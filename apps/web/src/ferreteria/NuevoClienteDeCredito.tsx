'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@morphiqpos/ui/primitivas/sheet';
import { Aviso, CampoDeDinero } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * EL CLIENTE DE CRÉDITO NUEVO (C.10 de la 2.4).
 *
 * «Nuevo cliente» estaba fuera de Cuentas y el límite no tenía quien lo escribiera. Aquí
 * se da de alta (`clientes.alta`) y, si se dice, se le fija el límite
 * (`credito.fijar_limite`, sólo dueño o administrador). Si el alta sale y el límite no
 * —otro rol—, se dice eso: el cliente ya existe y el límite lo pone quien puede.
 */
export function NuevoClienteDeCredito({
  abierto,
  alCerrar,
  alCrear,
}: {
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly alCrear: (nombre: string) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [limite, setLimite] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function crear(): Promise<void> {
    if (nombre.trim().length < 2) return;
    setEnviando(true);
    setFallo(null);
    let clienteId: string | null = null;
    try {
      const creado = await invocarComando<{ readonly clienteId: string }>('/api/clientes', {
        nombre: nombre.trim(),
        telefono: telefono.trim() === '' ? null : telefono.trim(),
      });
      clienteId = creado.clienteId;
      if (limite !== null && limite > 0) {
        await invocarComando('/api/credito/limite-credito', {
          clienteId,
          limiteCentavos: limite,
          motivo: 'Alta del cliente de crédito',
        });
      }
      alCrear(nombre.trim());
      setNombre('');
      setTelefono('');
      setLimite(null);
    } catch (error) {
      const mensaje = error instanceof ErrorApi ? error.error.mensaje : 'No se pudo dar de alta.';
      setFallo(
        clienteId === null
          ? mensaje
          : `El cliente quedó dado de alta, pero el límite no: ${mensaje} Lo fija el dueño o el administrador en su ficha.`,
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Sheet
      open={abierto}
      onOpenChange={(visible) => {
        if (!visible) alCerrar();
      }}
    >
      <SheetContent side="right" className="w-full gap-(--espacio-3) overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Cliente de crédito nuevo</SheetTitle>
          <SheetDescription>
            Con su teléfono se le cobra; con su límite, el mostrador avisa antes de despachar.
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-(--espacio-3) px-(--espacio-4) pb-(--espacio-4)"
          onSubmit={(evento) => {
            evento.preventDefault();
            void crear();
          }}
        >
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="cliente-nuevo-nombre">Nombre o razón social</Label>
            <Input
              id="cliente-nuevo-nombre"
              autoFocus
              value={nombre}
              onChange={(evento) => {
                setNombre(evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="cliente-nuevo-telefono">Teléfono</Label>
            <Input
              id="cliente-nuevo-telefono"
              inputMode="tel"
              value={telefono}
              onChange={(evento) => {
                setTelefono(evento.target.value);
              }}
            />
          </div>
          <div className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor="cliente-nuevo-limite">Límite de crédito</Label>
            <CampoDeDinero id="cliente-nuevo-limite" centavos={limite} alCambiar={setLimite} />
            <p className="text-xs text-texto-sutil">
              Sólo el dueño o el administrador lo fijan. Vacío es «sin definir».
            </p>
          </div>
          {fallo !== null && (
            <Aviso tono="peligro" titulo={fallo}>
              Revisa y vuelve a intentarlo.
            </Aviso>
          )}
          <Button type="submit" disabled={enviando || nombre.trim().length < 2} cargando={enviando}>
            Dar de alta
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
