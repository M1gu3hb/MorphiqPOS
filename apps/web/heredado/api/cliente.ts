'use client';

/**
 * El puente de datos (F1-02 §3).
 *
 * Su frontend hace 359 llamadas al SDK de la plataforma que desapareció, con la
 * forma `entities.X.list/filter/get/create/update/delete`. Reescribir las 359
 * es lento y arriesgado, así que en vez de eso esto expone **la misma firma**
 * contra el backend nuevo:
 *
 *     api.entidades.Venta.filter({ estado: 'abierta' }, '-created_date', 200)
 *
 * y por dentro habla con dos rutas genéricas que traducen sus nombres a los del
 * esquema (`Venta` → `ordenes`, `DetalleVenta` → `orden_lineas`…).
 *
 * ── Lo que el puente garantiza, y no es negociable ─────────────────────────
 * · El ámbito sale SIEMPRE de la sesión. `organizacion_id` no viaja nunca en el
 *   cuerpo; mandarlo no sirve de nada.
 * · Lista blanca de entidades y de campos por rol. Es lo que cierra la fuga
 *   D-14: hoy el portal QR expone `presentacion_password` y los identificadores
 *   de Google a cualquiera que escanee un código.
 * · Límite máximo de filas. Se acabaron los `list(10000)`.
 * · Ningún importe que venga del cliente decide un precio.
 *
 * ── Las escrituras que NO pasan por aquí ───────────────────────────────────
 * Las catorce operaciones transaccionales de `F1-01` §6 —cobrar, enviar
 * pedido, abrir mesa, corte…— son comandos con su transacción y viven en
 * `api.comandos`. Sólo las escrituras simples de catálogo pasan por
 * `/api/datos/escribir`, que también es un comando, sólo que delgado.
 */

/** Las seis operaciones que su código usa, con su semántica exacta. */
/** Un rango cerrado sobre un campo de fecha. Los dos extremos son inclusivos. */
export interface Rango {
  campo: string;
  desde?: string;
  hasta?: string;
}

export interface EntidadApi {
  /** `list('-created_date', 500)` — el prefijo `-` es descendente. */
  list(orden?: string, limite?: number): Promise<Registro[]>;
  /** Igualdad exacta, AND entre claves. */
  filter(donde: Filtro, orden?: string, limite?: number): Promise<Registro[]>;
  /**
   * Como `filter`, pero acotando un campo de fecha EN LA BASE.
   *
   * No existía en su plataforma, y por eso `Registros.jsx` descarga 1 000
   * ventas, 500 movimientos, 300 compras, 300 gastos y 200 cortes en cada carga
   * para después filtrar el periodo en el navegador. Con un restaurante de
   * verdad eso es traerse el año entero para enseñar el mes.
   */
  enRango(rango: Rango, donde?: Filtro, orden?: string, limite?: number): Promise<Registro[]>;
  /** Devuelve el objeto o lanza. */
  get(id: string): Promise<Registro>;
  /** Devuelve el registro creado, CON su `id`. */
  create(datos: Registro): Promise<Registro>;
  /** Mezcla parcial. Devuelve el actualizado. */
  update(id: string, parche: Registro): Promise<Registro>;
  delete(id: string): Promise<{ readonly id: string }>;
}

export type Valor = string | number | boolean | null | undefined | Valor[] | { [k: string]: Valor };
export type Registro = Record<string, Valor>;
export type Filtro = Record<string, Valor>;

/** Error del puente, con el código estable que decidió el servidor. */
export class ErrorPuente extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
    readonly estado: number,
  ) {
    super(mensaje);
    this.name = 'ErrorPuente';
  }
}

const CABECERA_PROPIA = 'x-morphiqpos-request';

/**
 * Una clave de idempotencia por operación (F1-02 §8, trampa T5).
 *
 * `comando()` rechaza toda escritura sin una clave de ocho caracteres o más.
 * Se genera aquí para que ninguna pantalla pueda olvidarla, y `conClave()`
 * permite reusar la misma mientras un diálogo esté abierto: así un doble clic
 * en «Cobrar» no cobra dos veces.
 */
