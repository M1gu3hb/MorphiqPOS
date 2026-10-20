'use client';

import { useEffect, useId, useState } from 'react';
import { z } from 'zod';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Aviso, EsqueletoDeLista, ErrorDePantalla, Superficie } from '@morphiqpos/ui/sistema';
import ModoPresentacion from '@/components/configuracion/ModoPresentacion';

const NegocioSchema = z.object({
  empleoId: z.string(),
  nombre: z.string(),
  paquete: z.string(),
  slug: z.string(),
});
type Negocio = z.infer<typeof NegocioSchema>;
const RespuestaSchema = z.object({
  ok: z.boolean(),
  datos: z
    .object({ negocios: z.array(NegocioSchema).optional(), desbloqueado: z.boolean().optional() })
    .optional(),
  error: z.object({ mensaje: z.string() }).optional(),
});
const NOMBRES: Record<string, string> = {
  restaurante: 'Restaurante',
  tienda: 'Tienda de abarrotes',
  cafeteria: 'Cafetería',
  ferreteria: 'Ferretería',
  estetica: 'Estética y salón',
};

async function pedir(entrada?: unknown) {
  const respuesta = await fetch(
    '/api/presentacion',
    entrada === undefined
      ? { cache: 'no-store' }
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-morphiqpos-request': '1' },
          body: JSON.stringify(entrada),
        },
  );
  const cuerpo: unknown = await respuesta.json();
  const validada = RespuestaSchema.safeParse(cuerpo);
  if (!validada.success) throw new Error('No se pudo interpretar la presentación.');
  if (!respuesta.ok || !validada.data.ok)
    throw new Error(validada.data.error?.mensaje ?? 'No se pudo cargar la presentación.');
  return validada.data.datos ?? {};
}

export function PresentacionDelDueno({ cfg }: { cfg: unknown }) {
  const [negocios, setNegocios] = useState<Negocio[] | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [intento, setIntento] = useState(0);
  const idTitulo = useId();
  useEffect(() => {
    let vigente = true;
    pedir()
      .then((datos) => {
        if (vigente) {
          setNegocios(datos.negocios ?? []);
          setAbierto(datos.desbloqueado ?? false);
        }
      })
      .catch((fallo: unknown) => {
        if (vigente)
          setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la presentación.');
      });
    return () => {
      vigente = false;
    };
  }, [intento]);
  async function ejecutar(entrada: unknown, navegar = false) {
    setOcupado(true);
    setError('');
    try {
      await pedir(entrada);
      setPin('');
      if (navegar) {
        try {
          sessionStorage.removeItem('posUser');
        } catch {
          /* La cookie sigue siendo la fuente de verdad. */
        }
        window.location.replace('/');
      } else setAbierto(true);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.');
    } finally {
      setOcupado(false);
    }
  }
  if (negocios?.length === 0) return <ModoPresentacion cfg={cfg} />;
  return (
    <Superficie
      como="section"
      aria-labelledby={idTitulo}
      className="flex flex-col gap-(--espacio-4) sm:p-(--espacio-6)"
    >
      <header className="flex flex-col gap-(--espacio-1)">
        <h2 id={idTitulo} className="text-lg font-semibold">
          Presentación de Morphiq
        </h2>
        <p className="text-sm text-texto-sutil">
          Tu sistema maestro reúne los modelos de negocio. Cambia de demostración para presentar su
          operación completa con sus propios datos.
        </p>
      </header>
      {negocios === null ? (
        error ? (
          <ErrorDePantalla
            titulo={error}
            queHacer="Revisa la conexión y vuelve a intentarlo."
            reintentar={
              <Button
                onClick={() => {
                  setError('');
                  setIntento((n) => n + 1);
                }}
              >
                Reintentar
              </Button>
            }
          />
        ) : (
          <EsqueletoDeLista filas={3} />
        )
      ) : (
        <>
          {error && <Aviso tono="peligro" titulo={error} />}
          {!abierto ? (
            <form
              className="max-w-sm space-y-(--espacio-3)"
              onSubmit={(e) => {
                e.preventDefault();
                void ejecutar({ accion: 'desbloquear', pin });
              }}
            >
              <label htmlFor="pin-presentacion" className="text-sm font-medium">
                PIN del dueño general
              </label>
              <Input
                id="pin-presentacion"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                }}
                maxLength={8}
              />
              <Button type="submit" disabled={ocupado || pin.length < 4}>
                {ocupado ? 'Comprobando…' : 'Abrir modelos de negocio'}
              </Button>
            </form>
          ) : (
            <div className="grid gap-(--espacio-3) sm:grid-cols-2 lg:grid-cols-3">
              {negocios.map((negocio) => (
                <Superficie
                  key={negocio.empleoId}
                  como="button"
                  type="button"
                  interactiva
                  disabled={ocupado}
                  onClick={() => {
                    void ejecutar({ accion: 'cambiar', empleoId: negocio.empleoId }, true);
                  }}
                >
                  <strong className="block text-lg">
                    {NOMBRES[negocio.paquete] ?? negocio.paquete}
                  </strong>
                  <span className="text-sm text-texto-sutil">
                    {negocio.slug.startsWith('demo-') ? 'Abrir demostración' : negocio.nombre}
                  </span>
                </Superficie>
              ))}
            </div>
          )}
        </>
      )}
    </Superficie>
  );
}
