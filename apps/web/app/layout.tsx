import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { GUION_SIN_PARPADEO } from '@/tema-arranque';
import { NOMBRE_COOKIE } from '@morphiqpos/app/http';
import { APARIENCIA_POR_OMISION, aparienciaDeLaOrganizacion } from '@morphiqpos/app/configuracion';

import { sesionDelServidor } from '~/servidor/http';

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
  const cabeceras = await headers();
  const nonce = cabeceras.get(CABECERA_NONCE) ?? undefined;
  /**
   * ¿Hay sesión? Lo dice la cookie, y con eso basta: no se valida aquí —de eso se
   * encarga cada ruta—, sólo se decide si tiene sentido pedir la configuración del
   * negocio. Sin sesión esa consulta es un 401 garantizado en la consola.
   */
  const conSesion = (cabeceras.get('cookie') ?? '').includes(`${NOMBRE_COOKIE}=`);

  /**
   * LA APARIENCIA DEL NEGOCIO, resuelta EN EL SERVIDOR.
   *
   * Sin sesión —la pantalla de acceso— no hay negocio del que leerla, y se pinta con
   * la base: es la marca de la plataforma, que es lo que esa pantalla enseña.
   *
   * Con sesión se lee la del negocio. Va aquí y no en un efecto del cliente porque
   * los tokens de color viven bajo `[data-estilo]` y los nombres en inglés que pinta
   * la aplicación derivan de ellos: aplicarlo tras hidratar sería medio segundo de
   * otro estilo en CADA carga. Y nunca lanza: si la base no contesta, se pinta con
   * el estilo base y la aplicación sigue.
   */
  const sesion = conSesion ? await sesionDelServidor() : null;
  const apariencia =
    sesion === null
      ? APARIENCIA_POR_OMISION
      : await aparienciaDeLaOrganizacion(sesion.organizacionId);

  return (
    <html
      lang="es-MX"
      suppressHydrationWarning
      className={`${inter.variable} ${dmSans.variable}`}
      /**
       * EL ESTILO Y SUS CUATRO PERILLAS, puestos en el servidor.
       *
       * Sin estos atributos el sistema de diseño no existe: sus tokens de color
       * viven bajo `[data-estilo='…']` y los nombres en inglés que pinta la
       * aplicación DERIVAN de ellos desde la etapa 2.35. Sin `data-estilo` no hay
       * `--fondo`, y sin `--fondo` no hay `--background`.
       *
       * Van en el HTML del servidor y no en un efecto del cliente a propósito: si
       * los pusiera React tras hidratar, la primera pintura sería sin tokens —un
       * destello de página en blanco y negro— en cada carga.
       *
       * `morphiq` es el base y de momento es el de todos. En la etapa 5 lo elige
       * cada organización desde Modo Presentación y esto leerá su preferencia.
       */
      data-estilo={apariencia.estilo}
      data-densidad={apariencia.densidad}
      data-redondeo={apariencia.redondeo}
      data-elevacion={apariencia.elevacion}
      data-movimiento={apariencia.movimiento}
    >
      <head>
        {/* Pone la clase del tema ANTES del primer pintado. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: GUION_SIN_PARPADEO }} />
      </head>
      <body>
        <Proveedores conSesion={conSesion} estilo={apariencia.estilo}>
          {children}
        </Proveedores>
      </body>
    </html>
  );
}
