'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { ChevronRight, Scissors, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { AvisoSinConexion, useEnLinea } from '~/cliente/en-linea';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

import {
  accionDeTecla,
  caminoPorOmision,
  caminosPosibles,
  faltaEnMixto,
  pagosParaEnviar,
  propinaQueCobraElSalon,
  propinasParaEnviar,
  type Camino,
  type CuentaDeTransferencia,
  type Metodo,
  type ParteDelEquipo,
  type RenglonDePago,
} from './cobro-de-cita';
import { DescuentoDelCobro } from './DescuentoDelCobro';
import { HistorialDePagos } from './HistorialDePagos';
import { PagoDelCobro } from './PagoDelCobro';
import { PropinaDelCobro } from './PropinaDelCobro';

/**
 * PANTALLA · estetica-salon · cobrar
 *
 * Convertir una cita terminada en dinero, con su comisión y su propina bien
 * puestas. 15–30 veces al día, desde recepción o desde la propia profesional.
 *
 * ── Por qué lo que queda POR COBRAR es lo más grande de la aplicación ─────
 * Porque es el único número que se dice EN VOZ ALTA con la clienta enfrente, y
 * decir uno distinto del que se cobra es la forma más cara de equivocarse aquí.
 * Todo lo demás —lista, descuento, IVA, anticipo— existe para explicarlo, no para
 * competir con él: es un recibo a su izquierda.
 *
 * ── Los números los pone el SERVIDOR ─────────────────────────────────────
 * Total, IVA, anticipo, descuento y lo que queda por cobrar salen de
 * `venta.cotizar_cita`, con la misma función que el cobro. Aquí antes se extraía el
 * IVA con una tasa fija del 16 % —un salón en la franja fronteriza cobra el 8 %— y
 * el anticipo se pintaba pero BLOQUEABA el cobro, porque el comando no sabía
 * descontarlo. Ahora el anticipo aparece ya restado (descuadre 4 de
 * `02-DINERO-Y-CAJA §10`: si hay que buscarlo, se cobra dos veces).
 *
 * ── Lo que este cobro tiene y ningún otro del proyecto ───────────────────
 * Cada línea trae SU profesional y la propina trae DESTINATARIA y CAMINO. Sin el
 * profesional en la línea, una cita con dos personas le paga la comisión entera a
 * una (F-443); sin destinataria, la propina acaba en un bote que nadie sabe
 * repartir. Y ahora la propina QUEDA ANOTADA a su nombre (`PropinaDelCobro`): antes
 * se capturaba, se decía en el botón y se tiraba.
 *
 * ── Por qué un fallo NO vacía la pantalla ────────────────────────────────
 * Perder un cobro de $1,130 con la clienta enfrente es inaceptable. El error es
 * un `Aviso` de peligro; la cita, el método, el descuento y la propina siguen donde
 * estaban y COBRAR se puede volver a tocar: una cita cobrada no se cobra dos veces
 * (`ORDEN_NO_EDITABLE`). Lo que sí vacía la pantalla es NO PODER LEER: sin las
 * citas no hay a quién cobrar, y eso es un `ErrorDePantalla`, no una lista vacía.
 *
 * ── Sin caja abierta, un muro ANTES de cobrar ────────────────────────────
 * La cotización dice si hay caja en esta terminal. Sin ella no se cobra —el efectivo
 * no tendría dónde contarse— y se dice antes de elegir método, con el botón que
 * lleva a abrirla, en vez de un rechazo al final.
 *
 * ── Atajos (PC) ──────────────────────────────────────────────────────────
 * F12 cobrar · F2 efectivo · F3 tarjeta · F4 transferencia · F7 propina · ESC
 * volver a la lista (`04-INTERFAZ §4.3.4`).
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * La fórmula, las fotos, el historial clínico y la agenda. Aquí se cobra.
 */

/** Las tarjetas grises mientras se lee: las que caben sin desplazar en una tableta. */
const TARJETAS_DE_ESPERA = 4;

const RENGLONES_VACIOS: readonly RenglonDePago[] = [
  { metodo: 'efectivo', centavos: null },
  { metodo: 'tarjeta', centavos: null },
  { metodo: 'transferencia', centavos: null },
];

const CUENTA_DEL_SALON: CuentaDeTransferencia = { profesionalId: null, porConfirmar: false };

