'use client';

import type { ImagenLogo } from '@morphiqpos/domain/qr';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { consultarPuente, invocarComando } from '~/cliente/api';

import { CLAVE_DE_QR_DE_MESAS, qrDeMesasLeido, type QrDeMesas } from './diseno';
import { cargarLogoDelNegocio } from './logo-del-negocio';

/**
 * El diseño de los QR de las mesas y el logo del negocio, para la pestaña «Mesas QR» (DP-9.8).
 * Se lee y se guarda por la configuración del negocio, como todo lo demás: el servidor valida y
 * decide quién puede (dueño, administrador, gerente).
 */

const CLAVE = [CLAVE_DE_QR_DE_MESAS] as const;

async function leer(): Promise<QrDeMesas> {
  const [configuracion] = await consultarPuente<{ qr_de_mesas?: unknown }>('ConfiguracionNegocio', {
    limite: 1,
  });
  return qrDeMesasLeido(configuracion?.qr_de_mesas);
}

export interface EstadoDeLosQr {
  readonly qr: QrDeMesas | null;
  readonly cargando: boolean;
  readonly fallo: boolean;
  reintentar(): void;
  guardar(qr: QrDeMesas): Promise<void>;
}

export function useQrDeMesas(): EstadoDeLosQr {
  const clienteDeConsultas = useQueryClient();
  const consulta = useQuery({ queryKey: CLAVE, queryFn: leer });
  return {
    qr: consulta.data ?? null,
    cargando: consulta.isLoading,
    fallo: consulta.isError,
    reintentar: () => void consulta.refetch(),
    async guardar(qr) {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        datos: { [CLAVE_DE_QR_DE_MESAS]: qr },
      });
      await clienteDeConsultas.invalidateQueries({ queryKey: CLAVE });
    },
  };
}

export interface EstadoDelLogo {
  readonly logo: ImagenLogo | null;
  readonly cargando: boolean;
  /** El negocio tiene logo pero no se pudo traer. */
  readonly fallo: boolean;
}

export function useLogoDelNegocio(url: string | null | undefined): EstadoDelLogo {
  const consulta = useQuery({
    queryKey: ['logo-del-negocio', url ?? ''],
    queryFn: () => cargarLogoDelNegocio(url),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  return { logo: consulta.data ?? null, cargando: consulta.isLoading, fallo: consulta.isError };
}
