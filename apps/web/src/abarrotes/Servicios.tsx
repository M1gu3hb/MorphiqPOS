'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
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
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  Vacio,
} from '@morphiqpos/ui/sistema';
import { Check, ReceiptText, Smartphone, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · servicios
 *
 * Recargas y pago de servicios (F-255). 15 a 60 veces al día, siempre el
 * cajero, casi siempre con alguien enfrente que trae un recibo en la mano.
 *
 * ── Por qué está FUERA de la venta ───────────────────────────────────────
 * Porque un ticket de tiendita nunca mezcla un refresco con el recibo de la
 * luz: son dos documentos y dos naturalezas. Los $1,240 del recibo entran al
 * cajón y NO son venta; lo único que el negocio gana son $8. Mezclarlos infla
 * las ventas del día con dinero ajeno y convierte el margen del mes en una
 * mentira. Por eso aquí no hay productos, ni carrito, ni total de venta.
 *
 * ── Por qué las seis operaciones son teselas ─────────────────────────────
 * Es lo primero que se ve (`04-INTERFAZ` §PANTALLA 3): tres operadores y tres
 * servicios, grandes, que se tocan. Cada tesela dice además lo que decide el
 * toque —el saldo que queda con ese operador, la comisión de ese servicio—
 * para que el cajero no tenga que ir a buscarlo a otra parte de la pantalla.
 *
 * ── Por qué la comisión se ve ANTES de cobrar ────────────────────────────
 * Es lo único que convierte un trámite en un negocio a los ojos del tendero.
 * Un sistema que no le enseña cuánto ganó por hacerlo no le está enseñando
 * que valga la pena hacerlo. Va en cada carril, junto al botón, y no en un
 * reporte de fin de mes que nadie abre.
 *
 * ── Por qué el saldo vive pegado abajo ───────────────────────────────────
 * Quedarse sin saldo a las ocho de la noche es perder todas las recargas de
 * la noche. La barra es pegajosa para que el aviso de «bajo» no dependa de
 * que alguien se acuerde de mirar.
 *
 * ── Por qué en teléfono hay una lista y una sola operación ───────────────
 * Quien abre esto desde el teléfono es el dueño, y no viene a operar: viene a
 * ver cuánto lleva de comisión. Por eso la barra de abajo es lo que siempre
 * se ve —y ahí la comisión del día va primero—, y los dos carriles se reducen
 * a la operación que él elija.
 *
 * ── Lo que quedó FUERA, dicho y no escondido ─────────────────────────────
 * 1. Las comisiones son las de referencia del documento (6 % en recarga,
 *    $3 a $22 por servicio). Las reales las fija el agregador —TAECEL,
 *    Yastás, PagoTodo…—, que es una decisión COMERCIAL todavía abierta
 *    (`05-DATOS-Y-BACKEND §8.1`). Cuando haya contrato, estas constantes
 *    salen de `saldos_comisionista` y la pantalla no cambia.
 * 2. El depósito de saldo y la reversa de una operación fallida son otras
 *    dos escrituras (`comision.depositar_saldo`) y viven en su pantalla; aquí
 *    sólo se enlaza a ellas.
 * 3. El recorte de «hoy» lo hace el puente por sesión de caja: el navegador
 *    no filtra por fecha, porque su reloj no es el del servidor.
 */

/** Los tres operadores que cubren casi toda la recarga del país. */
const RECARGAS = ['Telcel', 'Movistar', 'AT&T'] as const;

/** Los tres servicios de mostrador, con su comisión fija de referencia. */
const SERVICIOS = [
  { nombre: 'CFE', comisionCentavos: 800 },
  { nombre: 'Telmex', comisionCentavos: 1000 },
  { nombre: 'Sky', comisionCentavos: 1200 },
] as const;

/** Los que no caben en la botonera y salen por el desplegable. */
const OTROS_SERVICIOS = ['Izzi', 'Totalplay', 'Gas natural', 'Agua', 'Mercado Libre'] as const;

const COMISION_OTRO_CENTAVOS = 800;
const PORCENTAJE_RECARGA = 6;
/** Los montos de un toque, en centavos: la recarga también es dinero. */
const MONTOS_CENTAVOS = [2000, 3000, 5000, 10000, 20000] as const;
/** La recarga con la que el vacío enseña cuánto se gana. */
const RECARGA_DE_EJEMPLO_CENTAVOS = 5000;
const MINIMO_ALERTA_CENTAVOS = 30000;
const DIGITOS_TELEFONO = 10;
const DIGITOS_REFERENCIA = 6;

/** Los códigos que aquí cambian lo que el cajero tiene que hacer a continuación. */
const MENSAJES: Readonly<Record<string, string>> = {
  ENTRADA_INVALIDA:
    'Revisa el número y el importe: alguno no tiene la forma que el proveedor pide.',
  NO_AUTENTICADO: 'Tu sesión se cerró. Vuelve a entrar para cobrar.',
  SIN_PERMISO: 'Tu usuario no puede cobrar servicios. Pídeselo al encargado.',
  PAQUETE_NO_INCLUYE: 'Tu paquete no incluye recargas ni pago de servicios.',
  IDEMPOTENCIA_CONFLICTO: 'Ya hay un cobro con esa misma referencia. Búscalo antes de repetirlo.',
  COMANDO_EN_CURSO: 'Esa operación ya se está enviando. Espera a que termine.',
  CONFLICTO_ESTADO: 'No hay caja abierta, o la operación ya se cerró.',
  REGLA_DE_NEGOCIO: 'El proveedor rechazó la operación. No se cobró nada.',
};

/**
 * A QUIÉN se le vende por cuenta ajena. El nombre vive aquí, no en el saldo.
 *
 * Las tres entidades —`Comisionista`, `SaldoComisionista` y `OperacionComision`—
 * son las tablas que la migración 095 dejó escritas y que **nadie consumía**: ni
 * un comando, ni una pantalla, ni el mapa de tipos de Kysely. Por eso esta
 * pantalla tenía `Promise.resolve([])` donde va su consulta.
 */
export interface Comisionista {
  readonly id: string;
  readonly nombre: string;
  /** `prepago` es saldo comprado por adelantado; `pospago`, dinero que se debe. */
  readonly modelo: string | null;
}

/**
 * LAS FILAS DE `SaldoComisionista` Y `OperacionComision`, COMO LAS SIRVE EL PUENTE.
 *
 * `saldo_centavos`, `comision_acumulada_centavos`, `comision_centavos` y
 * `monto_ajeno_centavos` son `conversion: 'dinero'` en `puente/mapa.ts`: llegan en PESOS
 * aunque se llamen `…_centavos`. Leídos tal cual, el saldo salía cien veces más chico
 * —«Saldo bajo» siempre, y «sin saldo» con saldo de sobra—. Por eso se leen sus gemelos
 * honestos, `…_pesos` (la misma columna), y sólo al llegar: `centavosDe` los pasa a
 * centavos y la pantalla trabaja con `SaldoDeComisionista` y `OperacionDeComision`.
 */
interface FilaDeSaldo {
  readonly id: string;
  readonly saldo_pesos: number | null;
  readonly comision_acumulada_pesos: number | null;
}

interface FilaDeOperacion {
  readonly id: string;
  readonly comisionista_id: string;
  readonly tipo: string;
  readonly comision_pesos: number | null;
  readonly monto_ajeno_pesos: number | null;
  readonly created_date: string | null;
}

/**
 * El saldo como lo usa la pantalla: EN CENTAVOS, ya convertido. Lo que devuelven los
 * COMANDOS ya viene en centavos y se escribe aquí tal cual.
 */
export interface SaldoDeComisionista {
  /** ES el comisionista: la tabla tiene una fila por organización y comisionista. */
  readonly id: string;
  readonly saldo_centavos: number | null;
  readonly comision_acumulada_centavos: number | null;
}

/** Una operación como la usa la pantalla: sus importes EN CENTAVOS, ya convertidos. */
export interface OperacionDeComision {
  readonly id: string;
  readonly comisionista_id: string;
  readonly tipo: string;
  /** Lo que el negocio GANÓ. Los otros importes son de la tercera. */
  readonly comision_centavos: number | null;
  readonly monto_ajeno_centavos: number | null;
  readonly created_date: string | null;
}

export interface ServiciosProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly saldosIniciales?: readonly SaldoDeComisionista[];
  readonly operacionesIniciales?: readonly OperacionDeComision[];
  readonly onCobrada?: (proveedor: string, comisionCentavos: number) => void;
}