export interface CitaPorCobrar {
  readonly id: string;
  readonly folio: string | null;
  readonly cliente_id: string | null;
  readonly estado: string | null;
  readonly agendada_para: string | null;
}

export interface ServicioDeCita {
  readonly id: string;
  readonly cita_id: string | null;
  readonly servicio_id: string | null;
  readonly profesional_id: string | null;
  /**
   * EN PESOS: el gemelo honesto de `precio_centavos`, la misma columna, que el puente
   * convierte con `dinero`. Se lee sólo con `centavosDe` (`importeDeLinea`).
   */
  readonly precio_pesos: number | null;
  readonly estado: string | null;
}

/**
 * Un nombre y un id, para poner nombres a los identificadores de la cita.
 *
 * DOS TIPOS y no uno, porque el campo no se llama igual en las tres entidades: una
 * profesional tiene `nombre_completo` y un cliente o un producto tienen `nombre`.
 */
export interface PersonaDelSalon {
  readonly id: string;
  readonly nombre_completo: string | null;
}

/** Un cliente o un producto: los dos sirven `nombre`. */
export interface NombradoDelSalon {
  readonly id: string;
  readonly nombre: string | null;
}

/** Lo que contesta `venta.cotizar_cita`: centavos en cadena, como toda cifra del servidor. */
export interface CotizacionDeCita {
  readonly listaCentavos: string;
  readonly descuentoCentavos: string;
  readonly impuestosCentavos: string;
  readonly totalCentavos: string;
  readonly anticipoCentavos: string;
  readonly porCobrarCentavos: string;
  readonly descuentoPasaDelTope: { readonly topeCentavos: string; readonly topeBp: number } | null;
  readonly comisiones: readonly {
    readonly profesionalId: string;
    readonly sinDescuentoCentavos: string;
    readonly conDescuentoCentavos: string;
  }[];
  readonly cajaAbierta: boolean;
}

export interface CobrarProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly citasIniciales?: readonly CitaPorCobrar[];
  readonly serviciosIniciales?: readonly ServicioDeCita[];
  readonly profesionalesIniciales?: readonly PersonaDelSalon[];
  readonly clientesIniciales?: readonly NombradoDelSalon[];
  readonly catalogoInicial?: readonly NombradoDelSalon[];
  /** Para las pruebas: la cotización sin red. */
  readonly cotizar?: (citaId: string, descuentoBp: number) => Promise<CotizacionDeCita>;
  readonly onCobrado?: (citaId: string) => void;
}

/** Lo que se acaba de cobrar, para decirlo con sus importes y su folio. */
interface CobroHecho {
  readonly cobrado: number;
  readonly propinas: readonly { readonly nombre: string; readonly centavos: number }[];
  readonly folio: string;
}

/** Las líneas vivas de una cita. Lo cancelado no se cobra ni se enseña. */
export function lineasDe(
  servicios: readonly ServicioDeCita[],
  citaId: string | null,
): readonly ServicioDeCita[] {
  if (citaId === null) return [];
  return servicios.filter((fila) => fila.cita_id === citaId && fila.estado !== 'cancelado');
}

/** Lo que cuesta una línea, en CENTAVOS. Sin precio es cero: no se cobra lo que no llegó. */
function importeDeLinea(linea: ServicioDeCita): number {
  return centavosDe('CitaServicio', 'precio_pesos', linea.precio_pesos) ?? 0;
}

export function totalDe(lineas: readonly ServicioDeCita[]): number {
  return lineas.reduce((suma, linea) => suma + importeDeLinea(linea), 0);
}

/** Quién atendió y cuánto suma su servicio, de más a menos: el peso de su propina. */
export function equipoDe(lineas: readonly ServicioDeCita[]): readonly ParteDelEquipo[] {
  const porPersona = new Map<string, number>();
  for (const linea of lineas) {
    if (linea.profesional_id === null) continue;
    porPersona.set(
      linea.profesional_id,
      (porPersona.get(linea.profesional_id) ?? 0) + importeDeLinea(linea),
    );
  }
  return [...porPersona]
    .map(([profesionalId, centavos]) => ({ profesionalId, centavos }))
    .toSorted((a, b) => b.centavos - a.centavos);
}

/** «1 concepto», «3 conceptos»: el uno es el único singular. */
function conceptosEnTexto(cuantos: number): string {
  return `${cuantos} ${cuantos === 1 ? 'concepto' : 'conceptos'}`;
}

