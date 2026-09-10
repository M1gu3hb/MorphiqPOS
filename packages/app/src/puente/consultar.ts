import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import { obtenerDb } from '@morphiqpos/data';

import { baseLibre } from './db-dinamica.ts';

import { entidadMapeada } from './mapa.ts';
import { colorDePersona } from './roles.ts';
import {
  haciaEl,
  haciaLaBase,
  valorHaciaEl,
  valorHaciaLaBase,
  LIMITE_MAXIMO,
  LIMITE_POR_OMISION,
  type Calculo,
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

/**
 * Un rango cerrado sobre un campo de fecha o de día.
 *
 * Su plataforma no tenía rangos: `Registros.jsx` descarga 1 000 ventas, 500
 * movimientos, 300 compras, 300 gastos y 200 cortes EN CADA CARGA, y luego
 * filtra por periodo en el navegador. Con un restaurante de verdad eso es
 * descargar el año entero para enseñar el mes.
 *
 * El rango se aplica en la base. Los dos extremos son opcionales y ambos
 * INCLUSIVOS: `{desde: '2026-09-01', hasta: '2026-09-30'}` es septiembre entero,
 * que es lo que alguien espera al escribir esas dos fechas.
 */
export interface Rango {
  readonly campo: string;
  readonly desde?: string;
  readonly hasta?: string;
}

export interface PeticionConsulta {
  readonly entidad: string;
  readonly operacion: 'list' | 'filter' | 'get';
  readonly filtro?: Readonly<Record<string, unknown>>;
  /**
   * Un `in` sobre un campo. NO viene del cliente: lo usa el puente para traer
   * los hijos de todos los padres de una página en una sola consulta.
   */
  readonly filtroEn?: { readonly campo: string; readonly valores: readonly string[] };
  readonly rango?: Rango;
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

  /** Si este rol puede ver el campo. Sin `rolesLectura`, cualquiera con sesión. */
  const puedeVer = (campo: { readonly rolesLectura?: readonly string[] }): boolean =>
    campo.rolesLectura === undefined || campo.rolesLectura.includes(ambito.rol);

  const columnas = Object.entries(mapa.campos)
    // Un campo CONSTANTE no tiene columna que seleccionar: lo pone la
    // traducción de la fila.
    .filter(([, campo]) => campo.constante === undefined)
    // Y un campo que este rol no puede ver NI SIQUIERA SE SELECCIONA: quitarlo
    // después dejaría el costo del producto en el registro de la consulta y en
    // la memoria del servidor sin ninguna necesidad.
    .filter(([, campo]) => puedeVer(campo))
    .map(([suyo, campo]) => `${BASE}.${campo.columna} as ${suyo}`);

  // Los campos que su frontend lee y no son columnas de esta tabla: el nombre
  // del mesero, el número de la mesa, la zona. Un `left join` por campo, y
  // `left` a propósito: un pedido sin mesa es normal y no debe desaparecer.
  const derivados = Object.entries(mapa.derivados ?? {}).filter(([, d]) => puedeVer(d));
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
    if (campo.constante !== undefined) {
      // Filtrar por una constante es preguntar si la fila es de esta tabla. Si
      // coincide no acota nada; si no, no hay ninguna fila que pueda cumplirlo.
      // Su `useCajaAbierta` filtra por `tipo_corte='cierre_diario'`, y eso es
      // exactamente lo que significa venir de `sesiones_caja`.
      if (valor !== campo.constante) return [];
      continue;
    }
    consulta =
      valor === null
        ? consulta.where(`${BASE}.${campo.columna}`, 'is', null)
        : consulta.where(`${BASE}.${campo.columna}`, '=', valorHaciaLaBase(valor, campo));
  }

  // 4a · El `in` de los hijos. Es interno del puente y por eso no pasa por la
  //      validación del filtro de arriba, pero SÍ por la lista blanca de
  //      campos: un campo que no esté en el mapa no llega a la consulta.
  if (peticion.filtroEn !== undefined) {
    const campo = mapa.campos[peticion.filtroEn.campo];
    if (campo === undefined) {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        `«${peticion.filtroEn.campo}» no es un campo de ${peticion.entidad}.`,
      );
    }
    if (peticion.filtroEn.valores.length === 0) return [];
    consulta = consulta.where(`${BASE}.${campo.columna}`, 'in', [...peticion.filtroEn.valores]);
  }

  // 4b · El rango, si lo hay. Sólo sobre campos de fecha o de día: pedir un
  //      rango sobre un texto o un booleano no significa nada y se rechaza en
  //      vez de devolver algo que parezca una respuesta.
  if (peticion.rango !== undefined) {
    const { campo: clave, desde, hasta } = peticion.rango;
    const campo = mapa.campos[clave];
    if (campo === undefined) {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        `«${clave}» no es un campo de ${peticion.entidad}.`,
      );
    }
    if (campo.conversion !== 'fecha' && campo.conversion !== 'dia') {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        `«${clave}» no es una fecha: no se puede pedir un rango sobre él.`,
      );
    }
    if (desde !== undefined && desde !== '') {
      consulta = consulta.where(
        `${BASE}.${campo.columna}`,
        '>=',
        haciaLaBase(desde, campo.conversion),
      );
    }
    if (hasta !== undefined && hasta !== '') {
      // `<=` y no `<`: los dos extremos son inclusivos. Para un `timestamptz`,
      // el cliente manda el final del día en ISO; para un `date`, la fecha
      // basta. Un `<` aquí dejaría fuera las ventas del último día del mes, que
      // es justo el error que nadie nota hasta que el corte no cuadra.
      consulta = consulta.where(
        `${BASE}.${campo.columna}`,
        '<=',
        haciaLaBase(hasta, campo.conversion),
      );
    }
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
  const traducidas = filas.map((fila) => traducirFila(fila, mapa, ambito.rol));

  // 7 · Los hijos. UNA consulta por relación para TODA la página, no una por
  //     padre: dentro de una pantalla de cocina que refresca cada pocos
  //     segundos, un N+1 aquí se nota.
  await adjuntarHijos(ambito, mapa, traducidas);
  return traducidas;
}

