'use client';

import type { ReactNode } from 'react';
import { Toaster as SonnerToaster } from 'sonner';

import { Toaster } from '@/components/ui/toaster';
import { ConfigProvider } from '@/lib/ConfigContext';
import { POSAuthProvider } from '@/lib/POSAuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';

import type { AparienciaInicial } from '@morphiqpos/ui/hooks';

import { ProveedorDeApariencia } from './Apariencia';
import { GuardiaDePlantilla, ProveedorDeConsultas } from './ProveedorDeConsultas';
import { VigiaDePresentacion } from './VigiaDePresentacion';

/**
 * Los proveedores de la aplicación — los SUYOS, en su orden.
 *
 * Es su `App.jsx` sin el enrutador y sin `AuthProvider`. Lo demás está igual:
 * su `ThemeProvider` fuera, su `QueryClient` con sus opciones (ahora uno por contexto),
 * su `POSAuthProvider`, su `ConfigProvider`, su `<Toaster/>` de shadcn y su
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
 *
 * Y lo mismo para la pregunta de QUIÉN está dentro: `POSAuthProvider` se monta siempre
 * —la pantalla de acceso necesita su `login`—, pero sin cookie no le pregunta al servidor
 * (`/api/catalogo/sesion` contestaría 401: nadie).
 */
export function Proveedores({
  children,
  conSesion,
  apariencia,
}: {
  readonly children: ReactNode;
  readonly conSesion: boolean;
  /** La apariencia que el servidor ya puso en el `<html>`, perillas incluidas. Aquí se vuelve estado. */
  readonly apariencia: AparienciaInicial;
}) {
  return (
    <ProveedorDeApariencia aparienciaInicial={apariencia}>
      <ThemeProvider>
        <POSAuthProvider conSesion={conSesion}>
          {/*
            El caché de consultas cuelga de QUIÉN está dentro, y por eso va DEBAJO de la
            sesión: cada contexto —negocio, empleo y plantilla— tiene el suyo, y cambiar de
            contexto lo descarta entero, con sus consultas en vuelo
            (`ProveedorDeConsultas`). Los avisos quedan fuera de él: que un aviso siga en
            pantalla al cambiar de contexto es justo lo que se quiere.
          */}
          <ProveedorDeConsultas>
            <VigiaDePresentacion />
            {conSesion ? (
              <ConfigProvider>
                <GuardiaDePlantilla />
                {children}
              </ConfigProvider>
            ) : (
              children
            )}
          </ProveedorDeConsultas>
          <Toaster />
          <SonnerToaster
            richColors
            position="top-right"
            closeButton
            duration={3500}
            visibleToasts={4}
            swipeDirections={['top', 'right']}
          />
        </POSAuthProvider>
      </ThemeProvider>
    </ProveedorDeApariencia>
  );
}