/**
 * Qué pasó, en palabras de mostrador.
 *
 * El límite de intentos NO es un código de la API: es el 429, y por eso se lee
 * de `estado` y no de `codigo`.
 */
export function mensajeDeFallo(fallo: unknown, voc: Vocabulario): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429)
      return 'Demasiados intentos seguidos. Espera y vuelve a tocar COBRAR.';
    if (fallo.error.codigo === 'SIN_PERMISO') {
      // Dos negativas distintas con el mismo código: el descuento que pasa del tope
      // (trae el tope en `datos` y su mensaje dice qué hacer) y el puesto que no cobra.
      return fallo.error.datos?.['topeBp'] === undefined
        ? 'Tu usuario no puede cobrar. Que lo haga quien tenga la caja, desde aquí mismo.'
        : fallo.error.mensaje;
    }
    return fallo.error.mensaje;
  }
  return (
    `No se pudo cobrar y no se cobró nada. ${voc.conArticulo('orden')} sigue ` +
    `abiert${voc.terminacion('orden')}: vuelve a tocar COBRAR.`
  );
}

function cotizarEnElServidor(citaId: string, descuentoBp: number): Promise<CotizacionDeCita> {
  return invocarComando<CotizacionDeCita>('/api/venta/cotizar-cita', { citaId, descuentoBp });
}

