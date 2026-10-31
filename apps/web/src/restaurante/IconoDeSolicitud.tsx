import { ClipboardList, Hand, Receipt, type LucideIcon } from 'lucide-react';

import type { TipoSolicitud } from './globos-de-solicitud';

const ICONOS: Readonly<Record<TipoSolicitud, LucideIcon>> = {
  ayuda: Hand,
  cuenta: Receipt,
  ordenar: ClipboardList,
};

const TONOS: Readonly<Record<TipoSolicitud, string>> = {
  ayuda: 'bg-peligro text-peligro-texto',
  cuenta: 'bg-exito text-exito-texto',
  ordenar: 'bg-acento text-acento-texto',
};

/** Sobre la altura de control: la perilla de densidad los encoge con todo lo demás. */
const TAMANOS = {
  globo: { circulo: 'size-[calc(var(--altura-control)*0.65)]', icono: 'size-4' },
  lista: {
    circulo: 'size-[calc(var(--altura-control)*1.1)]',
    icono: 'size-[calc(var(--altura-control)*0.55)]',
  },
} as const;

/**
 * El icono de un tipo de solicitud en su círculo de color (DP-9.2, DP-9.3). El color nunca va
 * solo: quien lo usa pone al lado el texto del tipo.
 */
export function IconoDeSolicitud({
  tipo,
  tamano,
}: {
  readonly tipo: TipoSolicitud;
  readonly tamano: keyof typeof TAMANOS;
}) {
  const Icono = ICONOS[tipo];
  const medidas = TAMANOS[tamano];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${medidas.circulo} ${TONOS[tipo]}`}
    >
      <Icono aria-hidden className={medidas.icono} />
    </span>
  );
}
