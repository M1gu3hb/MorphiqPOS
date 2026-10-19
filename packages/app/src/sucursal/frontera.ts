import { veConsolidado, type Ambito } from '@morphiqpos/contracts';

import type { FronteraDeSucursal } from '../puente/tipos.ts';

/**
 * LA FRONTERA POR SUCURSAL DE LOS COMANDOS (cierre de la 2.4, D-36).
 *
 * El puente ya no deja LEER lo de otra sucursal a quien no consolida (paso 1c de
 * `consultar`). Esto es la otra mitad: que tampoco se pueda OPERAR. Un comando recibe ids
 * —la orden, la caja, la mesa, la cita— y cada uno resolvía su fila por organización; el
 * cajero del norte que mandara el id de una orden del centro la cobraba en su caja.
 *
 * ── Cómo: el comando declara, el envoltorio cumple ────────────────────────
 * Cada comando dice qué campos de su entrada son ids de algo que es de UNA sucursal
 * (`sucursal: { ordenId: 'ordenes' }`) y `definirComando` comprueba al cargar que esos
 * campos existen en su esquema. El envoltorio busca, antes del cuerpo, cuáles de esos ids
 * son de OTRA sucursal, y los cambia por uno que no existe en ninguna parte: el comando
 * contesta lo mismo que a un id al azar. Ni «esa orden es de otra sucursal», que ya diría
 * que existe, ni una comprobación que cada uno de cien comandos tuviera que acordarse de
 * escribir.
 *
 * ── A quién aplica ───────────────────────────────────────────────────────
 * · Quien no consolida (gerente, cajero, mesero, cocina, almacén): siempre, en lo que lee
 *   y en lo que escribe. Sin sucursal en su sesión falla cerrada: nada de una sucursal
 *   existe para él.
 * · El dueño y el administrador LEEN el negocio entero. Pero cuando ESCRIBEN desde una
 *   terminal operan esa sucursal: el cobro entra en ESA caja, la devolución sale de ESE
 *   cajón. Cobrar desde el centro una orden del norte metería dinero del norte en el corte
 *   del centro, y ningún corte cuadraría. Sin terminal —desde su teléfono— no hay caja de
 *   por medio y operan cualquiera.
 */

/**
 * LAS TABLAS QUE SON DE UNA SUCURSAL y que algún comando recibe por id. Una columna
 * `sucursal_id` que admite nulo se lee con su `coalesce` (la fila sin sucursal es del
 * negocio), igual que en el puente; el contrato contra el esquema migrado lo exige.
 */
export const FRONTERA_DE_TABLAS = {
  ordenes: { columna: 'sucursal_id' },
  orden_lineas: { porPadre: { columna: 'orden_id', tabla: 'ordenes' } },
  sesiones_caja: { columna: 'sucursal_id' },
  pagos_credito: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  mesas: { columna: 'sucursal_id' },
  uniones_mesa: { columna: 'sucursal_id' },
  lista_espera: { columna: 'sucursal_id' },
  solicitudes_qr: { porPadre: { columna: 'mesa_id', tabla: 'mesas' } },
  comandas: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  comanda_items: {
    porPadre: { columna: 'comanda_id', tabla: 'comandas', nulaEsDelNegocio: true },
  },
  esquemas_propina: { columna: 'sucursal_id' },
  citas: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  cita_servicios: { porPadre: { columna: 'cita_id', tabla: 'citas', nulaEsDelNegocio: true } },
  profesionales: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  rentas_estacion: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  empleos: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  compras: { columna: 'sucursal_id' },
  compra_lineas: { porPadre: { columna: 'compra_id', tabla: 'compras' } },
  almacenes: { columna: 'sucursal_id' },
  tomas_inventario: { porPadre: { columna: 'almacen_id', tabla: 'almacenes' } },
  piezas_abiertas: { porPadre: { columna: 'almacen_id', tabla: 'almacenes' } },
  ubicaciones: { porPadre: { columna: 'almacen_id', tabla: 'almacenes' } },
  caducidades: { porPadre: { columna: 'almacen_id', tabla: 'almacenes' } },
  cotizaciones: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  notas_mostrador: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  listas_trabajo: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  lineas_lista_trabajo: {
    porPadre: { columna: 'lista_id', tabla: 'listas_trabajo', nulaEsDelNegocio: true },
  },
  garantias_proveedor: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  rentas_herramienta: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  remisiones: { porPadre: { columna: 'orden_id', tabla: 'ordenes' } },
  anticipos_cita: {
    porPadre: { columna: 'cita_id', tabla: 'citas', nulaEsDelNegocio: true },
  },
  liquidaciones: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  lista_espera_citas: { columna: 'sucursal_id', nulaEsDelNegocio: true },
  presencias_turno: { porPadre: { columna: 'sesion_caja_id', tabla: 'sesiones_caja' } },
  // El traspaso se RECIBE en la sucursal de su almacén destino: el que lo manda es otra.
  traspasos: { porPadre: { columna: 'almacen_destino', tabla: 'almacenes' } },
} as const satisfies Readonly<Record<string, Exclude<FronteraDeSucursal, { delNegocio: string }>>>;

