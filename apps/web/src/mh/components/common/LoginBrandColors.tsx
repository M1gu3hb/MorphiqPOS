'use client';

import { useEffect } from 'react';

import { BRAND_DEFAULTS, applyBrandPalette, buildBrandPalette } from '../../lib/brandColors.ts';
import { useConfig } from '../../lib/ConfigContext.tsx';

/**
 * Variante del BrandColorsApplier dedicada al login.
 *
 * El login se renderiza FUERA de AppLayout (no tiene Sidebar ni
 * BrandColorsApplier global) y sí necesita las vars de marca para
 * mostrar el degradado y el glow personalizados.
 *
 * Esto solo aplica vars a <html>. No revierte al desmontar (las vars
 * sobreviven y AppLayout las pisa al entrar; comportamiento idéntico
 * pero sin parpadeo).
 *
 * Portado de `historico/restaurante/src/components/common/LoginBrandColors.jsx`.
 *
 * Nota: en la pantalla de acceso todavía no hay sesión, así que
 * `/api/catalogo/configuracion` responde 401 y los colores son los de la
 * plataforma. Es correcto —la marca del negocio no se enseña a quien aún no ha
 * entrado— y su diseño ya lo contemplaba: cada `var()` de esta pantalla lleva
 * su color de reserva escrito al lado.
 */
export default function LoginBrandColors() {
  const { config } = useConfig();
  const primario = config.color_primario || BRAND_DEFAULTS.color_primario;
  const acento = config.color_acento || BRAND_DEFAULTS.color_acento;

  useEffect(() => {
    applyBrandPalette(buildBrandPalette(primario, acento));
  }, [primario, acento]);

  return null;
}
