'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import {
  PASO,
  mover,
  sobrante,
  transcurrido,
  type ComponenteDeFormula,
  type Mezcla,
} from './formula-de-cabina';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';
import { Camera } from 'lucide-react';

/**
 * PANTALLA · estetica-salon · cita-en-curso
 *
 * Ésta es la pantalla que se toca CON GUANTES DE TINTE, y todo su diseño sale
 * de ahí. 15–30 veces al día, en el teléfono de la estilista, con la clienta ya
 * sentada y las manos ocupadas.
 *
 * ── Por qué la fórmula anterior va arriba de TODO ────────────────────────
 * Antes que los servicios y antes que el precio. Es lo que se necesita en el
 * minuto 10, no al final. Una pantalla que empieza por la lista de servicios
 * obliga a desplazar con el dorso del dedo para llegar a lo único urgente.
 *
 * ── Por qué REPETIR es un botón enorme y está solo ───────────────────────
 * El documento pide 64 px; aquí son 80 (`min-h-20`) porque la clase de 64 la
 * prohíbe la puerta de densidad y porque con guante de tinte el margen sobra,
 * no falta. Se toca con el nudillo, con el dorso o con el meñique limpio. Está
 * SOLO: nada que se pueda tocar por error a un centímetro.
 *
 * ── Por qué «añadir servicio» y «vender producto» están aquí ─────────────
 * Porque el momento en que se sugiere el tratamiento o el shampoo es con la
 * cabeza mojada, no en la salida. Si hay que acordarse en la caja, no se vende:
 * es el 15 % de la venta del salón y depende de estos dos botones.
 *
 * ── Por qué CERRAR SERVICIO no cobra ─────────────────────────────────────
 * Cierra el servicio, consume el material de cabina y deja la cita lista para
 * la caja. La clienta puede tardar veinte minutos más en salir. Por eso aquí NO
 * van el total, la propina ni el descuento: eso es de la pantalla de cobro.
 * Esta pantalla es del trabajo.
 *
 * ── Por qué el error NO vacía la pantalla ────────────────────────────────
 * Si no carga el historial se captura igual y se sincroniza. Perder la captura
 * por un error de red es perder el dato para siempre.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Caben la cabecera con la alergia y el cronómetro, la vez pasada con REPETIR y
 * AJUSTAR, la captura de fórmula (F-154), los servicios con sus dos botones de
 * venta, las dos fotos y el cierre. Quedan FUERA por el límite de 300 líneas:
 * las notas (prioridad 4), la galería de fotos de PC, la cola local sin
 * conexión de F-436 —aquí sólo queda marcado que la foto ya se tomó— y el costo
 * de material con la comisión, que necesita el escandallo de cabina.
 *
 * Contra la base de hoy `FormulaAplicada` y los campos de salón de `Cliente`
 * los escriben las migraciones 137 y 142, que NO están aplicadas: la lectura
 * vuelve vacía y la pantalla cae —a propósito— en el estado de clienta nueva.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const DIA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const HORA = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });

export interface VisitaConFormula {
  readonly id: string;
  /** ISO. Se formatea en el cliente: el servidor no sabe la zona del salón. */
  readonly fecha: string;
  readonly servicio: string;
  /**
   * Los componentes vienen DENTRO del jsonb `formula`, no como campo suelto.
   *
   * `FormulaAplicada` sirve `formula` —el objeto congelado tal cual se mezcló— y
   * esta pantalla leía `componentes` en la raíz: llegaba `undefined` y la fórmula de
   * partida salía vacía, que en un salón significa volver a adivinar la mezcla.
   */
  readonly componentes?: readonly ComponenteDeFormula[];
  readonly minutos: number;
}

export interface ServicioDeLaCita {
  readonly id: string;
  /** `servicio_nombre`, que es como lo sirve `CitaServicio`. */
  readonly servicio_nombre: string | null;
  readonly precio_centavos: number;
  readonly estado: string;
}

