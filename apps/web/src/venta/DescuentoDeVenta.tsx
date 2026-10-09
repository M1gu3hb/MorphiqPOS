'use client';

import { evaluarDescuento } from '@morphiqpos/domain/venta';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, CampoDeDinero, Dinero, Esqueleto, Vacio } from '@morphiqpos/ui/sistema';
import { BadgePercent, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

import { porcentajeDeTope } from './devolucion.ts';

/**
 * EL DESCUENTO, CON SU TOPE Y SU SUPERVISOR (F-205, D-28 de la 2.4).
 *
 * La cajera escribe cuánto —en pesos o en porcentaje— y por qué. Si cabe en el tope de su
 * puesto, se aplica. Si no, la pantalla lo DICE con el tope a la vista —«tu tope son $50
 * o el 10 %»— y el supervisor teclea SU PIN aquí mismo, sin cerrar la sesión de nadie: el
 * servidor lo comprueba como al entrar y devuelve una autorización de dos minutos que
 * viaja con el cobro. La cuenta del tope es la del dominio (`evaluarDescuento`), la misma
 * que el servidor vuelve a hacer al aplicar.
 */

export interface DescuentoElegido {
  readonly centavos: number;
  readonly motivo: string;
  /** La autorización firmada, cuando el descuento pasa del tope de quien cobra. */
  readonly autorizacion?: string;
  /** Quién la dio, para decirlo en la pantalla. */
  readonly autorizo?: string;
}

interface Tope {
  readonly topeCentavos: string;
  readonly topeBp: number;
  readonly quienesAutorizan: readonly { readonly empleoId: string; readonly nombre: string }[];
}

/** «10» o «12.5» por ciento a puntos base; `null` si no es un porcentaje. */
export function puntosBaseDe(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(limpio)) return null;
  const [entero = '0', decimal = ''] = limpio.split('.');
  const bp = Number(entero) * 100 + Number(decimal.padEnd(2, '0'));
  return bp > 0 && bp < 10_000 ? bp : null;
}

/** El porcentaje sobre la base, en centavos, redondeando la mitad hacia arriba. */
export function centavosDePorcentaje(base: number, bp: number): number {
  return Number((BigInt(base) * BigInt(bp) + 5_000n) / 10_000n);
}

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof ErrorApi ? fallo.message : porDefecto;
}

