/**
 * Fabrica central de claves de consulta.
 *
 * `02-ESTRATEGIA §5` la llama "el punto de friccion #1 de la tiendita": alli las
 * claves se escribian en linea, dispersas, y ninguna invalidacion era fiable —
 * cobras y la lista de productos sigue mostrando el stock viejo.
 *
 * Se construye en F1.0, **antes de que haya 200 usos**. Ese es el punto: montarla
 * despues cuesta diez veces mas y para entonces ya hay claves duplicadas.
 *
 * Reglas de uso:
 *   - Ningun `useQuery` escribe un arreglo literal. Siempre sale de aqui.
 *   - Las claves van de lo general a lo especifico, para poder invalidar por
 *     prefijo: invalidar `claves.productos.todo` alcanza a todas las listas y
 *     todos los detalles de producto.
 *   - El ambito (organizacion, sucursal) NO va en la clave: viene de la sesion
 *     del servidor (R16). Meterlo aqui invitaria a mandarlo desde el cliente.
 */

/** Filtros que aceptan las listas. Se serializan dentro de la clave. */
export type Filtros = Readonly<Record<string, string | number | boolean | null | undefined>>;

export const claves = {
  /** Todo lo cacheado. Se invalida al cambiar de empleado o de terminal. */
  todo: ['morphiqpos'] as const,

  productos: {
    todo: ['morphiqpos', 'productos'] as const,
    lista: (filtros?: Filtros) => ['morphiqpos', 'productos', 'lista', filtros ?? {}] as const,
    detalle: (id: string) => ['morphiqpos', 'productos', 'detalle', id] as const,
    porCodigoBarras: (codigo: string) =>
      ['morphiqpos', 'productos', 'codigo-barras', codigo] as const,
  },

  ordenes: {
    todo: ['morphiqpos', 'ordenes'] as const,
    lista: (filtros?: Filtros) => ['morphiqpos', 'ordenes', 'lista', filtros ?? {}] as const,
    detalle: (id: string) => ['morphiqpos', 'ordenes', 'detalle', id] as const,
    /** La orden en borrador de una terminal: el carrito ES una orden (P1-10). */
    borrador: (terminalId: string) => ['morphiqpos', 'ordenes', 'borrador', terminalId] as const,
  },

  caja: {
    todo: ['morphiqpos', 'caja'] as const,
    sesionAbierta: (terminalId: string) =>
      ['morphiqpos', 'caja', 'sesion-abierta', terminalId] as const,
    movimientos: (sesionId: string) => ['morphiqpos', 'caja', 'movimientos', sesionId] as const,
  },

  inventario: {
    todo: ['morphiqpos', 'inventario'] as const,
    existencias: (almacenId: string) =>
      ['morphiqpos', 'inventario', 'existencias', almacenId] as const,
  },

  mesas: {
    todo: ['morphiqpos', 'mesas'] as const,
    mapa: (sucursalId: string) => ['morphiqpos', 'mesas', 'mapa', sucursalId] as const,
    detalle: (id: string) => ['morphiqpos', 'mesas', 'detalle', id] as const,
  },

  comandas: {
    todo: ['morphiqpos', 'comandas'] as const,
    porEstacion: (estacionId: string) =>
      ['morphiqpos', 'comandas', 'estacion', estacionId] as const,
  },

  configuracion: {
    todo: ['morphiqpos', 'configuracion'] as const,
    seccion: (seccion: string) => ['morphiqpos', 'configuracion', seccion] as const,
  },

  sesion: {
    todo: ['morphiqpos', 'sesion'] as const,
    actual: ['morphiqpos', 'sesion', 'actual'] as const,
  },
} as const;
