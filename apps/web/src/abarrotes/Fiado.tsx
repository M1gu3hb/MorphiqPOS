'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  CampoDeDinero,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  TablaAdaptable,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { HandCoins, Search, TriangleAlert, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe, valorDelPuente } from '~/cliente/dinero-del-puente';
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
 * ── Por qué el semáforo y la marca del límite van separados ──────────────
 * Verde hasta 15 días, ámbar de 16 a 30, rojo de 31: eso es ANTIGÜEDAD. El
 * triángulo de «pasa su límite» es MONTO. Son dos problemas distintos —se puede
 * deber poco desde hace medio año, o pasarse del límite ayer— y por eso no se
 * funden en una sola señal: ni la fila entera se tiñe, ni el triángulo sale en
 * la cifra de «más de 30 días». Cada una lleva su palabra al lado, así que el
 * color nunca carga solo con el significado, y el triángulo viaja junto al
 * nombre para seguir visible en la tarjeta del teléfono.
 *
 * ── Por qué «a quién hablarle» no manda nada ─────────────────────────────
 * Arma la lista y ahí se detiene. Un mensaje automático de cobranza a la
 * vecina rompe la relación que sostiene el negocio: el dueño decide a quién,
 * cuándo y con qué palabras, y manda desde su propio WhatsApp.
 *
 * ── Por qué la nota es un campo de primera clase ─────────────────────────
 * *«Paga los viernes»* es el dato que hace útil el módulo y hoy vive sólo en
 * la memoria de Don Chuy. Va en la ficha, a la vista, no tras un «ver más».
 *
 * ── Por qué tabla en la PC y tarjetas en el teléfono ─────────────────────
 * Ésta es de las pocas pantallas que el dueño sí opera desde el teléfono, y
 * ahí la fila entera tiene que ser un solo blanco de dedo. `TablaAdaptable`
 * pinta la tabla densa del documento desde 768 px —se compara de arriba abajo
 * quién debe más y desde cuándo— y, por debajo, una tarjeta-botón por cliente
 * con el nombre arriba. Es la misma lista con las mismas columnas y el mismo
 * orden: por días, y a igual antigüedad el saldo más grande primero.
 *
 * ── La fila se convierte en la ficha ─────────────────────────────────────
 * Al tocar un cliente, su fila viaja hasta la ficha (`VIAJE.fila`), y al
 * cerrarla la ficha vuelve a su fila. No es adorno: en la PC la ficha abre a
 * la derecha, lejos de la fila, y el movimiento dice de quién es sin leer el
 * nombre. Dura lo que diga la perilla de movimiento, y cero con la preferencia
 * del sistema.
 *
 * ── Por qué centavos enteros ─────────────────────────────────────────────
 * El saldo llega en `saldo_centavos` de `CarteraFiado` —centavos de verdad, no el
 * `saldo_pendiente_centavos` de `Cliente`, que llega en pesos— y el abono se escribe igual:
 * `CampoDeDinero` convierte el texto a centavos contando dígitos. Ir a pesos y
 * volver es como entra el error de redondeo (R15).
 *
 * ── El abono, con su método (C.5 de la 2.4) ──────────────────────────────
 * Se registraba sólo en efectivo, con tarjeta y transferencia ya aceptadas por
 * `fiado.registrar_abono`. Ahora la ficha pregunta cómo paga: el efectivo entra al
 * cajón y al arqueo; la tarjeta baja el saldo y va al banco, así que el cajón no se
 * mueve —registrarla como efectivo dejaría el arqueo con dinero que no está—.
 *
 * ── Y baja la deuda DE VERDAD (C.10 de la 2.4) ───────────────────────────
 * El abono se anotaba en un libro que nadie lee: aquí el saldo bajaba y, al recargar,
 * volvía entero. Ahora es el pago de la cartera —el mismo que lee esta vista— y el saldo
 * que se pinta es el que contesta el servidor, no una resta hecha aquí. La transferencia
 * queda POR CONFIRMAR: el comprobante se ve en el teléfono del cliente y nadie sabe si es
 * real hasta mirar el banco, así que el saldo no baja todavía y la ficha lo dice.
 *
 * La lectura es la vista `CarteraFiado`, aplicada en la base desde la Fase 2.
 */