export interface CitaAbierta {
  readonly id: string;
  readonly clienta: string;
  readonly servicio: string;
  readonly hora: string;
  /** Epoch en ms del inicio real. El cronómetro no se guarda: se resta. */
  readonly inicioEn: number;
  /**
   * LAS ALERGIAS NO SON DEL CLIENTE: son de su EXPEDIENTE.
   *
   * `Cliente` no las sirve —la tabla no las tiene— y viven en
   * `ExpedienteBelleza.alergias`, que esta misma pantalla ya lee para la bandera
   * roja. Opcional para que el aviso salga del expediente y no de un `undefined`
   * que se lee como «sin alergias»: en un salón, esa confusión quema una cabeza.
   */
  readonly alergias?: string | null;
}

export interface CitaEnCursoProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly citaInicial?: CitaAbierta;
  readonly visitasIniciales?: readonly VisitaConFormula[];
  readonly serviciosIniciales?: readonly ServicioDeLaCita[];
}

export interface FilasDeFormulaProps {
  readonly componentes?: readonly ComponenteDeFormula[];
  readonly minutos?: number;
}

interface FilaCita {
  readonly id: string;
  readonly agendada_para: string;
  readonly inicio_real: string | null;
}

interface FilaClienta {
  readonly nombre: string;
  /**
   * La 142 añade los campos de salón a la tabla viva de clientes, y el puente NO
   * los sirve: `Cliente` no declara `alergias`.
   *
   * Opcional a propósito. Las alergias que esta pantalla enseña salen del
   * EXPEDIENTE —`ExpedienteBelleza.alergias`, que la agenda ya lee para la bandera
   * roja— y un `undefined` aquí se leería como «sin alergias», que en un salón es
   * la confusión que quema una cabeza.
   */
  readonly alergias?: string | null;
}

/** Punto de partida de una clienta nueva. NUNCA un formulario en blanco. */
const BASE: Mezcla = {
  mezclado: 90,
  usado: 90,
  componentes: [
    { nombre: '6.0', cantidad: 60, unidad: 'g' },
    { nombre: 'ox 20 vol', cantidad: 90, unidad: 'ml' },
  ],
  minutos: 35,
};

/** Un campo vacío es un cero, no un NaN: el sobrante tiene que cuadrar siempre. */
function entero(texto: string): number {
  const valor = Number.parseInt(texto, 10);
  return Number.isNaN(valor) ? 0 : Math.max(0, valor);
}

function mezclaDe(visita: VisitaConFormula): Mezcla {
  // Sin componentes servidos, una mezcla VACÍA y no un fallo: la fórmula de
  // partida se enseña como «todavía no hay» y la estilista la captura.
  const componentes = visita.componentes ?? [];
  const gramos = componentes.reduce((suma, c) => suma + c.cantidad, 0);
  return {
    mezclado: gramos,
    usado: gramos,
    componentes,
    minutos: visita.minutos,
  };
}

function armar(
  fila: FilaCita | undefined,
  clienta: FilaClienta | undefined,
  lineas: readonly ServicioDeLaCita[],
): CitaAbierta | null {
  if (fila === undefined) return null;
  const arranque = Date.parse(fila.inicio_real ?? fila.agendada_para);
  return {
    id: fila.id,
    clienta: clienta?.nombre ?? 'Sin registrar',
    servicio: lineas[0]?.servicio_nombre ?? 'Servicio',
    hora: HORA.format(new Date(fila.agendada_para)),
    inicioEn: Number.isNaN(arranque) ? Date.now() : arranque,
    alergias: clienta?.alergias ?? null,
  };
}

