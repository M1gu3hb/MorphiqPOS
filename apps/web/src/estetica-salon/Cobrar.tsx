'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { RadioGroup, RadioGroupItem } from '@morphiqpos/ui/primitivas/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import {
  Aviso,
  CampoDeDinero,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  Landmark,
  Scissors,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * PANTALLA · estetica-salon · cobrar
 *
 * Convertir una cita terminada en dinero, con su comisión y su propina bien
 * puestas. 15–30 veces al día, desde recepción o desde la propia profesional.
 *
 * ── Por qué el TOTAL es lo más grande de la aplicación ───────────────────
 * Porque es el único número que se dice EN VOZ ALTA con la clienta enfrente, y
 * decir uno distinto del que se cobra es la forma más cara de equivocarse aquí.
 * Todo lo demás —subtotal, IVA, conceptos— existe para explicarlo, no para
 * competir con él. Por eso va en el paso `total` de `Dinero`, arriba del bloque
 * de cobro, y los conceptos son una tabla densa a su izquierda: un recibo.
 *
 * ── Lo que este cobro tiene y ningún otro del proyecto ───────────────────
 * Cada línea trae SU profesional y la propina trae DESTINATARIO. Sin el
 * profesional en la línea, una cita con dos personas le paga la comisión entera
 * a una (F-443); sin destinatario, la propina acaba en un bote que nadie sabe
 * repartir. Por eso los dos viajan en la pantalla principal y no en un paso
 * posterior: en `restaurante` la propina se pregunta y se desglosa, aquí es un
 * toque.
 *
 * ── Por qué el anticipo aparece RESTADO y no como opción ─────────────────
 * Es el descuadre 4 de `02-DINERO-Y-CAJA §10`: un anticipo que hay que ir a
 * buscar se cobra dos veces. Aparece en su renglón, ya aplicado.
 *
 * ── Por qué TRANSFERENCIA pregunta a qué cuenta ──────────────────────────
 * Porque el dinero que cae en la cuenta personal de la profesional pasa igual:
 * la única diferencia es si el negocio lo sabe. Preguntarlo sin juicio convierte
 * una fuga en un flujo declarado, y se descuenta de su liquidación. Por eso el
 * botón de transferencia ocupa su renglón entero: la pregunta sale justo debajo.
 *
 * ── Por qué un fallo NO vacía la pantalla ────────────────────────────────
 * Perder un cobro de $1,130 con la clienta enfrente es inaceptable. El error es
 * un `Aviso` de peligro; la cita, el método y la propina siguen donde estaban y
 * COBRAR se puede volver a tocar. La clave de idempotencia la pone
 * `invocarComando`, así que reintentar no cobra dos veces. Lo que sí vacía la
 * pantalla es NO PODER LEER: sin las citas no hay a quién cobrar, y eso es un
 * `ErrorDePantalla` con su «volver a intentar», no una lista vacía que miente.
 *
 * ── Lo que NO va aquí ────────────────────────────────────────────────────
 * La fórmula, las fotos, el historial clínico y la agenda. Aquí se cobra.
 *
 * ── Alcance recortado para caber en un archivo, dicho y no escondido ─────
 * 1. La PROPINA se captura, se muestra y se dice en el botón, pero no se
 *    persiste: `propinas/pasivo` pide un `empleoBeneficiarioId` y el puente no
 *    expone el empleo de `Profesional`. Al cobrar se avisa de que se entrega en
 *    mano. El día que el puente lo exponga, sale de aquí una segunda escritura.
 * 2. El ANTICIPO se pinta cuando el dato llega, pero bloquea el cobro: el
 *    comando exige que los pagos sumen el total congelado y todavía no sabe
 *    descontarlo (`anticipos_cita`, migración 138, no está en el puente).
 *    Cobrar de más callando es peor que no cobrar.
 * 3. El DESCUENTO con su aviso de comisión, el MIXTO, el historial de pagos de
 *    la clienta (columna derecha de PC) y los atajos F2…F12 quedan fuera de este
 *    archivo.
 * 4. El IVA se muestra con la tasa general: la configuración por producto aún no
 *    viaja por el puente y se prefiere el renglón a la cifra inventada.
 */

/** Los tres métodos que acepta `venta.cobrar_cita`. Ni uno más. */
const METODOS = [
  { clave: 'efectivo', etiqueta: 'Efectivo', Icono: Banknote },
  { clave: 'tarjeta', etiqueta: 'Tarjeta', Icono: CreditCard },
  { clave: 'transferencia', etiqueta: 'Transferencia', Icono: Landmark },
] as const;

type Metodo = (typeof METODOS)[number]['clave'];

/** Los tres toques de propina del documento, en puntos porcentuales. */
const PROPINAS = [12, 15, 18];

/** Tasa general en puntos base. Ver el punto 4 del alcance. */
const IVA_BP = 1600;

/** Las tarjetas grises mientras se lee: las que caben sin desplazar en una tableta. */
const TARJETAS_DE_ESPERA = 4;

export interface CitaPorCobrar {
  readonly id: string;
  readonly folio: string | null;
  readonly cliente_id: string | null;
  readonly estado: string | null;
  readonly agendada_para: string | null;
  /** Pesos ya recibidos. Hoy nunca llega: ver el punto 2 del alcance. */
  readonly anticipo?: number | null;
}

export interface ServicioDeCita {
  readonly id: string;
  readonly cita_id: string | null;
  readonly servicio_id: string | null;
  readonly profesional_id: string | null;
  /** El puente convierte `dinero` a PESOS, aunque la columna se llame centavos. */
  readonly precio_centavos: number | null;
  readonly estado: string | null;
}

/**
 * Un nombre y un id, para poner nombres a los identificadores de la cita.
 *
 * DOS TIPOS y no uno, porque el campo no se llama igual en las tres entidades: una
 * profesional tiene `nombre_completo` —lleva apellido y el mostrador enseña el
 * corto— y un cliente o un producto tienen `nombre`. Con un solo tipo, dos de las
 * tres lecturas llegaban con el nombre en `undefined` y la pantalla de cobro
 * enseñaba «Sin nombre» en cada renglón, con los nombres en la base.
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

export interface CobrarProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly citasIniciales?: readonly CitaPorCobrar[];
  readonly serviciosIniciales?: readonly ServicioDeCita[];
  readonly profesionalesIniciales?: readonly PersonaDelSalon[];
  readonly clientesIniciales?: readonly NombradoDelSalon[];
  readonly catalogoInicial?: readonly NombradoDelSalon[];
  readonly onCobrado?: (citaId: string) => void;
}

/** Lo que se acaba de cobrar, para decirlo con sus importes y su folio. */
interface CobroHecho {
  readonly total: number;
  readonly propina: number;
  readonly folio: string;
}

/** Pesos a centavos contando dígitos: `58.995 * 100` pierde medio centavo. */
export function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Las líneas vivas de una cita. Lo cancelado no se cobra ni se enseña. */
export function lineasDe(
  servicios: readonly ServicioDeCita[],
  citaId: string | null,
): readonly ServicioDeCita[] {
  if (citaId === null) return [];
  return servicios.filter((fila) => fila.cita_id === citaId && fila.estado !== 'cancelado');
}

export function totalDe(lineas: readonly ServicioDeCita[]): number {
  return lineas.reduce((suma, linea) => suma + aCentavos(linea.precio_centavos), 0);
}

/** El IVA que ya viene DENTRO del precio: se explica, no se suma. */
export function ivaIncluidoDe(total: number): number {
  return total - Math.round((total * 10_000) / (10_000 + IVA_BP));
}

/** «1 concepto», «3 conceptos»: el uno es el único singular. */
function conceptosEnTexto(cuantos: number): string {
  return `${cuantos} ${cuantos === 1 ? 'concepto' : 'conceptos'}`;
}

/**
 * Qué pasó, en palabras de mostrador.
 *
 * El límite de intentos NO es un código de la API: es el 429, y por eso se lee
 * de `estado` y no de `codigo`. Confundirlos deja al mostrador reintentando
 * contra una puerta que sólo pide esperar.
 */
export function mensajeDeFallo(fallo: unknown, voc: Vocabulario): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429)
      return 'Demasiados intentos seguidos. Espera y vuelve a tocar COBRAR.';
    if (fallo.error.codigo === 'SIN_PERMISO') {
      return 'Tu usuario no puede cobrar. Que lo haga quien tenga la caja, desde aquí mismo.';
    }
    return fallo.error.mensaje;
  }
  return (
    `No se pudo cobrar y no se cobró nada. ${voc.conArticulo('orden')} sigue ` +
    `abiert${voc.terminacion('orden')}: vuelve a tocar COBRAR.`
  );
}

