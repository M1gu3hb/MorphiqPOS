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
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
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
 * se ve, y los dos carriles se reducen a la operación que él elija.
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
const MONTOS = [20, 30, 50, 100, 200] as const;
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

export interface SaldoDeComisionista {
  /** ES el comisionista: la tabla tiene una fila por organización y comisionista. */
  readonly id: string;
  readonly saldo_centavos: number | null;
  readonly comision_acumulada_centavos: number | null;
}

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

/** Centavos a pesos para una persona. Aritmética entera de punta a punta. */
export function enPesos(centavos: number): string {
  const miles = Math.trunc(Math.abs(centavos) / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${miles}.${(Math.abs(centavos) % 100).toString().padStart(2, '0')}`;
}

/** Texto tecleado a centavos sin pasar por coma flotante. */
export function aCentavos(texto: string): number {
  const [entero = '', decimal = ''] = texto.replace(/[^\d.]/g, '').split('.');
  return Number(entero === '' ? '0' : entero) * 100 + Number(`${decimal}00`.slice(0, 2));
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

/** La medianoche de HOY, en ISO: el rango con el que se piden las operaciones del día. */
function comienzoDelDia(): string {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString();
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
  // Telcel llega elegido porque es siete de cada diez recargas: no es una
  // suposición cómoda, es un toque menos en la operación más repetida del día.
  const [proveedorRecarga, setProveedorRecarga] = useState('Telcel');
  // El servicio NO se presupone: pagar el recibo del proveedor equivocado es
  // el error caro de esta pantalla, y aquí sí conviene obligar a elegir.
  const [proveedorServicio, setProveedorServicio] = useState<string | null>(null);
  const [eleccionMovil, setEleccionMovil] = useState('recarga:Telcel');
  const [telefono, setTelefono] = useState('');
  const [monto, setMonto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [importe, setImporte] = useState('');
  const [enviando, setEnviando] = useState(false);
  /** Lo que se va a cargar de saldo, en pesos tal como se teclea. */
  const [carga, setCarga] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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
      consultarPuente<SaldoDeComisionista>('SaldoComisionista', {
        limite: 50,
        signal: control.signal,
      }),
      // Las del DÍA: la lista de abajo dice «Hoy: N operaciones», y traer el
      // histórico entero para contar las de hoy es lo que hace lenta una pantalla
      // de mostrador.
      consultarPuente<OperacionDeComision>('OperacionComision', {
        limite: 200,
        rango: { campo: 'created_date', desde: comienzoDelDia() },
        signal: control.signal,
      }),
    ])
      .then(([filasComisionistas, filasSaldo, filasOperaciones]) => {
        if (!sigueMontada()) return;
        setComisionistas(filasComisionistas);
        setSaldos(saldosIniciales ?? filasSaldo);
        setOperaciones(operacionesIniciales ?? filasOperaciones);
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        // Una lectura caída NO puede impedir un cobro: el agregador vive en
        // otro sitio. La pantalla se abre igual, con la banda encima.
        setSaldos((previo) => previo ?? []);
        setOperaciones((previo) => previo ?? []);
        setError(mensajeDeFallo(fallo));
      });
    return () => {
      control.abort();
    };
  }, [saldosIniciales, operacionesIniciales]);

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
  const minimo = MINIMO_ALERTA_CENTAVOS;
  const comisionDeHoy = listaOperaciones.reduce(
    (suma, fila) => suma + (fila.comision_centavos ?? 0),
    0,
  );
  const bajos = deRecargas
    .filter((fila) => (fila.saldo_centavos ?? 0) < MINIMO_ALERTA_CENTAVOS)
    .map((fila) => nombreDelComisionista.get(fila.id) ?? 'sin nombre');

  const digitos = telefono.replace(/\D/g, '');
  const montoCentavos = aCentavos(monto);
  const importeCentavos = aCentavos(importe);
  const comisionRecarga = comisionDeRecarga(montoCentavos);
  const comisionServicio = proveedorServicio === null ? 0 : comisionDeServicio(proveedorServicio);
  const idDelOperador = comisionistas.find((c) => c.nombre === proveedorRecarga)?.id ?? null;
  const saldoDelOperador =
    idDelOperador === null
      ? 0
      : (listaSaldos.find((fila) => fila.id === idDelOperador)?.saldo_centavos ?? 0);
  const sinSaldo = saldoDelOperador === 0 || saldoDelOperador < montoCentavos;
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
    const centavos = aCentavos(carga);
    if (centavos <= 0) return;
    setEnviando(true);
    setError(null);
    setAviso(null);
    try {
      const hecho = await invocarComando<{ readonly saldoCentavos: string }>(
        '/api/comision/cargar-saldo',
        { proveedorServicio: proveedorRecarga, depositadoCentavos: centavos },
      );
      const despues = Number(hecho.saldoCentavos);
      setSaldos(
        idDelOperador === null
          ? listaSaldos
          : listaSaldos.map((fila) =>
              fila.id === idDelOperador ? { ...fila, saldo_centavos: despues } : fila,
            ),
      );
      setCarga('');
      setAviso(`Saldo de ${proveedorRecarga} cargado: quedan ${enPesos(despues)} por vender.`);
    } catch (fallo) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  }

  async function cobrar(tipo: 'recarga' | 'pago_servicio'): Promise<void> {
    const esRecarga = tipo === 'recarga';
    const proveedor = esRecarga ? proveedorRecarga : proveedorServicio;
    if (proveedor === null) return;
    const recibido = esRecarga ? montoCentavos : importeCentavos;
    const comision = esRecarga ? comisionRecarga : comisionServicio;
    setEnviando(true);
    setError(null);
    setAviso(null);
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
      const hecho = await invocarComando<{
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
        const despues = Number(hecho.saldoDelComisionistaCentavos);
        setSaldos(
          listaSaldos.map((fila) =>
            fila.id === idDelOperador ? { ...fila, saldo_centavos: despues } : fila,
          ),
        );
        setTelefono('');
        setMonto('');
      } else {
        setReferencia('');
        setImporte('');
      }
      // Con estas palabras, porque es la confusión número uno del giro.
      // «venta» es la palabra del GIRO —en una ferretería es una nota— y es justo la
      // frase donde importa: lo que se está explicando es qué NO es esto.
      setAviso(
        `Los ${enPesos(recibido)} entran a la caja pero no cuentan como ` +
          `${voc.singular('orden')}. Tu ganancia son ${enPesos(comision)}.`,
      );
      onCobrada?.(proveedor, comision);
    } catch (fallo) {
      // Las dos cosas o ninguna: si falló, ni se cobró ni se movió la caja.
      setError(mensajeDeFallo(fallo));
    } finally {
      setEnviando(false);
    }
  }

  const banda =
    error === null ? null : (
      <p
        role="alert"
        className="rounded-md border border-destructive bg-destructive/15 p-2 text-sm"
      >
        {error} · No se cobró nada y la caja no se movió.
      </p>
    );

  if (saldos === null || operaciones === null) {
    return (
      <div className="space-y-(--espacio-3) p-(--espacio-4)">
        <Skeleton className="h-5 w-40" />
        {/* Esqueletos con la forma de los dos carriles: el botón de cobrar no
            salta de sitio cuando llegan los datos. */}
        <div className="grid gap-(--espacio-4) xl:grid-cols-2">
          <Skeleton className="h-80 w-full rounded-lg" />
          <Skeleton className="hidden h-80 w-full rounded-lg md:block" />
        </div>
        <Skeleton className="h-5 w-full" />
      </div>
    );
  }

  if (error === null && listaSaldos.length === 0 && listaOperaciones.length === 0) {
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
          <p className="max-w-prose text-sm text-muted-foreground">
            Una recarga de $50 te deja {enPesos(comisionDeRecarga(5000))} y un recibo de luz
            {` ${enPesos(comisionDeServicio('CFE'))}`}. Treinta operaciones al día son cerca de $200
            diarios que hoy no estás cobrando, y además traen gente a la tienda.
          </p>
        </Vacio>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col gap-(--espacio-3) p-(--espacio-4)">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-bold">Servicios</h1>
        {/* TELÉFONO · una operación a la vez, elegida de una lista. */}
        <div className="w-full space-y-1 md:hidden">
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

      {banda}
      {aviso !== null && (
        <p role="status" className="rounded-md border border-border bg-accent p-2 text-sm">
          {aviso}
        </p>
      )}

      {/* PC dos columnas · TABLET dos filas apiladas · TELÉFONO sólo la elegida. */}
      <div className="grid flex-1 gap-(--espacio-4) xl:grid-cols-2">
        <section
          aria-labelledby="titulo-recarga"
          className={`${carrilMovil === 'recarga' ? '' : 'hidden'} space-y-(--espacio-3) rounded-lg border border-border bg-card p-(--espacio-4) md:block`}
        >
          <h2 id="titulo-recarga" className="text-sm font-bold uppercase tracking-wide">
            Recarga
          </h2>
          <div className="hidden gap-2 md:grid md:grid-cols-3">
            {RECARGAS.map((nombre) => (
              <Button
                key={nombre}
                type="button"
                aria-pressed={proveedorRecarga === nombre}
                variant={proveedorRecarga === nombre ? 'default' : 'outline'}
                className="h-20 text-base"
                onClick={() => {
                  setProveedorRecarga(nombre);
                }}
              >
                {nombre}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <Label htmlFor="telefono">Teléfono a diez dígitos</Label>
            <Input
              id="telefono"
              inputMode="numeric"
              autoComplete="off"
              placeholder="55 1234 5678"
              value={telefono}
              onChange={(evento) => {
                setTelefono(evento.target.value);
              }}
            />
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">Monto</legend>
            <div className="flex flex-wrap gap-2">
              {MONTOS.map((pesos) => (
                <Button
                  key={pesos}
                  type="button"
                  size="sm"
                  aria-pressed={monto === String(pesos)}
                  variant={monto === String(pesos) ? 'default' : 'outline'}
                  onClick={() => {
                    setMonto(String(pesos));
                  }}
                >
                  {`$${String(pesos)}`}
                </Button>
              ))}
              {/* El «otro» del documento es este campo: escribir encima de un
                  chip es lo mismo que elegirlo, con un solo estado detrás. */}
              <Input
                aria-label="Otro monto de recarga"
                inputMode="decimal"
                placeholder="Otro"
                className="w-24"
                value={monto}
                onChange={(evento) => {
                  setMonto(evento.target.value);
                }}
              />
            </div>
          </fieldset>

          <p className="text-sm">
            Comisión para la tienda: <strong>{enPesos(comisionRecarga)}</strong>
          </p>
          <Button
            type="button"
            className="h-20 w-full text-xl"
            disabled={!listoRecarga || enviando}
            aria-describedby="razon-recarga"
            onClick={() => {
              void cobrar('recarga');
            }}
          >
            COBRAR {enPesos(montoCentavos)}
          </Button>
          {/* El motivo se escribe, no se insinúa con un botón gris: el color
              nunca es el único que dice por qué algo no se puede. */}
          <p id="razon-recarga" className="text-xs text-muted-foreground">
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
        </section>

        <section
          aria-labelledby="titulo-servicio"
          className={`${carrilMovil === 'servicio' ? '' : 'hidden'} space-y-(--espacio-3) rounded-lg border border-border bg-card p-(--espacio-4) md:block`}
        >
          <h2 id="titulo-servicio" className="text-sm font-bold uppercase tracking-wide">
            Pago de servicio
          </h2>
          <div className="hidden gap-2 md:grid md:grid-cols-3">
            {SERVICIOS.map((servicio) => (
              <Button
                key={servicio.nombre}
                type="button"
                aria-pressed={proveedorServicio === servicio.nombre}
                variant={proveedorServicio === servicio.nombre ? 'default' : 'outline'}
                className="h-20 text-base"
                onClick={() => {
                  setProveedorServicio(servicio.nombre);
                }}
              >
                {servicio.nombre}
              </Button>
            ))}
          </div>
          {/* Vuelve solo al hueco cuando el cajero toca uno de los tres de
              arriba: el valor vacío es lo que el desplegable pinta como
              marcador, así que no hay dos sitios diciendo qué está elegido. */}
          <Select
            value={
              OTROS_SERVICIOS.some((n) => n === proveedorServicio) ? (proveedorServicio ?? '') : ''
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

          <div className="space-y-1">
            <Label htmlFor="referencia">Referencia</Label>
            {/* El lector de barras teclea en el campo con foco: por eso la
                referencia es un campo normal y no un diálogo aparte. Teclear
                24 dígitos con fila detrás es donde se paga el recibo de otro. */}
            <Input
              id="referencia"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Escanea el código del recibo"
              value={referencia}
              onChange={(evento) => {
                setReferencia(evento.target.value);
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="importe">Importe del recibo</Label>
            <Input
              id="importe"
              inputMode="decimal"
              placeholder="1240.00"
              value={importe}
              onChange={(evento) => {
                setImporte(evento.target.value);
              }}
            />
          </div>

          <p className="text-sm">
            Comisión para la tienda: <strong>{enPesos(comisionServicio)}</strong>
          </p>
          <Button
            type="button"
            className="h-20 w-full text-xl"
            disabled={!listoServicio || enviando}
            aria-describedby="razon-servicio"
            onClick={() => {
              void cobrar('pago_servicio');
            }}
          >
            COBRAR {enPesos(importeCentavos)}
          </Button>
          <p id="razon-servicio" className="text-xs text-muted-foreground">
            {proveedorServicio === null
              ? 'Elige el servicio: pagar el recibo del proveedor equivocado no tiene vuelta.'
              : referencia.trim().length < DIGITOS_REFERENCIA
                ? 'Escanea o teclea la referencia completa del recibo.'
                : importeCentavos === 0
                  ? 'Captura el importe que dice el recibo.'
                  : 'El dinero entra a la caja; tu ganancia es la comisión.'}
          </p>
        </section>
      </div>

      {/* Pegada abajo: el aviso de saldo no puede depender de que alguien se
          acuerde de mirar, y en teléfono es lo que el dueño vino a ver. */}
      <footer className="sticky bottom-0 -mx-(--espacio-4) -mb-(--espacio-4) flex flex-wrap items-center gap-x-(--espacio-4) gap-y-1 border-t border-border bg-card px-(--espacio-4) py-2 text-sm">
        <span>
          Saldo de recargas: <strong>{enPesos(saldoTotal)}</strong>
        </span>
        {/* El aviso NOMBRA a quién se le acabó: «saldo bajo» a secas obliga a ir a
            buscar cuál, y a las ocho de la noche eso no se hace. */}
        {saldoTotal < minimo && (
          <Badge variant="destructive">
            ⚠ Saldo bajo{bajos.length === 0 ? '' : ` · ${bajos.join(', ')}`}
          </Badge>
        )}
        <span aria-hidden>·</span>
        <span className="text-base font-semibold md:text-sm">
          Hoy: {String(listaOperaciones.length)} operaciones · {enPesos(comisionDeHoy)} de comisión
        </span>
        {/* CARGAR SALDO · la otra mitad del almacén de dinero.
            Sin esto el saldo sólo puede bajar, y el panel acabaría enseñando un
            número que no se puede arreglar desde ninguna pantalla. */}
        <span className="ml-auto flex items-center gap-2">
          <Label htmlFor="cargar-saldo" className="text-xs text-muted-foreground">
            Cargar saldo de {proveedorRecarga}
          </Label>
          <Input
            id="cargar-saldo"
            inputMode="decimal"
            className="w-24"
            placeholder="$"
            value={carga}
            onChange={(e) => {
              setCarga(e.target.value);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={aCentavos(carga) <= 0 || enviando}
            onClick={() => {
              void cargarSaldoDeRecargas();
            }}
          >
            Cargar
          </Button>
        </span>
      </footer>
    </div>
  );
}
