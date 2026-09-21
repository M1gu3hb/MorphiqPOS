'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

import { Toaster } from '@/components/ui/toaster';
import { ConfigProvider } from '@/lib/ConfigContext';
import { POSAuthProvider } from '@/lib/POSAuthContext';
import { queryClientInstance } from '@/lib/query-client';
import { ThemeProvider } from '@/lib/ThemeContext';

/**
 * Los proveedores de la aplicación — los SUYOS, en su orden.
 *
 * Es su `App.jsx` sin el enrutador y sin `AuthProvider`. Lo demás está igual:
 * su `ThemeProvider` fuera, su `queryClientInstance` con sus opciones, su
 * `POSAuthProvider`, su `ConfigProvider`, su `<Toaster/>` de shadcn y su
 * `<SonnerToaster/>` con las mismas cinco props.
 *
 * `AuthProvider` no se porta: era la autenticación de la plataforma que
 * desapareció. El rol lo da `empleos` y la sesión vive en una cookie firmada.
 */
/**
 * ── POR QUÉ LA CONFIGURACIÓN SÓLO SE MONTA CON SESIÓN ─────────────────
 * `ConfigProvider` pide la configuración del negocio al montarse, y este árbol
 * envuelve TODA la aplicación —incluida la pantalla de acceso—. Sin sesión esa
 * consulta contesta **401**, así que cada visita a `/login-pos` escribía un error en
 * la consola del navegador antes de que nadie teclee su PIN. Lo encontró el
 * rastreador, que vigila la consola: un 401 ahí no rompe nada y ensucia la señal de
 * lo que sí rompe.
 *
 * Sin proveedor, `useConfig()` devuelve el `DEFAULT_CONFIG` del contexto —que es
 * exactamente lo que la pantalla de acceso necesita: la marca de la plataforma—, así
 * que no se pierde nada. Con sesión se monta igual que siempre.
 */
export function Proveedores({
  children,
  conSesion,
}: {
  readonly children: ReactNode;
  readonly conSesion: boolean;
}) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClientInstance}>
        <POSAuthProvider>
          {conSesion ? <ConfigProvider>{children}</ConfigProvider> : children}
        </POSAuthProvider>
        <Toaster />
        <SonnerToaster
          richColors
          position="top-right"
          closeButton
          duration={3500}
          visibleToasts={4}
          swipeDirections={['top', 'right']}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
