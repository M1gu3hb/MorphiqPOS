'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Superficie } from '@morphiqpos/ui/sistema';
import { Receipt } from 'lucide-react';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * EL GASTO QUE SALE DEL CAJÓN (§8.3 de cada `02-DINERO-Y-CAJA`, bloque D de la 2.4).
 *
 * «Gasto en efectivo · Encargado · − monto · No suma a ventas»: la leche que faltó, el
 * garrafón, el plomero. El backend lo tenía —`gastos.registrar` escribe el gasto Y su
 * movimiento de caja en la misma transacción, así que el esperado del arqueo ya lo resta—
 * y ninguna pantalla de modelo lo llamaba: el dinero salía del cajón a mano y la noche
 * cerraba con un faltante que nadie sabía explicar.
 *
 * Siempre EN EFECTIVO y desde la caja de esta terminal: un gasto con tarjeta no toca el
 * cajón y se registra en compras. Lo registra quien administra (el servidor lo exige).
 */

const CATEGORIAS = [
  { clave: 'servicios', etiqueta: 'Servicios' },
  { clave: 'limpieza', etiqueta: 'Limpieza' },
  { clave: 'transporte', etiqueta: 'Transporte' },
  { clave: 'reparacion', etiqueta: 'Reparación' },
  { clave: 'otro', etiqueta: 'Otro' },
] as const;

type Categoria = (typeof CATEGORIAS)[number]['clave'];

/** Centavos enteros a «pesos.centavos» exacto: el servidor no recibe un flotante. */
export function pesosDeCentavos(centavos: number): string {
  return `${String(Math.trunc(centavos / 100))}.${String(centavos % 100).padStart(2, '0')}`;
}

export function GastoDeCaja({ alRegistrar }: { readonly alRegistrar: () => void }) {
  const [monto, setMonto] = useState<number | null>(null);
  const [categoria, setCategoria] = useState<Categoria>('servicios');
  const [descripcion, setDescripcion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'peligro' | 'atencion'; texto: string } | null>(null);

  async function registrar(): Promise<void> {
    if (monto === null || monto <= 0) {
      setAviso({ tono: 'atencion', texto: 'Pon cuánto salió del cajón.' });
      return;
    }
    if (descripcion.trim().length < 2) {
      setAviso({ tono: 'atencion', texto: 'Escribe en qué se gastó.' });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      await invocarComando('/api/gastos/registrar', {
        categoria,
        descripcion: descripcion.trim(),
        monto: pesosDeCentavos(monto),
        metodoPago: 'efectivo',
      });
      setMonto(null);
      setDescripcion('');
      alRegistrar();
    } catch (fallo: unknown) {
      setAviso({
        tono: 'peligro',
        texto: fallo instanceof ErrorApi ? fallo.message : 'No se pudo registrar el gasto.',
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
      aria-labelledby="gasto-titulo"
      onSubmit={(evento) => {
        evento.preventDefault();
        void registrar();
      }}
      className="flex flex-col gap-(--espacio-4)"
    >
      <div className="flex items-start gap-(--espacio-3)">
        <Receipt aria-hidden="true" className="mt-(--espacio-1) size-5 shrink-0 text-texto-sutil" />
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id="gasto-titulo" className="font-semibold">
            Pagar un gasto
          </h2>
          <p className="text-sm text-texto-sutil">
            Sale del cajón y no es venta: el corte de la noche ya lo descuenta.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="gasto-monto">Cuánto</Label>
        <CampoDeDinero id="gasto-monto" centavos={monto} alCambiar={setMonto} />
      </div>
      <fieldset>
        <legend className="mb-(--espacio-2) text-sm font-medium">De qué</legend>
        <div className="flex flex-wrap gap-(--espacio-2)">
          {CATEGORIAS.map((opcion) => (
            <Button
              key={opcion.clave}
              type="button"
              size="sm"
              variant={categoria === opcion.clave ? 'default' : 'outline'}
              aria-pressed={categoria === opcion.clave}
              onClick={() => {
                setCategoria(opcion.clave);
              }}
            >
              {opcion.etiqueta}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-(--espacio-2)">
        <Label htmlFor="gasto-descripcion">En qué se gastó</Label>
        <Input
          id="gasto-descripcion"
          className="h-[calc(var(--altura-control)*1.25)]"
          placeholder="garrafón · plomero · bolsa de hielo"
          value={descripcion}
          onChange={(evento) => {
            setDescripcion(evento.target.value);
          }}
        />
      </div>

      {aviso === null ? null : <Aviso tono={aviso.tono} titulo={aviso.texto} />}

      <div className="mt-auto">
        <Button
          type="submit"
          size="lg"
          variant="outline"
          className="w-full"
          disabled={guardando}
          cargando={guardando}
        >
          Registrar el gasto
        </Button>
      </div>
    </Superficie>
  );
}
