'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import { invocarComando } from '~/cliente/api';

import { puntosBaseDe } from './tasa-de-terminal.ts';

/**
 * LA TASA DE LA TERMINAL · para que la comisión del corte deje de ser «—» (C.10 de la 2.4).
 *
 * «3.6 % + IVA con Clip, 3.5 % + IVA con Mercado Pago Point» (`02-DINERO-Y-CAJA` de
 * cafetería §7): el segundo gasto variable después del insumo, y el sistema no lo sabía. Se
 * declara UNA vez, aquí mismo, donde se nota que falta; la escribe quien administra el
 * negocio (el servidor lo exige) y el corte la estima con ella —rotulada como estimación—.
 */

export function TasaDeTerminal({ onDeclarada }: { readonly onDeclarada: (bp: number) => void }) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const bp = puntosBaseDe(texto);

  async function guardar(): Promise<void> {
    if (bp === null) return;
    setGuardando(true);
    setFallo(null);
    try {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        datos: { comision_terminal_bp: bp },
      });
      onDeclarada(bp);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar la tasa.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-(--espacio-2)"
      onSubmit={(evento) => {
        evento.preventDefault();
        void guardar();
      }}
    >
      <p className="text-sm text-texto-sutil">
        La comisión de la terminal sale «—» porque no se ha dicho cuánto cobra. Dilo una vez y el
        corte la estima con IVA.
      </p>
      <div className="flex flex-wrap items-end gap-(--espacio-2)">
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="tasa-terminal">Cuánto cobra tu terminal (%)</Label>
          <Input
            id="tasa-terminal"
            inputMode="decimal"
            placeholder="3.6"
            className="w-28 font-numeros tabular-nums"
            value={texto}
            aria-invalid={texto !== '' && bp === null}
            onChange={(evento) => {
              setTexto(evento.target.value);
            }}
          />
        </div>
        <Button type="submit" disabled={bp === null || guardando} cargando={guardando}>
          Guardar la tasa
        </Button>
      </div>
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          La tasa la guarda quien administra el negocio.
        </Aviso>
      )}
    </form>
  );
}
