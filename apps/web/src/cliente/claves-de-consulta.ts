/**
 * LAS CLAVES DE CONSULTA de las pantallas heredadas, en un solo sitio.
 *
 * ── El defecto que esto impide ─────────────────────────────────────────────
 * React Query decide que dos consultas son LA MISMA por su clave, y no mira qué
 * pide cada una. `['mesas']` la usaban tres pantallas para tres preguntas distintas:
 *
 *   · Cocina:        `Mesa.list('-created_date', 500)`     →  las 16, con las 4 inactivas
 *   · Configuración: `Mesa.list('-created_date', 500)`     →  las 16
 *   · Mesero:        `Mesa.filter({ activo: true })`       →  las 12 de verdad
 *
 * Quien abría el Mesero después de pasar por Cocina recibía en su PRIMERA pintada
 * la lista de Cocina —el caché de otra pregunta— y el mapa dibujaba las inactivas
 * encima de las activas (sus coordenadas coinciden) hasta que llegara la lectura buena.
 * Con la red del local, esa espera es larga: son las «mesas encimadas».
 *
 * ── La regla ───────────────────────────────────────────────────────────────
 *   1 · La RAÍZ (primer elemento) es el nombre de siempre. Toda invalidación que ya
 *       existe —`invalidateQueries({ queryKey: ['mesas'] })`— sigue funcionando porque
 *       React Query compara por PREFIJO: alcanza a todas las variantes.
 *   2 · Cada consulta que pide algo distinto agrega, como segundo elemento, un objeto
 *       con LO QUE PIDE (el filtro, el orden, el límite). Dos preguntas distintas, dos
 *       claves; la misma pregunta desde dos pantallas, la misma clave (y una sola
 *       petición, que es lo que se quiere).
 *   3 · Una raíz que tiene variantes SOLO se escribe con estos constructores. El
 *       contrato `claves-sin-colisiones.contrato.test.ts` lo vigila: si alguien escribe
 *       `['mesas']` a mano en un `useQuery`, falla.
 *
 * Nada de esto lleva el usuario ni el negocio: el aislamiento por contexto no se
 * resuelve con claves sino con un `QueryClient` por contexto
 * (`contexto-de-consultas.ts`), para que NINGUNA consulta —presente o futura— pueda
 * olvidarse de él.
 */

/** Lo que un filtro de clave puede llevar: valores planos, comparables por contenido. */
export type ValorDeFiltro = string | number | boolean | null;

export type FiltrosDeClave = Readonly<Record<string, ValorDeFiltro>>;

/** Una clave: la raíz, y opcionalmente lo que pide. */
export type ClaveDeConsulta = readonly [raiz: string, filtros?: FiltrosDeClave];

/**
 * Las raíces que tienen MÁS DE UNA variante.
 *
 * Esta lista es la que el contrato vigila: un `useQuery` con una de estas raíces escrita
 * a mano es una colisión esperando su turno. Una raíz nueva con variantes se agrega
 * aquí y en `claves`, y nada más.
 */
export const RAICES_CON_VARIANTES = [
  'mesas',
  'gastos_hoy',
  'cortes_historial',
  'registros_ventas',
  'usuarios_pos',
] as const;

export type RaizConVariantes = (typeof RAICES_CON_VARIANTES)[number];

/** Rol del mesero tal como lo trae el puente (`ROLES.WAITER` de `lib/constants.js`). */
const ROL_MESERO = 'mesero';

export const claves = {
  mesas: {
    /** Para invalidar o refrescar TODAS las variantes. */
    raiz: (): ClaveDeConsulta => ['mesas'],
    /** El salón en servicio: `Mesa.filter({ activo: true })`. Es el mapa del mesero. */
    activas: (): ClaveDeConsulta => ['mesas', { activo: true }],
    /**
     * TODAS, también las dadas de baja: `Mesa.list('-created_date', 500)`. Sólo el editor
     * de mesas la necesita (para ofrecer «Reactivar»); nada que PINTE un mapa debe usarla.
     */
    todas: (): ClaveDeConsulta => [
      'mesas',
      { activo: 'todas', orden: '-created_date', limite: 500 },
    ],
  },

  gastos: {
    raiz: (): ClaveDeConsulta => ['gastos_hoy'],
    /**
     * Los gastos más recientes. El límite ES parte de la pregunta: Caja pide 100, Compras
     * 30 y el tablero lo que el puente da por omisión; compartir clave le servía a Compras
     * las 100 de Caja (o al revés).
     */
    recientes: (limite?: number): ClaveDeConsulta => [
      'gastos_hoy',
      { orden: '-created_date', limite: limite ?? 'omision' },
    ],
  },

  cortes: {
    raiz: (): ClaveDeConsulta => ['cortes_historial'],
    /** El historial de cortes: el tablero muestra 7; la caja, 100. */
    historial: (limite: number): ClaveDeConsulta => ['cortes_historial', { limite }],
  },

  registrosVentas: {
    raiz: (): ClaveDeConsulta => ['registros_ventas'],
    /**
     * Las ventas de Registros (1 000 por fecha de creación) y las de la pestaña de Propinas
     * (2 000 por fecha de cierre) compartían clave con listas distintas.
     */
    porOrden: (orden: string, limite: number): ClaveDeConsulta => [
      'registros_ventas',
      { orden, limite },
    ],
  },

  usuarios: {
    raiz: (): ClaveDeConsulta => ['usuarios_pos'],
    /** La plantilla activa: `UsuarioPOS.filter({ activo: true })`. */
    activos: (): ClaveDeConsulta => ['usuarios_pos', { activo: true }],
    /**
     * Sólo los meseros activos. Se llamaba `usuarios_pos_meseros` en tres sitios y dos de
     * ellos pedían TODOS los activos: el editor de mesas ofrecía de mesero a la cajera.
     */
    meseros: (): ClaveDeConsulta => ['usuarios_pos', { activo: true, rol: ROL_MESERO }],
  },
} as const;
