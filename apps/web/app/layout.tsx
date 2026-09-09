import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { atributosDeEstilo } from '@morphiqpos/ui';

import { CABECERA_NONCE } from '@/seguridad/csp';
import { GUION_SIN_PARPADEO } from '@/mh/lib/temaArranque';
import { Proveedores } from '@/proveedores/Proveedores';

import './globals.css';

/**
 * Sus dos fuentes, servidas desde nuestro propio origen.
 *
 * Su `index.css` las pedía a `fonts.googleapis.com` con un `@import`. Aquí eso
 * no funciona: la CSP es `style-src 'self'` y `font-src 'self' data:`, así que
 * el navegador lo bloquearía y la tipografía caería al `sans-serif` del
 * sistema. `next/font` las descarga en el build, las sirve desde `/_next` y
 * expone la variable que consume `mh-tokens.css`. Mismas familias, mismo
 * aspecto, y sin una petición de terceros que bloquee el pintado.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--mh-fuente-inter',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--mh-fuente-dm-sans',
});

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

  // Los tokens en español de `@morphiqpos/ui` siguen alimentando a las 36
  // primitivas y a las pantallas que aún no se reemplazan. Se retiran cuando
  // se retire la última que los use.
  const estilo = atributosDeEstilo('premium');

  return (
    <html
      lang="es-MX"
      suppressHydrationWarning
      className={`${inter.variable} ${dmSans.variable}`}
      {...estilo}
    >
      <head>
        {/* Pone la clase del tema ANTES del primer pintado. Sin esto la página
            se ve clara y salta a oscura en cada carga: el servidor no puede
            saber qué eligió este dispositivo. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: GUION_SIN_PARPADEO }} />
      </head>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
