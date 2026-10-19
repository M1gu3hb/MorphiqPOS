'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';

import { invocarComando } from '~/cliente/api';

/**
 * PIEZA · ferreteria · cerrar la toma con su ajuste (C.8 de la 2.4)
 *
 * La pantalla de conteo capturaba y ahí se quedaba: «queda fuera el cierre de la toma
 * con su ajuste, que es del tronco». El tronco lo tiene —`inventario.cerrar_conteo`
 * ajusta cada diferencia con el motivo `ajuste_conteo`, cierra la toma y sella la
 * zona— y nadie lo llamaba desde aquí, así que una toma de ferretería no terminaba
 * nunca y lo contado no cambiaba ninguna existencia.
 *
 * Cerrar se confirma con un segundo toque que dice qué va a pasar: lo contado AJUSTA el
 * inventario, y es un paso que no se deshace con otro toque.
 */

interface ResultadoDelCierre {
  readonly ajustados: number;
  readonly faltantes: number;
  readonly sobrantes: number;
}

export interface CerrarConteoProps {
  readonly tomaId: string;
}

export function CerrarConteo({ tomaId }: CerrarConteoProps) {
  const [confirmando, setConfirmando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cerrado, setCerrado] = useState<ResultadoDelCierre | null>(null);

  async function cerrar(): Promise<void> {
    setCerrando(true);
    setError(null);
    try {
      setCerrado(
        await invocarComando<ResultadoDelCierre>('/api/inventario/conteo/cerrar', { tomaId }),
      );
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cerrar el conteo.');
    } finally {
      setCerrando(false);
      setConfirmando(false);
    }
  }

  if (cerrado !== null) {
    return (
      <Aviso
        tono="exito"
        titulo="Conteo cerrado"
        anuncio="estado"
        accion={
          <Button asChild size="sm" variant="outline">
            <a href="/ferreteria/existencias">Ver existencias</a>
          </Button>
        }
      >
        {cerrado.ajustados === 0
          ? 'Todo cuadró: ninguna existencia cambió.'
          : `${String(cerrado.ajustados)} ajustes: ${String(cerrado.faltantes)} faltantes y ${String(cerrado.sobrantes)} sobrantes, con su motivo en el historial.`}
      </Aviso>
    );
  }

  return (
    <Superficie nivel={0} relleno={3} radio="md" className="flex flex-col gap-(--espacio-2)">
      {error === null ? null : (
        <Aviso tono="peligro" titulo={error}>
          La toma sigue abierta y ninguna existencia cambió.
        </Aviso>
      )}
      {confirmando ? (
        <>
          <p className="text-sm">
            Lo contado AJUSTA el inventario: cada diferencia entra con su motivo, y la toma se
            cierra. Lo que no se contó no se toca.
          </p>
          <div className="flex justify-end gap-(--espacio-2)">
            <Button
              type="button"
              variant="ghost"
              disabled={cerrando}
              onClick={() => {
                setConfirmando(false);
              }}
            >
              Seguir contando
            </Button>
            <Button
              type="button"
              cargando={cerrando}
              disabled={cerrando}
              onClick={() => {
                void cerrar();
              }}
            >
              {cerrando ? 'Cerrando…' : 'Sí, cerrar y ajustar'}
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-end"
          onClick={() => {
            setConfirmando(true);
          }}
        >
          <ClipboardCheck aria-hidden="true" />
          Cerrar el conteo
        </Button>
      )}
    </Superficie>
  );
}
