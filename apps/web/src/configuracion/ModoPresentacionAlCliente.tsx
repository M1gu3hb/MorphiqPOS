'use client';

import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Aviso, EsqueletoDeLista, Superficie } from '@morphiqpos/ui/sistema';

/**
 * EL SWITCH «MODO PRESENTACIÓN AL CLIENTE» (Configuración → Presentación, 21-10).
 *
 * Apagado: Miguel opera y prueba con sus datos de siempre. Encendido: el restaurante se enseña
 * con treinta días de actividad en un contexto aparte; sus datos no se tocan y vuelven tal
 * cual al apagarlo. Va debajo del selector de modelos y detrás del mismo PIN: el servidor
 * (`/api/presentacion/modo`) lo vuelve a exigir en cada cambio.
 */

const EstadoSchema = z.object({
  ok: z.boolean(),
  datos: z
    .object({
      disponible: z.boolean().optional(),
      desbloqueado: z.boolean().optional(),
      activo: z.boolean().optional(),
      preparado: z.boolean().optional(),
      dias: z.number().optional(),
      destino: z.string().optional(),
    })
    .optional(),
  error: z.object({ mensaje: z.string() }).optional(),
});
type Estado = NonNullable<z.infer<typeof EstadoSchema>['datos']>;

async function pedir(accion?: 'preparar' | 'encender' | 'apagar'): Promise<Estado> {
  const respuesta = await fetch(
    '/api/presentacion/modo',
    accion === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-morphiqpos-request': '1' },
          body: JSON.stringify({ accion }),
        },
  );
  const validada = EstadoSchema.safeParse(await respuesta.json().catch(() => null));
  if (!validada.success) throw new Error('No se pudo leer el modo presentación.');
  if (!respuesta.ok || !validada.data.ok)
    throw new Error(validada.data.error?.mensaje ?? 'No se pudo cambiar el modo presentación.');
  return validada.data.datos ?? {};
}

function irA(destino: string | undefined) {
  try {
    sessionStorage.removeItem('posUser');
  } catch {
    /* La cookie sigue siendo la fuente de verdad. */
  }
  window.location.replace(destino ?? '/');
}

export function ModoPresentacionAlCliente({ desbloqueado }: { desbloqueado: boolean }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [paso, setPaso] = useState<'' | 'preparando' | 'encendiendo' | 'apagando'>('');
  const [error, setError] = useState('');
  const idTitulo = useId();
  const idDetalle = useId();

  useEffect(() => {
    let vigente = true;
    pedir()
      .then((datos) => {
        if (vigente) setEstado(datos);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer el modo.');
      });
    return () => {
      vigente = false;
    };
  }, [desbloqueado]);

  if (estado === null && error === '') return <EsqueletoDeLista filas={2} />;
  if (estado !== null && estado.disponible !== true) return null;

  async function cambiar(encender: boolean) {
    setError('');
    try {
      if (encender) {
        setPaso('preparando');
        await pedir('preparar');
        setPaso('encendiendo');
        irA((await pedir('encender')).destino);
      } else {
        setPaso('apagando');
        irA((await pedir('apagar')).destino);
      }
    } catch (fallo) {
      setPaso('');
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar el modo presentación.');
    }
  }

  const activo = estado?.activo === true;
  const ocupado = paso !== '';
  return (
    <Superficie
      como="section"
      aria-labelledby={idTitulo}
      className="flex flex-col gap-(--espacio-3) sm:p-(--espacio-6)"
    >
      <div className="flex items-start justify-between gap-(--espacio-4)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h2 id={idTitulo} className="text-lg font-semibold">
            Modo presentación al cliente
          </h2>
          <p id={idDetalle} className="text-sm text-texto-sutil">
            {activo
              ? 'Encendido: el restaurante se enseña con treinta días de actividad. Meseros, cocina y caja entran con su PIN de siempre y trabajan en la presentación. Tus datos no se tocan.'
              : 'Apagado: trabajas con tus datos normales. Al encenderlo, el restaurante se enseña con treinta días de ventas, cortes y compras, aparte de tus operaciones.'}
          </p>
        </div>
        <Switch
          checked={activo}
          disabled={!desbloqueado || ocupado}
          onCheckedChange={(valor) => {
            void cambiar(valor);
          }}
          aria-labelledby={idTitulo}
          aria-describedby={idDetalle}
        />
      </div>
      {!desbloqueado && (
        <p className="text-sm text-texto-sutil">
          Escribe arriba el PIN del dueño general para encenderlo o apagarlo.
        </p>
      )}
      {paso === 'preparando' && (
        <Aviso tono="info" titulo="Preparando la presentación…">
          La primera vez se arma el restaurante con su historial; puede tardar un minuto.
        </Aviso>
      )}
      {paso === 'encendiendo' && <Aviso tono="info" titulo="Encendiendo la presentación…" />}
      {paso === 'apagando' && <Aviso tono="info" titulo="Volviendo a tus datos…" />}
      {error !== '' && <Aviso tono="peligro" titulo={error} />}
    </Superficie>
  );
}
