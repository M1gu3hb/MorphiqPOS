'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';

import { ConfigProvider } from '@/mh/lib/ConfigContext';
import { POSAuthProvider } from '@/mh/lib/POSAuthContext';
import { ThemeProvider } from '@/mh/lib/ThemeContext';

/**
 * Los proveedores de la aplicacion, en un solo sitio.
 *
 * `sonner` es el UNICO sistema de avisos (P2-07): la tiendita llego a tener
 * tres conviviendo —sonner activo, react-hot-toast y el toast de Radix— y nadie
 * sabia cual saldria.
 *
 * ── El tema ya no lo lleva next-themes ────────────────────────────────────
 * Lo lleva SU `ThemeContext`, con su clave `mh_theme` y su clase `.dark`. Dos
 * sistemas de tema conviviendo es la misma trampa que los tres sistemas de
 * avisos: uno pone la clase, el otro la quita, y nadie sabe cuál gana. El
 * guion que evita el parpadeo lo inyecta `layout.tsx` con el nonce de la CSP.
 */

function crearClienteConsultas(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Un POS muestra dinero y existencias. Preferimos revalidar de mas que
        // ensenar un stock viejo mientras alguien cobra.
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: true,
        // El tiempo real (Supabase Realtime o equivalente) llega como AVISO y
        // el cliente revalida por la API; nunca como fuente de datos
        // (04-ARQUITECTURA §4). Por eso no se desactiva la revalidacion.
        refetchOnReconnect: true,
      },
      mutations: {
        // Los comandos criticos son idempotentes por clave (R10), asi que un
        // reintento no duplica. Pero reintentar automaticamente un cobro
        // esconderia un fallo real al cajero, y eso no se hace (R12): que lo
        // decida la pantalla, con el error a la vista.
        retry: 0,
      },
    },
  });
}

interface Props {
  readonly children: ReactNode;
}

export function Proveedores({ children }: Props) {
  // Se crea dentro del estado, no en el modulo: en el servidor un cliente por
  // modulo se compartiria entre peticiones de organizaciones distintas.
  const [clienteConsultas] = useState(crearClienteConsultas);

  return (
    <QueryClientProvider client={clienteConsultas}>
      <ThemeProvider>
        <POSAuthProvider>
          <ConfigProvider>
            {children}
            <Toaster
              position="top-right"
              richColors
              closeButton
              // Un aviso que se va solo en 3 segundos no sirve en una caja con
              // ruido y prisa. Los errores no se van solos.
              duration={6000}
            />
          </ConfigProvider>
        </POSAuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
