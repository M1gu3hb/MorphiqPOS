'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { ArrowUpFromLine } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

import { CampoDePesos } from './CampoDePesos.tsx';
import { retiroParaEnviar } from './importe-tecleado.ts';

/**
 * EL RETIRO QUE SALE DEL CAJÓN (§8.3 de cada `02-DINERO-Y-CAJA`, D.1 de la 2.4).
 *
 * «Retiro parcial · Encargado · − monto · No»: lo que se lleva al banco, a la caja fuerte o
 * a pagarle al proveedor. Vivía dentro de la caja de la tienda y el salón no lo tenía: el
 * dinero salía del cajón a mano y el arqueo de la noche cerraba con un faltante. Es el
 * mismo formulario para los dos, con los mismos `id` —`#retiro-importe`, `#retiro-motivo`—
 * que leen los días completos.
 *
 * Va por `caja.movimiento` a la caja de ESTA terminal, y lleva escrito a dónde va: un
 * retiro sin motivo es la única salida que puede esconder un faltante.
 */

const RUTA_MOVIMIENTO = '/api/caja/movimiento';

export function RetiroDeCaja({ alRetirar }: { readonly alRetirar?: () => void }) {
  const [importe, setImporte] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'peligro' | 'atencion'; texto: string } | null>(null);

  async function retirar(): Promise<void> {
    const retiro = retiroParaEnviar(importe, motivo);
    if ('tropiezo' in retiro) {
      setAviso({ tono: 'atencion', texto: retiro.tropiezo });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      await invocarComando(RUTA_MOVIMIENTO, retiro.cuerpo);
      setImporte('');
      setMotivo('');
      alRetirar?.();
    } catch (fallo: unknown) {
      setAviso({
        tono: 'peligro',
        texto:
          fallo instanceof ErrorApi
            ? fallo.message
            : 'No se pudo. Lo capturado sigue aquí: vuelve a intentarlo.',
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Superficie
      como="form"
      nivel={0}
      relleno={4}
      aria-labelledby="retiro-titulo"
      onSubmit={(evento) => {
        evento.preventDefault();
        void retirar();
      }}
      className="flex flex-col gap-(--espacio-4)"
    >
      <div className="flex items-start gap-(--espacio-3)">
        <ArrowUpFromLine
          aria-hidden="true"
          className="mt-(--espacio-1) size-5 shrink-0 text-texto-sutil"
        />
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="retiro-titulo" className="font-semibold">
            Retirar
          </h2>
          <p className="text-sm text-texto-sutil">
            Lo que sale del cajón lleva escrito a dónde va.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="retiro-importe">Cuánto</Label>
        <CampoDePesos
          id="retiro-importe"
          siguiente="retiro-motivo"
          value={importe}
          onChange={(evento) => {
            setImporte(evento.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="retiro-motivo">A dónde va</Label>
        <Input
          id="retiro-motivo"
          className="h-[calc(var(--altura-control)*1.25)]"
          placeholder="al banco · pago a Bimbo · caja fuerte"
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value);
          }}
        />
      </div>

      {aviso === null ? null : aviso.tono === 'peligro' ? (
        <Aviso tono="peligro" titulo={aviso.texto} />
      ) : (
        <Aviso tono="atencion" titulo={aviso.texto}>
          No se mandó nada.
        </Aviso>
      )}

      <div className="mt-auto">
        <Button
          type="submit"
          size="lg"
          variant="outline"
          className="w-full"
          disabled={guardando}
          cargando={guardando}
        >
          Registrar el retiro
        </Button>
      </div>
    </Superficie>
  );
}