export function DescuentoDeVenta({
  base,
  onAplicar,
}: {
  /** Lo que vale la venta antes del descuento, en centavos. */
  readonly base: number;
  readonly onAplicar: (descuento: DescuentoElegido) => void;
}) {
  const [tope, setTope] = useState<Tope | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [modo, setModo] = useState<'importe' | 'porcentaje'>('importe');
  const [importe, setImporte] = useState<number | null>(null);
  const [porcentaje, setPorcentaje] = useState('');
  const [motivo, setMotivo] = useState('');
  const [supervisor, setSupervisor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [autorizacion, setAutorizacion] = useState<{ token: string; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    const control = new AbortController();
    invocarComando<Tope>('/api/venta/tope-de-descuento', {}, { signal: control.signal })
      .then((leido) => {
        if (control.signal.aborted) return;
        setTope(leido);
        setSupervisor(leido.quienesAutorizan[0]?.empleoId ?? null);
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) setFallo(mensajeDe(error, 'No se pudo leer tu tope.'));
      });
    return () => {
      control.abort();
    };
  }, []);

  const bp = puntosBaseDe(porcentaje);
  const centavos =
    modo === 'importe' ? (importe ?? 0) : bp === null ? 0 : centavosDePorcentaje(base, bp);
  const valido = centavos > 0 && centavos < base;
  const requiere =
    tope !== null && valido
      ? evaluarDescuento({
          baseCentavos: BigInt(base),
          descuentoCentavos: BigInt(centavos),
          tope: { topeCentavos: BigInt(tope.topeCentavos), topeBp: tope.topeBp },
        }).veredicto !== 'libre'
      : false;

  async function autorizar(): Promise<void> {
    if (supervisor === null || pin.length < 4) return;
    setOcupado(true);
    setFallo(null);
    try {
      const respuesta = await invocarComando<{ autorizacion: string }>(
        '/api/identidad/supervisor',
        {
          empleoId: supervisor,
          pin,
        },
      );
      const nombre = tope?.quienesAutorizan.find((q) => q.empleoId === supervisor)?.nombre ?? '';
      setAutorizacion({ token: respuesta.autorizacion, nombre });
    } catch (error: unknown) {
      setFallo(mensajeDe(error, 'No se pudo autorizar.'));
    } finally {
      setPin('');
      setOcupado(false);
    }
  }

  if (tope === null) {
    return fallo === null ? (
      <Esqueleto className="h-40 w-full rounded-lg" />
    ) : (
      <Aviso tono="peligro" titulo={fallo} />
    );
  }

  const listo = valido && motivo.trim().length >= 4 && (!requiere || autorizacion !== null);

  return (
    <form
      className="flex flex-col gap-(--espacio-3)"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (!listo) return;
        onAplicar({
          centavos,
          motivo: motivo.trim(),
          ...(requiere && autorizacion !== null
            ? { autorizacion: autorizacion.token, autorizo: autorizacion.nombre }
            : {}),
        });
      }}
    >
      <div
        role="group"
        aria-label="Cómo se descuenta"
        className="grid grid-cols-2 gap-(--espacio-2)"
      >
        {(['importe', 'porcentaje'] as const).map((opcion) => (
          <Button
            key={opcion}
            type="button"
            size="sm"
            variant={modo === opcion ? 'default' : 'outline'}
            aria-pressed={modo === opcion}
            onClick={() => {
              setModo(opcion);
              setAutorizacion(null);
            }}
          >
            {opcion === 'importe' ? 'En pesos' : 'En porcentaje'}
          </Button>
        ))}
      </div>
      {modo === 'importe' ? (
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="descuento-importe">Cuánto se descuenta</Label>
          <CampoDeDinero
            id="descuento-importe"
            autoFocus
            centavos={importe}
            alCambiar={(valor) => {
              setImporte(valor);
              setAutorizacion(null);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="descuento-porcentaje">Porcentaje</Label>
          <Input
            id="descuento-porcentaje"
            inputMode="decimal"
            autoComplete="off"
            autoFocus
            placeholder="10"
            value={porcentaje}
            onChange={(evento) => {
              setPorcentaje(evento.target.value);
              setAutorizacion(null);
            }}
          />
        </div>
      )}
      <p
        className="flex items-baseline justify-between gap-(--espacio-2) text-sm"
        aria-live="polite"
      >
        <span className="text-texto-sutil">Queda en</span>
        <Dinero centavos={base - (valido ? centavos : 0)} tamano="lg" />
      </p>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="descuento-motivo">Por qué</Label>
        <Input
          id="descuento-motivo"
          placeholder="cliente frecuente · producto golpeado"
          value={motivo}
          onChange={(evento) => {
            setMotivo(evento.target.value);
          }}
        />
      </div>

      {requiere ? (
        <div className="flex flex-col gap-(--espacio-2)">
          <Aviso tono="atencion" titulo="Pasa de tu tope: lo autoriza un supervisor con su PIN.">
            <span className="inline-flex flex-wrap items-baseline gap-(--espacio-1)">
              Tu tope: <Dinero centavos={Number(tope.topeCentavos)} tamano="sm" /> o el{' '}
              {porcentajeDeTope(tope.topeBp)} %.
            </span>
          </Aviso>
          {tope.quienesAutorizan.length === 0 ? (
            <Vacio
              icono={<KeyRound />}
              titulo="No hay quién autorice."
              explicacion="Este negocio no tiene gerente ni dueño con PIN: el descuento tiene que caber en tu tope."
            />
          ) : autorizacion === null ? (
            <>
              <fieldset>
                <legend className="mb-(--espacio-2) text-sm font-medium">Quién autoriza</legend>
                <div className="flex flex-wrap gap-(--espacio-2)">
                  {tope.quienesAutorizan.map((q) => (
                    <Button
                      key={q.empleoId}
                      type="button"
                      size="sm"
                      variant={supervisor === q.empleoId ? 'default' : 'outline'}
                      aria-pressed={supervisor === q.empleoId}
                      onClick={() => {
                        setSupervisor(q.empleoId);
                      }}
                    >
                      {q.nombre}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <div className="flex items-end gap-(--espacio-2)">
                <div className="flex flex-1 flex-col gap-(--espacio-1)">
                  <Label htmlFor="descuento-pin">PIN de quien autoriza</Label>
                  <Input
                    id="descuento-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={8}
                    value={pin}
                    onChange={(evento) => {
                      setPin(evento.target.value.replace(/\D/g, ''));
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={ocupado || supervisor === null || pin.length < 4}
                  cargando={ocupado}
                  onClick={() => {
                    void autorizar();
                  }}
                >
                  <KeyRound aria-hidden="true" />
                  Autorizar
                </Button>
              </div>
            </>
          ) : (
            <Aviso tono="exito" titulo={`Autorizó ${autorizacion.nombre}.`} />
          )}
        </div>
      ) : null}

      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}

      <Button type="submit" disabled={!listo}>
        <BadgePercent aria-hidden="true" />
        Aplicar el descuento
      </Button>
    </form>
  );
}
