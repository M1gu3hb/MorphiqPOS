import 'server-only';

import { desdeTexto } from '@morphiqpos/domain/dinero';

/**
 * Los tipos del puente y las conversiones de valor (F1-02 §3).
 *
 * Su frontend habla en pesos decimales, fechas ISO y booleanos `activo`. El
 * backend habla en `bigint` de centavos, `timestamptz` y columnas que a veces
 * se llaman `activa`. Aquí está la única traducción, y es simétrica: lo que
 * sale tiene que volver a entrar igual.
 *
 * Por eso cada entidad lleva una prueba de ida y vuelta. Un campo mal mapeado
 * no da error: da un precio con dos ceros de más en un ticket, seis meses
 * después.
 */

/** Cómo se convierte un valor entre su mundo y el de la base. */
export type Conversion =
  /** Texto tal cual. */
  | 'texto'
  /** Entero. */
  | 'entero'
  /**
   * DINERO. En la base es `bigint` de CENTAVOS; él lo lee en pesos decimales.
   * Nunca se hace aritmética del lado de él: el servidor recalcula siempre.
   */
  | 'dinero'
  /** `numeric` de Postgres, que Kysely entrega como cadena. Él espera número. */
  | 'decimal'
  /** Puntos base en la base (1600 = 16 %); él lo lee en por ciento. */
  | 'puntos_base'
  | 'booleano'
  /** `timestamptz` ↔ ISO 8601. */
  | 'fecha'
  /** `date` ↔ `YYYY-MM-DD`. */
  | 'dia'
  /** JSON opaco: viaja sin tocar. */
  | 'json';

export interface CampoMapeado {
  /** La columna en la tabla destino. */
  readonly columna: string;
  readonly conversion: Conversion;
  /** Validación adicional antes de aceptar una escritura del navegador. */
  readonly validacion?: 'url_http';
  /**
   * Quién puede LEER este campo. `undefined` = cualquiera con sesión.
   *
   * ── Por qué por CAMPO y no por entidad ─────────────────────────────────
   * `rolesLectura` a nivel de entidad ya existía y no lo usaba nadie: era
   * demasiado grueso. Un mesero TIENE que leer `ProductoTerminado` —necesita
   * el nombre y el precio para tomar la comanda— pero no tiene por qué leer su
   * costo, su utilidad ni su margen. Cerrar la entidad entera dejaría la
   * pantalla de mesero en blanco; dejarla abierta reparte los márgenes del
   * negocio a toda la plantilla.
   *
   * Es la regla 12 —«Cocina nunca ve costos, márgenes ni gramajes»— aplicada
   * donde se puede hacer cumplir: en el puente, y no en el `if` de una pantalla
   * que se salta abriendo la consola.
   *
   * El campo restringido NO SE SELECCIONA de la base para quien no puede
   * verlo, así que ni siquiera viaja: filtrarlo después dejaría el dato en el
   * registro de la consulta y en la memoria del servidor sin necesidad.
   */
  readonly rolesLectura?: readonly string[];
  /**
   * Traducción de VALORES, no de nombres. `base → suyo`.
   *
   * Traducir el nombre del campo no basta cuando el enumerado también cambió.
   * `sesiones_caja.estado` guarda `'abierta'` y su `useCajaAbierta` busca
   * `'abierto'`: el campo se llamaba igual, el valor no, y su POS decía «caja
   * cerrada» con la caja abierta y $1 500 de fondo. Un fallo así no da error en
   * ningún sitio — simplemente nada funciona.
   *
   * Es SIMÉTRICA: al leer se traduce en un sentido y al escribir y al filtrar,
   * en el otro. Un valor que no esté en la tabla pasa tal cual, para que
   * añadir un estado nuevo en la base no rompa la lectura de los viejos.
   */
  readonly traduccion?: Readonly<Record<string, string>>;
  /**
   * Un valor FIJO que no está en ninguna columna.
   *
   * `CorteCaja.tipo_corte` es siempre `'cierre_diario'` cuando la fila viene de
   * `sesiones_caja`, porque el corte de turno vive en otra tabla (F1-04 §20.1).
   * Su código compara contra ese literal en cuatro sitios, así que tiene que
   * llegar; y como no hay dónde guardarlo, se declara aquí en vez de inventar
   * una columna que sólo tendría un valor.
   */
  readonly constante?: string;
  /**
   * `false` cuando lo calcula el SERVIDOR y no se acepta del cliente:
   * subtotales, totales, utilidad, margen, costos derivados. Es la regla que
   * no se negocia — el endpoint no acepta importes del cliente.
   */
  readonly escribible?: boolean;
  /**
   * `true` cuando el campo puede salir por el endpoint PÚBLICO del portal QR.
   * Todo lo demás se filtra: es lo que cierra la fuga D-14, donde hoy el portal
   * expone `presentacion_password` y los identificadores de Google a
   * cualquiera que escanee un código.
   */
  readonly publico?: boolean;
}

