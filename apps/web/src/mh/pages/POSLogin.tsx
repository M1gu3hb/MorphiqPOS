'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';

import LoginBrandColors from '../components/common/LoginBrandColors.tsx';
import { useConfig } from '../lib/ConfigContext.tsx';
import { ROLE_HOME_ROUTES } from '../lib/constants.ts';
import { usePOSAuth } from '../lib/POSAuthContext.tsx';
import { useAccesoPin } from '../lib/useAccesoPin.ts';
import LoginTeclado from './LoginTeclado.tsx';
import LoginUsuarios from './LoginUsuarios.tsx';

/**
 * Portado de `historico/restaurante/src/pages/POSLogin.jsx`.
 *
 * Es su pantalla: el degradado `#04070f → #0a1428 → #0b1d3a`, los dos halos
 * difuminados con los colores de marca, el logo grande con su `drop-shadow`,
 * el nombre del negocio en `font-heading font-black`, la píldora de «Iniciando
 * como», los cuatro puntos, el teclado y el panel de usuarios abajo.
 *
 * ── La ÚNICA diferencia, y no se negocia ──────────────────────────────────
 * El PIN se valida en el SERVIDOR (ver `useAccesoPin.ts`). Antes se comparaba
 * en el navegador contra la lista de PIN de toda la plantilla. Ese era el
 * agujero P0-01.
 *
 * ── Dos cosas que se cayeron, dichas en voz alta ──────────────────────────
 * · `ensureDefaultAdmin()` — creaba un administrador con PIN `1234` desde el
 *   navegador si no había ninguno. Un alta de credenciales que puede disparar
 *   cualquiera que abra la página no vuelve. El primer acceso lo da
 *   `pnpm db:bootstrap`, del lado del servidor.
 * · El aviso de «sigues usando el PIN 1234» — dependía de leer los PIN desde
 *   el cliente. Con el hash en la base, el navegador no puede saberlo, y para
 *   decírselo habría que mandarle una pista sobre la credencial. No se manda.
 */

export default function POSLogin() {
  const { config } = useConfig();
  const { posUser } = usePOSAuth();
  const router = useRouter();

  const alEntrar = useCallback(
    (ruta: string) => {
      router.replace(ruta);
    },
    [router],
  );

  const acceso = useAccesoPin(alEntrar);

  useEffect(() => {
    if (posUser) router.replace(ROLE_HOME_ROUTES[posUser.rol] ?? '/');
  }, [posUser, router]);

  const sistema = config.nombre_sistema || 'MH Astral Systems POS';
  const negocio = config.nombre_negocio || 'MH Astral Systems';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#04070f] via-[#0a1428] to-[#0b1d3a] relative overflow-hidden">
      {/* Aplica color_primario/color_acento como CSS vars en <html>. */}
      <LoginBrandColors />

      {/* Glow decorativo — usa la paleta de marca dinámica.
          El fondo base siempre es oscuro/premium; solo cambian los tonos del glow. */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[120px]"
          style={{ background: 'var(--brand-primary-glow, rgba(37, 99, 235, 0.20))' }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] opacity-80"
          style={{ background: 'var(--brand-accent-glow, rgba(56, 189, 248, 0.18))' }}
        />
        {config.background_logo_url !== '' && (
          /* Marca de agua decorativa: más visible que antes (0.04 → 0.10)
             con un leve drop-shadow tintado de la marca para que se note
             como elemento premium sin competir con el logo principal. */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.background_logo_url}
            alt=""
            aria-hidden
            className="absolute right-[-10%] bottom-[-10%] w-[55vw] max-w-[700px] select-none brand-watermark"
            style={{
              opacity: 0.1,
              filter: 'drop-shadow(0 0 30px var(--brand-primary-glow, rgba(59,130,246,0.35)))',
              mixBlendMode: 'screen',
            }}
          />
        )}
      </div>

      {/* HEADER central: logo + nombre + PIN + keypad */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        {/* Logo grande sin caja — drop-shadow usa color primario dinámico */}
        {config.logo_url !== '' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={config.logo_url}
            alt={negocio}
            className="w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 object-contain mb-4"
            style={{
              filter: 'drop-shadow(0 0 30px var(--brand-primary-glow, rgba(59,130,246,0.45)))',
            }}
          />
        ) : (
          <div
            className="w-28 h-28 mb-4 rounded-2xl flex items-center justify-center text-5xl font-bold text-white/80"
            style={{ background: 'var(--brand-primary-soft, rgba(37,99,235,0.20))' }}
          >
            M
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl font-heading font-black text-white tracking-wide text-center">
          {negocio}
        </h1>
        <p className="text-white/60 text-sm mt-1 tracking-wider uppercase">{sistema}</p>

        {acceso.selectedUser && (
          <p
            className="mt-3 px-3 py-1 rounded-full border text-white/90 text-xs font-medium"
            style={{
              background: 'var(--brand-accent-soft, rgba(56,189,248,0.15))',
              borderColor: 'var(--brand-accent, rgba(96,165,250,0.4))',
            }}
          >
            Iniciando como: {acceso.selectedUser.nombre}
          </p>
        )}

        <LoginTeclado
          pin={acceso.pin}
          loading={acceso.loading}
          onTecla={acceso.pulsar}
          onBorrar={acceso.borrar}
        />

        {/* Su texto decía «Toca tu nombre o escribe directamente tu PIN». Con la
            comprobación en el servidor, escribir el PIN sin decir quién eres ya
            no puede funcionar —el servidor tendría que probarlo contra toda la
            plantilla—, así que la «o» pasa a ser «y». Se cambia una palabra
            para que la pantalla no prometa algo que el sistema ya no hace. */}
        <p className="text-center text-white/40 text-[11px] mt-4">
          Toca tu nombre y escribe tu PIN · Enter para entrar
        </p>
      </div>

      {/* USUARIOS abajo, full-width */}
      <LoginUsuarios
        usuarios={acceso.usuarios}
        cargando={acceso.usuariosCargando}
        error={acceso.usuariosError}
        seleccionado={acceso.selectedUser}
        onSeleccionar={acceso.seleccionar}
        onReintentar={() => {
          void acceso.cargarUsuarios();
        }}
      />
    </div>
  );
}