/** Qué escritura está en camino: el botón que la mandó es el que lo dice. */
type EnCurso = 'recarga' | 'pago_servicio' | 'saldo';

/**
 * Lo que acaba de salir bien. Se guardan los CENTAVOS y no la frase: la frase se
 * pinta con `<Dinero>`, y un importe hecho texto en el estado ya no se alinea.
 */
type Hecho =
  | {
      readonly tipo: 'cobro';
      readonly operacion: string;
      readonly recibidoCentavos: number;
      readonly comisionCentavos: number;
    }
  | { readonly tipo: 'saldo'; readonly proveedor: string; readonly saldoCentavos: number };

/** Lo que falló, y lo que por eso NO pasó: las dos mitades del aviso. */
interface FalloDeOperacion {
  readonly mensaje: string;
  readonly queNoPaso: string;
}

export function comisionDeRecarga(centavos: number): number {
  return Math.round((centavos * PORCENTAJE_RECARGA) / 100);
}

export function comisionDeServicio(nombre: string): number {
  return SERVICIOS.find((s) => s.nombre === nombre)?.comisionCentavos ?? COMISION_OTRO_CENTAVOS;
}

function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    // El límite de intentos no es un código del contrato: es el 429.
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    return MENSAJES[fallo.error.codigo] ?? fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';
}

/**
 * LOS PESOS DEL PUENTE, A CENTAVOS, una sola vez y al llegar. La unidad la decide
 * `centavosDe` por la conversión de cada campo; `null` —no vino— se queda `null`.
 */
