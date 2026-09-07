import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { atributosDeEstilo } from '@morphiqpos/ui';

import { Proveedores } from '@/proveedores/Proveedores';

import './globals.css';

export const metadata: Metadata = {
  title: 'MorphiqPOS',
  description: 'Punto de venta de Morphiq.',
  // Sin favicon de framework ni pantalla de bienvenida generada: gate PRS §03,
  // cero componentes de andamiaje visibles.
  icons: { icon: '/icono.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No se bloquea el zoom: escalar a 200 % sin perder contenido es requisito
  // de accesibilidad (05-SISTEMA-DE-DISENO §9).
  maximumScale: 5,
};

/**
 * Layout raiz.
 *
 * El estilo activo se decide aqui y se aplica como atributos `data-*` en
 * `<html>`. En F1.1 saldra de `configuracion.apariencia` de la organizacion;
 * hoy es el valor por omision.
 */
export default function LayoutRaiz({ children }: { children: ReactNode }) {
  const estilo = atributosDeEstilo('premium');

  return (
    <html lang="es-MX" suppressHydrationWarning {...estilo}>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
