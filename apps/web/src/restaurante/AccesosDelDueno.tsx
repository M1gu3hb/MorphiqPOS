'use client';

import Link from 'next/link';
import { Superficie } from '@morphiqpos/ui/sistema';
import { usePOSAuth } from '@/lib/POSAuthContext';
import {
  ArrowUpRight,
  ChefHat,
  LayoutGrid,
  Landmark,
  Palette,
  Presentation,
  Settings,
} from 'lucide-react';

const ACCESOS = [
  {
    href: '/mesero',
    nombre: 'Mesas y pedidos',
    detalle: 'Mapa del restaurante y atención',
    icono: LayoutGrid,
  },
  { href: '/caja', nombre: 'Caja', detalle: 'Cuentas pendientes y cobros', icono: Landmark },
  { href: '/cocina', nombre: 'Cocina', detalle: 'Preparación y entregas', icono: ChefHat },
  {
    href: '/configuracion?tab=mesas',
    nombre: 'Distribución de mesas',
    detalle: 'Acomoda tu restaurante',
    icono: Settings,
  },
  {
    href: '/configuracion?tab=apariencia',
    nombre: 'Apariencia',
    detalle: 'Ocho estilos y sus ajustes',
    icono: Palette,
  },
  {
    href: '/configuracion?tab=presentacion',
    nombre: 'Presentación',
    detalle: 'Recorre los modelos de negocio',
    icono: Presentation,
  },
];

export function AccesosDelDueno() {
  const { posUser } = usePOSAuth();
  if (!posUser || !['administrador', 'dueno'].includes(posUser.rol)) return null;
  // En presentación al cliente el tablero va limpio: estos accesos son de Miguel, no del
  // cliente que mira (21-10). Ocultarlos no quita permisos; el servidor sigue decidiendo.
  if (posUser.enPresentacion === true) return null;
  return (
    <Superficie como="section" aria-label="Control del restaurante" className="md:p-(--espacio-5)">
      <div className="mb-(--espacio-4) flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Control del restaurante</h2>
          <p className="text-sm text-texto-sutil">
            Operación, configuración y presentación desde tu panel.
          </p>
        </div>
        <span className="rounded-full bg-primario/10 px-(--espacio-3) py-1 text-xs font-medium text-primario">
          {posUser.etiqueta ?? 'Dueño'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {ACCESOS.map(({ href, nombre, detalle, icono: Icono }) => (
          <Link
            key={href}
            href={href}
            className="group flex min-h-20 items-center gap-(--espacio-3) rounded-xl border border-borde p-(--espacio-3) transition hover:border-primario focus-visible:outline-2 focus-visible:outline-primario"
          >
            <Icono className="size-5 shrink-0 text-primario" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{nombre}</span>
              <span className="block text-xs text-texto-sutil">{detalle}</span>
            </span>
            <ArrowUpRight className="size-4 text-texto-sutil" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Superficie>
  );
}
