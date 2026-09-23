'use client';

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
  Cifra,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  TablaAdaptable,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import { Check, Coffee, Gift, Search, Stamp } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · cafeteria · clientes-y-sellos
 *
 * La tarjeta de sellos, que en una cafetería es el programa de lealtad entero.
 *
 * ── Por qué se identifica por TELÉFONO y no por tarjeta ─────────────────
 * Porque la tarjeta de cartón se pierde, y con ella el cliente pierde nueve
 * sellos y las ganas. El teléfono lo trae siempre y lo recuerda de memoria: es
 * el único identificador que sobrevive a tres meses.
 *
 * ── Por qué el saldo se enseña ANTES de cobrar ──────────────────────────
 * «Te falta uno» dicho en la barra vende el noveno café. Dicho después de
 * cobrar no vende nada, y el cliente se entera de que pudo haber canjeado
 * cuando ya pagó.
 *
 * ── Por qué el canje pide confirmación y el sello no ────────────────────
 * Dar un sello de más cuesta una fracción de café. Canjear por error cuesta un
 * café entero y una discusión, porque el cliente ya se llevó el suyo y su
 * tarjeta volvió a cero. No son el mismo riesgo y no llevan el mismo freno.
 *
 * ── Y por qué el ajuste manual pide MOTIVO ──────────────────────────────
 * Es la única forma de meter sellos sin venta, y sin motivo es exactamente
 * cómo se regalan cafés a los conocidos sin que nadie pueda verlo después.
 *
 * ── La forma (04-INTERFAZ, «PANTALLA · Clientes y sellos») ──────────────
 * La acción principal es BUSCAR POR TELÉFONO: el campo va arriba, grande y con
 * el foco, y Enter busca. La tarjeta del cliente dibuja sus sellos como la de
 * cartón —un círculo por sello y el último es el premio—, porque eso es lo que
 * el barista le enseña al cliente por encima de la barra. En la terminal la
 * lista es una tabla densa a la izquierda y la tarjeta un panel fijo a la
 * derecha; tocar una fila la convierte en el panel (`VIAJE.fila`). En tableta y
 * teléfono la tarjeta va primero y la lista baja a tarjetas.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben identificar, ver el saldo, canjear y ajustar. Queda fuera la campaña
 * de recordatorio, que necesita el canal de salida que está bloqueado. Y quedan
 * fuera el PASIVO del programa y los que no vienen hace 21 días: piden leer a
 * todos los clientes, y esta pantalla lee doce. De esos doce sí se dice quién
 * puede canjear y a quién le falta uno, que es lo que se usa en la barra.
 */

// Identificar por teléfono es una LECTURA y va por el puente: la ruta
// `/api/lealtad/identificar` sirve `lealtad.otorgar_sellos`, que es otra cosa.
const RUTA_CANJEAR = '/api/lealtad/canjear';
const RUTA_AJUSTAR = '/api/lealtad/ajustar';

/** Diez dígitos, como se teclea en México. */
const TELEFONO_CON_FORMA = /^\d{10}$/;

/** Lo mínimo de un producto para poder ofrecerlo como premio. */
export interface PremioPosible {
  readonly id: string;
  readonly nombre: string;
}

export interface ClienteConSellos {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
  /**
   * Cuántos sellos son un premio. NO es del cliente: es del NEGOCIO.
   *
   * No se sirve por cliente y no debería: es una regla de lealtad, la misma para
   * todos, y vive en la configuración. Se declara opcional y la pantalla cae al
   * valor por omisión —diez, que es la tarjeta de cartón de toda la vida— en vez de
   * restar contra `undefined` y enseñar «NaN para tu próximo café».
   */
  readonly sellosParaPremio?: number;
  readonly premiosCanjeados: number;
}

export interface ClientesYSellosProps {
  readonly clienteInicial?: ClienteConSellos;
  readonly recientesIniciales?: readonly ClienteConSellos[];
}

/** Diez sellos son un café: es la tarjeta de cartón de toda la vida. */
const SELLOS_PARA_PREMIO = 10;

