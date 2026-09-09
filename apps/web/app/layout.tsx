import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { GUION_SIN_PARPADEO } from '@/tema-arranque';
import { CABECERA_NONCE } from '~/seguridad/csp';
import { Proveedores } from '~/proveedores/Proveedores';

import './globals.css';

/**
 * Sus dos fuentes, servidas desde nuestro propio origen.
 *
 * Su `index.css` las pedía a `fonts.googleapis.com`. Aquí eso no funciona: la
 * CSP es `style-src 'self'` y `font-src 'self' data:`, así que el navegador lo
 * bloquearía. `next/font` las descarga en el build, las sirve desde `/_next` y
 * expone la variable que consume su hoja. Mismas familias, mismo aspecto, y
 * sin una petición de terceros que bloquee el pintado.
 */
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--mh-inter' });
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--mh-dm-sans' });

export const metadata: Metadata = {
  title: 'MH Astral POS',
  description: 'Punto de venta de restaurante.',
  icons: { icon: '/icono.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // No se bloquea el zoom: escalar a 200 % sin perder contenido es requisito
  // de accesibilidad.
  maximumScale: 5,
};

/**
 * Layout raíz.
 *
 * Leer las cabeceras vuelve DINÁMICO el renderizado, y eso es a propósito: un
 * nonce por petición no cabe en HTML prerenderizado en el build. Sin esto la
 * CSP bloquea todos los scripts de Next y la página se sirve sin hidratar —se
 * ve bien y no responde a un solo clic—.
 *
 * No se pierde nada: en un POS prácticamente toda pantalla depende de la
 * sesión y del negocio, así que ninguna iba a ser estática.
 */
export default async function LayoutRaiz({ children }: { children: ReactNode }) {
  const nonce = (await headers()).get(CABECERA_NONCE) ?? undefined;

  return (
    <html lang="es-MX" suppressHydrationWarning className={`${inter.variable} ${dmSans.variable}`}>
      <head>
        {/* Pone la clase del tema ANTES del primer pintado. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: GUION_SIN_PARPADEO }} />
      </head>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