/**
 * Un campo que NO es una columna de la entidad: se trae de otra tabla.
 *
 * Su frontend lee `mesa.mesero_asignado_nombre` y `venta.mesa_numero` como si
 * fueran columnas. En el esquema nuevo no lo son —el nombre vive en `personas`
 * y el número en `mesas`—, así que el puente los resuelve con un `left join`.
 *
 * Es UN salto, a propósito. La vista `empleados_visibles` (migración 047)
 * existe justo para que «el nombre del mesero» no sean dos.
 *
 * Un derivado NUNCA se escribe: no tiene columna propia donde guardarlo.
 */
export interface CampoDerivado {
  /** Igual que en `CampoMapeado`: quién puede leerlo. `undefined` = cualquiera. */
  readonly rolesLectura?: readonly string[];
  /** Tabla o vista de la que se lee. */
  readonly tabla: string;
  /** La columna de ESTA entidad que apunta allí. */
  readonly porColumna: string;
  /** La columna de la otra tabla con la que empareja. Por omisión, `id`. */
  readonly emparejaCon?: string;
  /** La columna cuyo valor se devuelve. */
  readonly columna: string;
  readonly conversion: Conversion;
  readonly publico?: boolean;
  /**
   * Qué hacer cuando el `join` devuelve nulo pero la interfaz necesita un valor.
   *
   * Hoy sólo hay uno: el color del mesero. `empleos.color` es opcional y su
   * pantalla pinta un punto de color al lado de cada nombre; sin respaldo, el
   * punto sale transparente y dos meseros distintos se ven igual. Es un
   * conjunto CERRADO de nombres, no una función: una función aquí convertiría
   * el mapa en código y dejaría de poder comprobarse de un vistazo.
   */
  readonly respaldo?: 'colorDePersona';
}

/**
 * Un campo que no está en ninguna tabla: se calcula al leer.
 *
 * Igual que `respaldo`, es un conjunto CERRADO de nombres y no una función. La
 * fórmula vive en `consultar.ts`, junto a la aritmética que la hace exacta, y
 * el mapa sólo dice cuál se aplica. Una función aquí volvería el mapa código.
 */
export type Calculo = 'costoDeLineaDeReceta';

export interface CampoCalculado {
  /** Igual que en `CampoMapeado`: quién puede leerlo. `undefined` = cualquiera. */
  readonly rolesLectura?: readonly string[];
  readonly formula: Calculo;
  readonly conversion: Conversion;
}

/** Un arreglo de filas hijas que se adjunta al padre tras leerlo. */
export interface Hijos {
  /** La entidad hija, tal como se llama en el mapa. */
  readonly entidad: string;
  /** El campo de la hija que apunta al padre. */
  readonly porCampo: string;
  /** Cuántas hijas como mucho por padre. Una comanda no tiene sesenta platos. */
  readonly limite: number;
}

