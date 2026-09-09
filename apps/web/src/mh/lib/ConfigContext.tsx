'use client';

import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';

import { obtenerApi } from '@/cliente/api';

import { usePOSAuth } from './POSAuthContext.tsx';
import {
  getPackageFeatures,
  getPackageLabel,
  canAccessModule as canAccessModuleHelper,
  paqueteDesdeGiro,
  type PaqueteMH,
} from './packageConfig.ts';

/**
 * Portado de `historico/restaurante/src/lib/ConfigContext.jsx`.
 *
 * Mismo `useConfig()`, mismo objeto `config` con los mismos nombres de campo,
 * mismos helpers de paquete. Sus pantallas leen `config.nombre_negocio`,
 * `config.color_primario`, `config.iva_porcentaje` igual que antes.
 *
 * ── Lo único que cambia: de dónde salen los datos ─────────────────────────
 * Antes: el SDK de la plataforma que desapareció, listando la entidad
 * `ConfiguracionNegocio`. Ahora: `GET /api/catalogo/configuracion`, que
 * resuelve la organización desde la cookie de sesión — un negocio no puede
 * leer la configuración de otro ni pidiéndolo.
 *
 * ── Lo que la base todavía no guarda ──────────────────────────────────────
 * `background_image_url`, `mensaje_ticket`, `usa_mesas`, `modo_presentacion` y
 * compañía siguen tomando el valor por omisión que él escribió: la tabla
 * `configuracion` de esta base guarda hoy contacto, apariencia e impuesto y
 * nada más. Cuando se porten las pantallas que los editan (T4-T6) se agregan
 * al esquema; hasta entonces se comportan como su default, que es exactamente
 * lo que hacían en un negocio recién dado de alta.
 */

export interface ConfigNegocio {
  readonly nombre_negocio: string;
  readonly nombre_sistema: string;
  readonly platform_brand: string;
  readonly logo_url: string;
  readonly logo_ticket_url: string;
  readonly logo_pdf_url: string;
  readonly background_logo_url: string;
  readonly background_image_url: string;
  readonly background_fit: 'cover' | 'contain';
  readonly background_opacity: number;
  readonly color_primario: string;
  readonly color_secundario: string;
  readonly color_acento: string;
  readonly moneda: string;
  readonly simbolo_moneda: string;
  readonly iva_porcentaje: number;
  readonly iva_incluido_en_precio: boolean;
  readonly telefono: string;
  readonly direccion: string;
  readonly usa_mesas: boolean;
  readonly usa_cocina: boolean;
  readonly usa_barra: boolean;
  readonly permitir_venta_sin_stock: boolean;
  readonly mostrar_costos_a_caja: boolean;
  readonly mostrar_logo_ticket: boolean;
  readonly mensaje_ticket: string;
  readonly ticket_footer: string;
  readonly pdf_footer: string;
  readonly footer_text: string;
  readonly descargar_pdf_corte_auto: boolean;
  readonly formato_export_default: string;
  readonly colorear_importes_monetarios: boolean;
  readonly paquete_modo: PaqueteMH;
  readonly modo_presentacion_activo: boolean;
}

const PLATFORM_BRAND = 'MH Astral Systems';
const DEFAULT_SYSTEM_NAME = 'MH Astral POS';

/**
 * El logotipo de la plataforma ya no tiene URL.
 *
 * Vivía en el almacenamiento de la plataforma que desapareció, y además la CSP
 * de esta aplicación es `img-src 'self' data: blob:`: una imagen de otro
 * dominio no cargaría aunque la URL siguiera viva. Vacío es el valor correcto,
 * y su barra lateral ya sabe qué hacer con él — dibuja el icono de marca.
 */
const LOGO_PLATAFORMA = '';

const DEFAULT_CONFIG: ConfigNegocio = {
  nombre_negocio: PLATFORM_BRAND,
  nombre_sistema: DEFAULT_SYSTEM_NAME,
  platform_brand: PLATFORM_BRAND,
  logo_url: LOGO_PLATAFORMA,
  logo_ticket_url: '',
  logo_pdf_url: '',
  background_logo_url: '',
  background_image_url: '',
  background_fit: 'cover',
  background_opacity: 0.12,
  color_primario: '#1e40af',
  color_secundario: '#0f172a',
  color_acento: '#38bdf8',
  moneda: 'MXN',
  simbolo_moneda: '$',
  iva_porcentaje: 0,
  iva_incluido_en_precio: true,
  telefono: '',
  direccion: '',
  usa_mesas: true,
  usa_cocina: true,
  usa_barra: true,
  permitir_venta_sin_stock: false,
  mostrar_costos_a_caja: false,
  mostrar_logo_ticket: true,
  mensaje_ticket: '¡Gracias por tu visita!',
  ticket_footer: '',
  pdf_footer: '',
  footer_text: '',
  descargar_pdf_corte_auto: true,
  formato_export_default: 'csv',
  colorear_importes_monetarios: true,
  paquete_modo: 'restaurante_pro',
  modo_presentacion_activo: false,
};