export function Cobrar({
  citasIniciales,
  serviciosIniciales,
  profesionalesIniciales,
  clientesIniciales,
  catalogoInicial,
  onCobrado,
}: CobrarProps) {
  const voc = useVocabulario();
  const [citas, setCitas] = useState<readonly CitaPorCobrar[] | null>(citasIniciales ?? null);
  const [servicios, setServicios] = useState<readonly ServicioDeCita[]>(serviciosIniciales ?? []);
  const [personas, setPersonas] = useState<readonly (PersonaDelSalon | NombradoDelSalon)[]>([
    ...(profesionalesIniciales ?? []),
    ...(clientesIniciales ?? []),
    ...(catalogoInicial ?? []),
  ]);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [citaId, setCitaId] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [cuenta, setCuenta] = useState('salon');
  const [puntos, setPuntos] = useState<number | null>(null);
  const [otraPropina, setOtraPropina] = useState<number | null>(null);
  /**
   * La `key` del campo «otro». Un porcentaje lo vacía REMONTÁNDOLO: con un texto que
   * no es un importe («5O») `otraPropina` ya vale `null`, ponerle `null` otra vez no
   * cambia nada, y el campo sólo reescribe su texto cuando los centavos cambian desde
   * fuera. Quedaba «15 %» pulsado con «5O» escrito al lado.
   */
  const [reinicioDeOtra, setReinicioDeOtra] = useState(0);
  const [destinatario, setDestinatario] = useState('repartir');
  const [error, setError] = useState<string | null>(null);
  const [cobrado, setCobrado] = useState<CobroHecho | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [recarga, setRecarga] = useState(0);

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
      .then(([filas, lineas, profesionales, catalogo, clientes]) => {
        if (!sigueMontada()) return;
        setCitas(filas);
        setServicios(lineas);
        setPersonas([...profesionales, ...catalogo, ...clientes]);
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

  /** Leer otra vez desde cero. El estado se limpia EN EL CLIC, no dentro del efecto. */
  function releer(): void {
    setFalloDeCarga(null);
    setCitas(null);
    setRecarga((previa) => previa + 1);
  }

  const nombres = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const persona of personas) {
      // Los dos nombres, en el mismo mapa: la profesional trae `nombre_completo` y
      // el cliente o el producto traen `nombre`.
      const comoSeLlama = 'nombre_completo' in persona ? persona.nombre_completo : persona.nombre;
      mapa.set(persona.id, comoSeLlama ?? 'Sin nombre');
    }
    return mapa;
  }, [personas]);

  const cita = citas?.find((fila) => fila.id === citaId) ?? null;
  const lineas = lineasDe(servicios, citaId);
  const total = totalDe(lineas);
  const anticipo = aCentavos(cita?.anticipo);
  const propina = puntos === null ? (otraPropina ?? 0) : Math.round((total * puntos) / 100);
  const equipo = [...new Set(lineas.map((linea) => linea.profesional_id ?? ''))].filter(
    (id) => id !== '',
  );

  const bloqueo =
    total === 0
      ? 'Esa cita no tiene servicios cerrados que cobrar.'
      : anticipo > 0
        ? `${voc.conDeterminante('este', 'orden')} trae anticipo y el cobro todavía no sabe descontarlo. Ciérrala en caja.`
        : metodo === null
          ? 'Falta decir cómo paga.'
          : null;

  async function cobrar(citaActual: CitaPorCobrar, metodoActual: Metodo): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const salida = await invocarComando<{ readonly folio: string }>('/api/venta/cobrar-cita', {
        citaId: citaActual.id,
        // El importe lo manda el SERVIDOR desde los precios congelados al
        // agendar; aquí sólo viaja el reparto entre métodos, que él comprueba.
        pagos: [{ metodo: metodoActual, montoCentavos: total }],
      });
      setCitas((previas) => (previas ?? []).filter((fila) => fila.id !== citaActual.id));
      setCobrado({ total, propina, folio: salida.folio });
      setCitaId(null);
      setMetodo(null);
      setPuntos(null);
      setOtraPropina(null);
      onCobrado?.(citaActual.id);
    } catch (fallo) {
      setError(mensajeDeFallo(fallo, voc));
    } finally {
      setEnviando(false);
    }
  }

  const banda =
    error === null ? null : (
      <Aviso tono="peligro" titulo={error}>
        {voc.conArticulo('orden')}, el método y la propina siguen como estaban.
      </Aviso>
    );

  if (falloDeCarga !== null) {
    return (
      <div className="mx-auto w-full max-w-2xl p-(--espacio-4)">
        <ErrorDePantalla
          titulo="No se pudo leer lo que hay por cobrar"
          queHacer="Mientras no se lea no se sabe a quién se cobra ni cuánto, y no se cobró nada. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={<Button onClick={releer}>Volver a intentar</Button>}
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
            <Dinero centavos={cobrado.total} tamano="lg" className="text-texto" />
            {cobrado.propina > 0 && (
              <span className="mt-(--espacio-1) block">
                La propina de <Dinero centavos={cobrado.propina} tamano="sm" /> se entrega en mano:
                todavía no queda anotada.
              </span>
            )}
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
                    setCitaId(fila.id);
                    setCobrado(null);
                    // El fallo era de OTRA cita: arrastrarlo aquí afirma de ésta, que
                    // nadie intentó cobrar, que «sigue como estaba» tras un fallo.
                    setError(null);
                    setDestinatario('repartir');
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
      celda: (linea) => <Dinero centavos={aCentavos(linea.precio_centavos)} tamano="sm" />,
    },
  ];

  const conceptos = (
    <Tabla
      etiqueta="Conceptos"
      columnas={columnas}
      filas={lineas}
      claveDe={(linea) => linea.id}
      // El subtotal bajo SU columna: es la suma de lo que está encima, no otro número.
      pie={{ concepto: 'Subtotal', importe: <Dinero centavos={total} tamano="sm" /> }}
    />
  );

  return (
    <div className="grid gap-(--espacio-3) p-(--espacio-3) md:grid-cols-[minmax(0,1fr)_22rem] md:items-start xl:grid-cols-[minmax(0,1fr)_28rem] xl:gap-(--espacio-4) xl:p-(--espacio-4)">
      <div className="flex flex-col gap-(--espacio-3) md:col-span-2">
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
              setCitaId(null);
              setError(null);
            }}
          >
            Elegir {voc.enFraseCon('otro', 'orden')}
          </Button>
        </header>
        {banda}
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
            Total
          </span>
          <Dinero centavos={total} tamano="total" className="leading-none" />
          {anticipo > 0 && (
            <p className="mt-(--espacio-2) flex items-baseline justify-between border-t border-borde pt-(--espacio-2) text-sm">
              <span>− anticipo</span>
              <Dinero centavos={anticipo} tamano="sm" />
            </p>
          )}
        </div>

        {/* Transferencia en su renglón entero: al elegirla, la pregunta de a qué
            cuenta aparece justo debajo de ella y no bajo otro botón. */}
        <div className="grid grid-cols-2 gap-(--espacio-2)">
          {METODOS.map(({ clave, etiqueta, Icono }) => (
            <Button
              key={clave}
              type="button"
              variant={metodo === clave ? 'default' : 'outline'}
              aria-pressed={metodo === clave}
              className={`min-h-20 text-base ${clave === 'transferencia' ? 'col-span-2' : ''}`}
              onClick={() => {
                setMetodo(clave);
              }}
            >
              {/* El color nunca es el único que dice cuál está elegido: la marca
                  sustituye al icono del método. */}
              {metodo === clave ? <Check aria-hidden="true" /> : <Icono aria-hidden="true" />}
              {etiqueta}
            </Button>
          ))}
        </div>

        {metodo === 'transferencia' && (
          <Superficie nivel={0} relleno={3} radio="md" className="bg-fondo-sutil">
            <RadioGroup
              value={cuenta}
              onValueChange={setCuenta}
              aria-label="¿A qué cuenta?"
              className="gap-(--espacio-2)"
            >
              <p className="text-sm font-medium">¿A qué cuenta?</p>
              <span className="flex items-center gap-(--espacio-2)">
                <RadioGroupItem value="salon" id="cuenta-salon" />
                <Label htmlFor="cuenta-salon">Cuenta del salón</Label>
              </span>
              <span className="flex items-center gap-(--espacio-2)">
                <RadioGroupItem value="profesional" id="cuenta-profesional" />
                <Label htmlFor="cuenta-profesional">
                  Cuenta de {nombres.get(equipo[0] ?? '') ?? 'la profesional'} · se le descuenta de
                  su liquidación
                </Label>
              </span>
            </RadioGroup>
          </Superficie>
        )}

        <div className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)">
          <p className="flex items-baseline justify-between gap-(--espacio-2)">
            <span className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
              Propina
            </span>
            {propina > 0 && <Dinero centavos={propina} tamano="sm" />}
          </p>
          <div className="grid grid-cols-4 gap-(--espacio-2)">
            {PROPINAS.map((porcentaje) => (
              <Button
                key={porcentaje}
                type="button"
                // Una entrada de `.map` no es literal aunque el arreglo lleve
                // `as const`: el literal se escribe aquí, con el suyo.
                variant={puntos === porcentaje ? ('default' as const) : ('outline' as const)}
                aria-pressed={puntos === porcentaje}
                className="font-numeros tabular-nums"
                onClick={() => {
                  setPuntos(porcentaje);
                  setOtraPropina(null);
                  setReinicioDeOtra((previo) => previo + 1);
                }}
              >
                {porcentaje}%
              </Button>
            ))}
            <CampoDeDinero
              key={reinicioDeOtra}
              aria-label="Otra propina, en pesos"
              placeholder="otro"
              centavos={otraPropina}
              alCambiar={(centavos) => {
                setPuntos(null);
                setOtraPropina(centavos);
              }}
            />
          </div>
          <Select value={destinatario} onValueChange={setDestinatario}>
            <SelectTrigger className="w-full" aria-label="Destinatario de la propina">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="repartir">
                {equipo.length > 1 ? 'Repartir en proporción' : 'Para quien atendió'}
              </SelectItem>
              {equipo.map((id) => (
                <SelectItem key={id} value={id}>
                  Para {nombres.get(id) ?? 'esta persona'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-(--espacio-2)">
          <Button
            size="lg"
            className="min-h-20 w-full justify-between text-lg"
            disabled={enviando || bloqueo !== null}
            onClick={() => {
              if (metodo !== null) void cobrar(cita, metodo);
            }}
          >
            <span>{enviando ? 'Cobrando…' : 'COBRAR'}</span>
            <Dinero centavos={total + propina} tamano="lg" />
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
          <div className="px-(--espacio-3) pb-(--espacio-3)">{conceptos}</div>
        </details>
        <div className="hidden flex-col gap-(--espacio-3) p-(--espacio-4) md:flex">
          {conceptos}
          <dl className="flex items-baseline justify-between px-(--espacio-3) text-sm text-texto-sutil">
            <dt>IVA incluido</dt>
            <dd>
              <Dinero centavos={ivaIncluidoDe(total)} tamano="sm" />
            </dd>
          </dl>
        </div>
      </Superficie>
    </div>
  );
}
