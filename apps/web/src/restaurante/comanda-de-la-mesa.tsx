import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dinero, Esqueleto, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import { Minus } from 'lucide-react';

import { consultarPuente } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import type { useVocabulario } from '~/cliente/vocabulario';

/**
 * LAS PIEZAS SIN ESTADO DE LA MESA ACTIVA: sus tipos, sus columnas y su lectura.
 *
 * Vivían dentro de `MesaActiva.tsx`, que pasaba de las 800 líneas; salen aquí tal cual
 * para que la pantalla pudiera ganar lo que le faltaba —pedir la cuenta, cambiar de mesa y
 * unir mesas (día completo del restaurante, 2.4)— sin crecer más allá del límite.
 */

/** Un producto del catálogo. El puente entrega el dinero ya en pesos. */
export interface ProductoDeComanda {
  readonly id: string;
  readonly nombre: string;
  readonly precio_venta: number;
  /** Hoy el puente no expone existencia: llega por props hasta que la exponga. */
  readonly agotado?: boolean;
}
/** Una línea YA enviada a cocina: vive en el bloque de arriba, el intocable. */
export interface LineaEnviada {
  readonly id: string;
  readonly producto_nombre: string;
  readonly cantidad: number;
  readonly total: number;
}
export interface MesaAbierta {
  /** Lo que el mapa pasa en la dirección, y lo que el comando pide para ABRIRLA. */
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly personas_actuales: number | null;
  readonly notas_alergias: string | null;
  readonly venta_activa_id: string | null;
}
export interface MesaActivaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly mesaInicial?: MesaAbierta;
  readonly productosIniciales?: readonly ProductoDeComanda[];
  readonly lineasIniciales?: readonly LineaEnviada[];
  /** Los nombres de lo que cocina ya dejó en la ventana. */
  readonly listosIniciales?: readonly string[];
}

export type Vocabulario = ReturnType<typeof useVocabulario>;

/** El estado, como lo dice el salón (`04-INTERFAZ` §4.1): las palabras del mapa. */
export const ESTADOS_DE_MESA: Readonly<Record<string, string>> = {
  libre: 'Libre',
  esperando_orden: 'Esperando orden',
  pedido_enviado: 'Pedido enviado',
  en_preparacion: 'En preparación',
  en_espera_entrega: 'Esperando entrega',
  ocupada: 'Ocupada',
  cuenta_solicitada: 'Cuenta solicitada',
  limpieza: 'Limpieza',
};

/** El precio de un platillo, en centavos. Sin un precio legible cuenta cero, como antes. */
export function precioDe(producto: ProductoDeComanda): number {
  return centavosDe('ProductoTerminado', 'precio_venta', producto.precio_venta) ?? 0;
}

/** Lo que suma una línea ya enviada, en centavos. */
export function importeDe(linea: LineaEnviada): number {
  return centavosDe('DetalleVenta', 'total', linea.total) ?? 0;
}

/** Lo ya enviado de una cuenta, o el fallo. Quien llama decide dónde se dice. */
export type LecturaDeLoEnviado =
  | { readonly leidas: true; readonly lineas: readonly LineaEnviada[] }
  | { readonly leidas: false; readonly fallo: unknown };

export const SIN_LINEAS: LecturaDeLoEnviado = { leidas: true, lineas: [] };

export async function leerLoEnviado(
  ordenId: string,
  opciones: { readonly signal?: AbortSignal } = {},
): Promise<LecturaDeLoEnviado> {
  try {
    const filtro = { venta_id: ordenId };
    const lineas = await consultarPuente<LineaEnviada>('DetalleVenta', {
      filtro,
      limite: 120,
      ...opciones,
    });
    return { leidas: true, lineas };
  } catch (fallo: unknown) {
    return { leidas: false, fallo };
  }
}

/** Lo ya enviado: se lee, y se ANULA con motivo. Nunca se edita. */
export function columnasDeLoEnviado(
  voc: Vocabulario,
  anular: (linea: LineaEnviada) => () => void,
): readonly ColumnaDeTabla<LineaEnviada>[] {
  return [
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (l) => (
        <span className="line-clamp-2">
          <span className="font-numeros font-semibold tabular-nums">{l.cantidad} ×</span>{' '}
          {l.producto_nombre}
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (l) => <Dinero centavos={importeDe(l)} tamano="sm" />,
    },
    {
      clave: 'anular',
      titulo: '',
      celda: (l) => (
        <span className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Anular ${l.producto_nombre}`}
            onClick={anular(l)}
          >
            Anular
          </Button>
        </span>
      ),
    },
  ];
}

/** Lo que está por mandarse: se quita con el botón de su línea, se suma tocando. */
export function columnasDelBorrador(
  voc: Vocabulario,
  cantidadDe: (producto: ProductoDeComanda) => number,
  tocar: (productoId: string, delta: number) => () => void,
): readonly ColumnaDeTabla<ProductoDeComanda>[] {
  return [
    {
      clave: 'cantidad',
      titulo: 'Cant.',
      celda: (p) => (
        <span className="flex items-center gap-(--espacio-2)">
          <Button
            size="icon"
            variant="outline"
            onClick={tocar(p.id, -1)}
            aria-label={`Quitar ${p.nombre}`}
          >
            <Minus />
          </Button>
          <span className="min-w-5 text-center font-numeros font-semibold tabular-nums">
            {cantidadDe(p)}
          </span>
        </span>
      ),
    },
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (p) => <span className="line-clamp-2">{p.nombre}</span>,
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (p) => <Dinero centavos={precioDe(p) * cantidadDe(p)} tamano="sm" />,
    },
  ];
}

/** Cargando: la forma real del catálogo y del panel, no una rueda. */
export function EsqueletoDeLaComanda({ etiqueta }: { readonly etiqueta: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
      className="grid gap-(--espacio-4) p-(--espacio-3) xl:grid-cols-[minmax(0,1fr)_22rem]"
    >
      <div className="flex flex-col gap-(--espacio-3)">
        <Esqueleto className="h-[calc(var(--altura-control)*1.25)] w-full" />
        <div className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Esqueleto key={i} className="min-h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <Esqueleto className="hidden h-96 w-full rounded-lg xl:block" />
    </div>
  );
}