export function nuevaClave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function pedir<T>(ruta: string, cuerpo: unknown, clave?: string): Promise<T> {
  const cabeceras: Record<string, string> = {
    'content-type': 'application/json',
    [CABECERA_PROPIA]: '1',
  };
  if (clave !== undefined) cabeceras['idempotency-key'] = clave;

  const respuesta = await fetch(ruta, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
    // La cookie de sesión es `HttpOnly`: la adjunta el navegador, no el script.
    credentials: 'same-origin',
  });

  const datos: unknown = await respuesta.json().catch(() => null);
  if (typeof datos !== 'object' || datos === null || (datos as { ok?: unknown }).ok !== true) {
    const error = (datos as { error?: { codigo?: string; mensaje?: string } } | null)?.error;
    throw new ErrorPuente(
      error?.codigo ?? 'ERROR_INTERNO',
      error?.mensaje ?? 'No fue posible completar la operación.',
      respuesta.status,
    );
  }
  return (datos as { datos: T }).datos;
}

const RUTA_LECTURA = '/api/datos/consultar';
const RUTA_ESCRITURA = '/api/datos/escribir';

function entidad(nombre: string): EntidadApi {
  return {
    list: (orden, limite) =>
      pedir<Registro[]>(RUTA_LECTURA, { entidad: nombre, operacion: 'list', orden, limite }),
    filter: (donde, orden, limite) =>
      pedir<Registro[]>(RUTA_LECTURA, {
        entidad: nombre,
        operacion: 'filter',
        filtro: donde,
        orden,
        limite,
      }),
    enRango: (rango, donde, orden, limite) =>
      pedir<Registro[]>(RUTA_LECTURA, {
        entidad: nombre,
        operacion: 'filter',
        filtro: donde ?? {},
        rango,
        orden,
        limite,
      }),
    get: (id) => pedir<Registro>(RUTA_LECTURA, { entidad: nombre, operacion: 'get', id }),
    create: (datos) =>
      pedir<Registro>(
        RUTA_ESCRITURA,
        { entidad: nombre, operacion: 'create', datos },
        nuevaClave(),
      ),
    update: (id, parche) =>
      pedir<Registro>(
        RUTA_ESCRITURA,
        { entidad: nombre, operacion: 'update', id, datos: parche },
        nuevaClave(),
      ),
    delete: (id) =>
      pedir<{ id: string }>(
        RUTA_ESCRITURA,
        { entidad: nombre, operacion: 'delete', id },
        nuevaClave(),
      ),
  };
}

/**
 * Las 27 entidades del puente: sus 25 más dos que la base ahora sí tiene.
 *
 * La lista NO se inventa: sale de contar los nombres que su código usa de
 * verdad (`grep -o 'entidades\.[A-Za-z]*'`). Tres estuvieron a punto de
 * quedarse fuera por llamarse distinto de lo que uno esperaría —`CompraInsumo`
 * en vez de `Compra`, `DetalleCompra` en vez de `CompraLinea`, y
 * `CategoriaIngrediente`, que sólo aparece UNA vez, en Inventario—. Cualquiera
 * de las tres habría reventado una pantalla al montar.
 *
 * Los nombres son los SUYOS. La traducción a las tablas del backend vive en un
 * solo archivo, `packages/app/src/puente/mapa.ts`, y cada entidad lleva una
 * prueba de ida y vuelta: se construye un objeto con la forma vieja, se
 * traduce, se guarda, se lee y se traduce de vuelta, y tiene que salir
 * idéntico. Sin esa prueba, un campo mal mapeado rompe una pantalla en
 * silencio y nadie se entera hasta que un ticket sale mal.
 */
