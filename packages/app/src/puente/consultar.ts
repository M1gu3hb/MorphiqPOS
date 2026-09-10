import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { obtenerDb } from '@morphiqpos/data';

import { baseLibre } from './db-dinamica.ts';

import { entidadMapeada } from './mapa.ts';
import { colorDePersona } from './roles.ts';
import {
  haciaEl,
  haciaLaBase,
  LIMITE_MAXIMO,
  LIMITE_POR_OMISION,
  type MapaEntidad,
} from './tipos.ts';

/**
 * Las lecturas del puente (F1-02 §3, E3-4).
 *
 * Un solo camino para las 359 llamadas de su frontend. Lo que garantiza, y por
 * qué cada garantía existe:
 *
 * · **Ámbito de la sesión, SIEMPRE.** `organizacion_id` no se acepta del
 *   cliente; se pone aquí. Mandarlo en el cuerpo no sirve de nada.
 * · **Lista blanca de entidades.** Una entidad que no está en el mapa no
 *   existe: no hay forma de leer una tabla por su nombre real.
 * · **Lista blanca de campos.** Sólo salen las columnas declaradas. Es lo que
 *   cierra la fuga D-14 — hoy el portal QR hace `ConfiguracionNegocio.list()`
 *   completo y expone `presentacion_password` y los identificadores de Google
 *   a cualquiera que escanee un código.
 * · **Tope de filas.** Se acabaron los `list(5000)` para buscar un folio.
 */

export interface Ambito {
  readonly organizacionId: string;
  readonly rol: string;
}

export interface PeticionConsulta {
  readonly entidad: string;
  readonly operacion: 'list' | 'filter' | 'get';
  readonly filtro?: Readonly<Record<string, unknown>>;
  readonly id?: string;
  /** `'-created_date'` es descendente, igual que en su código. */
  readonly orden?: string;
  readonly limite?: number;
}

type Fila = Record<string, unknown>;

/**
 * La forma mínima de una consulta encadenable.
 *
 * Se declara a mano porque el tipo real de Kysely depende de la tabla, y aquí
 * la tabla se elige en tiempo de ejecución. Sólo se usan estos cinco métodos.
 */
interface ConsultaLibre {
  leftJoin(tabla: string, columnaIzquierda: string, columnaDerecha: string): ConsultaLibre;
  where(columna: string, operador: string, valor: unknown): ConsultaLibre;
  orderBy(columna: string, direccion: 'asc' | 'desc'): ConsultaLibre;
  limit(n: number): ConsultaLibre;
  execute(): Promise<Fila[]>;
}

/**
 * El alias de la tabla principal.
 *
 * Con `left join` de por medio, `id`, `nombre` y `organizacion_id` existen en
 * las dos tablas y Postgres rechaza la consulta por ambigua. Se cualifica todo
 * SIEMPRE, con join o sin él, para que no haya dos caminos que mantener.
 */
const BASE = 'b';

/** El alias del derivado número `n`. Uno por campo: dos campos pueden mirar la
 * misma tabla por columnas distintas —el mesero asignado y quien atiende— y
 * necesitan filas distintas. */
function aliasDerivado(n: number): string {
  return `d${String(n)}`;
}