/** El semáforo del documento, en días del saldo más viejo. */
const AMBAR_DESDE = 16;
const ROJO_DESDE = 31;

/** El límite de intentos no es un código de la API: es el estado HTTP. */
const HTTP_DEMASIADOS_INTENTOS = 429;

/** Cuántos clientes lee la cartera de una vez. */
const LIMITE_DE_LECTURA = 300;

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

/** El color va siempre con su palabra: solo, no dice nada a quien no lo ve. */
export function semaforoDe(dias: number): { readonly clase: string; readonly palabra: string } {
  if (dias >= ROJO_DESDE) return { clase: 'bg-peligro/20 border-peligro', palabra: 'vencido' };
  if (dias >= AMBAR_DESDE) return { clase: 'bg-advertencia/25 border-borde', palabra: 'se tarda' };
  return { clase: 'bg-exito/20 border-borde', palabra: 'al corriente' };
}

/**
 * El saldo y el límite de una fila, en centavos. `CarteraFiado` ya los sirve en centavos
 * (`conversion: 'entero'`), pero la unidad la decide la conversión del campo y no su
 * nombre: por eso pasan por `centavosDe`, como cualquier dinero del puente. Sin saldo es
 * cero —no debe nada—; sin límite es `null`, que la pantalla dice «sin límite».
 */
function saldoDe(fila: FilaDeCartera): number {
  return centavosDe('CarteraFiado', 'saldo_centavos', fila.saldo_centavos) ?? 0;
}

function limiteDe(fila: FilaDeCartera): number | null {
  return centavosDe('CarteraFiado', 'limite_centavos', fila.limite_centavos);
}

/** Deber más de lo aprobado. Problema de monto, independiente de los días. */
export function excedeLimite(fila: FilaDeCartera): boolean {
  const limite = limiteDe(fila) ?? 0;
  return limite > 0 && saldoDe(fila) > limite;
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

/**
 * Lo que no dejó abonar. La caja cerrada no es un fallo: es un MURO de negocio,
 * y se enseña distinto —en ámbar y con el camino para abrirla—.
 */
type FalloDeAbono =
  { readonly tipo: 'caja-cerrada' } | { readonly tipo: 'fallo'; readonly mensaje: string };

/** Lo que contesta `fiado.registrar_abono`: el pago de la cartera. */
interface AbonoRegistrado {
  readonly saldoDespuesCentavos: string;
  readonly pendienteDeConfirmar: boolean;
}

function falloDe(fallo: unknown): FalloDeAbono {
  if (!(fallo instanceof ErrorApi))
    return { tipo: 'fallo', mensaje: 'No se pudo registrar el abono.' };
  if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) {
    return {
      tipo: 'fallo',
      mensaje: 'Demasiados intentos seguidos. Espera un momento antes de volver a registrarlo.',
    };
  }
  // Un abono sin movimiento de caja es dinero que entró y no está en ningún
  // corte: el comando lo impide. Llega como regla de negocio con su código
  // (`comando.ts` pone el de `ErrorDominio` en `datos.regla`), no como 409.
  if (fallo.error.datos?.['regla'] === 'CAJA_CERRADA') return { tipo: 'caja-cerrada' };
  return { tipo: 'fallo', mensaje: fallo.error.mensaje };
}

/** La antigüedad: el color del semáforo, siempre con sus días y su palabra. */
function Semaforo({ dias }: { readonly dias: number }) {
  const luz = semaforoDe(dias);
  return (
    <Badge className={`${luz.clase} whitespace-nowrap text-texto tabular-nums`}>
      {dias} días · {luz.palabra}
    </Badge>
  );
}

/** El monto: una marca aparte del semáforo, con su palabra. */
function MarcaDeLimite() {
  return (
    <Badge variant="outline" className="border-peligro">
      <TriangleAlert aria-hidden="true" className="text-peligro" /> pasa su límite
    </Badge>
  );
}