/**
 * Cuántos sellos son un premio en ESTE negocio.
 *
 * El umbral no es del cliente —es una regla de lealtad, la misma para todos— y el
 * puente no lo sirve por cliente, con razón. Con el valor por omisión la tarjeta
 * dice «3 / 10» en vez de «3 / NaN», que es lo que enseñaba.
 */
export function metaDeSellos(cliente: { readonly sellosParaPremio?: number }): number {
  return cliente.sellosParaPremio ?? SELLOS_PARA_PREMIO;
}

/** «Te falta uno» vende el noveno café; «llevas nueve» no dice nada. */
export function loQueFalta(cliente: ClienteConSellos): string {
  const faltan = metaDeSellos(cliente) - cliente.sellos;
  if (faltan <= 0) return 'Ya puede canjear';
  if (faltan === 1) return 'Le falta uno';
  return `Le faltan ${String(faltan)}`;
}

function puedeCanjear(cliente: ClienteConSellos): boolean {
  return cliente.sellos >= metaDeSellos(cliente);
}

function aUnSello(cliente: ClienteConSellos): boolean {
  return metaDeSellos(cliente) - cliente.sellos === 1;
}

/**
 * El tono de la fila: los dos casos que se dicen en la barra. Nunca solo: la
 * columna «Para el premio» dice con palabras por qué la fila está pintada.
 */