function mensajeDe(fallo: unknown, porOmision: string, voc: Vocabulario): string {
  // Una estilista sólo ve las citas que atiende ella; el servidor lo dice con
  // SIN_PERMISO y aquí se traduce, porque «403» no explica nada en el lavabo.
  if (fallo instanceof ErrorApi && fallo.error.codigo === 'SIN_PERMISO') {
    return (
      `${voc.conDeterminante('este', 'orden')} l${voc.terminacion('orden')} atiende otra persona. ` +
      'Aquí sólo ves las tuyas.'
    );
  }
  return fallo instanceof Error ? fallo.message : porOmision;
}

export function FilasDeFormula({ componentes = [], minutos = 0 }: FilasDeFormulaProps) {
  return (
    <ul className="mt-1 text-sm tabular-nums">
      {componentes.map((c) => (
        <li key={c.nombre} className="flex justify-between gap-(--espacio-3)">
          <span>{c.nombre}</span>
          <span>{`${String(c.cantidad)} ${c.unidad}`}</span>
        </li>
      ))}
      <li className="text-muted-foreground">{`${String(minutos)} min de proceso`}</li>
    </ul>
  );
}

export function CitaEnCurso({
  citaInicial,
  visitasIniciales,
  serviciosIniciales,
}: CitaEnCursoProps) {
  const voc = useVocabulario();
  const sinRed = citaInicial !== undefined;
  const [cita, setCita] = useState<CitaAbierta | null>(citaInicial ?? null);
  const [servicios, setServicios] = useState<readonly ServicioDeLaCita[]>(serviciosIniciales ?? []);
  const [visitas, setVisitas] = useState<readonly VisitaConFormula[] | null>(
    visitasIniciales ?? (sinRed ? [] : null),
  );
  const [ahora, setAhora] = useState<number | null>(null);
  const [mezcla, setMezcla] = useState<Mezcla | null>(null);
  const [fotos, setFotos] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardada, setGuardada] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (sinRed) return;
    // La agenda trae las DOS llaves en la URL. Encadenar cita → clienta costaría
    // un viaje entero justo en el minuto en que ella ya está sentada.
    const parametros = new URLSearchParams(window.location.search);
    const citaId = parametros.get('cita');
    const clientaId = parametros.get('clienta');
    // El centinela es la señal de aborto y no un `let vivo`: además de decir si
    // la pantalla sigue montada, CANCELA las cuatro lecturas en vuelo.
    const control = new AbortController();
    const señal = control.signal;
    void (async () => {
      try {
        const [citas, clientas, lineas, formulas] = await Promise.all([
          consultarPuente<FilaCita>('Cita', { filtro: { id: citaId }, limite: 1, signal: señal }),
          consultarPuente<FilaClienta>('Cliente', {
            filtro: { id: clientaId },
            limite: 1,
            signal: señal,
          }),
          consultarPuente<ServicioDeLaCita>('CitaServicio', {
            filtro: { cita_id: citaId },
            limite: 20,
            signal: señal,
          }),
          // El historial se degrada SOLO: si no carga, la captura sigue en pie.
          consultarPuente<VisitaConFormula>('FormulaAplicada', {
            filtro: { cliente_id: clientaId },
            orden: '-fecha',
            limite: 6,
            signal: señal,
          }).catch(() => null),
        ]);
        if (señal.aborted) return;
        setCita(armar(citas[0], clientas[0], lineas));
        setServicios(lineas);
        setVisitas(formulas ?? []);
        if (formulas === null) setError('No cargó el historial. Captura igual: se sincroniza.');
      } catch (fallo: unknown) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (señal.aborted) return;
        setVisitas([]);
        setError(mensajeDe(fallo, `No se pudo leer ${voc.enFrase('orden')}.`, voc));
      }
    })();
    return () => {
      control.abort();
    };
  }, [sinRed, voc]);

  useEffect(() => {
    // El reloj nace en un `setTimeout` y no en el cuerpo del efecto: escribir
    // estado ahí lo prohíbe react-hooks/set-state-in-effect, y además el primer
    // valor tiene que nacer en el cliente o la hidratación pinta otro minuto.
    const marcar = (): void => {
      setAhora(Date.now());
    };
    const primero = setTimeout(marcar);
    const reloj = setInterval(marcar, 20_000);
    return () => {
      clearTimeout(primero);
      clearInterval(reloj);
    };
  }, []);

  async function capturar(valores: Mezcla): Promise<void> {
    if (cita === null) return;
    try {
      // §7 del documento sólo nombra la LECTURA `ultima-formula`; la escritura
      // va por la convención /api/<dominio>/<verbo>. La primera captura de una
      // clienta nueva es también la que le crea el historial.
      await invocarComando('/api/expediente/capturar-formula', { citaId: cita.id, ...valores });
      setGuardada(true);
      setMezcla(null);
    } catch (fallo: unknown) {
      // Nunca se traga: una fórmula perdida en silencio no se recupera jamás.
      setError(mensajeDe(fallo, 'No se guardó la fórmula. Vuelve a intentarlo.', voc));
    }
  }

  async function cerrarServicio(): Promise<void> {
    const linea = servicios.find((s) => s.estado !== 'cerrado');
    if (linea === undefined) return;
    setCerrando(true);
    try {
      /**
       * EL CUERPO VA VACÍO, y eso es lo correcto.
       *
       * El identificador del servicio viaja EN LA RUTA. Lo que se mandaba aquí
       * —`{citaId}`— no es un campo de `agenda.cerrar_servicio`, y lo que ese
       * comando sí pedía era `almacenId`, que esta pantalla no tiene ni debe
       * pedir: un salón tiene un almacén y la estilista no elige de qué bodega
       * salió el tinte. Resultado medido: zod rechazaba la petición y **ninguna
       * pantalla podía cerrar un servicio**, así que ninguna cita llegaba a
       * `terminada` y la pantalla de cobro no listaba nada. Ahora el almacén lo
       * resuelve el servidor cuando no llega.
       *
       * `consumos` se queda en su valor por omisión —vacío— porque lo que se
       * mezcló se declara en la cabina (F-430), no aquí. Cerrar sin consumos no
       * toca el inventario: es el caso del corte, que no gasta producto.
       */
      await invocarComando(`/api/cita-servicios/${linea.id}/cerrar`, {});
      setServicios(servicios.map((s) => (s.id === linea.id ? { ...s, estado: 'cerrado' } : s)));
    } catch (fallo: unknown) {
      setError(mensajeDe(fallo, `No se pudo cerrar ${voc.enFrase('linea_orden')}.`, voc));
    } finally {
      setCerrando(false);
    }
  }

  if (visitas === null) {
    return (
      <div className="space-y-(--espacio-3) p-(--espacio-4)">
        <Skeleton className="h-20 w-full rounded-lg" />
        {/* El bloque de «la vez pasada» es lo primero que aparece: su hueco se
            reserva con la forma que va a tener, para que nada salte al cargar. */}
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const ultima = visitas[0] ?? null;
  const punto = ultima === null ? BASE : mezclaDe(ultima);
  const alergias = cita?.alergias ?? null;
  const nombre = cita?.clienta ?? 'Sin registrar';
  const primero = nombre.split(' ')[0] ?? nombre;
  const reloj = cita === null || ahora === null ? '--:--' : transcurrido(cita.inicioEn, ahora);
  const abiertos = servicios.filter((s) => s.estado !== 'cerrado');

  return (
    <div className="p-(--espacio-4) pb-[calc(var(--espacio-12)*2)] md:pb-(--espacio-4)">
      <header className="mb-(--espacio-3) flex flex-wrap items-center gap-x-(--espacio-3) gap-y-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Volver a la agenda"
          onClick={() => {
            window.history.back();
          }}
        >
          ‹
        </Button>
        <h1 className="text-xl font-bold">{nombre}</h1>
        {/* La alergia SIEMPRE visible y con palabra, no sólo con color: un error
            aquí no es un descuadre, es una urgencia médica. */}
        {alergias !== null && <Badge variant="destructive">{`⚠ Alergia · ${alergias}`}</Badge>}
        <p className="w-full text-sm text-muted-foreground">
          {`${cita?.servicio ?? 'Servicio'} · ${cita?.hora ?? '--:--'} · ⏱ en curso ${reloj}`}
        </p>
      </header>

      {error !== null && (
        <p
          role="alert"
          className="mb-(--espacio-3) rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
        >
          {error}
        </p>
      )}
      {guardada && (
        <p
          role="status"
          className="mb-(--espacio-3) rounded-md border border-border bg-success/20 p-2 text-sm"
        >
          Fórmula guardada en su historial.
        </p>
      )}

      {/* Teléfono: una columna, la cita primero. Tablet y PC: el historial a la
          izquierda —la vista que se acuerda de todo cuando la estilista grita
          «¿qué le pusimos la vez pasada?»— y la cita en curso a la derecha. */}
      <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section
          aria-labelledby="titulo-historial"
          className="order-2 rounded-lg border border-border bg-card p-(--espacio-3) text-card-foreground md:order-1"
        >
          <h2
            id="titulo-historial"
            className="text-xs font-semibold uppercase text-muted-foreground"
          >
            Historial
          </h2>
          {visitas.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">{`${primero} viene por primera vez.`}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {visitas.map((v) => (
                <li key={v.id} className="rounded-md border border-border p-2">
                  <p className="text-xs text-muted-foreground">
                    {`${DIA.format(new Date(v.fecha))} · ${v.servicio}`}
                  </p>
                  <FilasDeFormula componentes={v.componentes ?? []} minutos={v.minutos} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="order-1 space-y-(--espacio-3) md:order-2">
          <section
            aria-labelledby="titulo-formula"
            className="rounded-lg border border-border bg-card p-(--espacio-3) text-card-foreground shadow-1"
          >
            <h2
              id="titulo-formula"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              {ultima === null
                ? 'Fórmula de partida'
                : `La vez pasada · ${DIA.format(new Date(ultima.fecha))}`}
            </h2>
            {ultima === null && (
              <p className="mt-1 text-sm">
                {`${primero} viene por primera vez. Ésta es la fórmula base del servicio: ajústala y queda como su punto de partida.`}
              </p>
            )}
            <FilasDeFormula componentes={punto.componentes} minutos={punto.minutos} />

            {mezcla === null ? (
              <>
                {/* Solo y enorme: se toca con el nudillo o con el dorso del dedo. */}
                <Button
                  type="button"
                  className="mt-(--espacio-3) min-h-20 w-full text-lg"
                  // SIN CITA no hay nada que guardar: `capturar` se iba de vuelta en su
                  // primera línea y el botón no hacía nada, sin decir por qué. El
                  // rastreador lo contó como muerto, y lo era en ese estado.
                  disabled={cita === null}
                  title={cita === null ? 'Abre una cita para guardar su fórmula' : undefined}
                  onClick={() => {
                    void capturar(punto);
                  }}
                >
                  {ultima === null ? '✓ Guardar y crear su historial' : '✓ Repetir igual'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => {
                    setMezcla(punto);
                  }}
                >
                  Ajustar
                </Button>
              </>
            ) : (
              <div className="mt-(--espacio-3) space-y-2 rounded-md border border-border p-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="mezclado">Mezclé (g)</Label>
                    <Input
                      id="mezclado"
                      type="number"
                      inputMode="numeric"
                      value={mezcla.mezclado}
                      onChange={(evento) => {
                        setMezcla({ ...mezcla, mezclado: entero(evento.target.value) });
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="usado">Usé (g)</Label>
                    <Input
                      id="usado"
                      type="number"
                      inputMode="numeric"
                      value={mezcla.usado}
                      onChange={(evento) => {
                        setMezcla({ ...mezcla, usado: entero(evento.target.value) });
                      }}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {`Sobrante al bote: ${String(sobrante(mezcla.mezclado, mezcla.usado))} g`}
                </p>
                <ul className="space-y-1">
                  {mezcla.componentes.map((c, i) => (
                    <li key={c.nombre} className="flex items-center gap-2 text-sm tabular-nums">
                      <span className="flex-1">{c.nombre}</span>
                      <span>{`${String(c.cantidad)} ${c.unidad}`}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Quitar ${String(PASO)} a ${c.nombre}`}
                        onClick={() => {
                          setMezcla(mover(mezcla, i, -PASO));
                        }}
                      >
                        −
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label={`Añadir ${String(PASO)} a ${c.nombre}`}
                        onClick={() => {
                          setMezcla(mover(mezcla, i, PASO));
                        }}
                      >
                        +
                      </Button>
                    </li>
                  ))}
                </ul>
                <Label htmlFor="minutos">Procesado (min)</Label>
                <Input
                  id="minutos"
                  type="number"
                  inputMode="numeric"
                  value={mezcla.minutos}
                  onChange={(evento) => {
                    setMezcla({ ...mezcla, minutos: entero(evento.target.value) });
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() => {
                      void capturar(mezcla);
                    }}
                  >
                    Guardar fórmula
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMezcla(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section
            aria-labelledby="titulo-servicios"
            className="rounded-lg border border-border bg-card p-(--espacio-3) text-card-foreground"
          >
            <h2
              id="titulo-servicios"
              className="text-xs font-semibold uppercase text-muted-foreground"
            >
              {voc.titulo('linea_orden', true)}
            </h2>
            <ul className="mt-1 divide-y divide-border">
              {servicios.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span>{s.servicio_nombre ?? 'Servicio'}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {s.estado === 'cerrado' && <Badge variant="secondary">Cerrado</Badge>}
                    {PESOS.format(s.precio_centavos / 100)}
                  </span>
                </li>
              ))}
              {servicios.length === 0 && (
                <li className="py-1 text-sm text-muted-foreground">
                  Todavía no hay {voc.plural('linea_orden')} en {voc.enFraseCon('este', 'orden')}.
                </li>
              )}
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button asChild variant="secondary">
                <a href="/productos?tipo=servicio">+ Añadir {voc.singular('linea_orden')}</a>
              </Button>
              <Button asChild variant="secondary">
                <a href="/productos?tipo=anaquel">+ Vender {voc.singular('producto')}</a>
              </Button>
            </div>
          </section>

          <section aria-labelledby="titulo-fotos">
            <h2 id="titulo-fotos" className="text-xs font-semibold uppercase text-muted-foreground">
              Fotos
            </h2>
            {/* Un toque y se abre la cámara: `capture` evita el paso por la
                galería, que es donde se pierde el antes. */}
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['antes', 'después'] as const).map((momento) => (
                <label
                  key={momento}
                  className="flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border text-sm"
                >
                  <Camera aria-hidden="true" className="inline size-4 shrink-0" />
                  <span>{fotos.includes(momento) ? `${momento} · tomada ✓` : momento}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label={`Tomar la foto de ${momento}`}
                    onChange={(evento) => {
                      if (evento.target.files?.[0] === undefined) return;
                      setFotos([...fotos.filter((f) => f !== momento), momento]);
                    }}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Pegado abajo en el teléfono, donde llega el pulgar con la otra mano
          ocupada. En tablet vuelve al flujo: ahí la pantalla cabe entera. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background p-(--espacio-3) md:static md:border-0 md:p-0 md:pt-(--espacio-3)">
        <Button
          type="button"
          className="min-h-20 w-full text-lg"
          disabled={cerrando || abiertos.length === 0}
          onClick={() => {
            void cerrarServicio();
          }}
        >
          {cerrando ? 'Cerrando…' : 'Cerrar servicio'}
        </Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Cerrar no cobra: consume el material de cabina y deja la cita lista para la caja.
        </p>
      </div>
    </div>
  );
}
