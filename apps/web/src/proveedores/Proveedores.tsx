'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';

/**
 * Los proveedores de la aplicacion, en un solo sitio.
 *
 * `sonner` es el UNICO sistema de avisos (P2-07): la tiendita llego a tener
 * tres conviviendo —sonner activo, react-hot-toast y el toast de Radix— y nadie
 * sabia cual saldria.
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

export function Proveedores({ children }: { children: ReactNode }) {
  // Se crea dentro del estado, no en el modulo: en el servidor un cliente por
  // modulo se compartiria entre peticiones de organizaciones distintas.
  const [clienteConsultas] = useState(crearClienteConsultas);

  return (
    <QueryClientProvider client={clienteConsultas}>
      <ThemeProvider
        attribute="class"
        // La clase es "oscuro", no "dark": el CSS del sistema de diseno la usa
        // asi, y el idioma del codigo de dominio es espanol.
        value={{ light: 'claro', dark: 'oscuro' }}
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster
          position="top-right"
          richColors
          closeButton
          // Un aviso que se va solo en 3 segundos no sirve en una caja con
          // ruido y prisa. Los errores no se van solos.
          duration={6000}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
