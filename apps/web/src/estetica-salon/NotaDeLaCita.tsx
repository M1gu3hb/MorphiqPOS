'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { Aviso, IndicadorDeGuardado, type EstadoDeGuardado } from '@morphiqpos/ui/sistema';
import { useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * LA NOTA DE LA CITA, escrita con la clienta sentada (prioridad 4 del §4.3.3; C.10 de la
 * 2.4): «prefiere el agua tibia», «trae foto de referencia». No había dónde escribirla
 * durante el servicio —sólo al agendar—; ahora la guarda `agenda.anotar`, que a la
 * estilista sólo le deja anotar las citas donde da un servicio.
 */
export function NotaDeLaCita({
  citaId,
  notaInicial,
}: {
  readonly citaId: string;
  readonly notaInicial: string | null;
}) {
  const [nota, setNota] = useState(notaInicial ?? '');
  const [estado, setEstado] = useState<EstadoDeGuardado>('quieto');
  const [fallo, setFallo] = useState<string | null>(null);

  function guardar(): void {
    setEstado('guardando');
    setFallo(null);
    invocarComando('/api/agenda/anotar', { citaId, notas: nota.trim() })
      .then(() => {
        setEstado('guardado');
      })
      .catch((error: unknown) => {
        setEstado('quieto');
        setFallo(error instanceof ErrorApi ? error.message : 'No se pudo guardar la nota.');
      });
  }

  return (
    <div className="flex flex-col gap-(--espacio-2)">
      <Textarea
        aria-label="Nota de la cita"
        rows={3}
        maxLength={1000}
        value={nota}
        placeholder="Lo que conviene recordar la próxima vez…"
        onChange={(evento) => {
          setNota(evento.target.value);
          setEstado('quieto');
        }}
      />
      <div className="flex items-center justify-end gap-(--espacio-3)">
        <IndicadorDeGuardado estado={estado} className="mr-auto" />
        <Button variant="outline" disabled={estado === 'guardando'} onClick={guardar}>
          Guardar la nota
        </Button>
      </div>
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          La nota sigue aquí.
        </Aviso>
      )}
    </div>
  );
}