/**
 * Adjunta los arreglos de filas hijas a cada padre.
 *
 * Se reusa `consultar` con un filtro `in` implícito —una llamada por relación
 * con el conjunto de identificadores de los padres—, así que los hijos pasan
 * por las MISMAS garantías que cualquier otra lectura: ámbito de sesión, lista
 * blanca de campos y tope de filas. Un camino aparte que las esquivara sería la
 * puerta de atrás del puente.
 */
async function adjuntarHijos(
  ambito: Ambito,
  mapa: MapaEntidad,
  padres: Fila[],
): Promise<void> {
  const relaciones = Object.entries(mapa.hijos ?? {});
  if (relaciones.length === 0 || padres.length === 0) return;

  const ids = padres.map((p) => String(p['id'])).filter((id) => id !== '');
  for (const [campo, relacion] of relaciones) {
    // Se piden todos los hijos de todos los padres de la página de una vez.
    const todos = await consultar(ambito, {
      entidad: relacion.entidad,
      operacion: 'filter',
      filtroEn: { campo: relacion.porCampo, valores: ids },
      limite: Math.min(relacion.limite * padres.length, LIMITE_MAXIMO),
    });
    const porPadre = new Map<string, Fila[]>();
    for (const hijo of todos) {
      const clave = String(hijo[relacion.porCampo]);
      const lista = porPadre.get(clave) ?? [];
      if (lista.length < relacion.limite) lista.push(hijo);
      porPadre.set(clave, lista);
    }
    for (const padre of padres) padre[campo] = porPadre.get(String(padre['id'])) ?? [];
  }
}

/**
 * `rol` decide qué campos calculados salen.
 *
 * Los `calculados` no vienen de una columna: se derivan de la fila cruda, así
 * que filtrarlos en el `select` no basta. `costoDeLineaDeReceta` es el ejemplo:
 * quien no puede ver el costo del insumo tampoco puede ver el de la línea, o el
 * filtro de arriba sería teatro.
 */