/** Las columnas del documento: cliente, debe, más viejo, límite y último abono. */
function columnasDeCartera(tituloCliente: string): readonly ColumnaDeTabla<FilaDeCartera>[] {
  return [
    {
      clave: 'cliente',
      titulo: tituloCliente,
      orden: (f) => f.nombre,
      celda: (f) => (
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-(--espacio-1)">
            <span className="truncate font-medium">{f.nombre}</span>
            {excedeLimite(f) ? <MarcaDeLimite /> : null}
          </span>
          <span className="truncate text-xs text-texto-sutil">{f.telefono ?? 'sin teléfono'}</span>
        </span>
      ),
    },
    {
      clave: 'debe',
      titulo: 'Debe',
      numerica: true,
      orden: (f) => saldoDe(f),
      celda: (f) => <Dinero centavos={saldoDe(f)} tamano="sm" className="font-semibold" />,
    },
    {
      clave: 'mas-viejo',
      titulo: 'Más viejo',
      orden: (f) => f.dias_mas_viejo ?? 0,
      celda: (f) => <Semaforo dias={f.dias_mas_viejo ?? 0} />,
    },
    {
      clave: 'limite',
      titulo: 'Límite',
      numerica: true,
      orden: (f) => limiteDe(f) ?? 0,
      celda: (f) => {
        const limite = limiteDe(f);
        return limite === null ? (
          <span className="text-texto-sutil">sin límite</span>
        ) : (
          <Dinero centavos={limite} tamano="sm" />
        );
      },
    },
    {
      // Sin `desde`: la tabla sólo existe desde `md`, y en tableta el último abono
      // es la mitad de la respuesta a «¿le sigo fiando?».
      clave: 'ultimo-abono',
      titulo: 'Último abono',
      // «Nunca ha abonado» es lo más viejo que hay: va al fondo del orden.
      orden: (f) => f.ultimo_abono_dias ?? Number.MAX_SAFE_INTEGER,
      celda: (f) => <span className="text-texto-sutil">{hace(f.ultimo_abono_dias)}</span>,
    },
  ];
}

/** Lo primero que se ve: el total de la cartera y lo que ya urge. */
function ResumenDeCartera({
  filas,
  voc,
}: {
  readonly filas: readonly FilaDeCartera[];
  readonly voc: ReturnType<typeof useVocabulario>;
}) {
  const deben = filas.reduce((suma, f) => suma + saldoDe(f), 0);
  const vencidas = filas.filter((f) => (f.dias_mas_viejo ?? 0) >= ROJO_DESDE);
  const vencido = vencidas.reduce((suma, f) => suma + saldoDe(f), 0);
  return (
    <section aria-label="Resumen de la cartera" className="grid gap-(--espacio-2) sm:grid-cols-2">
      <Superficie relleno={4} className="flex flex-col gap-(--espacio-1)">
        <p className="text-sm text-texto-sutil">Lo que me deben</p>
        <Dinero centavos={deben} tamano="lg" className="text-3xl font-bold" />
        <p className="text-sm text-texto-sutil">{voc.conNumero('cliente', filas.length)}</p>
      </Superficie>
      {/* El rojo sólo cuando hay alguien ahí: una cifra en cero pintada de
          alarma enseña a no hacerle caso al rojo. */}
      <Superficie
        relleno={4}
        className={`flex flex-col gap-(--espacio-1) ${vencidas.length > 0 ? 'border-peligro bg-peligro/10' : ''}`}
      >
        <p className="text-sm font-medium">Más de 30 días</p>
        <Dinero centavos={vencido} tamano="lg" className="text-3xl font-bold" />
        <p className="text-sm">
          {voc.conNumero('cliente', vencidas.length)} · son a los que hay que hablarles
        </p>
      </Superficie>
    </section>
  );
}

/** El límite en la ficha: pasado, con su marca; si no, dicho en tenue. */
function LimiteDeLaFicha({ cliente }: { readonly cliente: FilaDeCartera }) {
  const limite = limiteDe(cliente);
  if (excedeLimite(cliente)) {
    return (
      <p className="flex items-center gap-(--espacio-1) text-sm font-medium">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-peligro" />
        <span>
          Pasa su límite de <Dinero centavos={limite ?? 0} tamano="sm" />
        </span>
      </p>
    );
  }
  if (limite === null) {
    return <p className="text-sm text-texto-sutil">Sin límite</p>;
  }
  return (
    <p className="text-sm text-texto-sutil">
      Límite <Dinero centavos={limite} tamano="sm" />
    </p>
  );
}

/** Los tres métodos que acepta `fiado.registrar_abono`. */
const METODOS_DE_ABONO = [
  { clave: 'efectivo', etiqueta: 'Efectivo' },
  { clave: 'tarjeta', etiqueta: 'Tarjeta' },
  { clave: 'transferencia', etiqueta: 'Transferencia' },
] as const;

