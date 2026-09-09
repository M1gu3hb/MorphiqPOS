'use client';

import { Boxes, CookingPot, House, KeyRound, Settings2, Sparkles, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { navegacionParaPaquete, type Paquete } from '@morphiqpos/contracts';
import { obtenerApi } from '../../src/cliente/api';

const ICONOS = {
  inicio: House,
  productos: Boxes,
  inventario: Warehouse,
  recetas: CookingPot,
  accesos: KeyRound,
  configuracion: Settings2,
} as const;

interface SesionApi {
  readonly paquete: Paquete;
  readonly nombreNegocio: string;
  readonly nombreSucursal: string | null;
  readonly rol: string;
}

export function NavegacionGestion() {
  const ruta = usePathname();
  const [sesion, setSesion] = useState<SesionApi>({
    paquete: 'tienda',
    nombreNegocio: 'MorphiqPOS',
    nombreSucursal: null,
    rol: '',
  });
  useEffect(() => {
    void obtenerApi<SesionApi>('/api/catalogo/sesion')
      .then(setSesion)
      .catch(() => undefined);
  }, []);
  const destinos = navegacionParaPaquete(sesion.paquete);
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-superficie lg:flex">
        <Link href="/productos" className="flex h-20 items-center gap-3 border-b px-6">
          <span className="grid size-[var(--altura-control)] place-items-center rounded-xl bg-primario text-primario-texto shadow-2">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <span>
            <strong className="block font-display text-lg">MorphiqPOS</strong>
            <span className="text-xs text-texto-sutil">Gestión del negocio</span>
          </span>
        </Link>
        <nav aria-label="Gestión" className="grid gap-1 p-4">
          {destinos.map((destino) => {
            const activo = ruta === destino.href;
            const Icono = ICONOS[destino.icono];
            return (
              <Link
                key={destino.href}
                href={destino.href}
                aria-current={activo ? 'page' : undefined}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-texto-sutil transition hover:bg-fondo-sutil hover:text-texto aria-[current=page]:bg-primario aria-[current=page]:text-primario-texto"
              >
                <Icono aria-hidden="true" /> {destino.etiqueta}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t p-5 text-xs leading-relaxed text-texto-sutil">
          <p className="font-medium text-texto">{sesion.nombreNegocio}</p>
          <p>
            {sesion.nombreSucursal ?? 'Alcance general'} · {sesion.rol || 'Sesión pendiente'}
          </p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-[calc(var(--altura-control)*1.6)] items-center justify-between border-b bg-superficie/95 px-4 backdrop-blur lg:hidden">
        <Link href="/productos" className="flex items-center gap-2 font-display font-semibold">
          <span className="grid size-[calc(var(--altura-control)*0.8)] place-items-center rounded-lg bg-primario text-primario-texto">
            <Sparkles aria-hidden="true" className="size-4" />
          </span>
          MorphiqPOS
        </Link>
        <nav aria-label="Gestión móvil" className="flex items-center gap-1">
          {destinos.map((destino) => {
            const Icono = ICONOS[destino.icono];
            return (
              <Link
                key={destino.href}
                href={destino.href}
                aria-label={destino.etiqueta}
                aria-current={ruta === destino.href ? 'page' : undefined}
                className="grid size-[var(--altura-control)] place-items-center rounded-md text-texto-sutil aria-[current=page]:bg-primario aria-[current=page]:text-primario-texto"
              >
                <Icono aria-hidden="true" />
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
