'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero } from '@morphiqpos/ui/sistema';
import { HandCoins } from 'lucide-react';
import { useState } from 'react';

import { invocarComando } from '~/cliente/api';

import { ElegirCliente, type ClienteDelCobro } from './ElegirCliente.tsx';

/**
 * F7 · COBRAR UN ABONO SIN SALIR DEL COBRO (C.10 de la 2.4).
 *
 * «Movimiento propio, no una venta» (`04-INTERFAZ` de abarrotes). Doña Meche viene a
 * abonar mientras hay fila: mandarla a la pantalla del fiado es perder la venta que se está
 * armando. Es el MISMO abono de la ficha del fiado —`fiado.registrar_abono`, que aplica a lo
 * más viejo y mete el efectivo al cajón como depósito, no como venta—, y la venta en curso
 * no se toca.
 */

const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
] as const;

type Metodo = (typeof METODOS)[number]['clave'];

interface Respuesta {
  readonly saldoDespuesCentavos: string;
  readonly pendienteDeConfirmar: boolean;
}

/** Lo que la pantalla de cobro dice al volver: con `<Dinero>`, no con un texto armado. */
export interface AbonoHecho {
  readonly nombre: string;
  readonly abonoCentavos: number;
  /** Nulo cuando fue por transferencia: todavía no baja nada. */
  readonly debeCentavos: number | null;
}

export function AbonoRapido({ onListo }: { readonly onListo: (abono: AbonoHecho) => void }) {
  const [cliente, setCliente] = useState<ClienteDelCobro | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<Metodo>('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  if (cliente === null) return <ElegirCliente importe={0} onElegir={setCliente} />;

  async function abonar(): Promise<void> {
    if (cliente === null || monto === null || monto <= 0) {
      setFallo('Escribe cuánto abona.');
      return;
    }
    setEnviando(true);
    setFallo(null);
    try {
      const respuesta = await invocarComando<Respuesta>('/api/fiado/abono', {
        clienteId: cliente.id,
        montoCentavos: monto,
        metodo,
      });
      onListo({
        nombre: cliente.nombre,
        abonoCentavos: monto,
        debeCentavos: respuesta.pendienteDeConfirmar
          ? null
          : Number(respuesta.saldoDespuesCentavos),
      });
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo registrar el abono.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-(--espacio-3)"
      onSubmit={(evento) => {
        evento.preventDefault();
        void abonar();
      }}
    >
      <div className="flex items-baseline justify-between gap-(--espacio-2)">
        <p className="font-medium">{cliente.nombre}</p>
        <p className="inline-flex items-baseline gap-(--espacio-1) text-sm text-texto-sutil">
          debe <Dinero centavos={cliente.debe} tamano="sm" />
        </p>
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="abono-monto">Cuánto abona</Label>
        <CampoDeDinero id="abono-monto" autoFocus centavos={monto} alCambiar={setMonto} />
      </div>
      <div role="group" aria-label="Cómo abona" className="grid grid-cols-3 gap-(--espacio-2)">
        {METODOS.map((opcion) => (
          <Button
            key={opcion.clave}
            type="button"
            size="sm"
            variant={metodo === opcion.clave ? 'default' : 'outline'}
            aria-pressed={metodo === opcion.clave}
            onClick={() => {
              setMetodo(opcion.clave);
            }}
          >
            {opcion.etiqueta}
          </Button>
        ))}
      </div>
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          Ningún saldo cambió.
        </Aviso>
      )}
      <div className="flex gap-(--espacio-2)">
        <Button type="submit" disabled={enviando}>
          <HandCoins aria-hidden="true" />
          {enviando ? 'Registrando…' : 'Registrar abono'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setCliente(null);
          }}
        >
          Otro cliente
        </Button>
      </div>
    </form>
  );
}
