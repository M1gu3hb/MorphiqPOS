'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dinero } from '@morphiqpos/ui/sistema';
import { Plus } from 'lucide-react';
import type { ReactElement } from 'react';

/** Lo que el menú público manda de cada platillo y este renglón lee. */
export interface PlatilloPublico {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion?: string | null;
  /** Centavos exactos en cadena (`lista-blanca.ts`); nulo si el negocio apaga los precios. */
  readonly precio_venta_centavos?: string | null;
  readonly tipo_venta?: string | null;
  readonly unidad_variable?: string | null;
  readonly modificadores?: readonly unknown[] | null;
}

export interface PlatilloParaPedirProps {
  readonly platillo: PlatilloPublico;
  readonly mostrarPrecios: boolean;
  /** Abre el mismo diálogo que el menú de siempre: cantidad, opciones y nota. */
  readonly alPedir: () => void;
}

/**
 * UN PLATILLO BAJO SU PÁGINA DEL MENÚ PERSONALIZADO (DP-5, portal QR).
 *
 * La imagen de la página ya enseña el platillo con su diseño; este renglón es el botón de
 * pedirlo, compacto: nombre, su detalle, el precio —por kilo si se vende por peso— y «Agregar»,
 * que abre el MISMO diálogo que el menú de siempre (cantidad, sabor o relleno, nota).
 */
export function PlatilloParaPedir({
  platillo,
  mostrarPrecios,
  alPedir,
}: PlatilloParaPedirProps): ReactElement {
  const centavos =
    typeof platillo.precio_venta_centavos === 'string' ? Number(platillo.precio_venta_centavos) : 0;
  const porMedida = platillo.tipo_venta === 'variable_medida';
  const conOpciones = (platillo.modificadores?.length ?? 0) > 0;
  return (
    <li className="flex items-center gap-(--espacio-3) py-(--espacio-2)">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{platillo.nombre}</span>
        {typeof platillo.descripcion === 'string' && platillo.descripcion !== '' ? (
          <span className="text-xs text-texto-sutil">{platillo.descripcion}</span>
        ) : null}
        {conOpciones ? (
          <span className="text-xs text-texto-sutil">Eliges la opción al agregarlo</span>
        ) : null}
      </div>
      {mostrarPrecios && centavos > 0 ? (
        <span className="flex shrink-0 items-baseline gap-(--espacio-1)">
          <Dinero centavos={centavos} tamano="sm" />
          {porMedida && typeof platillo.unidad_variable === 'string' ? (
            <span className="text-xs text-texto-sutil">/ {platillo.unidad_variable}</span>
          ) : null}
        </span>
      ) : null}
      <Button type="button" size="sm" onClick={alPedir} aria-label={`Agregar ${platillo.nombre}`}>
        <Plus aria-hidden="true" />
        Agregar
      </Button>
    </li>
  );
}