/** Lo que devuelve `GET /api/catalogo/configuracion`. */
interface ConfiguracionDelServidor {
  readonly version: number;
  readonly nombreNegocio: string;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly logoUrl: string | null;
  readonly colorPrimario: string;
  readonly colorAcento: string;
  readonly estilo: string;
  readonly paquete: string;
  readonly impuestoPuntosBase: number;
  readonly impuestoIncluidoEnPrecio: boolean;
}

function componer(guardada: ConfiguracionDelServidor | undefined): ConfigNegocio {
  if (guardada === undefined) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    nombre_negocio: guardada.nombreNegocio || PLATFORM_BRAND,
    logo_url: guardada.logoUrl ?? LOGO_PLATAFORMA,
    logo_ticket_url: guardada.logoUrl ?? '',
    logo_pdf_url: guardada.logoUrl ?? '',
    color_primario: guardada.colorPrimario,
    color_acento: guardada.colorAcento,
    telefono: guardada.telefono ?? '',
    direccion: guardada.direccion ?? '',
    // El impuesto se guarda en puntos base para que no exista un 16.000000001.
    // Su interfaz lo enseña en por ciento, así que se divide aquí y en un solo
    // sitio.
    iva_porcentaje: guardada.impuestoPuntosBase / 100,
    iva_incluido_en_precio: guardada.impuestoIncluidoEnPrecio,
    paquete_modo: paqueteDesdeGiro(guardada.paquete),
  };
}

export interface ValorConfig {
  readonly config: ConfigNegocio;
  readonly isLoading: boolean;
  readonly paquete_modo: PaqueteMH;
  readonly modo_presentacion_activo: boolean;
  readonly canAccessModule: (moduleName: string) => boolean;
  readonly packageLabel: string;
  readonly packageFeatures: readonly string[];
}

const ConfigContext = createContext<ValorConfig>({
  config: DEFAULT_CONFIG,
  isLoading: false,
  paquete_modo: DEFAULT_CONFIG.paquete_modo,
  modo_presentacion_activo: false,
  canAccessModule: () => true,
  packageLabel: getPackageLabel(DEFAULT_CONFIG.paquete_modo),
  packageFeatures: getPackageFeatures(DEFAULT_CONFIG.paquete_modo),
});

export function ConfigProvider({ children }: { readonly children: ReactNode }) {
  const { posUser } = usePOSAuth();

  // Sin `initialData` para distinguir "primer fetch" de "vacío real".
  // `placeholderData` mantiene el valor previo durante el refetch y evita el
  // parpadeo de los interruptores en cualquier pantalla que use useConfig.
  const { data, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: () => obtenerApi<ConfiguracionDelServidor>('/api/catalogo/configuracion'),
    placeholderData: (prev) => prev,
    staleTime: 3000,
    // La configuración es del negocio de QUIEN ENTRÓ. Sin sesión responde 401,
    // así que ni se pide: en la pantalla de acceso la consulta fallaba en cada
    // foco de ventana y llenaba la consola de errores que no eran errores.
    // Ahí los colores son los de reserva, que es lo correcto — la marca del
    // negocio no se le enseña a quien todavía no ha entrado.
    enabled: posUser !== null,
    retry: false,
  });

  const config = componer(data);
  const paquete_modo = config.paquete_modo;

  return (
    <ConfigContext.Provider
      value={{
        config,
        isLoading,
        paquete_modo,
        modo_presentacion_activo: config.modo_presentacion_activo,
        canAccessModule: (moduleName: string) => canAccessModuleHelper(moduleName, paquete_modo),
        packageLabel: getPackageLabel(paquete_modo),
        packageFeatures: getPackageFeatures(paquete_modo),
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ValorConfig {
  return useContext(ConfigContext);
}
