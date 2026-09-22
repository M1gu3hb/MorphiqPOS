import type { Metadata, Viewport } from 'next';
import { DM_Sans, Inter } from 'next/font/google';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { GUION_SIN_PARPADEO } from '@/tema-arranque';
import { NOMBRE_COOKIE } from '@morphiqpos/app/http';
import { APARIENCIA_POR_OMISION, aparienciaDeLaOrganizacion } from '@morphiqpos/app/configuracion';
import { negociosDelDespliegue } from '@morphiqpos/app/negocio';

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

/**
 * De qué negocio es la piel que se pinta, con sesión y sin ella.
 *
 * Aparte del componente porque tiene tres caminos y cada uno con su razón, y un
 * ternario de tres ramas dentro del `layout` esconde la de en medio — que es la única
 * que no es obvia.
 *
 * NUNCA lanza. Es un dato decorativo: una pantalla de acceso que no abre porque el
 * color no se pudo leer sería un desastre causado por un adorno.
 */
async function aparienciaDelDespliegue(
  sesion: { readonly organizacionId: string } | null,
  host: string | null,
) {
  if (sesion !== null) return aparienciaDeLaOrganizacion(sesion.organizacionId);
  try {
    const negocios = await negociosDelDespliegue(process.env['ORGANIZACION'], host);
    // Uno solo: es SU pantalla de acceso. Varios —las cinco demostraciones en un
    // despliegue— no tienen una respuesta correcta, y se pinta con la base.
    const unico = negocios.length === 1 ? negocios[0] : undefined;
    if (unico === undefined) return APARIENCIA_POR_OMISION;
    return await aparienciaDeLaOrganizacion(unico.organizacionId);
  } catch {
    return APARIENCIA_POR_OMISION;
  }
}

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
   * Va aquí y no en un efecto del cliente porque los tokens de color viven bajo
   * `[data-estilo]` y los nombres en inglés que pinta la aplicación derivan de ellos:
   * aplicarlo tras hidratar sería medio segundo de otro estilo en CADA carga. Y nunca
   * lanza: si la base no contesta se pinta con el estilo base y la aplicación sigue.
   *
   * ── Y LA PANTALLA DE ACCESO TAMBIÉN, cuando se puede ─────────────────────
   * Antes se pintaba siempre con el estilo base «porque sin sesión no hay negocio del
   * que leerla». Sí lo hay: un despliegue sirve a UN negocio (R16) y el servidor ya
   * sabe cuál —`negociosDelDespliegue`, del host o de la configuración—, que es la
   * misma resolución con la que la pantalla de acceso arma sus tarjetas de personas.
   *
   * Importa porque los atributos llegan en el PRIMER pintado del día, antes de que
   * nadie teclee un PIN: la primera pantalla con tokens que se abra ya está en el
   * estilo de su negocio, sin el salto de medio segundo que habría si el estilo
   * llegara al entrar. Y no es un parámetro del cliente —eso sería R16 al revés—: es
   * configuración del servidor, la misma con la que esa pantalla arma sus tarjetas.
   *
   * Lo que NO cambia, y está bien que no cambie: la pantalla de acceso EN SÍ. Es de
   * `heredado/`, se pinta con su propio degradado y la cubre `verify:aspecto`. Los
   * atributos están puestos en su `<html>`; lo que no hay es una sola clase suya que
   * los consuma, y cambiárselas sería romper el diseño que Miguel entregó.
   *
   * Cuando el despliegue sirve a VARIOS —las cinco demostraciones a la vez— no hay
   * una respuesta correcta, y ahí sí se pinta con la base.
   */
  const sesion = conSesion ? await sesionDelServidor() : null;
  const apariencia = await aparienciaDelDespliegue(sesion, cabeceras.get('host'));

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
       * Desde la etapa 5 el estilo lo elige cada organización desde Modo Presentación,
       * y desde la 4.4 cada demostración nace con el suyo. Esto ya no es siempre
       * `morphiq`: es lo que ese negocio guardó.
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