export type PoliticaDeEscritura =
  /** Escrituras simples de catálogo: pasan por un comando delgado. */
  | 'directa'
  /**
   * Sólo por comando transaccional dedicado. El puente RECHAZA la escritura.
   * Son las catorce operaciones de `F1-01` §6: cobrar, enviar pedido, abrir
   * mesa, corte… Escribir una venta campo por campo desde el navegador es
   * exactamente lo que producía el defecto D-07.
   */
  | 'comando'
  /** No se escribe nunca: es una vista o un derivado. */
  | 'lectura';

export interface MapaEntidad {
  /** La tabla destino en el esquema nuevo. */
  readonly tabla: string;
  /** Alias de la tabla en las consultas. */
  readonly alias?: string;
  readonly campos: Readonly<Record<string, CampoMapeado>>;
  /**
   * Campos que su frontend lee pero que no son columnas de esta tabla. Salen
   * de un `left join` y son de SÓLO LECTURA: mandarlos en una escritura es un
   * error, no un campo que se ignora en silencio.
   */
  readonly derivados?: Readonly<Record<string, CampoDerivado>>;
  /** Campos que no existen en ninguna tabla: se calculan al leer. */
  readonly calculados?: Readonly<Record<string, CampoCalculado>>;
  /**
   * Un arreglo de filas HIJAS que viaja dentro del padre.
   *
   * Su `PedidoPreparacion` lleva `items` como arreglo embebido y su pantalla de
   * Cocina lo pinta directamente. Aquí esos items son filas de `comanda_items`
   —porque cocina marca UN plato como listo sin tocar los demás, con dos
   * pantallas abiertas (F1-04 §10.1)—, y sin esto la comanda llega a la cocina
   * diciendo «0 items · Sin productos» con los tres platos en la base.
   *
   * NO es un `left join`: eso multiplicaría la fila del padre por cada hijo. Es
   * UNA consulta más para todos los padres de la página, agrupada por el
   * identificador del padre. Una consulta, no una por comanda.
   */
  readonly hijos?: Readonly<Record<string, Hijos>>;
  readonly escritura: PoliticaDeEscritura;
  /**
   * Filtro que SIEMPRE se aplica, además del ámbito. Sirve para las tablas que
   * el backend comparte entre varios conceptos —`categorias` guarda las de
   * producto y las de insumo en la misma tabla, distinguidas por `tipo`—.
   */
  readonly filtroFijo?: Readonly<Record<string, string | boolean>>;
  /**
   * `true` cuando la tabla tiene `sucursal_id not null`.
   *
   * La sucursal la pone el SERVIDOR, igual que la organización, y sale de la
   * sesión. Se declara aquí en vez de adivinarse mirando si el `insert` falla:
   * una mesa sin sucursal no es un caso a corregir después, es un `not null`
   * que revienta la creación de la primera mesa del negocio.
   */
  readonly conSucursal?: boolean;
  /** Orden por omisión cuando él no pide ninguno. */
  readonly ordenPorOmision?: string;
  /**
   * Roles que pueden LEER esta entidad.
   *
   * Es obligatorio incluso cuando contiene a toda la plantilla: una entidad
   * nueva sin decisión explícita no puede convertir en código muerto la guarda
   * de `consultar` ni abrir datos por omisión.
   */
  readonly rolesLectura: readonly string[];
}

/** Nada de `list(10000)`: el tope existe para que una pantalla no tumbe la base. */
export const LIMITE_MAXIMO = 1000;
export const LIMITE_POR_OMISION = 200;

const CENTAVOS_POR_PESO = 100;

/**
 * Un `unknown` a texto, sin `[object Object]`.
 *
 * `String(valor)` sobre un objeto da `[object Object]`, que es exactamente el
 * valor que acaba guardado en una columna cuando nadie mira. Aquí un objeto se
 * serializa como JSON, que al menos se puede leer y depurar.
 */
function aTexto(valor: unknown): string {
  if (typeof valor === 'string') return valor;
  if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') {
    return valor.toString();
  }
  return JSON.stringify(valor);
}

