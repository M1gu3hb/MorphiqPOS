'use client';

import { Boxes, Settings2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DESTINOS = [
  { href: '/productos', nombre: 'Productos', icono: Boxes },
  { href: '/configuracion', nombre: 'Configuración', icono: Settings2 },
] as const;

export function NavegacionGestion() {
  const ruta = usePathname();
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
          {DESTINOS.map((destino) => {
            const activo = ruta === destino.href;
            const Icono = destino.icono;
            return (
              <Link
                key={destino.href}
                href={destino.href}
                aria-current={activo ? 'page' : undefined}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-texto-sutil transition hover:bg-fondo-sutil hover:text-texto aria-[current=page]:bg-primario aria-[current=page]:text-primario-texto"
              >
                <Icono aria-hidden="true" /> {destino.nombre}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t p-5 text-xs leading-relaxed text-texto-sutil">
          <p className="font-medium text-texto">Ferretería La Broca</p>
          <p>Sucursal Centro · Administrador</p>
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
          {DESTINOS.map((destino) => {
            const Icono = destino.icono;
            return (
              <Link
                key={destino.href}
                href={destino.href}
                aria-label={destino.nombre}
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
