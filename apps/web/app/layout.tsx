import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { atributosDeEstilo } from '@morphiqpos/ui';

import { CABECERA_NONCE } from '@/seguridad/csp';
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
 *
 * Leer las cabeceras vuelve DINAMICO el renderizado, y eso es a proposito:
 * un nonce por peticion no cabe en HTML prerenderizado en el build. Sin esto
 * la CSP bloquea todos los scripts de Next y la pagina se sirve sin hidratar
 * — se ve bien y no responde a un solo clic.
 *
 * No se pierde nada: en un POS practicamente toda pantalla depende de la
 * sesion, del negocio y de la terminal, asi que ninguna iba a ser estatica.
 */
export default async function LayoutRaiz({ children }: { children: ReactNode }) {
  // Fuerza el renderizado dinamico para que Next firme sus <script> con el
  // nonce que puso el middleware, y recupera ese nonce para los scripts que
  // inyectan las librerias.
  const nonce = (await headers()).get(CABECERA_NONCE) ?? undefined;

  const estilo = atributosDeEstilo('premium');

  return (
    <html lang="es-MX" suppressHydrationWarning {...estilo}>
      <body>
        <Proveedores {...(nonce === undefined ? {} : { nonce })}>{children}</Proveedores>
      </body>
    </html>
  );
}