function saldoDelPuente(fila: FilaDeSaldo): SaldoDeComisionista {
  return {
    id: fila.id,
    saldo_centavos: centavosDe('SaldoComisionista', 'saldo_pesos', fila.saldo_pesos),
    comision_acumulada_centavos: centavosDe(
      'SaldoComisionista',
      'comision_acumulada_pesos',
      fila.comision_acumulada_pesos,
    ),
  };
}

function operacionDelPuente(fila: FilaDeOperacion): OperacionDeComision {
  return {
    id: fila.id,
    comisionista_id: fila.comisionista_id,
    tipo: fila.tipo,
    comision_centavos: centavosDe('OperacionComision', 'comision_pesos', fila.comision_pesos),
    monto_ajeno_centavos: centavosDe(
      'OperacionComision',
      'monto_ajeno_pesos',
      fila.monto_ajeno_pesos,
    ),
    created_date: fila.created_date,
  };
}

/** La medianoche de HOY, en ISO: el rango con el que se piden las operaciones del día. */
function comienzoDelDia(): string {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
}

/**
 * Un carril mientras se lee: su marco, sus tres teselas, sus campos y el botón de
 * cobrar EN SU SITIO. Cuando llegan los datos nada salta, y el ojo ya sabe dónde
 * va a estar el botón.
 */
function EsqueletoDeCarril({ className = '' }: { readonly className?: string }) {
  return (
    <Superficie
      relleno={3}
      className={`flex flex-col gap-(--espacio-3) xl:p-(--espacio-4) ${className}`}
    >
      <Esqueleto className="h-4 w-28" />
      <div className="hidden grid-cols-3 gap-(--espacio-2) md:grid">
        {Array.from({ length: 3 }, (_, indice) => (
          <Esqueleto key={indice} className="min-h-20" />
        ))}
      </div>
      <Esqueleto className="h-(--altura-control) w-full" />
      <Esqueleto className="h-(--altura-control) w-full" />
      <Esqueleto className="h-20 w-full" />
    </Superficie>
  );
}

