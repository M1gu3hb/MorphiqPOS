'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorApi, invocarComando, nuevaClave } from '@/cliente/api';

import type { Cotizacion, EstadoVenta, ResultadoCobro } from './tipos';

/**
 * El estado de la venta en curso.
 *
 * Una sola regla lo gobierna: **la verdad vive en el servidor.** Cada acción
 * manda el comando y adopta la cotización que responde; no hay carrito local
 * que mantener sincronizado, no hay total calculado aquí. Recargar la pestaña
 * vuelve a pedir el estado y aparece el mismo carrito (P1-10).
 *
 * Cuesta un viaje de red por línea agregada. Es el precio de que la pantalla no
 * pueda mostrar un total distinto del que se va a cobrar.
 */

interface Estado {
  readonly cotizacion: Cotizacion | null;
  readonly sesionCajaId: string | null;
  readonly cargando: boolean;
  readonly error: string | null;
}

const INICIAL: Estado = { cotizacion: null, sesionCajaId: null, cargando: true, error: null };

export function useVenta() {
  const [estado, setEstado] = useState<Estado>(INICIAL);

  // La clave de idempotencia del cobro se fija al abrir el diálogo y se
  // conserva mientras siga abierto: reintentar tras un error de red no puede
  // cobrar dos veces.
  const claveCobro = useRef(nuevaClave());

  const aplicar = useCallback((datos: EstadoVenta) => {
    setEstado({
      cotizacion: datos.cotizacion,
      sesionCajaId: datos.sesionCajaId,
      cargando: false,
      error: null,
    });
  }, []);

  const fallar = useCallback((error: unknown) => {
    setEstado((previo) => ({ ...previo, cargando: false, error: mensajeDe(error) }));
  }, []);

  const refrescar = useCallback(async () => {
    try {
      aplicar(await invocarComando<EstadoVenta>('/api/venta/estado', {}));
    } catch (error) {
      fallar(error);
    }
  }, [aplicar, fallar]);

  // La carga inicial no pasa por `refrescar` para poder abortarla: si el cajero
  // sale de la pantalla mientras el servidor contesta, escribir el estado de un
  // componente desmontado no rompe nada pero deja una petición viva por gusto.
  useEffect(() => {
    const control = new AbortController();
    invocarComando<EstadoVenta>('/api/venta/estado', {}, { signal: control.signal })
      .then(aplicar)
      .catch((error: unknown) => {
        if (control.signal.aborted) return;
        fallar(error);
      });
    return () => {
      control.abort();
    };
  }, [aplicar, fallar]);

  /** Ejecuta un comando y adopta el estado que devuelve el servidor. */
  const ejecutar = useCallback(
    async (accion: () => Promise<unknown>) => {
      setEstado((previo) => ({ ...previo, cargando: true, error: null }));
      try {
        await accion();
        aplicar(await invocarComando<EstadoVenta>('/api/venta/estado', {}));
        return true;
      } catch (error) {
        fallar(error);
        return false;
      }
    },
    [aplicar, fallar],
  );

  const agregar = useCallback(
    async (productoId: string, cantidad = '1') => {
      const ordenId = estado.cotizacion?.ordenId ?? (await crearOrden());
      return ejecutar(() =>
        invocarComando('/api/venta/agregar-linea', { ordenId, productoId, cantidad }),
      );
    },
    [ejecutar, estado.cotizacion?.ordenId],
  );

  const quitar = useCallback(
    async (lineaId: string) => {
      const ordenId = estado.cotizacion?.ordenId;
      if (ordenId === undefined) return false;
      return ejecutar(() => invocarComando('/api/venta/quitar-linea', { ordenId, lineaId }));
    },
    [ejecutar, estado.cotizacion?.ordenId],
  );

  const cambiarCantidad = useCallback(
    async (lineaId: string, cantidad: string) => {
      const ordenId = estado.cotizacion?.ordenId;
      if (ordenId === undefined) return false;
      return ejecutar(() =>
        invocarComando('/api/venta/cambiar-cantidad', { ordenId, lineaId, cantidad }),
      );
    },
    [ejecutar, estado.cotizacion?.ordenId],
  );

  /**
   * Cobra. Devuelve el resultado o `null` si falló.
   *
   * `totalEsperadoCentavos` viaja para que el servidor pueda detectar que la
   * pantalla estaba desactualizada. **No decide el cobro**: si no coincide, el
   * servidor rechaza con su total, y ese es el que se le vuelve a decir al
   * cliente.
   */
  const cobrar = useCallback(
    async (pagos: readonly unknown[]): Promise<ResultadoCobro | null> => {
      const cotizacion = estado.cotizacion;
      if (cotizacion === null) return null;
      setEstado((previo) => ({ ...previo, cargando: true, error: null }));
      try {
        const resultado = await invocarComando<ResultadoCobro>(
          '/api/venta/cobrar',
          {
            ordenId: cotizacion.ordenId,
            pagos,
            totalEsperadoCentavos: Number(cotizacion.totalCentavos),
          },
          { idempotencyKey: claveCobro.current },
        );
        claveCobro.current = nuevaClave();
        aplicar(await invocarComando<EstadoVenta>('/api/venta/estado', {}));
        return resultado;
      } catch (error) {
        fallar(error);
        return null;
      }
    },
    [aplicar, estado.cotizacion, fallar],
  );

  const limpiarError = useCallback(() => {
    setEstado((previo) => ({ ...previo, error: null }));
  }, []);

  return {
    ...estado,
    agregar,
    cambiarCantidad,
    cobrar,
    limpiarError,
    quitar,
    refrescar,
  };
}

async function crearOrden(): Promise<string> {
  const creada = await invocarComando<{ ordenId: string }>('/api/venta/crear-orden', {});
  return creada.ordenId;
}

/**
 * El mensaje del servidor, tal cual.
 *
 * Los mensajes de `ErrorDominio` están escritos para el cajero («Abre la caja
 * antes de cobrar»), así que reemplazarlos por uno genérico sería perder la
 * única pista útil. Sólo se sustituye lo que no viene del servidor.
 */
function mensajeDe(error: unknown): string {
  if (error instanceof ErrorApi) return error.error.mensaje;
  if (error instanceof TypeError) return 'Sin conexión con el servidor. Revisa la red.';
  return 'Algo salió mal. Intenta otra vez.';
}