export async function consultar(
  ambito: Ambito,
  peticion: PeticionConsulta,
): Promise<readonly Fila[]> {
  const mapa = entidadMapeada(peticion.entidad);
  if (mapa === null) {
    throw new ErrorDominio(
      'PUENTE_ENTIDAD_DESCONOCIDA',
      `La entidad «${peticion.entidad}» no existe en el puente.`,
    );
  }
  if (mapa.rolesLectura !== undefined && !mapa.rolesLectura.includes(ambito.rol)) {
    throw new ErrorDominio('PUENTE_SIN_PERMISO', 'Tu rol no puede leer esa información.');
  }

  const columnas = Object.entries(mapa.campos).map(
    ([suyo, campo]) => `${BASE}.${campo.columna} as ${suyo}`,
  );

  // Los campos que su frontend lee y no son columnas de esta tabla: el nombre
  // del mesero, el número de la mesa, la zona. Un `left join` por campo, y
  // `left` a propósito: un pedido sin mesa es normal y no debe desaparecer.
  const derivados = Object.entries(mapa.derivados ?? {});
  derivados.forEach(([suyo, derivado], indice) => {
    columnas.push(`${aliasDerivado(indice)}.${derivado.columna} as ${suyo}`);
  });

  // La tabla y las columnas salen del MAPA, nunca del cliente. Ver `db-dinamica.ts`.
  let consulta = baseLibre(obtenerDb())
    .selectFrom(`${mapa.tabla} as ${BASE}`)
    .select(columnas as never) as unknown as ConsultaLibre;

  // 0 · Los derivados. El emparejamiento es por clave primaria —`id` es un
  //     uuid global, no por organización—, así que un solo lado basta y el
  //     ámbito de la fila principal ya acota lo que se puede ver.
  derivados.forEach(([, derivado], indice) => {
    const alias = aliasDerivado(indice);
    consulta = consulta.leftJoin(
      `${derivado.tabla} as ${alias}`,
      `${alias}.${derivado.emparejaCon ?? 'id'}`,
      `${BASE}.${derivado.porColumna}`,
    );
  });

  // 1 · El ámbito. No es negociable y va antes que nada.
  consulta = consulta.where(`${BASE}.organizacion_id`, '=', ambito.organizacionId);

  // 2 · El filtro fijo de la entidad (p. ej. categorias.tipo = 'producto').
  for (const [columna, valor] of Object.entries(mapa.filtroFijo ?? {})) {
    consulta = consulta.where(`${BASE}.${columna}`, '=', valor);
  }

  // 3 · `get(id)` es un filtro por id, ni más ni menos.
  if (peticion.operacion === 'get') {
    if (typeof peticion.id !== 'string' || peticion.id === '') {
      throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', 'Falta el identificador.');
    }
    consulta = consulta.where(`${BASE}.id`, '=', peticion.id);
  }

  // 4 · Su `filter({clave: valor})`: igualdad exacta, AND entre claves. Una
  //     clave que no está en el mapa se RECHAZA en vez de ignorarse: ignorarla
  //     devolvería más filas de las que la pantalla pidió, en silencio.
  for (const [clave, valor] of Object.entries(peticion.filtro ?? {})) {
    const campo = mapa.campos[clave];
    if (campo === undefined) {
      // Un derivado no se puede filtrar: filtrar por el nombre del mesero
      // parecería funcionar y devolvería lo que dijera el `join`, no lo que la
      // pantalla pidió. Se dice con claridad en vez de fallar raro.
      const esDerivado = Object.prototype.hasOwnProperty.call(mapa.derivados ?? {}, clave);
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        esDerivado
          ? `«${clave}» se calcula al leer y no se puede filtrar por él.`
          : `«${clave}» no es un campo de ${peticion.entidad}.`,
      );
    }
    consulta =
      valor === null
        ? consulta.where(`${BASE}.${campo.columna}`, 'is', null)
        : consulta.where(`${BASE}.${campo.columna}`, '=', haciaLaBase(valor, campo.conversion));
  }

  // 5 · El orden. El prefijo `-` es descendente, como en su código.
  const orden = peticion.orden ?? mapa.ordenPorOmision;
  if (orden !== undefined && orden !== '') {
    const descendente = orden.startsWith('-');
    const clave = descendente ? orden.slice(1) : orden;
    const campo = mapa.campos[clave];
    if (campo === undefined) {
      throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', `No se puede ordenar por «${clave}».`);
    }
    consulta = consulta.orderBy(`${BASE}.${campo.columna}`, descendente ? 'desc' : 'asc');
  }

  // 6 · El tope. Aunque pida diez mil.
  const limite = Math.min(
    Math.max(1, Math.trunc(peticion.limite ?? LIMITE_POR_OMISION)),
    LIMITE_MAXIMO,
  );
  consulta = consulta.limit(peticion.operacion === 'get' ? 1 : limite);

  const filas = await consulta.execute();
  return filas.map((fila) => traducirFila(fila, mapa));
}

function traducirFila(fila: Fila, mapa: MapaEntidad): Fila {
  const salida: Fila = {};
  for (const [suyo, campo] of Object.entries(mapa.campos)) {
    salida[suyo] = haciaEl(fila[suyo], campo.conversion);
  }
  for (const [suyo, derivado] of Object.entries(mapa.derivados ?? {})) {
    const valor = haciaEl(fila[suyo], derivado.conversion);
    if (valor !== null || derivado.respaldo === undefined) {
      salida[suyo] = valor;
      continue;
    }
    // El respaldo se calcula desde el identificador por el que se hizo el
    // `join`, que ya está en la fila traducida. Si tampoco hay identificador
    // —una mesa sin mesero asignado— el respaldo NO se inventa: sigue nulo.
    const claveDelId = Object.entries(mapa.campos).find(
      ([, campo]) => campo.columna === derivado.porColumna,
    )?.[0];
    const id = claveDelId === undefined ? null : salida[claveDelId];
    salida[suyo] = typeof id === 'string' && id !== '' ? colorDePersona(id) : null;
  }
  return salida;
}