export function Servicios({ saldosIniciales, operacionesIniciales, onCobrada }: ServiciosProps) {
  const voc = useVocabulario();
  const [comisionistas, setComisionistas] = useState<readonly Comisionista[]>([]);
  const [saldos, setSaldos] = useState<readonly SaldoDeComisionista[] | null>(
    saldosIniciales ?? null,
  );
  const [operaciones, setOperaciones] = useState<readonly OperacionDeComision[] | null>(
    operacionesIniciales ?? null,
  );
  /** La LECTURA que no llegó. No es la de un cobro: ésa es `fallo`. */
  const [falloDeLectura, setFalloDeLectura] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  // El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  // Telcel llega elegido porque es siete de cada diez recargas: no es una
  // suposición cómoda, es un toque menos en la operación más repetida del día.
  const [proveedorRecarga, setProveedorRecarga] = useState('Telcel');
  // El servicio NO se presupone: pagar el recibo del proveedor equivocado es
  // el error caro de esta pantalla, y aquí sí conviene obligar a elegir.
  const [proveedorServicio, setProveedorServicio] = useState<string | null>(null);
  const [eleccionMovil, setEleccionMovil] = useState('recarga:Telcel');
  const [telefono, setTelefono] = useState('');
  /** El monto de la recarga, en centavos. Los botones y el campo «otro» son este mismo estado. */
  const [monto, setMonto] = useState<number | null>(null);
  const [referencia, setReferencia] = useState('');
  const [importe, setImporte] = useState<number | null>(null);
  /** Lo que se va a cargar de saldo, en centavos. */
  const [carga, setCarga] = useState<number | null>(null);
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null);
  const [fallo, setFallo] = useState<FalloDeOperacion | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);

  useEffect(() => {
    if (saldosIniciales !== undefined && operacionesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    Promise.all([
      // LOS TRES, del puente. Aquí había dos `Promise.resolve([])` con un comentario
      // largo explicando que el saldo «no se sirve»: era verdad y era el defecto.
      // Las tablas existían desde la 095; lo que faltaba era que alguien las
      // conectara.
      consultarPuente<Comisionista>('Comisionista', { limite: 50, signal: control.signal }),
      consultarPuente<FilaDeSaldo>('SaldoComisionista', {
        limite: 50,
        signal: control.signal,
      }),
      // Las del DÍA: la barra de abajo dice «Hoy: N operaciones», y traer el
      // histórico entero para contar las de hoy es lo que hace lenta una pantalla
      // de mostrador.
      consultarPuente<FilaDeOperacion>('OperacionComision', {
        limite: 200,
        rango: { campo: 'created_date', desde: comienzoDelDia() },
        signal: control.signal,
      }),
    ])
      .then(([filasComisionistas, filasSaldo, filasOperaciones]) => {
        if (!sigueMontada()) return;
        setComisionistas(filasComisionistas);
        setSaldos(saldosIniciales ?? filasSaldo.map(saldoDelPuente));
        setOperaciones(operacionesIniciales ?? filasOperaciones.map(operacionDelPuente));
      })
      .catch((causa: unknown) => {
        if (!sigueMontada()) return;
        // Una lectura caída NO puede impedir un cobro: el agregador vive en
        // otro sitio. La pantalla se abre igual, con el error encima.
        setSaldos((previo) => previo ?? []);
        setOperaciones((previo) => previo ?? []);
        setFalloDeLectura(mensajeDeFallo(causa));
      });
    return () => {
      control.abort();
    };
  }, [saldosIniciales, operacionesIniciales, intento]);

  function releer(): void {
    setFalloDeLectura(null);
    setSaldos(saldosIniciales ?? null);
    setOperaciones(operacionesIniciales ?? null);
    setIntento((previo) => previo + 1);
  }

  const enviando = enCurso !== null;
  /**
   * EL SALDO NO SE LEYÓ: la lectura cayó y las listas quedaron vacías. De una lista
   * vacía sale cero para todos, y cero no es «sin saldo», es «no se sabe». Mientras
   * tanto nada se afirma —ni «sin saldo», ni «Saldo bajo»— y la recarga no se
   * bloquea: la pantalla ya dice «Puedes seguir cobrando», y eso tiene que ser verdad.
   */
  const saldoSinLeer = falloDeLectura !== null;
  const listaSaldos = saldos ?? [];
  const listaOperaciones = operaciones ?? [];
  /** El nombre por su id: el saldo y la operación traen la llave, no el nombre. */
  const nombreDelComisionista = new Map(comisionistas.map((c) => [c.id, c.nombre]));
  /**
   * SÓLO EL PREPAGO suma al panel «Saldo de recargas».
   *
   * El saldo está firmado y su significado depende del modelo: en `prepago` es lo
   * que queda por vender; en `pospago` es lo que se DEBE entregar. Sumarlos daría
   * un número que no es ninguna de las dos cosas.
   */
  const deRecargas = listaSaldos.filter(
    (fila) => comisionistas.find((c) => c.id === fila.id)?.modelo !== 'pospago',
  );
  const saldoTotal = deRecargas.reduce((suma, fila) => suma + (fila.saldo_centavos ?? 0), 0);
  const saldoBajo = !saldoSinLeer && saldoTotal < MINIMO_ALERTA_CENTAVOS;
  const comisionDeHoy = listaOperaciones.reduce(
    (suma, fila) => suma + (fila.comision_centavos ?? 0),
    0,
  );
  const bajos = deRecargas
    .filter((fila) => (fila.saldo_centavos ?? 0) < MINIMO_ALERTA_CENTAVOS)
    .map((fila) => nombreDelComisionista.get(fila.id) ?? 'sin nombre');

  /** El saldo que queda con un operador: es lo que dice su tesela. */
  function saldoDe(nombre: string): number {
    const id = comisionistas.find((c) => c.nombre === nombre)?.id;
    return id === undefined ? 0 : (listaSaldos.find((fila) => fila.id === id)?.saldo_centavos ?? 0);
  }

  const digitos = telefono.replace(/\D/g, '');
  const montoCentavos = monto ?? 0;
  const importeCentavos = importe ?? 0;
  const comisionRecarga = comisionDeRecarga(montoCentavos);
  const comisionServicio = proveedorServicio === null ? 0 : comisionDeServicio(proveedorServicio);
  const idDelOperador = comisionistas.find((c) => c.nombre === proveedorRecarga)?.id ?? null;
  const saldoDelOperador = saldoDe(proveedorRecarga);
  const sinSaldo = !saldoSinLeer && (saldoDelOperador === 0 || saldoDelOperador < montoCentavos);
  const listoRecarga = digitos.length === DIGITOS_TELEFONO && montoCentavos > 0 && !sinSaldo;
  const listoServicio =
    proveedorServicio !== null &&
    referencia.trim().length >= DIGITOS_REFERENCIA &&
    importeCentavos > 0;
  const carrilMovil = eleccionMovil.startsWith('recarga') ? 'recarga' : 'servicio';

  function elegirEnMovil(valor: string): void {
    setEleccionMovil(valor);
    const [tipo = 'recarga', nombre = ''] = valor.split(':');
    if (tipo === 'recarga') setProveedorRecarga(nombre);
    else setProveedorServicio(nombre);
  }

  /**
   * CARGAR SALDO · «deposité $1,000 y me dieron saldo para vender».
   *
   * Lo depositado y lo recibido pueden no ser lo mismo —la bonificación del
   * comisionista—, pero desde el mostrador se teclea UNO: lo que se depositó. La
   * diferencia, cuando la hay, se corrige desde la ficha del comisionista, que es
   * donde vive ese dato.
   */
  async function cargarSaldoDeRecargas(): Promise<void> {
    const centavos = carga ?? 0;
    if (centavos <= 0) return;
    setEnCurso('saldo');
    setFallo(null);
    setHecho(null);
    try {
      const respuesta = await invocarComando<{ readonly saldoCentavos: string }>(
        '/api/comision/cargar-saldo',
        { proveedorServicio: proveedorRecarga, depositadoCentavos: centavos },
      );
      const despues = Number(respuesta.saldoCentavos);
      setSaldos(
        idDelOperador === null
          ? listaSaldos
          : listaSaldos.map((fila) =>
              fila.id === idDelOperador ? { ...fila, saldo_centavos: despues } : fila,
            ),
      );
      setCarga(null);
      setHecho({ tipo: 'saldo', proveedor: proveedorRecarga, saldoCentavos: despues });
    } catch (causa) {
      setFallo({ mensaje: mensajeDeFallo(causa), queNoPaso: 'El saldo no se cargó.' });
    } finally {
      setEnCurso(null);
    }
  }

  async function cobrar(tipo: 'recarga' | 'pago_servicio'): Promise<void> {
    const esRecarga = tipo === 'recarga';
    const proveedor = esRecarga ? proveedorRecarga : proveedorServicio;
    if (proveedor === null) return;
    const recibido = esRecarga ? montoCentavos : importeCentavos;
    const comision = esRecarga ? comisionRecarga : comisionServicio;
    setEnCurso(tipo);
    setFallo(null);
    setHecho(null);
    try {
      /**
       * EL CAMPO SE LLAMA `proveedorServicio`, y aquí decía `proveedor`.
       *
       * `entradaRegistrarComision` es un `z.object` con `proveedorServicio`, así
       * que zod rechazaba CADA cobro con `ENTRADA_INVALIDA` y la pantalla enseñaba
       * el mensaje del servidor. Es la otra mitad del defecto de esta pantalla: no
       * sólo no se leía el saldo —tampoco se podía cobrar una recarga—.
       *
       * La clave de idempotencia la pone `invocarComando`: sin ella, un doble clic
       * con mala red cobra dos veces el mismo recibo.
       */
      const respuesta = await invocarComando<{
        readonly saldoDelComisionistaCentavos: string;
      }>('/api/comision/registrar', {
        tipo,
        proveedorServicio: proveedor,
        referencia: esRecarga ? digitos : referencia.trim(),
        montoRecibidoCentavos: recibido,
        comisionNegocioCentavos: comision,
      });
      setOperaciones([
        ...listaOperaciones,
        {
          id: `${proveedor}-${String(listaOperaciones.length)}`,
          comisionista_id: idDelOperador ?? proveedor,
          tipo,
          comision_centavos: comision,
          monto_ajeno_centavos: recibido - comision,
          created_date: new Date().toISOString(),
        },
      ]);
      if (esRecarga) {
        // El saldo que devuelve el SERVIDOR, no una resta local: es el número con
        // el que se arquea a las nueve, y restarlo aquí lo haría depender de que
        // la pantalla supiera el saldo de partida.
        const despues = Number(respuesta.saldoDelComisionistaCentavos);
        setSaldos(
          listaSaldos.map((fila) =>
            fila.id === idDelOperador ? { ...fila, saldo_centavos: despues } : fila,
          ),
        );
        setTelefono('');
        setMonto(null);
      } else {
        setReferencia('');
        setImporte(null);
      }
      setHecho({
        tipo: 'cobro',
        operacion: esRecarga ? `Recarga ${proveedor}` : `Pago de ${proveedor}`,
        recibidoCentavos: recibido,
        comisionCentavos: comision,
      });
      onCobrada?.(proveedor, comision);
    } catch (causa) {
      // Las dos cosas o ninguna: si falló, ni se cobró ni se movió la caja.
      setFallo({
        mensaje: mensajeDeFallo(causa),
        queNoPaso: 'No se cobró nada y la caja no se movió.',
      });
    } finally {
      setEnCurso(null);
    }
  }

  if (saldos === null || operaciones === null) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Cargando el saldo y las operaciones de hoy"
        className="flex min-h-dvh flex-col gap-(--espacio-3) p-(--espacio-3) xl:p-(--espacio-4)"
      >
        <Esqueleto className="h-5 w-40" />
        {/* La forma de los dos carriles: el botón de cobrar no salta de sitio
            cuando llegan los datos. En teléfono, uno solo, como después. */}
        <div className="grid gap-(--espacio-3) xl:grid-cols-2 xl:gap-(--espacio-4)">
          <EsqueletoDeCarril />
          <EsqueletoDeCarril className="hidden md:flex" />
        </div>
        <Esqueleto className="mt-auto h-(--altura-control) w-full" />
      </div>
    );
  }

  if (falloDeLectura === null && listaSaldos.length === 0 && listaOperaciones.length === 0) {
    // El vacío ENSEÑA el negocio que falta; no se disculpa por no tener datos.
    return (
      <div className="mx-auto max-w-xl p-(--espacio-8)">
        <Vacio
          icono={<Smartphone />}
          titulo="Aquí se cobra dinero ajeno y se gana comisión."
          accion={
            <Button asChild>
              <a href="/configuracion">Dar de alta mi cuenta de comisionista</a>
            </Button>
          }
        >
          <p className="max-w-prose text-sm text-texto-sutil">
            Una recarga de <Dinero centavos={RECARGA_DE_EJEMPLO_CENTAVOS} tamano="sm" /> te deja{' '}
            <Dinero centavos={comisionDeRecarga(RECARGA_DE_EJEMPLO_CENTAVOS)} tamano="sm" /> y un
            recibo de luz <Dinero centavos={comisionDeServicio('CFE')} tamano="sm" />. Treinta
            operaciones al día son cerca de $200 diarios que hoy no estás cobrando, y además traen
            gente a la tienda.
          </p>
        </Vacio>
      </div>
    );
  }

  const avisoDelHecho = (() => {
    if (hecho === null) return null;
    if (hecho.tipo === 'saldo') {
      return (
        <Aviso tono="exito" titulo={`Saldo de ${hecho.proveedor} cargado`}>
          Quedan <Dinero centavos={hecho.saldoCentavos} tamano="sm" /> por vender.
        </Aviso>
      );
    }
    // Con estas palabras, porque es la confusión número uno del giro.
    // «venta» es la palabra del GIRO —en una ferretería es una nota— y es justo la
    // frase donde importa: lo que se está explicando es qué NO es esto.
    return (
      <Aviso tono="exito" titulo={`Cobrado · ${hecho.operacion}`}>
        Los <Dinero centavos={hecho.recibidoCentavos} tamano="sm" /> entran a la caja pero no
        cuentan como {voc.singular('orden')}. Tu ganancia son{' '}
        <Dinero centavos={hecho.comisionCentavos} tamano="sm" conSigno />.
      </Aviso>
    );
  })();

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-(--espacio-3) p-(--espacio-3) xl:p-(--espacio-4)">
        <header className="flex flex-wrap items-end justify-between gap-(--espacio-2)">
          <h1 className="text-xl font-bold">Servicios</h1>
          {/* TELÉFONO · una operación a la vez, elegida de una lista. */}
          <div className="flex w-full flex-col gap-(--espacio-1) md:hidden">
            <Label htmlFor="operacion-movil">Operación</Label>
            <Select value={eleccionMovil} onValueChange={elegirEnMovil}>
              <SelectTrigger id="operacion-movil" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECARGAS.map((nombre) => (
                  <SelectItem key={nombre} value={`recarga:${nombre}`}>
                    Recarga {nombre}
                  </SelectItem>
                ))}
                {[...SERVICIOS.map((s) => s.nombre), ...OTROS_SERVICIOS].map((nombre) => (
                  <SelectItem key={nombre} value={`servicio:${nombre}`}>
                    Pago de {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* La LECTURA no llegó, pero la pantalla se abre igual: el agregador vive
            en otro sitio y un saldo sin leer no es razón para no cobrar. */}
        {falloDeLectura === null ? null : (
          <ErrorDePantalla
            titulo="No se leyeron el saldo ni las operaciones de hoy"
            queHacer="Puedes seguir cobrando. El saldo y la comisión de abajo no están al día hasta que se vuelvan a leer."
            detalle={falloDeLectura}
            reintentar={
              <Button type="button" variant="outline" size="sm" onClick={releer}>
                Volver a leer
              </Button>
            }
          />
        )}
        {fallo === null ? null : (
          <Aviso tono="peligro" titulo={fallo.mensaje}>
            {fallo.queNoPaso}
          </Aviso>
        )}
        {avisoDelHecho}

        {/* PC dos columnas · TABLET dos filas apiladas · TELÉFONO sólo la elegida. */}
        <div className="grid gap-(--espacio-3) xl:grid-cols-2 xl:gap-(--espacio-4)">
          <Superficie
            como="section"
            relleno={3}
            aria-labelledby="titulo-recarga"
            className={`${carrilMovil === 'recarga' ? 'flex' : 'hidden'} flex-col gap-(--espacio-3) md:flex xl:p-(--espacio-4)`}
          >
            <h2
              id="titulo-recarga"
              className="flex items-center gap-(--espacio-2) text-sm font-bold tracking-wide uppercase"
            >
              <Smartphone aria-hidden="true" className="size-4 text-texto-sutil" />
              Recarga
            </h2>
            <ul aria-label="Operador" className="hidden grid-cols-3 gap-(--espacio-2) md:grid">
              {RECARGAS.map((nombre) => {
                const elegido = proveedorRecarga === nombre;
                const saldo = saldoDe(nombre);
                return (
                  <li key={nombre}>
                    <Superficie
                      como="button"
                      type="button"
                      interactiva
                      activa={elegido}
                      aria-pressed={elegido}
                      relleno={3}
                      radio="md"
                      className="flex min-h-20 w-full flex-col justify-between gap-(--espacio-1)"
                      onClick={() => {
                        setProveedorRecarga(nombre);
                      }}
                    >
                      <span className="flex items-center justify-between gap-(--espacio-1) text-base font-semibold">
                        {nombre}
                        {/* El anillo no es lo único que dice cuál está elegido. */}
                        {elegido ? (
                          <Check aria-hidden="true" className="size-4 text-primario" />
                        ) : null}
                      </span>
                      {/* Sin saldo se dice con la palabra: el operador que ya no
                          vende se ve ANTES de teclear el número. Sin lectura no se
                          sabe, y se dice eso: no «sin saldo». */}
                      {saldoSinLeer ? (
                        <span className="text-xs text-texto-sutil">saldo sin leer</span>
                      ) : saldo <= 0 ? (
                        <span className="text-xs font-medium text-peligro">sin saldo</span>
                      ) : (
                        <span className="text-xs text-texto-sutil">
                          saldo <Dinero centavos={saldo} tamano="xs" />
                        </span>
                      )}
                    </Superficie>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="telefono">Teléfono a diez dígitos</Label>
              <Input
                id="telefono"
                inputMode="numeric"
                autoComplete="off"
                placeholder="55 1234 5678"
                className="h-[calc(var(--altura-control)*1.25)] font-numeros text-lg tabular-nums"
                value={telefono}
                onChange={(evento) => {
                  setTelefono(evento.target.value);
                }}
              />
            </div>

            <fieldset className="flex flex-col gap-(--espacio-1)">
              <legend className="mb-(--espacio-1) text-sm font-medium">Monto</legend>
              <div className="grid grid-cols-3 gap-(--espacio-2)">
                {MONTOS_CENTAVOS.map((centavos) => (
                  <Button
                    key={centavos}
                    type="button"
                    aria-pressed={monto === centavos}
                    variant={monto === centavos ? 'default' : 'outline'}
                    onClick={() => {
                      setMonto(centavos);
                    }}
                  >
                    <Dinero centavos={centavos} />
                  </Button>
                ))}
                {/* El «otro» del documento es este campo: escribir encima de un
                    monto es lo mismo que elegirlo, con un solo estado detrás. */}
                <CampoDeDinero
                  aria-label="Otro monto de recarga"
                  placeholder="Otro"
                  centavos={monto}
                  alCambiar={setMonto}
                />
              </div>
            </fieldset>

            <div className="mt-auto flex flex-col gap-(--espacio-2)">
              <p className="flex items-baseline justify-between gap-(--espacio-2) text-sm">
                <span className="text-texto-sutil">Comisión para la tienda</span>
                <Dinero centavos={comisionRecarga} tamano="lg" conSigno />
              </p>
              <Button
                type="button"
                size="lg"
                className="h-20 w-full justify-between text-xl font-bold"
                disabled={!listoRecarga || enviando}
                aria-describedby="razon-recarga"
                onClick={() => {
                  void cobrar('recarga');
                }}
              >
                <span>{enCurso === 'recarga' ? 'Cobrando…' : 'COBRAR'}</span>
                <Dinero centavos={montoCentavos} tamano="lg" />
              </Button>
              {/* El motivo se escribe, no se insinúa con un botón gris: el color
                  nunca es el único que dice por qué algo no se puede. */}
              <p
                id="razon-recarga"
                className={`text-xs ${sinSaldo ? 'font-medium text-peligro' : 'text-texto-sutil'}`}
              >
                {sinSaldo
                  ? 'Sin saldo con este operador: deposita para seguir recargando.'
                  : digitos.length !== DIGITOS_TELEFONO
                    ? 'Faltan dígitos del teléfono.'
                    : montoCentavos === 0
                      ? 'Elige el monto.'
                      : 'El dinero entra a la caja; tu ganancia es la comisión.'}
              </p>
              {sinSaldo && (
                <Button variant="outline" className="w-full" asChild>
                  <a href="/configuracion">Depositar saldo con el comisionista</a>
                </Button>
              )}
            </div>
          </Superficie>

          <Superficie
            como="section"
            relleno={3}
            aria-labelledby="titulo-servicio"
            className={`${carrilMovil === 'servicio' ? 'flex' : 'hidden'} flex-col gap-(--espacio-3) md:flex xl:p-(--espacio-4)`}
          >
            <h2
              id="titulo-servicio"
              className="flex items-center gap-(--espacio-2) text-sm font-bold tracking-wide uppercase"
            >
              <ReceiptText aria-hidden="true" className="size-4 text-texto-sutil" />
              Pago de servicio
            </h2>
            <ul aria-label="Servicio" className="hidden grid-cols-3 gap-(--espacio-2) md:grid">
              {SERVICIOS.map((servicio) => {
                const elegido = proveedorServicio === servicio.nombre;
                return (
                  <li key={servicio.nombre}>
                    <Superficie
                      como="button"
                      type="button"
                      interactiva
                      activa={elegido}
                      aria-pressed={elegido}
                      relleno={3}
                      radio="md"
                      className="flex min-h-20 w-full flex-col justify-between gap-(--espacio-1)"
                      onClick={() => {
                        setProveedorServicio(servicio.nombre);
                      }}
                    >
                      <span className="flex items-center justify-between gap-(--espacio-1) text-base font-semibold">
                        {servicio.nombre}
                        {elegido ? (
                          <Check aria-hidden="true" className="size-4 text-primario" />
                        ) : null}
                      </span>
                      <span className="text-xs text-texto-sutil">
                        comisión <Dinero centavos={servicio.comisionCentavos} tamano="xs" />
                      </span>
                    </Superficie>
                  </li>
                );
              })}
            </ul>
            {/* Vuelve solo al hueco cuando el cajero toca uno de los tres de
                arriba: el valor vacío es lo que el desplegable pinta como
                marcador, así que no hay dos sitios diciendo qué está elegido. */}
            <Select
              value={
                OTROS_SERVICIOS.some((n) => n === proveedorServicio)
                  ? (proveedorServicio ?? '')
                  : ''
              }
              onValueChange={(valor) => {
                setProveedorServicio(valor);
              }}
            >
              <SelectTrigger className="hidden w-full md:flex" aria-label="Otro servicio">
                <SelectValue placeholder="Otro servicio…" />
              </SelectTrigger>
              <SelectContent>
                {OTROS_SERVICIOS.map((nombre) => (
                  <SelectItem key={nombre} value={nombre}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="referencia">Referencia</Label>
              {/* El lector de barras teclea en el campo con foco: por eso la
                  referencia es un campo normal y no un diálogo aparte. Teclear
                  24 dígitos con fila detrás es donde se paga el recibo de otro,
                  y por eso va grande y en cifras tabulares: se coteja de reojo. */}
              <Input
                id="referencia"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Escanea el código del recibo"
                className="h-[calc(var(--altura-control)*1.25)] font-numeros text-lg tabular-nums"
                value={referencia}
                onChange={(evento) => {
                  setReferencia(evento.target.value);
                }}
              />
            </div>

            <div className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor="importe">Importe del recibo</Label>
              <CampoDeDinero
                id="importe"
                placeholder="1240.00"
                centavos={importe}
                alCambiar={setImporte}
              />
            </div>

            <div className="mt-auto flex flex-col gap-(--espacio-2)">
              <p className="flex items-baseline justify-between gap-(--espacio-2) text-sm">
                <span className="text-texto-sutil">Comisión para la tienda</span>
                <Dinero centavos={comisionServicio} tamano="lg" conSigno />
              </p>
              <Button
                type="button"
                size="lg"
                className="h-20 w-full justify-between text-xl font-bold"
                disabled={!listoServicio || enviando}
                aria-describedby="razon-servicio"
                onClick={() => {
                  void cobrar('pago_servicio');
                }}
              >
                <span>{enCurso === 'pago_servicio' ? 'Cobrando…' : 'COBRAR'}</span>
                <Dinero centavos={importeCentavos} tamano="lg" />
              </Button>
              <p id="razon-servicio" className="text-xs text-texto-sutil">
                {proveedorServicio === null
                  ? 'Elige el servicio: pagar el recibo del proveedor equivocado no tiene vuelta.'
                  : referencia.trim().length < DIGITOS_REFERENCIA
                    ? 'Escanea o teclea la referencia completa del recibo.'
                    : importeCentavos === 0
                      ? 'Captura el importe que dice el recibo.'
                      : 'El dinero entra a la caja; tu ganancia es la comisión.'}
              </p>
            </div>
          </Superficie>
        </div>
      </div>

      {/* Pegada abajo: el aviso de saldo no puede depender de que alguien se
          acuerde de mirar, y en teléfono es lo que el dueño vino a ver. */}
      <Superficie
        como="footer"
        nivel={3}
        radio="sm"
        relleno={3}
        conBorde={false}
        className="sticky bottom-0 z-20 flex flex-wrap items-center gap-x-(--espacio-4) gap-y-(--espacio-2) rounded-none border-t border-borde xl:px-(--espacio-4)"
      >
        <p className="flex flex-wrap items-center gap-(--espacio-2) text-sm">
          <span className="text-texto-sutil">Saldo de recargas</span>
          {saldoSinLeer ? (
            <span className="font-semibold text-texto-sutil">sin leer</span>
          ) : (
            <Dinero
              centavos={saldoTotal}
              className={saldoBajo ? 'font-semibold text-peligro' : 'font-semibold'}
            />
          )}
          {/* El aviso NOMBRA a quién se le acabó: «saldo bajo» a secas obliga a ir a
              buscar cuál, y a las ocho de la noche eso no se hace. */}
          {saldoBajo && (
            <Badge variant="destructive">
              <TriangleAlert aria-hidden="true" />
              Saldo bajo{bajos.length === 0 ? '' : ` · ${bajos.join(', ')}`}
            </Badge>
          )}
        </p>
        {/* Lo que el dueño viene a ver desde el teléfono: ahí va primero. */}
        <p className="order-first flex w-full items-baseline gap-(--espacio-2) text-sm md:order-none md:w-auto">
          <span className="text-texto-sutil">
            Hoy: <Cifra valor={listaOperaciones.length} tamano="sm" /> operaciones ·
          </span>
          <Dinero centavos={comisionDeHoy} tamano="lg" />
          <span className="text-texto-sutil">de comisión</span>
        </p>
        {/* CARGAR SALDO · la otra mitad del almacén de dinero.
            Sin esto el saldo sólo puede bajar, y el panel acabaría enseñando un
            número que no se puede arreglar desde ninguna pantalla. */}
        <div className="flex w-full items-center gap-(--espacio-2) md:ml-auto md:w-auto">
          <Label htmlFor="cargar-saldo" className="text-xs text-texto-sutil">
            Cargar saldo de {proveedorRecarga}
          </Label>
          <CampoDeDinero
            id="cargar-saldo"
            className="w-28 shrink-0"
            centavos={carga}
            alCambiar={setCarga}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={(carga ?? 0) <= 0 || enviando}
            cargando={enCurso === 'saldo'}
            onClick={() => {
              void cargarSaldoDeRecargas();
            }}
          >
            Cargar
          </Button>
        </div>
      </Superficie>
    </div>
  );
}