function traducirFila(fila: Fila, mapa: MapaEntidad, rol: string): Fila {
  const salida: Fila = {};
  for (const [suyo, campo] of Object.entries(mapa.campos)) {
    salida[suyo] = valorHaciaEl(fila[suyo], campo);
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
  for (const [suyo, calculado] of Object.entries(mapa.calculados ?? {})) {
    if (calculado.rolesLectura !== undefined && !calculado.rolesLectura.includes(rol)) continue;
    salida[suyo] = calcular(calculado.formula, fila);
  }
  return salida;
}

const PUNTOS_BASE = 10_000n;
const CENTAVOS_POR_PESO = 100;
/** Cuatro decimales: es la escala de `numeric(14,4)` en `recetas.cantidad`. */
const ESCALA_CANTIDAD = 10_000n;

/**
 * Las fórmulas de los campos calculados.
 *
 * Se hacen sobre la fila CRUDA y en enteros, no sobre la fila ya traducida a
 * pesos: `8.1 * 1.05` en coma flotante no da lo mismo que `810 * 10500 / 10000`
 * redondeado una vez, y el que sale mal es el que acaba en un ticket.
 *
 * Es la misma aritmética que `recalcularCostosRecetas`
 * (`inventario/recetas.ts:131`), a propósito: si las dos difirieran, el costo
 * que enseña Productos y el que guarda el producto dirían cosas distintas.
 */
/**
 * Una tabla y no un `switch`: el tipo `Record<Calculo, …>` obliga a que toda
 * fórmula nueva tenga implementación para compilar, sin ramas muertas que el
 * analizador tenga que perdonar.
 */
const FORMULAS: Readonly<Record<Calculo, (fila: Fila) => unknown>> = {
  costoDeLineaDeReceta(fila) {
    const centavos = enteroDe(fila['costo_unitario_base_snapshot']);
    const cantidad = escalarDe(fila['cantidad_convertida_unidad_base']);
    const mermaBp = enteroDe(fila['merma_porcentaje']) ?? 0n;
    if (centavos === null || cantidad === null) return null;

    const bruto = centavos * cantidad * (PUNTOS_BASE + mermaBp);
    const divisor = ESCALA_CANTIDAD * PUNTOS_BASE;
    // Redondeo al centavo más cercano, UNA sola vez y al final.
    const redondeado = (bruto + divisor / 2n) / divisor;
    return Number(redondeado) / CENTAVOS_POR_PESO;
  },
};

export function calcular(formula: Calculo, fila: Fila): unknown {
  return FORMULAS[formula](fila);
}

/**
 * El valor tal como llega de Postgres, como texto.
 *
 * `String(valor)` sobre un objeto da `[object Object]`, y aquí eso se
 * convertiría en un `null` silencioso en vez de en un fallo visible. Un tipo que
 * no sea número, texto o `bigint` no es un número de la base: se descarta.
 */
function textoDeNumero(valor: unknown): string | null {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'bigint') return valor.toString();
  return null;
}

/** Un entero de la base —`bigint`, `number` o cadena— o `null`. */
function enteroDe(valor: unknown): bigint | null {
  if (typeof valor === 'bigint') return valor;
  const texto = textoDeNumero(valor);
  if (texto === null) return null;
  const limpio = texto.split('.')[0] ?? '';
  return /^-?\d+$/.test(limpio) ? BigInt(limpio) : null;
}

/** Un `numeric(14,4)` como entero escalado por 10 000, sin pasar por `Number`. */
function escalarDe(valor: unknown): bigint | null {
  const texto = textoDeNumero(valor);
  if (texto === null) return null;
  const coincide = /^(-?)(\d+)(?:\.(\d{0,4}))?$/.exec(texto);
  if (coincide === null) return null;
  const signo = coincide[1] === '-' ? -1n : 1n;
  const entera = BigInt(coincide[2] ?? '0');
  const decimales = (coincide[3] ?? '').padEnd(4, '0');
  return signo * (entera * ESCALA_CANTIDAD + BigInt(decimales));
}
