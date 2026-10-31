'use client';

import { useId, useState } from 'react';

import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { Smile } from 'lucide-react';

import { invocarComando } from '~/cliente/api';
import { useExperiencia } from '~/proveedores/Experiencia';

/**
 * «MASCOTA MORFI» (DP-11.1), en Configuración → Apariencia: por negocio, encendida por omisión.
 *
 * Se guarda al tocarla, por el camino de siempre de la configuración
 * (`configuracion.valores.experiencia`, validada en el servidor), y la pestaña la ve cambiar al
 * instante. Si el servidor no la guarda, vuelve como estaba y lo dice.
 */
export function MascotaDelNegocio() {
  const { experiencia, cambiar } = useExperiencia();
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const idTitulo = useId();

  async function alCambiar(mascota: boolean): Promise<void> {
    if (guardando) return;
    const antes = experiencia;
    const nueva = { ...experiencia, mascota };
    cambiar(nueva);
    setGuardando(true);
    setFallo(null);
    try {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        datos: { experiencia: nueva },
      });
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
      aria-labelledby={idTitulo}
      className="flex flex-col gap-(--espacio-3) p-(--espacio-4) sm:p-(--espacio-6)"
    >
      <div className="flex items-start justify-between gap-(--espacio-4)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h3 id={idTitulo} className="flex items-center gap-(--espacio-2) text-lg font-semibold">
            <Smile aria-hidden className="size-5 shrink-0 text-primario" />
            Mascota Morfi
          </h3>
          <p className="max-w-prose text-sm text-texto-sutil">
            Morfi acompaña las cargas largas, la página que no existe y el modo espera. Apagada,
            cada lugar usa su versión sin mascota. Es para todo el negocio.
          </p>
        </div>
        <Switch
          checked={experiencia.mascota}
          disabled={guardando}
          aria-labelledby={idTitulo}
          onCheckedChange={(valor) => {
            void alCambiar(valor);
          }}
        />
      </div>
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          Morfi sigue como estaba guardado para el negocio.
        </Aviso>
      )}
    </Superficie>
  );
}
