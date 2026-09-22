'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Card } from '@morphiqpos/ui/primitivas/card';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { HandCoins } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · fiado
 *
 * La cartera: a quién le tengo que cobrar y a quién ya no fiarle. Consulta
 * rápida 10 a 25 veces al día, repaso completo una. Acción principal: abonar.
 *
 * ── Por qué «más viejo» y no «fecha del último cargo» ────────────────────
 * Porque la pregunta es *«¿desde cuándo me debe?»*, no *«¿cuándo compró?»*. Un
 * saldo de 47 días preocupa aunque el cliente haya comprado ayer, y ordenar
 * por compra esconde justo ese caso detrás de los que acaban de llevar algo.
 *
 * ── Por qué el semáforo y el ⚠ del límite son marcas separadas ───────────
 * Verde hasta 15 días, ámbar de 16 a 30, rojo de 31: eso es ANTIGÜEDAD. El ⚠
 * es MONTO. Son dos problemas distintos —se puede deber poco desde hace medio
 * año, o pasarse del límite ayer— y por eso no se funden en una sola señal.
 * Cada una lleva su palabra al lado, así que el color nunca carga solo con el
 * significado, y el ⚠ viaja junto al nombre para seguir visible en teléfono.
 *
 * ── Por qué «a quién hablarle» no manda nada ─────────────────────────────
 * Arma la lista y ahí se detiene. Un mensaje automático de cobranza a la
 * vecina rompe la relación que sostiene el negocio: el dueño decide a quién,
 * cuándo y con qué palabras, y manda desde su propio WhatsApp.
 *
 * ── Por qué la nota es un campo de primera clase ─────────────────────────
 * *«Paga los viernes»* es el dato que hace útil el módulo y hoy vive sólo en
 * la memoria de Don Chuy. Va en la ficha, arriba, no tras un «ver más».
 *
 * ── Por qué una rejilla y no una `<table>` ───────────────────────────────
 * Ésta es de las pocas pantallas que el dueño sí opera desde el teléfono, y
 * ahí la fila entera tiene que ser un solo blanco de dedo; una celda de tabla
 * no lo es. La rejilla da las cuatro columnas del documento en PC y dos
 * renglones por cliente a 390 px, con el mismo marcado.
 *
 * ── Por qué centavos enteros ─────────────────────────────────────────────
 * El saldo vive en `saldo_pendiente_centavos` y el abono se escribe igual.
 * Ir a pesos y volver es como entra el error de redondeo (R15).
 *
 * ── Alcance recortado, dicho y no escondido ──────────────────────────────
 * El abono se registra **en efectivo**: tarjeta y transferencia existen en
 * `fiado.registrar_abono`, pero elegir método pide un bloque que no cabe sin
 * sacrificar la ficha. «Nuevo cliente», «Exportar» y «Ver movimientos» son
 * otras pantallas y el documento no nombra sus rutas. La lectura es la vista
 * `CarteraFiado`, que las migraciones de Fase 2 escriben y NO aplican: contra
 * la base de hoy llega vacía y la pantalla enseña el flujo.
 */

/** El semáforo del documento, en días del saldo más viejo. */
const AMBAR_DESDE = 16;
const ROJO_DESDE = 31;

/** El límite de intentos no es un código de la API: es el estado HTTP. */
const HTTP_DEMASIADOS_INTENTOS = 429;

export interface FilaDeCartera {
  readonly cliente_id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly saldo_centavos: number | null;
  readonly dias_mas_viejo: number | null;
  readonly limite_centavos: number | null;
  readonly ultimo_abono_dias: number | null;
  readonly nota: string | null;
}

