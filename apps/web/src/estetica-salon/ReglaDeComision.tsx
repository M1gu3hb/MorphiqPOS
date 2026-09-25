'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, EsqueletoDeLista, Superficie } from '@morphiqpos/ui/sistema';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

import {
  BASES,
  MATERIALES,
  cuerpoDeLaVersion,
  formularioDe,
  reglaEnPalabras,
  reglasVigentes,
  type FormularioDeRegla,
  type ReglaDelPuente,
} from './regla-de-comision.ts';

/**
 * LA REGLA DE ESTA PROFESIONAL, dentro de su liquidación (F-440; C.10 de la 2.4): cuál
 * tiene, dicha en palabras; cambiarla por una versión nueva desde una fecha; o asignarle
 * otra de las vigentes. Lo causado no se toca: la versión nueva cuenta desde su día.
 */

const CAMPO =
  'h-(--altura-control) w-full rounded-md border border-borde-fuerte bg-fondo px-(--espacio-3) text-sm focus-visible:ring-2 focus-visible:ring-anillo focus-visible:outline-none';

interface ProfesionalConRegla {
  readonly id: string;
  readonly regla_comision_id: string | null;
}

function mananaDe(hoy: Date): string {
  return new Date(hoy.getTime() + 86_400_000).toISOString().slice(0, 10);
}

function mensajeDe(fallo: unknown): string {
  return fallo instanceof ErrorApi ? fallo.message : 'No se pudo guardar la regla.';
}