export type MetodoDeAbono = (typeof METODOS_DE_ABONO)[number]['clave'];

interface FichaProps {
  readonly cliente: FilaDeCartera;
  /** Un abono por transferencia que entró y todavía no baja el saldo. */
  readonly porConfirmar: number | null;
  readonly monto: number | null;
  readonly metodo: MetodoDeAbono;
  readonly alCambiarMetodo: (metodo: MetodoDeAbono) => void;
  readonly enviando: boolean;
  readonly error: FalloDeAbono | null;
  readonly alCambiarMonto: (centavos: number | null) => void;
  readonly alAbonar: () => void;
  readonly alCerrar: () => void;
}

/**
 * La ficha: hoja inferior en teléfono, columna fija en PC. El mismo marcado en
 * los dos sitios, porque el contenido de la ficha es el mismo. Lleva el nombre
 * de viaje de su fila: es la fila, convertida en panel.
 */
function Ficha({
  cliente,
  porConfirmar,
  monto,
  metodo,
  alCambiarMetodo,
  enviando,
  error,
  alCambiarMonto,
  alAbonar,
  alCerrar,
}: FichaProps) {
  return (
    <Superficie
      como="aside"
      nivel={3}
      relleno={4}
      aria-label={`Ficha de ${cliente.nombre}`}
      style={{ viewTransitionName: VIAJE.fila(cliente.cliente_id) }}
      className="fixed inset-x-0 bottom-0 z-20 flex max-h-[70dvh] flex-col gap-(--espacio-3) overflow-y-auto rounded-b-none lg:static lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-b-lg lg:shadow-1"
    >
      <header className="flex items-start justify-between gap-(--espacio-2)">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{cliente.nombre}</h2>
          <p className="text-sm text-texto-sutil">{cliente.telefono ?? 'sin teléfono'}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={alCerrar}>
          <X aria-hidden="true" />
          Cerrar
        </Button>
      </header>

      <div className="flex flex-col gap-(--espacio-1)">
        <p className="text-sm text-texto-sutil">Debe</p>
        <Dinero centavos={saldoDe(cliente)} tamano="lg" className="text-3xl font-bold" />
        <p className="text-sm text-texto-sutil">
          más viejo {cliente.dias_mas_viejo ?? 0} días · {hace(cliente.ultimo_abono_dias)}
        </p>
        <LimiteDeLaFicha cliente={cliente} />
      </div>

      {/* «Paga los viernes» es el dato que hace útil el módulo. */}
      {cliente.nota === null ? null : (
        <p className="rounded-md bg-fondo-sutil px-(--espacio-3) py-(--espacio-2) text-sm">
          <span className="font-medium">Nota:</span> {cliente.nota}
        </p>
      )}

      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="fiado-monto">Cuánto abona</Label>
        <CampoDeDinero
          id="fiado-monto"
          placeholder="0.00"
          centavos={monto}
          alCambiar={alCambiarMonto}
        />
      </div>

      <div role="group" aria-label="Cómo abona" className="grid grid-cols-3 gap-(--espacio-2)">
        {METODOS_DE_ABONO.map((opcion) => (
          <Button
            key={opcion.clave}
            type="button"
            size="sm"
            variant={metodo === opcion.clave ? 'default' : 'outline'}
            aria-pressed={metodo === opcion.clave}
            onClick={() => {
              alCambiarMetodo(opcion.clave);
            }}
          >
            {opcion.etiqueta}
          </Button>
        ))}
      </div>

      {porConfirmar === null ? null : (
        <Aviso tono="info" titulo="La transferencia queda por confirmar.">
          <span>
            <Dinero centavos={porConfirmar} tamano="sm" /> baja del saldo cuando se vea en el banco.
            Hasta entonces, la deuda sigue como estaba.
          </span>
        </Aviso>
      )}

      {/* Encima del botón, donde están los ojos, y lo primero que dice después
          de qué pasó es que ningún saldo se movió. La caja cerrada es un muro, no
          un fallo: lleva el camino para abrirla. */}
      {error === null ? null : error.tipo === 'caja-cerrada' ? (
        <Aviso
          tono="atencion"
          titulo="La caja está cerrada."
          accion={
            <Button asChild size="sm" variant="outline">
              <a href="/abarrotes/caja">Abrir caja</a>
            </Button>
          }
        >
          Un abono sin movimiento de caja no saldría en el corte. Ningún saldo cambió.
        </Aviso>
      ) : (
        <Aviso tono="peligro" titulo={error.mensaje}>
          Ningún saldo cambió.
        </Aviso>
      )}

      <Button type="button" size="lg" className="w-full" disabled={enviando} onClick={alAbonar}>
        <HandCoins aria-hidden="true" />
        {enviando ? 'Registrando…' : 'Registrar abono'}
      </Button>
      <p className="text-xs text-texto-sutil">
        {metodo === 'efectivo'
          ? 'Al saldo más viejo primero. Entra al cajón y al corte del día.'
          : metodo === 'tarjeta'
            ? 'Al saldo más viejo primero. Va al banco: el cajón no se mueve, y el corte lo cuenta por su método.'
            : 'Queda por confirmar: el saldo baja cuando alguien vea el depósito en el banco.'}
      </p>
    </Superficie>
  );
}