export type TablaDeSucursal = keyof typeof FRONTERA_DE_TABLAS;

/**
 * Lo que un comando declara: el camino de cada campo de su entrada que es un id de una
 * tabla de sucursal. `[]` recorre un arreglo: `ordenIds[]`, `particiones[].tomas[].lineaId`.
 * Un id que puede ser de varias tablas —el origen de un documento de crédito es una venta,
 * una remisión o una nota— declara las varias, y cae fuera si lo está en cualquiera.
 */
export type FronteraDelComando = Readonly<
  Record<string, TablaDeSucursal | readonly TablaDeSucursal[]>
>;

export function esTablaDeSucursal(tabla: string): tabla is TablaDeSucursal {
  return Object.prototype.hasOwnProperty.call(FRONTERA_DE_TABLAS, tabla);
}

/** `'particiones[].tomas[].lineaId'` → `['particiones', '[]', 'tomas', '[]', 'lineaId']`. */
export function segmentosDe(camino: string): readonly string[] {
  return camino.split('.').flatMap((parte) => {
    const nombre = parte.replace(/(\[\])+$/, '');
    const arreglos = (parte.length - nombre.length) / 2;
    return [...(nombre === '' ? [] : [nombre]), ...Array.from({ length: arreglos }, () => '[]')];
  });
}

/**
 * De qué sucursal tiene que ser lo que este ámbito toca, o `null` si no hay frontera.
 *
 * `{ sucursalId: null }` es la frontera que falla cerrada: quien no consolida y llega sin
 * sucursal no opera nada que sea de una.
 */
export function fronteraDelAmbito(
  ambito: Pick<Ambito, 'rol' | 'sucursalId'>,
  escribe: boolean,
): { readonly sucursalId: string | null } | null {
  if (!veConsolidado(ambito.rol)) return { sucursalId: ambito.sucursalId };
  return escribe && ambito.sucursalId !== null ? { sucursalId: ambito.sucursalId } : null;
}

/** Los ids que hay en `dato` siguiendo `segmentos`. Lo que no es texto no es un id. */
function idsEn(dato: unknown, segmentos: readonly string[]): string[] {
  if (segmentos.length === 0) return typeof dato === 'string' ? [dato] : [];
  const [primero, ...resto] = segmentos;
  if (primero === '[]') return Array.isArray(dato) ? dato.flatMap((d) => idsEn(d, resto)) : [];
  if (typeof dato !== 'object' || dato === null || primero === undefined) return [];
  return idsEn((dato as Record<string, unknown>)[primero], resto);
}

/** `dato` con los ids de `cambios` cambiados en los caminos dados. No toca el original. */
function cambiarEn(
  dato: unknown,
  segmentos: readonly string[],
  cambios: ReadonlyMap<string, string>,
): unknown {
  if (segmentos.length === 0) {
    return typeof dato === 'string' ? (cambios.get(dato) ?? dato) : dato;
  }
  const [primero, ...resto] = segmentos;
  if (primero === '[]') {
    return Array.isArray(dato) ? dato.map((d) => cambiarEn(d, resto, cambios)) : dato;
  }
  if (typeof dato !== 'object' || dato === null || primero === undefined) return dato;
  const objeto = dato as Record<string, unknown>;
  if (!(primero in objeto)) return dato;
  return { ...objeto, [primero]: cambiarEn(objeto[primero], resto, cambios) };
}

/**
 * La entrada que el cuerpo del comando debe ver: la misma, salvo los ids que son de OTRA
 * sucursal, que llegan cambiados por uno que no existe —el mismo id, el mismo cambio, por
 * si viene repetido—. `fuera` dice, por tabla, cuáles de los ids dados caen fuera.
 */
export async function dentroDeLaSucursal(
  declaracion: FronteraDelComando,
  entrada: unknown,
  fuera: (tabla: TablaDeSucursal, ids: readonly string[]) => Promise<ReadonlySet<string>>,
  nuevoId: () => string,
): Promise<unknown> {
  const porTabla = new Map<TablaDeSucursal, Set<string>>();
  for (const [camino, tablas] of Object.entries(declaracion)) {
    const ids = idsEn(entrada, segmentosDe(camino));
    if (ids.length === 0) continue;
    for (const tabla of typeof tablas === 'string' ? [tablas] : tablas) {
      const de = porTabla.get(tabla) ?? new Set<string>();
      for (const id of ids) de.add(id);
      porTabla.set(tabla, de);
    }
  }

  const cambios = new Map<string, string>();
  for (const [tabla, ids] of porTabla) {
    for (const id of await fuera(tabla, [...ids])) {
      if (!cambios.has(id)) cambios.set(id, nuevoId());
    }
  }
  if (cambios.size === 0) return entrada;

  let resultado = entrada;
  for (const camino of Object.keys(declaracion)) {
    resultado = cambiarEn(resultado, segmentosDe(camino), cambios);
  }
  return resultado;
}