export function ReglaDeComision({ profesionalId }: { readonly profesionalId: string }) {
  const [reglas, setReglas] = useState<readonly ReglaDelPuente[] | null>(null);
  const [suya, setSuya] = useState<string | null | undefined>(undefined);
  const [fallo, setFallo] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<FormularioDeRegla | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [lectura, setLectura] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    Promise.all([
      consultarPuente<ReglaDelPuente>('ReglaComision', { limite: 100, signal: control.signal }),
      consultarPuente<ProfesionalConRegla>('Profesional', {
        filtro: { id: profesionalId },
        limite: 1,
        signal: control.signal,
      }),
    ])
      .then(([leidas, [profesional]]) => {
        if (control.signal.aborted) return;
        setReglas(leidas);
        setSuya(profesional?.regla_comision_id ?? null);
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) setFallo(mensajeDe(error));
      });
    return () => {
      control.abort();
    };
  }, [profesionalId, lectura]);

  if (fallo !== null) {
    return (
      <Aviso tono="atencion" titulo="No se pudo leer la regla de comisión.">
        {fallo} La liquidación se calcula igual con la regla guardada.
      </Aviso>
    );
  }
  if (reglas === null || suya === undefined) return <EsqueletoDeLista filas={2} />;

  const regla = reglas.find((r) => r.id === suya) ?? null;
  const hoy = new Date().toISOString().slice(0, 10);
  const vigentes = reglasVigentes(reglas, hoy);

  function guardarVersion(): void {
    if (regla === null || formulario === null) return;
    const resultado = cuerpoDeLaVersion(regla, formulario);
    if (!resultado.ok) {
      setAviso(resultado.problema);
      return;
    }
    setOcupado(true);
    setAviso(null);
    invocarComando('/api/comision/regla', resultado.cuerpo)
      .then(() => {
        setFormulario(null);
        setAviso(`Regla nueva desde el ${formulario.vigenteDesde}. Lo ya causado no cambia.`);
        setLectura((n) => n + 1);
      })
      .catch((error: unknown) => {
        setAviso(mensajeDe(error));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function asignar(reglaId: string | null): void {
    setOcupado(true);
    setAviso(null);
    invocarComando('/api/comision/asignar-regla', { profesionalId, reglaId })
      .then(() => {
        setLectura((n) => n + 1);
      })
      .catch((error: unknown) => {
        setAviso(mensajeDe(error));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  return (
    <Superficie nivel={0} radio="md" relleno={3} className="flex flex-col gap-(--espacio-2)">
      <h3 className="text-sm font-semibold">Su regla de comisión</h3>
      <p className="text-sm">
        {regla === null ? (
          <span className="text-texto-sutil">Sin regla propia: manda la de cada servicio.</span>
        ) : (
          <>
            <span className="font-medium">
              {regla.nombre} · versión {regla.version}
            </span>{' '}
            · {reglaEnPalabras(regla)}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-end gap-(--espacio-2)">
        <div className="flex min-w-48 flex-col gap-(--espacio-1)">
          <Label htmlFor={`regla-${profesionalId}`}>Asignarle otra</Label>
          <select
            id={`regla-${profesionalId}`}
            className={CAMPO}
            disabled={ocupado}
            value={suya ?? ''}
            onChange={(evento) => {
              asignar(evento.target.value === '' ? null : evento.target.value);
            }}
          >
            <option value="">Sin regla propia</option>
            {vigentes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre} · v{r.version}
              </option>
            ))}
          </select>
        </div>
        {regla === null || formulario !== null ? null : (
          <Button
            variant="outline"
            disabled={ocupado}
            onClick={() => {
              setFormulario(formularioDe(regla, mananaDe(new Date())));
            }}
          >
            Cambiar la regla
          </Button>
        )}
      </div>

      {regla === null || formulario === null ? null : (
        <FormularioDeVersion
          regla={regla}
          formulario={formulario}
          ocupado={ocupado}
          alCambiar={setFormulario}
          alGuardar={guardarVersion}
          alCancelar={() => {
            setFormulario(null);
          }}
        />
      )}
      {aviso === null ? null : <Aviso tono="atencion" titulo={aviso} />}
    </Superficie>
  );
}

function FormularioDeVersion({
  regla,
  formulario,
  ocupado,
  alCambiar,
  alGuardar,
  alCancelar,
}: {
  readonly regla: ReglaDelPuente;
  readonly formulario: FormularioDeRegla;
  readonly ocupado: boolean;
  readonly alCambiar: (formulario: FormularioDeRegla) => void;
  readonly alGuardar: () => void;
  readonly alCancelar: () => void;
}) {
  const campo = (clave: keyof FormularioDeRegla, valor: FormularioDeRegla[typeof clave]): void => {
    alCambiar({ ...formulario, [clave]: valor });
  };
  return (
    <form
      className="grid gap-(--espacio-3) sm:grid-cols-2"
      aria-label={`Versión nueva de ${regla.nombre}`}
      onSubmit={(evento) => {
        evento.preventDefault();
        alGuardar();
      }}
    >
      {regla.esquema === 'escalonado' ? (
        <fieldset className="flex flex-col gap-(--espacio-2) sm:col-span-2">
          <legend className="text-sm font-medium">
            Escalones: hasta cuánto acumulado, qué tasa
          </legend>
          {formulario.escalones.map((escalon, indice) => (
            <div key={String(indice)} className="flex flex-wrap items-center gap-(--espacio-2)">
              <CampoDeDinero
                aria-label={`Hasta cuánto, escalón ${String(indice + 1)}`}
                className="w-40"
                centavos={escalon.hastaCentavos}
                alCambiar={(centavos) => {
                  campo(
                    'escalones',
                    formulario.escalones.map((e, i) =>
                      i === indice ? { ...e, hastaCentavos: centavos } : e,
                    ),
                  );
                }}
              />
              <Input
                aria-label={`Tasa del escalón ${String(indice + 1)}, en por ciento`}
                inputMode="decimal"
                className="w-20 text-right font-numeros tabular-nums"
                value={escalon.tasa}
                onChange={(evento) => {
                  campo(
                    'escalones',
                    formulario.escalones.map((e, i) =>
                      i === indice ? { ...e, tasa: evento.target.value } : e,
                    ),
                  );
                }}
              />
              <span className="text-sm text-texto-sutil">%</span>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => {
              campo('escalones', [...formulario.escalones, { hastaCentavos: null, tasa: '' }]);
            }}
          >
            Agregar un escalón
          </Button>
        </fieldset>
      ) : (
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="tasa-servicio">Servicios (%)</Label>
          <Input
            id="tasa-servicio"
            inputMode="decimal"
            className="w-24 text-right font-numeros tabular-nums"
            value={formulario.tasaServicio}
            onChange={(evento) => {
              campo('tasaServicio', evento.target.value);
            }}
          />
        </div>
      )}
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="tasa-producto">Producto (%)</Label>
        <Input
          id="tasa-producto"
          inputMode="decimal"
          className="w-24 text-right font-numeros tabular-nums"
          value={formulario.tasaProducto}
          onChange={(evento) => {
            campo('tasaProducto', evento.target.value);
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="regla-base">Sobre qué</Label>
        <select
          id="regla-base"
          className={CAMPO}
          value={formulario.base}
          onChange={(evento) => {
            campo('base', evento.target.value);
          }}
        >
          {BASES.map((b) => (
            <option key={b.clave} value={b.clave}>
              {b.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="regla-material">El material</Label>
        <select
          id="regla-material"
          className={CAMPO}
          value={formulario.material}
          onChange={(evento) => {
            campo('material', evento.target.value);
          }}
        >
          {MATERIALES.map((m) => (
            <option key={m.clave} value={m.clave}>
              {m.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-(--espacio-2) text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primario"
          checked={formulario.sobreIva}
          onChange={(evento) => {
            campo('sobreIva', evento.target.checked);
          }}
        />
        Se calcula con IVA
      </label>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="regla-desde">Cuenta desde</Label>
        <Input
          id="regla-desde"
          type="date"
          className="w-44"
          value={formulario.vigenteDesde}
          onChange={(evento) => {
            campo('vigenteDesde', evento.target.value);
          }}
        />
      </div>
      <div className="flex gap-(--espacio-2) sm:col-span-2">
        <Button type="submit" disabled={ocupado} cargando={ocupado}>
          Guardar la versión nueva
        </Button>
        <Button type="button" variant="ghost" onClick={alCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
