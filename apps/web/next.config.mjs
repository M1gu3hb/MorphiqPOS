/** @type {import('next').NextConfig} */

/**
 * El `.env` vive en la RAÍZ del monorepo y Next sólo mira el de `apps/web`.
 *
 * Sin esto, `next dev` arrancaba y toda ruta que tocara la base moría con
 * «DATABASE_URL: expected string, received undefined» — con la variable
 * perfectamente puesta dos carpetas más arriba. Duplicar el archivo habría
 * dejado dos sitios donde rotar un secreto, que es peor.
 *
 * `override: false`: lo que ya venga del entorno manda. En Vercel las
 * variables llegan por el entorno y ahí no hay `.env` que leer.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as cargarEnv } from 'dotenv';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
cargarEnv({ path: [join(RAIZ, '.env.local'), join(RAIZ, '.env')], override: false, quiet: true });

/**
 * Cabeceras de seguridad que no dependen de la peticion.
 * La CSP se pone en middleware.ts porque necesita un nonce por peticion.
 *
 * Cierra SEC-HEADERS de 06-DEFECTOS §4: ninguno de los dos sistemas fuente
 * enviaba nada de esto.
 */
const cabecerasDeSeguridad = [
  // El navegador no adivina el tipo de un archivo. Corta la via de subir un
  // .txt que el navegador decide ejecutar como script (relacionado con SEC-UPLOAD).
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // No filtrar la ruta completa a terceros. Una URL de MorphiqPOS lleva ids de
  // organizacion y de orden.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Un POS no necesita camara, microfono ni ubicacion del navegador. El escaner
  // por camara se habilita explicitamente en su ruta cuando llegue en F1.2.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },

  // Legado, pero sigue siendo la unica defensa en navegadores viejos que no
  // entienden frame-ancestors. La CSP lo repite.
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig = {
  reactStrictMode: true,

  // Los paquetes del monorepo se consumen como codigo TypeScript, sin paso de
  // compilacion propio. Es lo que permite que un proyecto de cliente declare
  // dependencias en vez de copiar codigo (A-01, R3).
  transpilePackages: ['@morphiqpos/ui', '@morphiqpos/contracts', '@morphiqpos/domain'],

  /**
   * La raiz del trazado de archivos es el MONOREPO, no `apps/web`.
   *
   * Sin esto, Next decide que la raiz es la carpeta de la aplicacion y la
   * funcion serverless sale sin los paquetes del workspace. En local no se
   * nota —el enlace simbolico de pnpm resuelve igual— y en Vercel la primera
   * peticion muere con «Cannot find module '@morphiqpos/data'».
   */
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), '..', '..'),

  // R19: el build NO se completa con errores de tipos. Next permite apagarlo;
  // aqui se deja explicito para que nadie lo apague "temporalmente".
  //
  // La clave `eslint` desapareció en Next 16 y el config avisaba de ella en cada
  // arranque. El lint no se perdió: `pnpm verify` corre `eslint .` sobre el
  // monorepo entero antes del build, que además cubre los paquetes y no sólo
  // apps/web.
  typescript: { ignoreBuildErrors: false },

  // No anunciar la version del framework.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: cabecerasDeSeguridad }];
  },
};

export default nextConfig;