const NOMBRES = [
  'Venta',
  'DetalleVenta',
  'Mesa',
  // `Zona` no era una entidad suya: era un arreglo literal en
  // `lib/constants.js:118`. Ahora es una tabla, porque una mesa con una zona
  // fuera de las cinco desaparecía de la interfaz sin decir nada.
  'Zona',
  'PedidoPreparacion',
  // Las líneas de la comanda como entidad propia: cocina marca UNA lista sin
  // tocar las demás, y hoy eso obliga a reescribir el arreglo entero.
  'PedidoPreparacionItem',
  'EstacionPreparacion',
  'UsuarioPOS',
  'ConfiguracionNegocio',
  'Ingrediente',
  'CategoriaIngrediente',
  'ProductoTerminado',
  'CategoriaProducto',
  'RecetaEscandallo',
  'MovimientoInventario',
  'DescuentoInventarioVenta',
  'CorteCaja',
  'CompraInsumo',
  'DetalleCompra',
  'Proveedor',
  'GastoOperativo',
  'PlantillaGasto',
  'PlantillaCompra',
  'SolicitudQR',
  'MenuQRSeccion',
  'LiquidacionPropina',
  'IntegrationSyncLog',
] as const;

export type NombreEntidad = (typeof NOMBRES)[number];

const entidades = Object.fromEntries(NOMBRES.map((n) => [n, entidad(n)])) as Record<
  NombreEntidad,
  EntidadApi
>;

const archivos = {
  subir: ({ file }: { file: File }): Promise<{ file_url: string }> => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', file);
    return fetch('/api/archivos/subir', {
      method: 'POST',
      headers: { [CABECERA_PROPIA]: '1', 'idempotency-key': nuevaClave() },
      body: cuerpo,
      credentials: 'same-origin',
    }).then(async (r) => {
      const d: unknown = await r.json().catch(() => null);
      if (typeof d !== 'object' || d === null || (d as { ok?: unknown }).ok !== true) {
        throw new ErrorPuente('ERROR_INTERNO', 'No se pudo subir el archivo.', r.status);
      }
      return (d as { datos: { file_url: string } }).datos;
    });
  },
};

/**
 * El acceso. Es la ÚNICA parte del puente que existe antes de que haya sesión.
 *
 * `usuarios()` devuelve nombre, rol y color — nunca el PIN ni su hash.
 * Enumerar la plantilla en la propia pantalla de acceso no es una fuga: quien
 * está frente a la caja los ve por la puerta. El secreto es el PIN, y el PIN
 * se verifica en el servidor.
 */
const auth = {
  usuarios: (): Promise<Registro[]> =>
    fetch('/api/auth/empleados', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { ok?: boolean; datos?: { usuarios?: Registro[] } }) => {
        if (d.ok !== true) {
          throw new ErrorPuente('ERROR_INTERNO', 'No pudimos cargar los usuarios.', 500);
        }
        return d.datos?.usuarios ?? [];
      }),

  /** El PIN viaja al servidor. Nunca al revés. */
  entrar: ({ id, pin }: { id: string; pin: string }): Promise<Registro> =>
    pedir<Registro>('/api/auth/entrar', { empleoId: id, pin }, nuevaClave()),

  salir: (): Promise<null> => pedir<null>('/api/auth/salir', {}, nuevaClave()),

  me: (): Promise<Registro> =>
    fetch('/api/catalogo/sesion', { cache: 'no-store', credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { ok?: boolean; datos?: Registro }) => {
        if (d.ok !== true || d.datos === undefined) {
          throw new ErrorPuente('NO_AUTENTICADO', 'Inicia sesión para continuar.', 401);
        }
        return d.datos;
      }),
};

/**
 * Los comandos transaccionales.
 *
 * Sustituyen a `api.funciones.invocar`, que ya no existe: aquella mandaba un
 * `rol` en el cuerpo y el servidor lo creía. Aquí no hay nada que mandar — el
 * rol sale de la sesión, y un comando que declarara `rol` en su entrada ni
 * siquiera compila.
 *
 * La clave de idempotencia la pone `pedir`. `clave` deja REUSAR la misma
 * mientras un diálogo esté abierto, que es lo que impide que un doble clic en
 * «Cobrar» cobre dos veces, o que un reintento de red duplique el inventario.
 */
const comandos = {
  ejecutar: <T>(ruta: string, cuerpo: Registro, clave?: string): Promise<T> =>
    pedir<T>(ruta, cuerpo, clave ?? nuevaClave()),
};

export const api = { entidades, archivos, auth, comandos };
export default api;
