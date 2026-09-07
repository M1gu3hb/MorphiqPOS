/** @type {import('next').NextConfig} */

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

  // R19: el build NO se completa con errores de tipos o de lint. Next permite
  // apagarlo; aqui se deja explicito para que nadie lo apague "temporalmente".
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // No anunciar la version del framework.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: cabecerasDeSeguridad }];
  },
};

export default nextConfig;
