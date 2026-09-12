export const INDICES_UNICOS_046 = [
  'cortes_folio_unico',
  'cortes_turno_folio_unico',
  'liquidaciones_folio_unico',
  'ordenes_una_activa_por_mesa',
  'mesas_una_orden_activa',
  'sesiones_caja_una_abierta_por_sucursal',
  'estaciones_una_general',
  'ordenes_carrito_por_terminal',
  'insumos_nombre_unico',
  'categorias_nombre_unico',
  'estaciones_nombre_unico',
  'solicitudes_qr_una_pendiente',
] as const;

export interface RelacionSeguridad {
  readonly clave: string;
  readonly tipo: 'tabla' | 'tabla_particionada' | 'vista' | 'vista_materializada';
  readonly rlsActiva: boolean | null;
  readonly rlsForzada: boolean | null;
  readonly selectAnon: boolean;
  readonly selectAuthenticated: boolean;
}

export interface IndiceSeguridad {
  readonly nombre: string;
  readonly unico: boolean;
  readonly valido: boolean;
}

export interface FuncionSeguridad {
  readonly clave: string;
  readonly executeAnon: boolean;
  readonly executeAuthenticated: boolean;
}

export interface EstadoSeguridad {
  readonly relaciones: readonly RelacionSeguridad[];
  readonly indices: readonly IndiceSeguridad[];
  readonly funciones: readonly FuncionSeguridad[];
}

/** Convierte el estado vivo de PostgreSQL en fallos concretos para CI. */
export function problemasDeSeguridad(estado: EstadoSeguridad): string[] {
  const problemas: string[] = [];

  for (const relacion of estado.relaciones) {
    if (relacion.tipo === 'tabla' || relacion.tipo === 'tabla_particionada') {
      if (relacion.rlsActiva !== true) problemas.push(`${relacion.clave}: RLS no está activa`);
      if (relacion.rlsForzada !== true) problemas.push(`${relacion.clave}: RLS no está forzada`);
    }
    if (relacion.selectAnon) problemas.push(`${relacion.clave}: anon conserva SELECT`);
    if (relacion.selectAuthenticated) {
      problemas.push(`${relacion.clave}: authenticated conserva SELECT`);
    }
  }

  for (const funcion of estado.funciones) {
    if (funcion.executeAnon) problemas.push(`${funcion.clave}: anon conserva EXECUTE`);
    if (funcion.executeAuthenticated) {
      problemas.push(`${funcion.clave}: authenticated conserva EXECUTE`);
    }
  }

  const indices = new Map(estado.indices.map((indice) => [indice.nombre, indice]));
  for (const nombre of INDICES_UNICOS_046) {
    const indice = indices.get(nombre);
    if (indice === undefined) {
      problemas.push(`${nombre}: índice 046 ausente`);
      continue;
    }
    if (!indice.unico) problemas.push(`${nombre}: el índice no es único`);
    if (!indice.valido) problemas.push(`${nombre}: el índice no es válido`);
  }

  return problemas;
}
