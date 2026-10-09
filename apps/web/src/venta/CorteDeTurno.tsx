'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { Handshake } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * EL CORTE DE TURNO QUE NO CIERRA LA CAJA (F-233, bloque D de la 2.4).
 *
 * A las nueve de la noche el sobrino entrega el efectivo que le tocó y se va; la tienda
 * sigue abierta. «Corte de turno, que NO cierra la caja» (`abarrotes/00-FICHA §3`): una
 * foto firmada de cuánto había en el cajón al entregar. `caja.corte_turno` existía y
 * ninguna pantalla de modelo lo llamaba —el botón «Cerrar el turno» cierra la caja del
 * día—, así que el segundo turno de una tienda no tenía cómo entregarse.
 *
 * Se cuenta A CIEGAS, como el arqueo: el esperado aparece DESPUÉS de mandar lo contado,
 * con la diferencia dicha en palabras —sobrante, faltante o cuadra— y no sólo con color.
 */

interface ResultadoDelTurno {
  readonly folio: string;
  readonly efectivoContadoCentavos: string;
  readonly efectivoEsperadoCentavos: string;
  readonly diferenciaCentavos: string;
}

export function CorteDeTurno() {
  const [contado, setContado] = useState<number | null>(null);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [hecho, setHecho] = useState<ResultadoDelTurno | null>(null);

  async function entregar(): Promise<void> {
    if (contado === null) {
      setFallo('Pon lo que contaste en el cajón.');
      return;
    }
    setGuardando(true);
    setFallo(null);
    try {
      setHecho(
        await invocarComando<ResultadoDelTurno>('/api/caja/corte-turno', {
          efectivoContadoCentavos: contado,
          notas: notas.trim() === '' ? null : notas.trim(),
        }),
      );
      setContado(null);
      setNotas('');
    } catch (error: unknown) {
      setFallo(error instanceof ErrorApi ? error.message : 'No se pudo entregar el turno.');
    } finally {
      setGuardando(false);
    }
  }

  const diferencia = hecho === null ? 0 : Number(hecho.diferenciaCentavos);

  return (
    <Superficie
      como="form"
      nivel={0}
      relleno={4}
      aria-labelledby="corte-de-turno-titulo"
      onSubmit={(evento) => {
        evento.preventDefault();
        void entregar();
      }}
      className="flex flex-col gap-(--espacio-3)"
    >
      <div className="flex items-start gap-(--espacio-3)">
        <Handshake
          aria-hidden="true"
          className="mt-(--espacio-1) size-5 shrink-0 text-texto-sutil"
        />
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="corte-de-turno-titulo" className="font-semibold">
            Entregar el turno
          </h2>
          <p className="text-sm text-texto-sutil">
            Cuenta y entrega lo de tu turno. La caja sigue abierta para quien entra.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="turno-contado">Lo que contaste</Label>
        <CampoDeDinero id="turno-contado" centavos={contado} alCambiar={setContado} />
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="turno-notas">Notas (opcional)</Label>
        <Input
          id="turno-notas"
          maxLength={500}
          placeholder="se lo entregué a Don Chuy"
          value={notas}
          onChange={(evento) => {
            setNotas(evento.target.value);
          }}
        />
      </div>
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      {hecho === null ? null : (
        <Aviso
          tono={diferencia === 0 ? 'exito' : 'atencion'}
          titulo={`Turno ${hecho.folio} entregado: ${
            diferencia === 0 ? 'cuadra exacto' : diferencia > 0 ? 'sobrante' : 'faltante'
          }`}
        >
          <p className="inline-flex flex-wrap items-baseline gap-(--espacio-1)">
            Esperado <Dinero centavos={Number(hecho.efectivoEsperadoCentavos)} tamano="sm" /> ·
            contado <Dinero centavos={Number(hecho.efectivoContadoCentavos)} tamano="sm" />
            {diferencia === 0 ? null : (
              <>
                · {diferencia > 0 ? 'sobran' : 'faltan'}{' '}
                <Dinero centavos={Math.abs(diferencia)} tamano="sm" />
              </>
            )}
          </p>
        </Aviso>
      )}
      <Button type="submit" variant="outline" disabled={guardando} cargando={guardando}>
        Entregar el turno
      </Button>
    </Superficie>
  );
}