/** De la base hacia su frontend. */
export function haciaEl(valor: unknown, conversion: Conversion): unknown {
  if (valor === null || valor === undefined) return null;
  switch (conversion) {
    case 'dinero':
      return Number(valor) / CENTAVOS_POR_PESO;
    case 'decimal':
      return Number(valor);
    case 'entero':
      return Number(valor);
    case 'puntos_base':
      return Number(valor) / CENTAVOS_POR_PESO;
    case 'booleano':
      return Boolean(valor);
    case 'fecha':
      return valor instanceof Date ? valor.toISOString() : aTexto(valor);
    case 'dia':
      return valor instanceof Date ? valor.toISOString().slice(0, 10) : aTexto(valor);
    case 'json':
      return valor;
    case 'texto':
    default:
      return aTexto(valor);
  }
}

/**
 * De su frontend hacia la base.
 *
 * El redondeo del dinero es a centavo entero y se hace AQUÍ, una sola vez. Un
 * `45.55 * 100` en coma flotante da `4554.999…`; sin el redondeo, un producto
 * de 45.55 se guardaría a 45.54 y nadie sabría por qué.
 */
export function haciaLaBase(valor: unknown, conversion: Conversion): unknown {
  if (valor === null || valor === undefined) return null;
  switch (conversion) {
    case 'dinero':
      // `desdeTexto` del dominio, NO `Math.round(x * 100)`.
      //
      // La multiplicación en coma flotante pierde el medio centavo justo en el
      // caso que importa: `1234.995 * 100` da `123499.49999…`, así que redondear
      // ahí devuelve 1234.99 en vez de 1235.00. `desdeTexto` arma el importe
      // como fracción exacta y redondea UNA vez, con la regla única del sistema.
      // Lo cazó la prueba de ida y vuelta.
      return desdeTexto(aTexto(valor));
    case 'puntos_base':
      return Math.round(Number(valor) * CENTAVOS_POR_PESO);
    case 'decimal':
      return Number(valor).toString();
    case 'entero':
      return Math.trunc(Number(valor));
    case 'booleano':
      return Boolean(valor);
    case 'fecha':
      return new Date(aTexto(valor));
    case 'dia':
      return aTexto(valor).slice(0, 10);
    case 'json':
      return valor;
    case 'texto':
    default:
      return aTexto(valor);
  }
}

/** Aplica la traducción de valores de la base hacia su vocabulario. */
export function valorHaciaEl(valor: unknown, campo: CampoMapeado): unknown {
  if (campo.constante !== undefined) return campo.constante;
  const traducido = haciaEl(valor, campo.conversion);
  if (campo.traduccion === undefined || typeof traducido !== 'string') return traducido;
  // Un valor que no está en la tabla pasa TAL CUAL. Así, añadir un estado
  // nuevo en la base no rompe la lectura de los que ya existían.
  return campo.traduccion[traducido] ?? traducido;
}

/** Y de vuelta: su vocabulario hacia el de la base. Es la inversa exacta. */
export function valorHaciaLaBase(valor: unknown, campo: CampoMapeado): unknown {
  if (campo.traduccion === undefined || typeof valor !== 'string') {
    return haciaLaBase(valor, campo.conversion);
  }
  const inversa = Object.entries(campo.traduccion).find(([, suyo]) => suyo === valor);
  return haciaLaBase(inversa?.[0] ?? valor, campo.conversion);
}

/**
 * Los tres campos automáticos que su frontend lee SIEMPRE.
 *
 * `Configuracion.jsx` depende de `updated_date` para volver a hidratar los
 * formularios: si falta, los interruptores se quedan con el valor viejo
 * después de guardar.
 */
export const CAMPOS_AUTOMATICOS: Readonly<Record<string, CampoMapeado>> = {
  id: { columna: 'id', conversion: 'texto', escribible: false, publico: true },
  created_date: { columna: 'created_at', conversion: 'fecha', escribible: false },
  updated_date: { columna: 'updated_at', conversion: 'fecha', escribible: false },
};