function tonoDe(cliente: ClienteConSellos): TonoDeFila | undefined {
  if (puedeCanjear(cliente)) return 'exito';
  if (aUnSello(cliente)) return 'advertencia';
  return undefined;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

function textoDeFallo(fallo: unknown, siNoSeSabe: string): string {
  return fallo instanceof Error ? fallo.message : siNoSeSabe;
}

/** «2 pueden canjear · 1 a un sello del premio», con el verbo concordando. */
function resumenDe(filas: readonly ClienteConSellos[]): string {
  const canjean = filas.filter(puedeCanjear).length;
  const aUno = filas.filter(aUnSello).length;
  const verbo = canjean === 1 ? 'puede' : 'pueden';
  return `${String(canjean)} ${verbo} canjear · ${String(aUno)} a un sello del premio`;
}

function columnasDeRecientes(tituloCliente: string): readonly ColumnaDeTabla<ClienteConSellos>[] {
  return [
    {
      clave: 'cliente',
      titulo: tituloCliente,
      orden: (f) => f.nombre,
      celda: (f) => (
        <span className="flex flex-col">
          <span className="font-medium">{f.nombre}</span>
          <span className="font-numeros text-xs text-texto-sutil tabular-nums">
            {f.telefono ?? 'sin teléfono'}
          </span>
        </span>
      ),
    },
    {
      clave: 'sellos',
      titulo: 'Sellos',
      numerica: true,
      orden: (f) => f.sellos,
      celda: (f) => (
        <span className="whitespace-nowrap">
          <Cifra valor={f.sellos} tamano="sm" />
          <span className="text-texto-sutil"> / {metaDeSellos(f)}</span>
        </span>
      ),
    },
    {
      clave: 'premio',
      titulo: 'Para el premio',
      celda: (f) => (
        <span className={puedeCanjear(f) || aUnSello(f) ? 'font-semibold' : 'text-texto-sutil'}>
          {loQueFalta(f)}
        </span>
      ),
    },
    {
      clave: 'canjeados',
      titulo: 'Canjeados',
      numerica: true,
      desde: 'lg',
      orden: (f) => f.premiosCanjeados,
      celda: (f) => <Cifra valor={f.premiosCanjeados} tamano="sm" />,
    },
  ];
}

/**
 * La tarjeta de cartón, dibujada: un círculo por sello, y el último es el premio.
 *
 * No es adorno. «Un sello es un dibujo en una tarjeta y todo el mundo sabe lo que
 * es» (04-INTERFAZ §4.1): el número lo lee el barista, el dibujo lo entiende el
 * cliente al otro lado de la barra sin que nadie se lo explique.
 */
function TiraDeSellos({ sellos, meta }: { readonly sellos: number; readonly meta: number }) {
  const puestos = Math.min(sellos, meta);
  return (
    <div
      role="img"
      aria-label={`${String(puestos)} de ${String(meta)} sellos`}
      className="grid max-w-xs grid-cols-5 gap-(--espacio-2)"
    >
      {Array.from({ length: meta }, (_, indice) => {
        const puesto = indice < sellos;
        // El último círculo es el premio aunque falte: es lo que se está juntando.
        const esElPremio = indice === meta - 1;
        let icono: ReactNode = null;
        if (esElPremio) icono = <Gift aria-hidden="true" className="size-1/2" />;
        else if (puesto) icono = <Coffee aria-hidden="true" className="size-1/2" />;
        return (
          <span
            key={indice}
            className={`flex aspect-square items-center justify-center rounded-full border-2 ${
              puesto
                ? 'border-primario text-primario'
                : 'border-dashed border-borde-fuerte text-texto-tenue'
            }`}
          >
            {icono}
          </span>
        );
      })}
    </div>
  );
}

interface ConfirmarCanjeProps {
  readonly premio: string;
  readonly premios: readonly PremioPosible[] | null;
  readonly falloDePremios: string | null;
  readonly ocupado: boolean;
  readonly alElegirPremio: (id: string) => void;
  readonly alCanjear: () => void;
  readonly alCancelar: () => void;
  readonly alReintentar: () => void;
}

/** El freno del canje: lo irreversible se dice antes, y el premio se elige aquí. */
function ConfirmarCanje({
  premio,
  premios,
  falloDePremios,
  ocupado,
  alElegirPremio,
  alCanjear,
  alCancelar,
  alReintentar,
}: ConfirmarCanjeProps) {
  return (
    <Superficie
      como="section"
      nivel={0}
      relleno={4}
      aria-label="Confirmar el canje"
      className="flex flex-col gap-(--espacio-3) border-advertencia bg-advertencia/10"
    >
      <p className="text-sm">
        Al canjear, la tarjeta vuelve a cero. Canjear por error cuesta un café entero y una
        discusión.
      </p>
      {/*
        QUÉ SE LLEVA. No es un adorno: `lealtad.canjear` congela el COSTO del
        producto en el movimiento —el premio de hace un año se valuó con el
        costo de hace un año— y sin producto el comando contesta 400. Antes no
        se preguntaba, y el canje no se podía hacer nunca.
      */}
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="premio">Qué se lleva</Label>
        {falloDePremios !== null && (
          <Aviso
            tono="peligro"
            titulo="No se pudo leer qué se puede dar de premio."
            accion={
              <Button type="button" size="sm" variant="outline" onClick={alReintentar}>
                Volver a intentar
              </Button>
            }
          >
            Sin premio no se canjea: el canje anota su costo.
          </Aviso>
        )}
        {falloDePremios === null && premios === null && (
          <Esqueleto className="h-(--altura-control) w-full" />
        )}
        {falloDePremios === null && premios !== null && (
          <Select value={premio} onValueChange={alElegirPremio}>
            <SelectTrigger id="premio" className="w-full bg-superficie">
              <SelectValue placeholder="Elige el premio…" />
            </SelectTrigger>
            <SelectContent>
              {premios.map((posible) => (
                <SelectItem key={posible.id} value={posible.id}>
                  {posible.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="grid grid-cols-2 gap-(--espacio-2)">
        <Button type="button" size="lg" disabled={ocupado} onClick={alCanjear}>
          Sí, canjear
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={alCancelar}>
          No
        </Button>
      </div>
    </Superficie>
  );
}

interface AjusteAManoProps {
  readonly ajuste: string;
  readonly motivo: string;
  readonly ocupado: boolean;
  readonly alCambiarAjuste: (valor: string) => void;
  readonly alCambiarMotivo: (valor: string) => void;
  readonly alAjustar: () => void;
}

/** Lo de la dueña, no lo de la ráfaga: abajo, callado, y con su motivo. */
function AjusteAMano({
  ajuste,
  motivo,
  ocupado,
  alCambiarAjuste,
  alCambiarMotivo,
  alAjustar,
}: AjusteAManoProps) {
  return (
    <section
      aria-labelledby="ajuste-titulo"
      className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)"
    >
      <h3 id="ajuste-titulo" className="text-sm font-semibold">
        Ajustar a mano
      </h3>
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="ajuste">Sellos</Label>
          <Input
            id="ajuste"
            inputMode="numeric"
            className="text-right font-numeros tabular-nums"
            placeholder="+1 / −1"
            value={ajuste}
            onChange={(evento) => {
              alCambiarAjuste(evento.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="motivo">Por qué</Label>
          <Input
            id="motivo"
            value={motivo}
            onChange={(evento) => {
              alCambiarMotivo(evento.target.value);
            }}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={ocupado}
        onClick={alAjustar}
      >
        Ajustar
      </Button>
    </section>
  );
}

export function ClientesYSellos({ clienteInicial, recientesIniciales }: ClientesYSellosProps) {
  const voc = useVocabulario();
  const [telefono, setTelefono] = useState('');
  const [cliente, setCliente] = useState<ClienteConSellos | null>(clienteInicial ?? null);
  const [recientes, setRecientes] = useState<readonly ClienteConSellos[] | null>(
    recientesIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [confirmandoCanje, setConfirmandoCanje] = useState(false);
  /** El premio que se lleva. Lo pide el comando: congela su costo en el ledger. */
  const [premio, setPremio] = useState('');
  const [premios, setPremios] = useState<readonly PremioPosible[] | null>(null);
  const [falloDePremios, setFalloDePremios] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ajuste, setAjuste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** La fila que está viajando al panel: sólo ella lleva el nombre del viaje. */
  const [viajando, setViajando] = useState<string | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee
  // otra vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (recientesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ClienteConSellos>('Cliente', { limite: 12, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setRecientes(filas);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setFalloDeCarga(textoDeFallo(fallo, 'No se pudo leer la lista.'));
        });
      // Lo que se puede dar como premio. Hace falta AQUÍ porque el canje anota el
      // costo del producto que se entrega, y ese costo se congela en el ledger.
      consultarPuente<PremioPosible>('ProductoTerminado', {
        filtro: { activo: true },
        orden: 'nombre',
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setPremios(filas);
        })
        .catch((fallo: unknown) => {
          if (sigueMontada()) setFalloDePremios(textoDeFallo(fallo, 'No se pudo leer el menú.'));
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [recientesIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setFalloDePremios(null);
    setRecientes(null);
    setPremios(null);
    setIntento((previo) => previo + 1);
  }

  function identificar(): void {
    const limpio = telefono.replace(/\D/g, '');
    if (!TELEFONO_CON_FORMA.test(limpio)) {
      setError('El teléfono son diez dígitos.');
      return;
    }
    setOcupado(true);
    setError(null);
    setAviso(null);
    /**
     * ── IDENTIFICAR NUNCA FUNCIONÓ, y es lo PRIMERO que hace esta pantalla ──
     * Publicaba `{telefono}` en `/api/lealtad/identificar`, que es el comando
     * `lealtad.otorgar_sellos` y pide `{clienteId, ordenId}`: cada búsqueda
     * contestaba **400** y la tarjeta de sellos no se podía abrir nunca. La ruta ni
     * identifica ni debería: buscar por teléfono es una LECTURA, y las lecturas van
     * por el puente —que además ya sirve los `sellos` derivados del ledger—.
     */
    consultarPuente<ClienteConSellos>('Cliente', { filtro: { telefono: limpio }, limite: 1 })
      .then((filas) => {
        const encontrado = filas[0];
        if (encontrado === undefined) {
          setCliente(null);
          setError('Con ese teléfono no hay nadie registrado todavía.');
          return;
        }
        setCliente(encontrado);
        setConfirmandoCanje(false);
      })
      .catch((fallo: unknown) => {
        setCliente(null);
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  /**
   * La fila se convierte en la tarjeta. Antes del cambio la FILA lleva el nombre;
   * dentro del cambio se lo quita y lo toma el PANEL, y `flushSync` hace que el
   * navegador fotografíe el estado nuevo ya pintado. Nunca los dos a la vez: con
   * dos elementos del mismo nombre el navegador no anima ninguno.
   */
  function abrirTarjeta(id: string): void {
    const elegido = recientes?.find((fila) => fila.id === id);
    if (elegido === undefined) return;
    if (cliente?.id === id) {
      setConfirmandoCanje(false);
      return;
    }
    flushSync(() => {
      setViajando(id);
    });
    void conTransicion(() => {
      flushSync(() => {
        setViajando(null);
        setCliente(elegido);
        setConfirmandoCanje(false);
      });
    });
  }

  function canjear(): void {
    if (cliente === null) return;
    // La validación va ANTES de ocupar la pantalla: al revés, un «Sí, canjear»
    // sin premio dejaba todos los botones apagados para siempre.
    if (premio === '') {
      setError('Elige qué se lleva: el premio se anota con su costo congelado.');
      return;
    }
    setOcupado(true);
    setError(null);
    /**
     * EL PREMIO VIAJA, porque `lealtad.canjear` congela su COSTO en el movimiento.
     * Antes iba sólo `{clienteId}` y contestaba 400: se podía confirmar el canje y
     * la tarjeta no se vaciaba —ni el premio se anotaba— nunca.
     */
    invocarComando<ClienteConSellos>(RUTA_CANJEAR, { clienteId: cliente.id, productoId: premio })
      .then((actualizado) => {
        setCliente(actualizado);
        setConfirmandoCanje(false);
        setAviso('Canjeado. La tarjeta vuelve a empezar.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function ajustar(): void {
    if (cliente === null) return;
    const cantidad = Number(ajuste);
    if (!Number.isInteger(cantidad) || cantidad === 0) {
      setError('Pon cuántos sellos, en más o en menos.');
      return;
    }
    if (motivo.trim().length < 4) {
      // Sin motivo es exactamente cómo se regalan cafés a los conocidos sin que
      // nadie pueda verlo después.
      setError('Escribe por qué se ajusta.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<ClienteConSellos>(RUTA_AJUSTAR, {
      clienteId: cliente.id,
      sellos: cantidad,
      motivo: motivo.trim(),
    })
      .then((actualizado) => {
        setCliente(actualizado);
        setAjuste('');
        setMotivo('');
        setAviso('Ajustado.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const tarjeta =
    cliente === null ? (
      <Vacio
        icono={<Stamp />}
        titulo="Nadie identificado todavía."
        explicacion={`Pide el teléfono y búscalo arriba, o toca a ${voc.enFraseCon('un', 'cliente')} de la lista: su tarjeta de sellos se abre aquí.`}
        className="hidden py-(--espacio-10) xl:col-start-2 xl:row-start-1 xl:flex"
      />
    ) : (
      <Superficie
        como="section"
        nivel={2}
        relleno={6}
        aria-label={`Tarjeta de sellos de ${cliente.nombre}`}
        style={{ viewTransitionName: VIAJE.fila(cliente.id) }}
        className="flex flex-col gap-(--espacio-4) xl:sticky xl:top-(--espacio-4) xl:col-start-2 xl:row-start-1"
      >
        <header>
          <h2 className="text-xl font-bold">{cliente.nombre}</h2>
          <p className="font-numeros text-sm text-texto-sutil tabular-nums">
            {cliente.telefono ?? 'sin teléfono'}
          </p>
        </header>

        {/* Lo que se dice en voz alta, primero y lo más grande: «le falta uno». */}
        <div className="flex flex-col gap-(--espacio-3)">
          <p
            className={`flex items-center gap-(--espacio-2) text-2xl font-bold ${
              puedeCanjear(cliente) ? 'text-exito' : ''
            }`}
          >
            {puedeCanjear(cliente) ? <Check aria-hidden="true" /> : null}
            {loQueFalta(cliente)}
          </p>
          <p className="flex items-baseline gap-(--espacio-2)">
            <Cifra valor={cliente.sellos} tamano="total" className="font-bold" />
            <span className="text-xl text-texto-sutil">/ {metaDeSellos(cliente)}</span>
          </p>
          <TiraDeSellos sellos={cliente.sellos} meta={metaDeSellos(cliente)} />
          <p className="text-sm text-texto-sutil">
            {cliente.premiosCanjeados} premio{cliente.premiosCanjeados === 1 ? '' : 's'} canjeado
            {cliente.premiosCanjeados === 1 ? '' : 's'}
          </p>
        </div>

        {puedeCanjear(cliente) && !confirmandoCanje && (
          <Button
            type="button"
            size="lg"
            className="w-full text-base"
            disabled={ocupado}
            onClick={() => {
              setConfirmandoCanje(true);
            }}
          >
            <Gift aria-hidden="true" />
            Canjear premio
          </Button>
        )}

        {confirmandoCanje && (
          <ConfirmarCanje
            premio={premio}
            premios={premios}
            falloDePremios={falloDePremios}
            ocupado={ocupado}
            alElegirPremio={setPremio}
            alCanjear={canjear}
            alCancelar={() => {
              setConfirmandoCanje(false);
            }}
            alReintentar={reintentar}
          />
        )}

        <AjusteAMano
          ajuste={ajuste}
          motivo={motivo}
          ocupado={ocupado}
          alCambiarAjuste={setAjuste}
          alCambiarMotivo={setMotivo}
          alAjustar={ajustar}
        />
      </Superficie>
    );

  const lista = (() => {
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo={`No se pudo leer la lista de ${voc.plural('cliente')}`}
          queHacer="Buscar por teléfono sigue funcionando. Revisa la conexión y vuelve a leer la lista."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentar}>
              Volver a intentar
            </Button>
          }
        />
      );
    }
    // La forma de la tabla, nunca una rueda: el ojo ya sabe dónde va a mirar.
    if (recientes === null) return <EsqueletoDeLista filas={6} />;
    return (
      <TablaAdaptable
        etiqueta={`${voc.titulo('cliente', true)} recientes`}
        principal="cliente"
        columnas={columnasDeRecientes(voc.titulo('cliente'))}
        filas={recientes}
        claveDe={(fila) => fila.id}
        {...(cliente === null ? {} : { activa: cliente.id })}
        alActivar={abrirTarjeta}
        viajeDeFila={(fila) => (fila.id === viajando ? VIAJE.fila(fila.id) : undefined)}
        tonoDeFila={tonoDe}
        alto="max-h-[70vh]"
        vacio={
          <Vacio
            icono={<Stamp />}
            titulo={`Todavía no hay ${voc.plural('cliente')} con tarjeta de sellos.`}
            explicacion="Cuando los haya, aparecen aquí con sus sellos. Mientras, se busca por teléfono."
            className="py-(--espacio-8)"
          />
        }
      />
    );
  })();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-4) xl:p-(--espacio-6)">
      <header className="flex flex-col gap-(--espacio-1)">
        <h1 className="text-2xl font-bold">{voc.titulo('cliente', true)} y sellos</h1>
        <p className="text-sm text-texto-sutil">
          Se identifica por teléfono: la tarjeta de cartón se pierde y el teléfono no.
        </p>
      </header>

      {/* LA ACCIÓN PRINCIPAL. Grande, con el foco, y Enter busca: el cliente dicta
          diez dígitos y el barista no suelta el teclado para ir al botón. */}
      <Superficie
        como="form"
        role="search"
        relleno={4}
        aria-label="Buscar por teléfono"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault();
          identificar();
        }}
        className="flex items-end gap-(--espacio-3)"
      >
        <div className="flex flex-1 flex-col gap-(--espacio-1)">
          <Label htmlFor="telefono">Teléfono</Label>
          <Input
            id="telefono"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="h-[calc(var(--altura-control)*1.4)] font-numeros text-2xl tracking-wide tabular-nums"
            placeholder="10 dígitos"
            value={telefono}
            onChange={(evento) => {
              setTelefono(evento.target.value);
            }}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-[calc(var(--altura-control)*1.4)] text-base"
          disabled={ocupado}
        >
          <Search aria-hidden="true" />
          Buscar
        </Button>
      </Superficie>

      {error !== null && <Aviso tono="peligro" titulo={error} />}
      {aviso !== null && <Aviso tono="exito" titulo={aviso} />}

      <div className="grid gap-(--espacio-4) xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        {tarjeta}

        <section
          aria-labelledby="recientes-titulo"
          className="flex min-w-0 flex-col gap-(--espacio-3) xl:col-start-1 xl:row-start-1"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
            <h2
              id="recientes-titulo"
              className="text-sm font-semibold tracking-wide text-texto-sutil uppercase"
            >
              Recientes
            </h2>
            {recientes !== null && recientes.length > 0 && (
              <p className="text-sm text-texto-sutil">{resumenDe(recientes)}</p>
            )}
          </div>
          {lista}
        </section>
      </div>
    </main>
  );
}
