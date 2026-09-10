import { ErrorDominio } from '@morphiqpos/contracts';

/**
 * La cadena Producto → Categoría → Estación, y el reparto por área (F1-04 §11.2).
 *
 * Puro: entra la categoría del producto y la lista de estaciones activas, sale
 * la estación. Se prueba sin base de datos porque es donde se decide a qué
 * pantalla de cocina llega cada plato, y equivocarse ahí no da error: da un
 * pedido que nadie ve.
 *
 * ── Una diferencia deliberada con `preparacionEstacionUtils.js` ────────────
 * El original «nunca lanza»: cuando no hay Cocina general devuelve un objeto
 * sintético con `id` vacío, y la comanda acaba en un grupo llamado `general`
 * que no existe en la base. Aquí eso es `ESTACION_NO_ENCONTRADA`. La estación
 * general está garantizada por la semilla de F1-04 §34.28 y por el índice único
 * `estaciones_una_general`; si aun así falta, el negocio está mal dado de alta
 * y hay que decirlo, no fabricar una estación de humo (R12).
 */

export const AREAS_PREPARACION = ['cocina', 'barra', 'ambos', 'ninguno'] as const;
export type AreaPreparacion = (typeof AREAS_PREPARACION)[number];

/** Las dos áreas que sí producen comanda. `ambos` produce las dos; `ninguno`, ninguna. */
export type AreaComanda = 'cocina' | 'barra';

/**
 * A qué áreas va un producto.
 *
 * `ambos` devuelve dos, y eso es lo que hace que una jarra de sangría con
 * botana genere una comanda en cocina y otra en barra (`POS.jsx:396`). Un valor
 * desconocido se trata como `ninguno`: no se inventa un destino de cocina para
 * un dato que no entendemos.
 */
export function areasDe(areaPreparacion: string): readonly AreaComanda[] {
  if (areaPreparacion === 'ambos') return ['cocina', 'barra'];
  if (areaPreparacion === 'cocina' || areaPreparacion === 'barra') return [areaPreparacion];
  return [];
}

export interface EstacionCandidata {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
  readonly esGeneral: boolean;
}

export interface EstacionResuelta {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
  /** `true` cuando se llegó por la Cocina general y no por la categoría. */
  readonly porRespaldo: boolean;
}

/**
 * Resuelve la estación de un producto a partir de la estación de su categoría.
 *
 * Tres tramos, en este orden:
 *   1. La categoría tiene estación y esa estación sigue activa → esa.
 *   2. No tiene, o la que tenía se desactivó → la estación `es_general`.
 *   3. No hay `es_general` → falla. Regla 10 de `F1-01` §3.
 *
 * `estaciones` debe traer SÓLO las activas: una estación apagada no recibe
 * comandas, y filtrarlo aquí obligaría a esta función a conocer el borrado
 * suave del catálogo.
 */
export function resolverEstacion(
  estacionDeLaCategoria: string | null,
  estaciones: readonly EstacionCandidata[],
): EstacionResuelta {
  if (estacionDeLaCategoria !== null) {
    const directa = estaciones.find((e) => e.id === estacionDeLaCategoria);
    if (directa !== undefined) return { ...sinBandera(directa), porRespaldo: false };
  }

  const general = estaciones.find((e) => e.esGeneral);
  if (general !== undefined) return { ...sinBandera(general), porRespaldo: true };

  throw new ErrorDominio(
    'ESTACION_NO_ENCONTRADA',
    'No hay ninguna estación de preparación activa. Crea la "Cocina general" en Configuración ' +
      'antes de enviar pedidos.',
  );
}

function sinBandera(estacion: EstacionCandidata): { id: string; nombre: string; color: string } {
  return { id: estacion.id, nombre: estacion.nombre, color: estacion.color };
}

/** Lo que el reparto necesita saber de una línea, y nada más. */
export interface LineaParaRepartir {
  readonly areaPreparacion: string;
  readonly estacion: EstacionResuelta;
}

export interface GrupoDeComanda<T> {
  readonly area: AreaComanda;
  readonly estacion: EstacionResuelta;
  readonly lineas: readonly T[];
}

/**
 * Reparte las líneas en comandas: una por (área × estación).
 *
 * Dos platos de la misma estación y la misma área comparten comanda —la cocina
 * quiere un solo ticket— y un producto de área `ambos` aparece en DOS grupos,
 * que es la regla que este reparto existe para cumplir: una comanda a cocina y
 * otra a barra, las dos apuntando a la misma orden.
 *
 * El orden de los grupos es el de aparición de la primera línea que los abre,
 * para que el ticket de cocina salga en el orden en que el mesero capturó.
 */
export function agruparEnComandas<T extends LineaParaRepartir>(
  lineas: readonly T[],
): readonly GrupoDeComanda<T>[] {
  const grupos = new Map<string, { area: AreaComanda; estacion: EstacionResuelta; lineas: T[] }>();

  for (const linea of lineas) {
    for (const area of areasDe(linea.areaPreparacion)) {
      const clave = `${area} ${linea.estacion.id}`;
      const existente = grupos.get(clave);
      if (existente === undefined) {
        grupos.set(clave, { area, estacion: linea.estacion, lineas: [linea] });
      } else {
        existente.lineas.push(linea);
      }
    }
  }

  return [...grupos.values()].map((grupo) => ({
    area: grupo.area,
    estacion: grupo.estacion,
    lineas: [...grupo.lineas],
  }));
}
