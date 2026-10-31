'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { LockKeyhole, Smile } from 'lucide-react';

import { invocarComando } from '~/cliente/api';
import {
  useExperiencia,
  type ExperienciaDelNegocio as Experiencia,
} from '~/proveedores/Experiencia';

/** Un renglón: el nombre, para qué sirve y su interruptor (el nombre accesible es el título). */
function Interruptor({
  icono,
  titulo,
  explicacion,
  encendido,
  ocupado,
  alCambiar,
}: {
  readonly icono: ReactNode;
  readonly titulo: string;
  readonly explicacion: string;
  readonly encendido: boolean;
  readonly ocupado: boolean;
  readonly alCambiar: (valor: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-(--espacio-4)">
      <div className="flex flex-col gap-(--espacio-1)">
        <h3 id={id} className="flex items-center gap-(--espacio-2) text-lg font-semibold">
          {icono}
          {titulo}
        </h3>
        <p className="max-w-prose text-sm text-texto-sutil">{explicacion}</p>
      </div>
      <Switch
        checked={encendido}
        disabled={ocupado}
        aria-labelledby={id}
        onCheckedChange={alCambiar}
      />
    </div>
  );
}

/**
 * LA EXPERIENCIA DEL NEGOCIO (DP-11), en Configuración → Apariencia: «Mascota Morfi» (DP-11.1,
 * encendida por omisión) y «Pedir PIN al despertar» (DP-11.2, apagada). Son de TODO el negocio.
 *
 * Cada interruptor se guarda al tocarlo, por el camino de siempre de la configuración
 * (`configuracion.valores.experiencia`, validada en el servidor), y la pestaña lo ve cambiar al
 * instante. Se manda SÓLO el interruptor tocado: el servidor lo mezcla con lo guardado y no pisa
 * lo que otro aparato cambió. Si el servidor no lo guarda, vuelve como estaba y lo dice.
 */
export function ExperienciaDelNegocio() {
  const { experiencia, cambiar } = useExperiencia();
  const consultas = useQueryClient();
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function guardar(parte: Partial<Experiencia>): Promise<void> {
    if (guardando) return;
    const antes = experiencia;
    const nueva = { ...experiencia, ...parte };
    cambiar(nueva);
    setGuardando(true);
    setFallo(null);
    try {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        // Sólo lo que cambió: el servidor lo mezcla con lo guardado (DP-11.2).
        datos: { experiencia: parte },
      });
      // El modo espera lee el PIN de la configuración que se vuelve a pedir: que la pida ya.
      await consultas.invalidateQueries({ queryKey: ['config'] });
    } catch (error: unknown) {
      cambiar(antes);
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Superficie
      como="section"
      relleno={0}
      aria-label="Experiencia del negocio"
      className="flex flex-col gap-(--espacio-5) p-(--espacio-4) sm:p-(--espacio-6)"
    >
      <Interruptor
        icono={<Smile aria-hidden className="size-5 shrink-0 text-primario" />}
        titulo="Mascota Morfi"
        explicacion="Morfi acompaña las cargas largas, la página que no existe y el modo espera. Apagada, cada lugar usa su versión sin mascota. Es para todo el negocio."
        encendido={experiencia.mascota}
        ocupado={guardando}
        alCambiar={(mascota) => {
          void guardar({ mascota });
        }}
      />
      <Interruptor
        icono={<LockKeyhole aria-hidden className="size-5 shrink-0 text-primario" />}
        titulo="Pedir PIN al despertar"
        explicacion="Al volver del modo espera, quien tiene la sesión teclea su PIN. Para que nadie use la caja o el tablero de otro mientras no estaba."
        encendido={experiencia.pin_al_despertar}
        ocupado={guardando}
        alCambiar={(pin_al_despertar) => {
          void guardar({ pin_al_despertar });
        }}
      />
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          Se queda como estaba guardado para el negocio.
        </Aviso>
      )}
    </Superficie>
  );
}