export interface FiadoProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeCartera[];
  readonly onAbonoRegistrado?: (clienteId: string, montoCentavos: number) => void;
}

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const bruto = Math.abs(centavos);
  const miles = Math.trunc(bruto / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${centavos < 0 ? '-' : ''}$${miles}.${(bruto % 100).toString().padStart(2, '0')}`;
}

/** Texto a centavos contando dígitos: «120.50» no pasa por punto flotante. */
export function aCentavos(texto: string): number {
  const [enteros = '', decimales = ''] = texto.replace(/[^\d.]/g, '').split('.');
  return Number(`0${enteros}`) * 100 + Number(`${decimales}00`.slice(0, 2));
}

/** El color va siempre con su palabra: solo, no dice nada a quien no lo ve. */
export function semaforoDe(dias: number): { readonly clase: string; readonly palabra: string } {
  if (dias >= ROJO_DESDE) return { clase: 'bg-peligro/20 border-peligro', palabra: 'vencido' };
  if (dias >= AMBAR_DESDE) return { clase: 'bg-advertencia/25 border-borde', palabra: 'se tarda' };
  return { clase: 'bg-exito/20 border-borde', palabra: 'al corriente' };
}

/** Deber más de lo aprobado. Problema de monto, independiente de los días. */
export function excedeLimite(fila: FilaDeCartera): boolean {
  const limite = fila.limite_centavos ?? 0;
  return limite > 0 && (fila.saldo_centavos ?? 0) > limite;
}

/** A quién hay que hablarle: o se tardó demasiado, o ya se pasó del límite. */
export function urge(fila: FilaDeCartera): boolean {
  return (fila.dias_mas_viejo ?? 0) >= ROJO_DESDE || excedeLimite(fila);
}

/** El último abono dicho como lo diría el tendero, no en formato de fecha. */
function hace(dias: number | null): string {
  if (dias === null) return 'nunca ha abonado';
  if (dias <= 0) return 'abonó hoy';
  if (dias === 1) return 'abonó ayer';
  if (dias >= 60) return `abonó hace ${Math.trunc(dias / 30)} meses`;
  return `abonó hace ${dias} días`;
}

function mensajeDe(fallo: unknown): string {
  if (!(fallo instanceof ErrorApi)) return 'No se pudo registrar el abono.';
  if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) {
    return 'Demasiados intentos seguidos. Espera un momento antes de volver a registrarlo.';
  }
  // Un abono sin movimiento de caja es dinero que entró y no está en ningún
  // corte: la base lo impide, y aquí se dice por qué en vez de «error 409».
  if (fallo.error.codigo === 'CONFLICTO_ESTADO') {
    return 'No hay caja abierta. Un abono sin movimiento de caja no saldría en el corte.';
  }
  return fallo.error.mensaje;
}

export function Fiado({ filasIniciales, onAbonoRegistrado }: FiadoProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeCartera[] | null>(filasIniciales ?? null);
  const [busqueda, setBusqueda] = useState('');
  const [soloPorCobrar, setSoloPorCobrar] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  const [monto, setMonto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    consultarPuente<FilaDeCartera>('CarteraFiado', { limite: 300, signal: control.signal })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        // La cartera NUNCA se vacía por la red: el dueño prefiere el dato de
        // hace un minuto a una pantalla en blanco con el cliente enfrente.
        if (sigueMontada()) setError(fallo instanceof Error ? fallo.message : 'No se pudo leer.');
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales]);

  const todas = filas ?? [];
  const deben = todas.reduce((suma, f) => suma + (f.saldo_centavos ?? 0), 0);
  const vencidas = todas.filter((f) => (f.dias_mas_viejo ?? 0) >= ROJO_DESDE);
  const vencido = vencidas.reduce((suma, f) => suma + (f.saldo_centavos ?? 0), 0);

  // Por antigüedad, y a igual antigüedad el saldo más grande primero: la
  // pantalla abre con lo que lleva más tiempo sin cobrarse.
  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return [...(filas ?? [])]
      .filter((f) => !soloPorCobrar || urge(f))
      .filter(
        (f) =>
          texto === '' ||
          f.nombre.toLowerCase().includes(texto) ||
          (f.telefono ?? '').includes(texto),
      )
      .sort(
        (a, b) =>
          (b.dias_mas_viejo ?? 0) - (a.dias_mas_viejo ?? 0) ||
          (b.saldo_centavos ?? 0) - (a.saldo_centavos ?? 0),
      );
  }, [filas, busqueda, soloPorCobrar]);

  const ficha = todas.find((f) => f.cliente_id === elegido) ?? null;

  async function abonar(cliente: FilaDeCartera): Promise<void> {
    const centavos = aCentavos(monto);
    if (centavos <= 0) {
      setError('Escribe cuánto abona antes de registrarlo.');
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      // Ruta nombrada en `05-DATOS-Y-BACKEND §5`. El servidor aplica el abono
      // al saldo más viejo primero; aquí no se decide a qué venta va.
      const entrada = {
        clienteId: cliente.cliente_id,
        montoCentavos: centavos,
        metodo: 'efectivo',
      };
      await invocarComando('/api/fiado/abono', entrada);
      const baja = (f: FilaDeCartera): FilaDeCartera =>
        f.cliente_id === cliente.cliente_id
          ? { ...f, saldo_centavos: Math.max(0, (f.saldo_centavos ?? 0) - centavos) }
          : f;
      setFilas((previas) => (previas ?? []).map(baja));
      setMonto('');
      onAbonoRegistrado?.(cliente.cliente_id, centavos);
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  if (filas === null) {
    // Esqueletos con la forma de los dos números y de la lista, no un spinner:
    // así nada salta de sitio cuando llegan los datos.
    return (
      <div className="p-(--espacio-4) lg:p-(--espacio-6)">
        <h1 className="text-2xl font-bold">Fiado</h1>
        <div className="mt-(--espacio-3) grid gap-(--espacio-3) sm:grid-cols-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
        <div className="mt-(--espacio-6) space-y-(--espacio-4)">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (filas.length === 0) {
    // El vacío ENSEÑA el flujo: dice con qué tecla nace un fiado.
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-(--espacio-8)">
        <h1 className="text-2xl font-bold">Fiado</h1>
        <Vacio
          icono={<HandCoins />}
          titulo="Todavía no le fías a nadie."
          explicacion="Cuando cobres una venta con «Fiado» (F11), el cliente aparece aquí con su saldo, sus días y su límite."
          accion={
            <Button asChild>
              <a href="/abarrotes/cobrar">Ir a cobrar</a>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="p-(--espacio-4) lg:p-(--espacio-6)">
      <h1 className="text-2xl font-bold">Fiado</h1>

      {/* Lo primero que se ve: el total de la cartera y lo que ya urge. */}
      <div className="mt-(--espacio-3) grid gap-(--espacio-3) sm:grid-cols-2">
        <Card className="gap-1 px-(--espacio-4) py-(--espacio-4)">
          <p className="text-sm text-texto-sutil">Lo que me deben</p>
          <p className="text-3xl font-bold tabular-nums">{enPesos(deben)}</p>
          <p className="text-sm text-texto-sutil">{filas.length} clientes</p>
        </Card>
        <Card className="gap-1 border-peligro bg-peligro/10 px-(--espacio-4) py-(--espacio-4)">
          <p className="text-sm font-medium">Más de 30 días</p>
          <p className="text-3xl font-bold tabular-nums">{enPesos(vencido)}</p>
          <p className="text-sm">{vencidas.length} clientes · son a los que hay que hablarles</p>
        </Card>
      </div>

      <div className="mt-(--espacio-4) flex flex-wrap items-center gap-2">
        <Label htmlFor="fiado-buscar" className="sr-only">
          Buscar {voc.singular('cliente')} por nombre o teléfono
        </Label>
        <Input
          id="fiado-buscar"
          type="search"
          value={busqueda}
          placeholder="Buscar por nombre o teléfono"
          className="min-w-40 max-w-xs flex-1"
          onChange={(evento) => {
            setBusqueda(evento.target.value);
          }}
        />
        {/* Arma la lista y ahí para: el mensaje lo manda el dueño, no esto. */}
        <Button
          type="button"
          variant={soloPorCobrar ? 'default' : 'outline'}
          aria-pressed={soloPorCobrar}
          onClick={() => {
            setSoloPorCobrar(!soloPorCobrar);
          }}
        >
          A quién hablarle
        </Button>
      </div>

      {error !== null && (
        // Encima del último dato conocido, nunca en su lugar, y lo primero que
        // dice es que ningún saldo se movió.
        <p role="alert" className="mt-(--espacio-3) rounded-md border border-peligro p-2 text-sm">
          {error} · Ningún saldo cambió.
        </p>
      )}

      <div className="mt-(--espacio-4) flex flex-col gap-(--espacio-4) lg:flex-row lg:items-start">
        <section className={`min-w-0 flex-1 ${ficha === null ? '' : 'pb-64 lg:pb-0'}`}>
          <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-x-(--espacio-4) border-b border-borde px-2 pb-2 text-xs font-medium text-texto-sutil md:grid">
            <span>{voc.titulo('cliente')}</span>
            <span className="text-right">Debe</span>
            <span>Más viejo</span>
            <span className="text-right">Límite · último abono</span>
          </div>

          <ul>
            {visibles.map((fila) => {
              const dias = fila.dias_mas_viejo ?? 0;
              const luz = semaforoDe(dias);
              return (
                <li key={fila.cliente_id} className="border-b border-borde">
                  <button
                    type="button"
                    aria-pressed={fila.cliente_id === elegido}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-(--espacio-4) gap-y-1 rounded-md px-2 py-(--espacio-3) text-left transition-colors hover:bg-acento-suave focus-visible:ring-2 focus-visible:ring-anillo md:grid-cols-[1fr_auto_auto_auto]"
                    onClick={() => {
                      setElegido(fila.cliente_id);
                      setMonto('');
                      setError(null);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{fila.nombre}</span>
                      <span className="block truncate text-xs text-texto-sutil">
                        {fila.telefono ?? 'sin teléfono'}
                      </span>
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {enPesos(fila.saldo_centavos ?? 0)}
                    </span>
                    <span className="col-span-2 flex flex-wrap items-center gap-1 md:col-span-1">
                      <Badge className={`${luz.clase} whitespace-nowrap text-texto`}>
                        {dias} días · {luz.palabra}
                      </Badge>
                      {excedeLimite(fila) && (
                        <Badge variant="outline" className="border-peligro">
                          <span aria-hidden>⚠</span> pasa su límite
                        </Badge>
                      )}
                    </span>
                    <span className="hidden text-right text-xs text-texto-sutil md:block">
                      <span className="block tabular-nums">
                        {fila.limite_centavos === null
                          ? 'sin límite'
                          : enPesos(fila.limite_centavos)}
                      </span>
                      {hace(fila.ultimo_abono_dias)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {visibles.length === 0 && (
            <p className="p-(--espacio-4) text-sm text-texto-sutil">
              Nadie cae en ese filtro. Buena señal, si era «a quién hablarle».
            </p>
          )}
        </section>

        {ficha !== null && (
          // Hoja inferior en teléfono, columna fija en PC: el mismo marcado en
          // los dos sitios, porque el contenido de la ficha es el mismo.
          <aside
            aria-label={`Ficha de ${ficha.nombre}`}
            className="fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto border-t border-borde bg-superficie p-(--espacio-4) text-texto shadow-3 lg:static lg:w-80 lg:shrink-0 lg:rounded-xl lg:border lg:shadow-1"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{ficha.nombre}</h2>
                <p className="text-sm text-texto-sutil">{ficha.telefono ?? 'sin teléfono'}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setElegido(null);
                }}
              >
                Cerrar
              </Button>
            </div>

            <p className="mt-2 text-2xl font-bold tabular-nums">
              {enPesos(ficha.saldo_centavos ?? 0)}
            </p>
            <p className="text-sm text-texto-sutil">
              más viejo {ficha.dias_mas_viejo ?? 0} días · {hace(ficha.ultimo_abono_dias)}
            </p>
            {excedeLimite(ficha) && (
              <p className="mt-1 text-sm font-medium">
                <span aria-hidden>⚠</span> Pasa su límite de {enPesos(ficha.limite_centavos ?? 0)}
              </p>
            )}

            {/* «Paga los viernes» es el dato que hace útil el módulo. */}
            {ficha.nota !== null && (
              <p className="mt-(--espacio-3) rounded-md bg-fondo-sutil p-2 text-sm text-texto-sutil">
                {ficha.nota}
              </p>
            )}

            <Label htmlFor="fiado-monto" className="mt-(--espacio-4)">
              Cuánto abona
            </Label>
            <Input
              id="fiado-monto"
              inputMode="decimal"
              placeholder="0.00"
              value={monto}
              className="mt-1 text-lg tabular-nums"
              onChange={(evento) => {
                setMonto(evento.target.value);
              }}
            />
            <Button
              type="button"
              size="lg"
              className="mt-(--espacio-3) w-full"
              disabled={enviando}
              onClick={() => {
                void abonar(ficha);
              }}
            >
              {enviando ? 'Registrando…' : 'Registrar abono'}
            </Button>
            <p className="mt-2 text-xs text-texto-sutil">
              En efectivo, al saldo más viejo primero. Entra al cajón y al corte del día.
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