export function Fiado({ filasIniciales, onAbonoRegistrado }: FiadoProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeCartera[] | null>(filasIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a intentar» lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [soloPorCobrar, setSoloPorCobrar] = useState(false);
  const [elegido, setElegido] = useState<string | null>(null);
  /** La fila que lleva el nombre de viaje mientras se convierte en ficha, o vuelve. */
  const [viajando, setViajando] = useState<string | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [metodoDeAbono, setMetodoDeAbono] = useState<MetodoDeAbono>('efectivo');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<FalloDeAbono | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<number | null>(null);
  /** Adonde vuelve el foco cuando el vacío que lo tenía desaparece. */
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    consultarPuente<FilaDeCartera>('CarteraFiado', {
      limite: LIMITE_DE_LECTURA,
      signal: control.signal,
    })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        if (sigueMontada())
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer.');
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  const columnas = useMemo(() => columnasDeCartera(voc.titulo('cliente')), [voc]);

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
      .sort((a, b) => (b.dias_mas_viejo ?? 0) - (a.dias_mas_viejo ?? 0) || saldoDe(b) - saldoDe(a));
  }, [filas, busqueda, soloPorCobrar]);

  const ficha = (filas ?? []).find((f) => f.cliente_id === elegido) ?? null;

  function reintentar(): void {
    setFalloDeCarga(null);
    setFilas(null);
    setIntento((previo) => previo + 1);
  }

  /**
   * La fila se convierte en la ficha. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma la FICHA, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrirFicha(id: string): void {
    if (id === elegido) {
      setMonto(null);
      setError(null);
      return;
    }
    flushSync(() => {
      setViajando(id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        setElegido(id);
        setMonto(null);
        // Otro cliente, otro abono: el método vuelve al de casi siempre.
        setMetodoDeAbono('efectivo');
        setError(null);
        setPorConfirmar(null);
      });
    });
  }

  /** El camino de vuelta: la ficha se recoge en su fila. */
  function cerrarFicha(): void {
    const id = elegido;
    if (id === null) return;
    void conTransicion(() => {
      flushSync(() => {
        setElegido(null);
        setViajando(id);
      });
    }).finally(() => {
      setViajando(null);
    });
  }

  function verTodaLaCartera(): void {
    // El botón vive en el vacío que esto desmonta: sin llevar el foco a otro lado,
    // cae en `<body>` y quien usa teclado vuelve a empezar desde arriba.
    buscador.current?.focus();
    setBusqueda('');
    setSoloPorCobrar(false);
  }

  async function abonar(cliente: FilaDeCartera): Promise<void> {
    const centavos = monto ?? 0;
    if (centavos <= 0) {
      setError({ tipo: 'fallo', mensaje: 'Escribe cuánto abona antes de registrarlo.' });
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
        metodo: metodoDeAbono,
      };
      const abono = await invocarComando<AbonoRegistrado>('/api/fiado/abono', entrada);
      setMonto(null);
      if (abono.pendienteDeConfirmar) {
        // No baja nada todavía: pintarlo bajado sería decirle al cliente que ya pagó.
        setPorConfirmar(centavos);
        return;
      }
      setPorConfirmar(null);
      // El saldo que contestó el servidor, en la unidad del puente que `saldoDe` espera.
      const despues = Number(abono.saldoDespuesCentavos);
      const baja = (f: FilaDeCartera): FilaDeCartera =>
        f.cliente_id === cliente.cliente_id
          ? { ...f, saldo_centavos: valorDelPuente('CarteraFiado', 'saldo_centavos', despues) }
          : f;
      setFilas((previas) => (previas ?? []).map(baja));
      onAbonoRegistrado?.(cliente.cliente_id, centavos);
    } catch (fallo) {
      setError(falloDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  const encabezado = <h1 className="text-2xl font-bold">Fiado</h1>;
  const lienzo = 'flex flex-col gap-(--espacio-3) p-(--espacio-3) lg:p-(--espacio-4)';

  if (falloDeCarga !== null) {
    // No leyó nada: no hay dato de hace un minuto que enseñar en su lugar.
    return (
      <div className={lienzo}>
        {encabezado}
        <ErrorDePantalla
          titulo="No se pudo leer la cartera de fiado"
          queHacer="Sin la cartera no se sabe quién debe ni cuánto. Revisa la conexión y vuelve a intentarlo: ningún saldo cambió."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentar}>
              Volver a intentar
            </Button>
          }
        />
      </div>
    );
  }

  if (filas === null) {
    // Esqueletos con la forma de los dos números, del buscador y de la lista,
    // no una rueda: así nada salta de sitio cuando llegan los datos.
    return (
      <div className={lienzo}>
        {encabezado}
        <div className="grid gap-(--espacio-2) sm:grid-cols-2">
          <Esqueleto className="h-28 w-full rounded-lg" />
          <Esqueleto className="h-28 w-full rounded-lg" />
        </div>
        <Esqueleto className="h-(--altura-control) w-full max-w-sm" />
        <EsqueletoDeLista filas={8} />
      </div>
    );
  }

  if (filas.length === 0) {
    // El vacío ENSEÑA el flujo: dice con qué tecla nace un fiado.
    return (
      <div className={lienzo}>
        {encabezado}
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
    <div className={lienzo}>
      {encabezado}

      <ResumenDeCartera filas={filas} voc={voc} />

      <div className="flex flex-wrap items-center gap-(--espacio-2)">
        <div className="relative max-w-sm min-w-40 flex-1">
          <Label htmlFor="fiado-buscar" className="sr-only">
            Buscar {voc.singular('cliente')} por nombre o teléfono
          </Label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            ref={buscador}
            id="fiado-buscar"
            type="search"
            value={busqueda}
            placeholder="Buscar por nombre o teléfono"
            className="pl-(--espacio-8)"
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
          />
        </div>
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

      <div className="flex flex-col gap-(--espacio-3) lg:flex-row lg:items-start">
        {/* Con la hoja abierta en el teléfono, el último cliente todavía tiene que
            poder subir por encima de ella. */}
        <div className={`min-w-0 flex-1 ${ficha === null ? '' : 'pb-[70dvh] lg:pb-0'}`}>
          <TablaAdaptable
            etiqueta="Cartera de fiado"
            principal="cliente"
            desde="md"
            columnas={columnas}
            filas={visibles}
            claveDe={(f) => f.cliente_id}
            {...(elegido === null ? {} : { activa: elegido })}
            alActivar={abrirFicha}
            viajeDeFila={(f) => (f.cliente_id === viajando ? VIAJE.fila(f.cliente_id) : undefined)}
            vacio={
              <Vacio
                titulo="Nadie cae en ese filtro."
                explicacion="Buena señal, si era «a quién hablarle»."
                accion={
                  <Button type="button" variant="outline" onClick={verTodaLaCartera}>
                    Ver toda la cartera
                  </Button>
                }
                className="py-(--espacio-6)"
              />
            }
          />
        </div>

        {ficha === null ? null : (
          <Ficha
            key={ficha.cliente_id}
            cliente={ficha}
            porConfirmar={porConfirmar}
            monto={monto}
            metodo={metodoDeAbono}
            alCambiarMetodo={setMetodoDeAbono}
            enviando={enviando}
            error={error}
            alCambiarMonto={setMonto}
            alAbonar={() => {
              void abonar(ficha);
            }}
            alCerrar={cerrarFicha}
          />
        )}
      </div>
    </div>
  );
}
