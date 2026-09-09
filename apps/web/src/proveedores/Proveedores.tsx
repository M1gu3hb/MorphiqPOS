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
export function Proveedores({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClientInstance}>
        <POSAuthProvider>
          <ConfigProvider>{children}</ConfigProvider>
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