export function Cobrar({
  citasIniciales,
  serviciosIniciales,
  profesionalesIniciales,
  clientesIniciales,
  catalogoInicial,
  cotizar,
  onCobrado,
}: CobrarProps) {
  const voc = useVocabulario();
  const enLinea = useEnLinea();
  const router = useRouter();
  const [citas, setCitas] = useState<readonly CitaPorCobrar[] | null>(citasIniciales ?? null);
  const [servicios, setServicios] = useState<readonly ServicioDeCita[]>(serviciosIniciales ?? []);
  const [profesionales, setProfesionales] = useState<readonly PersonaDelSalon[]>(
    profesionalesIniciales ?? [],
  );
  const [otrosNombres, setOtrosNombres] = useState<readonly NombradoDelSalon[]>([
    ...(clientesIniciales ?? []),
    ...(catalogoInicial ?? []),
  ]);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [citaId, setCitaId] = useState<string | null>(null);
  const [descuentoBp, setDescuentoBp] = useState(0);
  /** La cotización con la clave de lo que cotizó: una vieja no se cobra por error. */
  const [cotizacion, setCotizacion] = useState<{
    readonly clave: string;
    readonly datos: CotizacionDeCita;
  } | null>(null);
  const [falloDeCotizacion, setFalloDeCotizacion] = useState<string | null>(null);
  const [recotizar, setRecotizar] = useState(0);
  const [modo, setModo] = useState<'uno' | 'mixto'>('uno');
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [renglones, setRenglones] = useState<readonly RenglonDePago[]>(RENGLONES_VACIOS);
  const [cuenta, setCuenta] = useState<CuentaDeTransferencia>(CUENTA_DEL_SALON);
  const [puntos, setPuntos] = useState<number | null>(null);
  const [otraPropina, setOtraPropina] = useState<number | null>(null);
  /**
   * La `key` del campo «otro». Un porcentaje lo vacía REMONTÁNDOLO: con un texto que
   * no es un importe («5O») `otraPropina` ya vale `null`, ponerle `null` otra vez no
   * cambia nada, y el campo sólo reescribe su texto cuando los centavos cambian desde
   * fuera.
   */
  const [reinicioDeOtra, setReinicioDeOtra] = useState(0);
  const [destinatarioElegido, setDestinatarioElegido] = useState<string | null>(null);
  const [caminoElegido, setCaminoElegido] = useState<Camino | null>(null);
  const [apoyo, setApoyo] = useState<{
    readonly profesionalId: string;
    readonly centavos: number | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cobrado, setCobrado] = useState<CobroHecho | null>(null);
  const [enviando, setEnviando] = useState(false);
  const primerToqueDePropina = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (citasIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    const señal = { signal: control.signal };
    Promise.all([
      consultarPuente<CitaPorCobrar>('Cita', { filtro: { estado: 'terminada' }, limite: 40 }),
      // Todas las líneas de una vez: elegir cita con la clienta enfrente no
      // puede costar otro viaje al servidor.
      consultarPuente<ServicioDeCita>('CitaServicio', { limite: 300, ...señal }),
      consultarPuente<PersonaDelSalon>('Profesional', { limite: 60, ...señal }),
      consultarPuente<NombradoDelSalon>('ProductoTerminado', { limite: 400, ...señal }),
      // El nombre de la clienta es adorno comparado con el cobro, y su lectura
      // pide un rol más estrecho: si falta, se cobra igual.
      consultarPuente<NombradoDelSalon>('Cliente', { limite: 400, ...señal }).catch(
        (): readonly NombradoDelSalon[] => [],
      ),
    ])
      .then(([filas, lineas, equipoDelSalon, catalogo, clientes]) => {
        if (!sigueMontada()) return;
        setCitas(filas);
        setServicios(lineas);
        setProfesionales(equipoDelSalon);
        setOtrosNombres([...catalogo, ...clientes]);
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setFalloDeCarga(
          fallo instanceof Error ? fallo.message : 'No se pudo leer la agenda del día.',
        );
      });
    return () => {
      control.abort();
    };
  }, [citasIniciales, recarga]);

  const claveDeCotizacion =
    citaId === null ? null : `${citaId}:${String(descuentoBp)}:${String(recotizar)}`;

  useEffect(() => {
    if (citaId === null || claveDeCotizacion === null) return;
    let vigente = true;
    (cotizar ?? cotizarEnElServidor)(citaId, descuentoBp)
      .then((datos) => {
        if (vigente) setCotizacion({ clave: claveDeCotizacion, datos });
      })
      .catch((fallo: unknown) => {
        if (!vigente) return;
        setFalloDeCotizacion(
          fallo instanceof ErrorApi ? fallo.error.mensaje : 'No se pudo calcular la cuenta.',
        );
      });
    return () => {
      vigente = false;
    };
  }, [citaId, descuentoBp, claveDeCotizacion, cotizar]);

  const nombres = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const persona of profesionales)
      mapa.set(persona.id, persona.nombre_completo ?? 'Sin nombre');
    for (const otro of otrosNombres) mapa.set(otro.id, otro.nombre ?? 'Sin nombre');
    return mapa;
  }, [profesionales, otrosNombres]);
  const nombreDe = (id: string): string => nombres.get(id) ?? 'Sin nombre';

  const cita = citas?.find((fila) => fila.id === citaId) ?? null;
  const lineas = lineasDe(servicios, citaId);
  const equipo = equipoDe(lineas);
  const cuentaVigente =
    cotizacion !== null && cotizacion.clave === claveDeCotizacion ? cotizacion.datos : null;
  const total = cuentaVigente === null ? totalDe(lineas) : Number(cuentaVigente.totalCentavos);
  const porCobrar = cuentaVigente === null ? null : Number(cuentaVigente.porCobrarCentavos);

  const metodosEnJuego: readonly Metodo[] =
    modo === 'uno'
      ? metodo === null
        ? []
        : [metodo]
      : renglones.filter((r) => (r.centavos ?? 0) > 0).map((r) => r.metodo);
  const caminos = caminosPosibles(metodosEnJuego);
  const camino =
    caminoElegido !== null && caminos.includes(caminoElegido)
      ? caminoElegido
      : caminoPorOmision(metodosEnJuego);
  const destinatario =
    destinatarioElegido ??
    (equipo.length > 1 ? 'repartir' : (equipo[0]?.profesionalId ?? 'repartir'));
  const propina = puntos === null ? (otraPropina ?? 0) : Math.round((total * puntos) / 100);
  const propinas = propinasParaEnviar({
    centavos: propina,
    destinatario,
    camino,
    equipo,
    apoyo:
      apoyo === null || apoyo.profesionalId === ''
        ? null
        : { profesionalId: apoyo.profesionalId, centavos: apoyo.centavos ?? 0 },
  });
  const pagos = pagosParaEnviar(modo, metodo, renglones, porCobrar ?? 0, cuenta);

  const bloqueo =
    cuentaVigente === null
      ? 'Calculando la cuenta…'
      : !cuentaVigente.cajaAbierta
        ? 'Abre la caja para poder cobrar.'
        : porCobrar !== null && porCobrar > 0 && modo === 'uno' && metodo === null
          ? 'Falta decir cómo paga.'
          : porCobrar !== null &&
              porCobrar > 0 &&
              modo === 'mixto' &&
              faltaEnMixto(porCobrar, renglones) !== 0
            ? 'El pago mixto no suma lo que queda por cobrar.'
            : null;

  /** Todo lo que se decidió para UNA cita vuelve a cero al elegir otra. */
  function elegirCita(id: string | null): void {
    setCitaId(id);
    setDescuentoBp(0);
    setFalloDeCotizacion(null);
    setModo('uno');
    setMetodo(null);
    setRenglones(RENGLONES_VACIOS);
    setCuenta(CUENTA_DEL_SALON);
    setPuntos(null);
    setOtraPropina(null);
    setReinicioDeOtra((previo) => previo + 1);
    setDestinatarioElegido(null);
    setCaminoElegido(null);
    setApoyo(null);
    // El fallo era de OTRA cita: arrastrarlo aquí afirma de ésta, que nadie intentó
    // cobrar, que «sigue como estaba» tras un fallo.
    setError(null);
  }

  async function cobrar(citaActual: CitaPorCobrar): Promise<void> {
    // Sin red no se cobra (F-988, A-27): no hay cola que guarde el cobro para después.
    if (!enLinea || bloqueo !== null || enviando || porCobrar === null) return;
    setEnviando(true);
    setError(null);
    try {
      const salida = await invocarComando<{ readonly folio: string }>('/api/venta/cobrar-cita', {
        citaId: citaActual.id,
        // Los importes los pone el SERVIDOR desde los precios congelados; aquí viajan
        // el porcentaje de descuento, el reparto entre métodos y las propinas, y él
        // comprueba que todo cuadre.
        pagos,
        descuentoBp,
        propinas,
      });
      setCitas((previas) => (previas ?? []).filter((fila) => fila.id !== citaActual.id));
      setCobrado({
        cobrado: porCobrar + propinaQueCobraElSalon(propinas),
        propinas: propinas.map((p) => ({
          nombre: nombreDe(p.profesionalId),
          centavos: p.montoCentavos,
        })),
        folio: salida.folio,
      });
      elegirCita(null);
      onCobrado?.(citaActual.id);
    } catch (fallo) {
      setError(mensajeDeFallo(fallo, voc));
    } finally {
      setEnviando(false);
    }
  }

  const alTeclear = useEffectEvent((evento: KeyboardEvent) => {
    if (cita === null) return;
    const accion = accionDeTecla(evento.key);
    if (accion === null) return;
    evento.preventDefault();
    if (accion === 'cancelar') {
      if (!enviando) elegirCita(null);
    } else if (accion === 'cobrar') {
      void cobrar(cita);
    } else if (accion === 'propina') {
      primerToqueDePropina.current?.focus();
    } else {
      setModo('uno');
      setMetodo(accion);
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const banda =
    error === null ? null : (
      <Aviso tono="peligro" titulo={error}>
        {voc.conArticulo('orden')}, el método, el descuento y la propina siguen como estaban.
      </Aviso>
    );

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto w-full max-w-2xl p-(--espacio-4)">
        <ErrorDePantalla
          titulo="No se pudo leer lo que hay por cobrar"
          queHacer="Mientras no se lea no se sabe a quién se cobra ni cuánto, y no se cobró nada. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={
            <Button
              onClick={() => {
                setFalloDeCarga(null);
                setCitas(null);
                setRecarga((previa) => previa + 1);
              }}
            >
              Volver a intentar
            </Button>
          }
        />
      </div>
    );
  }

  if (citas === null) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={`Leyendo ${voc.enFrase('orden', true)} por cobrar`}
        className="mx-auto flex w-full max-w-2xl flex-col gap-(--espacio-4) p-(--espacio-4)"
      >
        {/* La forma de la lista que viene, y nada tocable: un botón vivo sobre un
            importe que aún no existe es la forma de cobrar un número equivocado. */}
        <Esqueleto className="h-[calc(var(--altura-control)*0.8)] w-3/4" />
        <ul className="flex flex-col gap-(--espacio-2)">
          {Array.from({ length: TARJETAS_DE_ESPERA }, (_, indice) => (
            <li key={indice}>
              <Superficie relleno={4} className="flex items-center gap-(--espacio-3)">
                <span className="flex flex-1 flex-col gap-(--espacio-2)">
                  <Esqueleto className="h-4 w-1/2" />
                  <Esqueleto className="h-3 w-1/3" />
                </span>
                <Esqueleto className="h-5 w-24" />
              </Superficie>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (cita === null) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-(--espacio-4) p-(--espacio-4)">
        <header className="flex flex-col gap-(--espacio-1)">
          <h1 className="text-2xl font-bold">
            Elige {voc.enFraseCon('un', 'orden')} terminad{voc.terminacion('orden')} para cobrar
          </h1>
          {citas.length > 0 && (
            <p className="text-sm text-texto-sutil">
              {voc.conNumero('orden', citas.length)} con el servicio cerrado
            </p>
          )}
        </header>
        {cobrado !== null && (
          <Aviso tono="exito" titulo={`Cobrado · folio ${cobrado.folio}`}>
            <Dinero centavos={cobrado.cobrado} tamano="lg" className="text-texto" />
            {cobrado.propinas.map((p) => (
              <span key={p.nombre} className="mt-(--espacio-1) block">
                Propina de <Dinero centavos={p.centavos} tamano="sm" /> anotada a nombre de{' '}
                {p.nombre}.
              </span>
            ))}
          </Aviso>
        )}
        {banda}
        {citas.length === 0 ? (
          // El vacío ENSEÑA: dice por qué está vacío y qué hacer, no se disculpa.
          <Superficie relleno={6}>
            <Vacio
              icono={<Scissors />}
              titulo={`${voc.conDeterminante('ningun', 'orden')} está list${voc.terminacion('orden')} para cobrar.`}
              explicacion="Una cita se cobra cuando el servicio está CERRADO, y no antes: cerrarlo es donde se captura la fórmula y donde se descuenta el material de cabina. Cierra el servicio en la agenda y vuelve aquí."
              accion={
                <Button
                  variant="outline"
                  onClick={() => {
                    setRecarga((previa) => previa + 1);
                  }}
                >
                  Volver a mirar
                </Button>
              }
              className="py-0"
            />
          </Superficie>
        ) : (
          // Una rejilla de cosas que se tocan, no una tabla: la elección de a quién
          // se cobra es LA decisión de esta pantalla, y cada tarjeta es un botón
          // entero que sube al pasar y se hunde al tocar.
          <ul
            aria-label={`${voc.titulo('orden', true)} por cobrar`}
            className="flex flex-col gap-(--espacio-2)"
          >
            {citas.map((fila) => (
              <li key={fila.id}>
                <Superficie
                  como="button"
                  type="button"
                  interactiva
                  relleno={4}
                  className="flex w-full items-center gap-(--espacio-3)"
                  onClick={() => {
                    elegirCita(fila.id);
                    setCobrado(null);
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {nombres.get(fila.cliente_id ?? '') ?? `Sin ${voc.singular('cliente')}`}
                    </span>
                    <span className="block text-sm text-texto-sutil">
                      <span className="font-numeros">{fila.folio ?? 'Sin folio'}</span> ·{' '}
                      {conceptosEnTexto(lineasDe(servicios, fila.id).length)}
                    </span>
                  </span>
                  <Dinero
                    centavos={totalDe(lineasDe(servicios, fila.id))}
                    tamano="lg"
                    className="shrink-0"
                  />
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-texto-tenue" />
                </Superficie>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const columnas: readonly ColumnaDeTabla<ServicioDeCita>[] = [
    {
      clave: 'concepto',
      titulo: 'Concepto',
      celda: (linea) => (
        <span className="flex flex-col items-start gap-(--espacio-1)">
          <span>{nombres.get(linea.servicio_id ?? '') ?? 'Servicio'}</span>
          {/* El profesional en CADA línea: sin él la comisión se la lleva una sola. */}
          <Badge variant="secondary">
            <UserRound aria-hidden="true" />
            {nombres.get(linea.profesional_id ?? '') ?? 'Sin asignar'}
          </Badge>
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={importeDeLinea(linea)} tamano="sm" />,
    },
  ];

  const conceptos = (
    <Tabla
      etiqueta="Conceptos"
      columnas={columnas}
      filas={lineas}
      claveDe={(linea) => linea.id}
      // El subtotal bajo SU columna: es la suma de lo que está encima, no otro número.
      pie={{ concepto: 'Subtotal', importe: <Dinero centavos={totalDe(lineas)} tamano="sm" /> }}
    />
  );

  /** El recibo bajo los conceptos: descuento, IVA y anticipo, del servidor. */
  const recibo =
    cuentaVigente === null ? (
      <div
        role="status"
        aria-label="Calculando la cuenta"
        className="flex flex-col gap-(--espacio-2) px-(--espacio-3)"
      >
        <Esqueleto className="h-4 w-1/2" />
        <Esqueleto className="h-4 w-1/3" />
      </div>
    ) : (
      <dl className="grid grid-cols-[1fr_auto] gap-x-(--espacio-3) gap-y-(--espacio-1) px-(--espacio-3) text-sm text-texto-sutil">
        {Number(cuentaVigente.descuentoCentavos) > 0 && (
          <>
            <dt>Descuento {descuentoBp / 100} %</dt>
            <dd>
              <Dinero centavos={-Number(cuentaVigente.descuentoCentavos)} tamano="sm" conSigno />
            </dd>
          </>
        )}
        <dt>IVA incluido</dt>
        <dd>
          <Dinero centavos={Number(cuentaVigente.impuestosCentavos)} tamano="sm" />
        </dd>
        <dt className="font-medium text-texto">Total de la cita</dt>
        <dd className="font-medium text-texto">
          <Dinero centavos={Number(cuentaVigente.totalCentavos)} tamano="sm" />
        </dd>
      </dl>
    );

  const anticipo = cuentaVigente === null ? 0 : Number(cuentaVigente.anticipoCentavos);
  const aCobrarConPropina = (porCobrar ?? 0) + propinaQueCobraElSalon(propinas);

  return (
    <div className="grid gap-(--espacio-3) p-(--espacio-3) md:grid-cols-[minmax(0,1fr)_22rem] md:items-start xl:grid-cols-[minmax(0,1fr)_26rem_20rem] xl:gap-(--espacio-4) xl:p-(--espacio-4)">
      <div className="flex flex-col gap-(--espacio-3) md:col-span-2 xl:col-span-3">
        {enLinea ? null : <AvisoSinConexion />}
        <header className="flex flex-wrap items-baseline gap-x-(--espacio-3) gap-y-(--espacio-1)">
          <h1 className="text-xl font-bold">
            {nombres.get(cita.cliente_id ?? '') ?? `Sin ${voc.singular('cliente')}`}
          </h1>
          <span className="font-numeros text-sm text-texto-sutil">{cita.folio ?? 'Sin folio'}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            // Mientras se cobra no se sale: el fallo de ESTA cita caería sobre la
            // lista o sobre otra, diciendo de ella que «sigue como estaba».
            disabled={enviando}
            onClick={() => {
              elegirCita(null);
            }}
          >
            Elegir {voc.enFraseCon('otro', 'orden')}
          </Button>
        </header>
        {banda}
        {falloDeCotizacion !== null && (
          <Aviso
            tono="peligro"
            titulo={falloDeCotizacion}
            accion={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFalloDeCotizacion(null);
                  setRecotizar((previo) => previo + 1);
                }}
              >
                Volver a calcular
              </Button>
            }
          >
            Sin la cuenta del servidor no se cobra: el número que se dice en voz alta tiene que ser
            el que se cobra.
          </Aviso>
        )}
      </div>

      {/* El bloque del dinero va PRIMERO en el DOM: en teléfono es lo que se ve
          sin desplazar, y en tablet es la columna derecha del documento. */}
      <Superficie
        nivel={2}
        relleno={4}
        como="aside"
        aria-label="Cobro"
        className="flex flex-col gap-(--espacio-4) md:col-start-2 md:row-start-2"
      >
        <div className="flex flex-col gap-(--espacio-1)">
          <span className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
            A cobrar
          </span>
          {porCobrar === null ? (
            <Esqueleto className="h-[calc(var(--altura-control)*1.4)] w-2/3" />
          ) : (
            <Dinero centavos={porCobrar} tamano="total" className="leading-none" />
          )}
          {anticipo > 0 && (
            <p className="mt-(--espacio-2) flex items-baseline justify-between border-t border-borde pt-(--espacio-2) text-sm">
              <span>Anticipo ya pagado</span>
              <Dinero centavos={-anticipo} tamano="sm" conSigno />
            </p>
          )}
        </div>

        {cuentaVigente !== null && !cuentaVigente.cajaAbierta ? (
          // EL MURO: sin caja no se cobra, y se dice antes de elegir nada.
          <Aviso
            tono="atencion"
            titulo="Abre la caja para poder cobrar"
            accion={
              <Button
                onClick={() => {
                  router.push('/estetica-salon/caja-y-corte');
                }}
              >
                Ir a abrir la caja
              </Button>
            }
          >
            El efectivo de este cobro tiene que caber en el arqueo del día: sin caja abierta en esta
            terminal no tendría dónde contarse.
          </Aviso>
        ) : (
          <>
            <DescuentoDelCobro
              key={cita.id}
              citaId={cita.id}
              aplicadoBp={descuentoBp}
              descuentoAplicadoCentavos={Number(cuentaVigente?.descuentoCentavos ?? '0')}
              nombreDe={nombreDe}
              alAplicar={setDescuentoBp}
              {...(cotizar === undefined ? {} : { cotizar: (bp: number) => cotizar(cita.id, bp) })}
            />
            {porCobrar === 0 ? (
              <p className="text-sm text-texto-sutil">
                El anticipo cubre la cita entera: hoy no se cobra nada más.
              </p>
            ) : (
              <PagoDelCobro
                porCobrar={porCobrar ?? 0}
                modo={modo}
                metodo={metodo}
                renglones={renglones}
                cuenta={cuenta}
                equipo={equipo.map((p) => ({
                  id: p.profesionalId,
                  nombre: nombreDe(p.profesionalId),
                }))}
                alElegirMetodo={(elegido) => {
                  setModo('uno');
                  setMetodo(elegido);
                }}
                alElegirMixto={() => {
                  setModo('mixto');
                  setMetodo(null);
                }}
                alCambiarRenglon={(cual, centavos) => {
                  setRenglones((previos) =>
                    previos.map((r) => (r.metodo === cual ? { ...r, centavos } : r)),
                  );
                }}
                alCambiarCuenta={setCuenta}
              />
            )}
            <PropinaDelCobro
              centavos={propina}
              puntos={puntos}
              otra={otraPropina}
              reinicioDeOtra={reinicioDeOtra}
              destinatario={destinatario}
              camino={camino}
              caminosPosibles={caminos}
              equipo={equipo}
              todas={profesionales.map((p) => ({ id: p.id, nombre: nombreDe(p.id) }))}
              nombreDe={nombreDe}
              apoyo={apoyo}
              refPrimerToque={primerToqueDePropina}
              alElegirPorcentaje={(porcentaje) => {
                setPuntos(porcentaje);
                setOtraPropina(null);
                setReinicioDeOtra((previo) => previo + 1);
              }}
              alEscribirOtra={(centavos) => {
                setPuntos(null);
                setOtraPropina(centavos);
              }}
              alElegirDestinatario={setDestinatarioElegido}
              alElegirCamino={setCaminoElegido}
              alCambiarApoyo={setApoyo}
            />
          </>
        )}

        <div className="flex flex-col gap-(--espacio-2)">
          <Button
            size="lg"
            className="min-h-20 w-full justify-between text-lg"
            disabled={enviando || bloqueo !== null || !enLinea}
            onClick={() => {
              void cobrar(cita);
            }}
          >
            <span>{enviando ? 'Cobrando…' : 'COBRAR'}</span>
            <Dinero centavos={aCobrarConPropina} tamano="lg" />
          </Button>
          {bloqueo !== null && <p className="text-center text-sm text-texto-sutil">{bloqueo}</p>}
        </div>
      </Superficie>

      <Superficie
        relleno={0}
        como="section"
        aria-label={`Conceptos de ${voc.enFrase('orden')}`}
        className="md:col-start-1 md:row-start-2"
      >
        {/* `details` nativo: el teclado y el lector de pantalla ya saben abrirlo.
            En tablet y PC no hay nada que abrir — las líneas están a la vista. */}
        <details className="md:hidden">
          <summary className="cursor-pointer p-(--espacio-4) text-sm">
            ({conceptosEnTexto(lineas.length)})
          </summary>
          <div className="flex flex-col gap-(--espacio-3) px-(--espacio-3) pb-(--espacio-3)">
            {conceptos}
            {recibo}
          </div>
        </details>
        <div className="hidden flex-col gap-(--espacio-3) p-(--espacio-4) md:flex">
          {conceptos}
          {recibo}
        </div>
      </Superficie>

      {/* PC: lo que la clienta ha pagado, a la derecha del cobro (§4.3.4). */}
      {cita.cliente_id !== null && (
        <div className="hidden xl:col-start-3 xl:row-start-2 xl:block">
          <HistorialDePagos clienteId={cita.cliente_id} />
        </div>
      )}
    </div>
  );
}
