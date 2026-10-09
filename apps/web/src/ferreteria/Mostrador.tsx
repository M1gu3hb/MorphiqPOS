'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  TablaAdaptable,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Maximize2,
  MapPin,
  Minus,
  Plus,
  Scissors,
  Search,
  UserRound,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { buscar, cercanas, normalizar, type MaterialDeMostrador } from './buscar-material';
import { useVocabulario } from '~/cliente/vocabulario';
import {
  claveDePartida,
  dejarParaCotizar,
  guardarLaNota,
  leerLaNota,
  sumarPartida,
  tomarLoDeLaFicha,
  type PartidaGuardada,
  type PresentacionElegida,
} from './nota-del-mostrador.ts';
import { ElegirClienteDelMostrador, type EleccionDeCliente } from './ElegirClienteDelMostrador.tsx';
import {
  apartarNota,
  guardarLasNotasEnEspera,
  notasEnEspera,
  retomarNota,
  suscribirseALaEspera,
  textoDeLaEspera,
} from './notas-en-espera.ts';

/**
 * PANTALLA · ferreteria · mostrador
 *
 * El 70 % del uso del modelo: 25 a 60 ventas al día con el mismo par de manos.
 * La acción principal es BUSCAR, y por eso el foco arranca en el campo.
 *
 * ── Por qué arranca CON los ocho grupos y no en blanco ───────────────────
 * `abarrotes` abre con la lista vacía y «escanea el primer producto». Aquí eso
 * sería un error: la primera pregunta del mostradorista al cliente es «¿de qué
 * es?», y los ocho grupos de línea son esa pregunta convertida en botones.
 *
 * ── Por qué los resultados son una TABLA en la PC y tarjetas en el pasillo ─
 * En el mostrador se COMPARA —cinco tornillos de la misma medida, ¿galvanizado o
 * negro?, ¿Truper o Pretul?—, y comparar es leer una columna de arriba abajo: medida,
 * acabado, marca, precio, existencia y DÓNDE, cada una alineada. En la tableta del
 * pasillo se camina hacia el rack, y la misma fila es una tarjeta con la ubicación
 * en negritas. Es la misma lista con las mismas columnas (`TablaAdaptable`).
 *
 * ── Por qué el total NO es lo más grande ─────────────────────────────────
 * Aquí el cliente no mira la pantalla: mira la pieza que le acaban de poner
 * enfrente. El total importa al final, no durante.
 *
 * ── Por qué la franja del cliente está arriba y no en el cobro ───────────
 * Porque en una remisión a crédito NO HAY COBRO. El saldo, el límite y quién
 * recoge tienen que verse ANTES de despachar o no se ven nunca.
 *
 * ── Por qué no hay esqueleto mientras se teclea ──────────────────────────
 * El índice vive en memoria del cliente y filtrar es local: por debajo de 100
 * ms no hay nada que anunciar. El esqueleto es sólo para la HIDRATACIÓN del
 * índice, que sí cruza la red, y una sola vez.
 *
 * ── La nota sobrevive a ir y volver, y la ficha le agrega (C.10 de la 2.4) ─
 * F5 abre la ficha de la pieza que se está viendo; lo que ahí se agrega —la caja con
 * su precio, o piezas— vuelve a esta nota, que vive en la pestaña y no se pierde al ir
 * a la ficha, al corte o al alta (`nota-del-mostrador.ts`).
 *
 * ── A cuenta de quién, y la llave (C.10 de la 2.4) ───────────────────────
 * El mostrador tenía la remisión entera —F11, la firma, el aviso del límite— y
 * NINGUNA forma de elegir al cliente: ahora se elige (nombre o teléfono), con su
 * obra y quién recoge, de la lista o a mano, y entonces se avisa. Si la mora lo
 * bloquea, se dice dónde da el dueño la llave (Cuentas, con SU usuario) y la nota
 * que ya se mandó a caja se REUSA al volver a F11: antes cada intento creaba otra.
 *
 * ── Las teclas, todas con su botón ───────────────────────────────────────
 * F5 la ficha, F6 el corte de la pieza, F8 la nota como cotización, F9 apartarla
 * mientras se atiende a otro (espera en este dispositivo con un número corto,
 * `notas-en-espera.ts`), F11 a cuenta y F12 a caja. La equivalencia real (F-060)
 * sale de `equivalencias`; mientras no exista, cero resultados aproxima por familia
 * y lo dice en la pantalla.
 */

/** «¿De qué es?», convertido en botones. No son productos: son puntos de partida. */
const GRUPOS = [
  'Fijación',
  'Eléctrico',
  'Plomería',
  'Pintura',
  'Herramienta',
  'Cerrajería',
  'Construcción',
  'Jardín',
] as const;

/** F-153: el conocimiento del mostradorista. Aquí sólo siembran la búsqueda. */
const LISTAS = ['tinaco', 'contacto', 'llave'] as const;

export interface ClienteDeMostrador {
  readonly id: string;
  readonly nombre: string;
  readonly obra: string | null;
  readonly saldoCentavos: number;
  readonly limiteCentavos: number;
  readonly diasVencido: number;
  readonly recoge: string | null;
  readonly recogeAutorizado: boolean;
}

export interface MostradorProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly MaterialDeMostrador[];
  readonly clienteInicial?: ClienteDeMostrador | null;
  /** La caja cerrada no bloquea el mostrador: armar no es cobrar. */
  readonly cajaCerrada?: boolean;
  /**
   * LO QUE SE VIENE BUSCANDO, cuando quien llega ya sabe qué quiere: la pantalla
   * de Entradas manda aquí cada renglón del proveedor que no pudo emparejar, con
   * su descripción ya escrita.
   */
  readonly consultaInicial?: string;
}

interface Partida {
  readonly material: MaterialDeMostrador;
  readonly cantidad: number;
  /** La caja que la ficha eligió, o nulo: la pieza suelta. */
  readonly presentacion: PresentacionElegida | null;
}

/** Su clave: la misma pieza suelta y en caja son dos renglones. */
function claveDe(partida: Partida): string {
  return claveDePartida(partida.material.id, partida.presentacion);
}

/**
 * Lo que devuelve `ferreteria.crear_nota_mostrador`. Se declara aquí y no se
 * importa del comando: ese módulo es `server-only` y esta pantalla corre en el
 * navegador.
 */
interface ResultadoNotaMostrador {
  readonly ordenId: string;
  readonly notaId: string;
  readonly folio: string;
  readonly totalCentavos: string;
}

/**
 * El precio de un material, en centavos. Por `centavosDe`: la unidad la dice el
 * mapa, no el nombre. Ausente vale cero, como valía antes.
 */
function precioDe(m: MaterialDeMostrador): number {
  return centavosDe('MaterialMostrador', 'precioCentavos', m.precioCentavos) ?? 0;
}

/** El código de dominio del muro, que el contrato de la ruta no lista. */
function esElMuroDeLaMora(codigo: string): boolean {
  return codigo === 'PUENTE_SIN_PERMISO';
}

/** Cómo se dice la pieza en el botón de su ficha: su medida o, sin ella, su nombre. */
function nombreParaLaFicha(material: MaterialDeMostrador | undefined): string {
  if (material === undefined) return 'la pieza';
  return material.medida.trim() === '' ? material.nombre : material.medida;
}

/** La nota guardada en la pestaña más lo que dejó la ficha, contra el catálogo. */
function partidasRecuperadas(catalogo: readonly MaterialDeMostrador[]): Partida[] {
  const deLaFicha = tomarLoDeLaFicha();
  const guardadas = deLaFicha === null ? leerLaNota() : sumarPartida(leerLaNota(), deLaFicha);
  const porId = new Map(catalogo.map((m) => [m.id, m]));
  return guardadas.flatMap((g): Partida[] => {
    const material = porId.get(g.productoId);
    return material === undefined
      ? []
      : [{ material, cantidad: g.cantidad, presentacion: g.presentacion }];
  });
}

/** El precio de un renglón: el de su caja, si es una; si no, el de la pieza. */
function precioDeLaPartida(p: Partida): number {
  return p.presentacion === null ? precioDe(p.material) : (p.presentacion.precioCentavos ?? 0);
}

/** Las columnas de un resultado. Cada una se gana su lugar (`04-INTERFAZ` §1). */
function columnasDeResultado(
  nombreDeMaterial: string,
): readonly ColumnaDeTabla<MaterialDeMostrador>[] {
  return [
    {
      clave: 'material',
      titulo: nombreDeMaterial,
      celda: (m) => (
        <span className="flex flex-col">
          <span className="text-base font-semibold">{m.medida}</span>
          <span className="text-xs text-texto-sutil">{m.nombre}</span>
        </span>
      ),
    },
    { clave: 'acabado', titulo: 'Acabado', desde: 'md', celda: (m) => m.acabado ?? '—' },
    { clave: 'marca', titulo: 'Marca', desde: 'lg', celda: (m) => m.marca ?? '—' },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (m) => precioDe(m),
      celda: (m) => <Dinero centavos={precioDe(m)} tamano="sm" />,
    },
    {
      clave: 'hay',
      titulo: 'Hay',
      numerica: true,
      orden: (m) => m.existencia,
      // Negativo es un dato que NO es verdad: falta capturar una entrada. Se dice.
      celda: (m) =>
        m.existencia < 0 ? (
          <span className="font-medium text-peligro">revisar entradas</span>
        ) : (
          <Cifra valor={m.existencia} unidad={m.unidad} />
        ),
    },
    {
      clave: 'donde',
      titulo: 'Dónde',
      // En negritas siempre: en el pasillo es el dato que se está usando.
      celda: (m) => (
        <span className="inline-flex items-center gap-(--espacio-1) font-bold">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          {m.ubicacion ?? 'sin capturar'}
        </span>
      ),
    },
  ];
}

export function Mostrador({
  filasIniciales,
  clienteInicial,
  cajaCerrada = false,
  consultaInicial = '',
}: MostradorProps) {
  const voc = useVocabulario();
  const enrutador = useRouter();
  const [filas, setFilas] = useState<readonly MaterialDeMostrador[] | null>(filasIniciales ?? null);
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [consulta, setConsulta] = useState(consultaInicial);
  const [partidas, setPartidas] = useState<readonly Partida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ventaAbierta, setVentaAbierta] = useState(false);
  /** El folio de la última nota mandada: lo que el cliente canta en la caja. */
  const [folioEnCaja, setFolioEnCaja] = useState<string | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  const [cliente, setCliente] = useState<ClienteDeMostrador | null>(clienteInicial ?? null);
  /** Obra, autorizado y quien firma: lo que la remisión necesita del que se eligió. */
  const [eleccion, setEleccion] = useState<Omit<EleccionDeCliente, 'cliente'> | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  /**
   * La nota que ya se mandó a la caja para ESTA remisión. Si la remisión falla —la mora,
   * la red— la nota se queda en la caja por cobrar; volver a F11 la reusa en vez de
   * crear otra: antes cada intento dejaba una nota más en la caja.
   */
  const [notaEnCaja, setNotaEnCaja] = useState<ResultadoNotaMostrador | null>(null);
  /** El muro de la mora, dicho con lo que hay que hacer. */
  const [bloqueo, setBloqueo] = useState<string | null>(null);
  const [avisoDeEspera, setAvisoDeEspera] = useState<string | null>(null);
  const textoDeEspera = useSyncExternalStore(suscribirseALaEspera, textoDeLaEspera, () => null);
  const enEspera = useMemo(() => notasEnEspera(textoDeEspera), [textoDeEspera]);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    let vivo = true;
    // El índice se hidrata una vez al abrir, de la vista `materiales_mostrador`:
    // precio y existencia EN VIVO, y los atributos con su valor original.
    consultarPuente<MaterialDeMostrador>('MaterialMostrador', { limite: 6000 })
      .then((leidas) => {
        if (!vivo) return;
        setFilas(leidas);
        // LA NOTA QUE YA IBA y lo que la ficha dejó, en cuanto hay catálogo contra el
        // cual reconocerlos. Una sola vez: después, la nota la lleva esta pantalla.
        if (!rehidratada.current) {
          rehidratada.current = true;
          const recuperadas = partidasRecuperadas(leidas);
          if (recuperadas.length > 0) setPartidas(recuperadas);
        }
      })
      .catch((fallo: unknown) => {
        if (vivo)
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.');
      });
    return () => {
      vivo = false;
    };
  }, [filasIniciales, intento]);

  /** Hasta que la nota guardada se recupera, no se guarda nada: se pisaría con vacío. */
  const rehidratada = useRef(false);
  useEffect(() => {
    if (!rehidratada.current) return;
    guardarLaNota(
      partidas.map((p) => ({
        productoId: p.material.id,
        cantidad: p.cantidad,
        presentacion: p.presentacion,
      })),
    );
  }, [partidas]);

  const palabras = useMemo(
    () =>
      normalizar(consulta)
        .split(' ')
        .filter((p) => p !== ''),
    [consulta],
  );
  const resultados = useMemo(() => buscar(filas ?? [], palabras), [filas, palabras]);
  const total = partidas.reduce((suma, p) => suma + precioDeLaPartida(p) * p.cantidad, 0);
  const sobreLimite = cliente !== null && cliente.saldoCentavos > cliente.limiteCentavos;
  const columnas = useMemo(() => columnasDeResultado(voc.titulo('producto')), [voc]);

  useEffect(() => {
    // Escribir desde cualquier parte va al buscador —la acción principal no gasta
    // ninguna tecla—. Esc limpia la búsqueda; con la búsqueda vacía, la venta.
    function alTeclear(evento: KeyboardEvent): void {
      const enCampo = evento.target instanceof HTMLInputElement;
      if (evento.key === 'Escape') {
        if (consulta === '') setPartidas([]);
        setConsulta('');
        return;
      }
      if (enCampo || evento.ctrlKey || evento.altKey || evento.metaKey) return;
      if (evento.key.length !== 1) return;
      setConsulta((actual) => actual + evento.key);
      buscador.current?.focus();
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [consulta]);

  function agregar(material: MaterialDeMostrador): void {
    // Desde la tabla se agrega la pieza SUELTA; la caja llega desde la ficha.
    const clave = claveDePartida(material.id, null);
    setNotaEnCaja(null);
    setPartidas((actuales) =>
      actuales.some((p) => claveDe(p) === clave)
        ? actuales.map((p) => (claveDe(p) === clave ? { ...p, cantidad: p.cantidad + 1 } : p))
        : [...actuales, { material, cantidad: 1, presentacion: null }],
    );
  }

  function cambiarCantidad(clave: string, paso: number): void {
    setNotaEnCaja(null);
    setPartidas((actuales) =>
      actuales
        .map((p) => (claveDe(p) === clave ? { ...p, cantidad: p.cantidad + paso } : p))
        .filter((p) => p.cantidad > 0),
    );
  }

  /**
   * F5 · LA FICHA de la pieza que se está viendo: el primer resultado, o la última
   * partida si no se está buscando. La nota se queda: vive en la pestaña.
   */
  function abrirLaFicha(): void {
    const pieza = resultados[0] ?? partidas.at(-1)?.material;
    if (pieza === undefined) return;
    enrutador.push(`/ferreteria/ficha-de-pieza?pieza=${encodeURIComponent(pieza.id)}`);
  }

  /** F6 · EL CORTE de la pieza que se está viendo; la pantalla del corte dice si no es de corte. */
  function abrirElCorte(): void {
    const pieza = resultados[0] ?? partidas.at(-1)?.material;
    enrutador.push(
      pieza === undefined
        ? '/ferreteria/corte-de-material'
        : `/ferreteria/corte-de-material?material=${encodeURIComponent(pieza.id)}`,
    );
  }

  /** Las partidas como se guardan: lo que viaja a la cotización y a la espera. */
  function guardables(): PartidaGuardada[] {
    return partidas.map((p) => ({
      productoId: p.material.id,
      cantidad: p.cantidad,
      presentacion: p.presentacion,
    }));
  }

  /** F8 · LA NOTA COMO COTIZACIÓN: la cotización la toma y el mostrador se vacía. */
  function aCotizar(): void {
    if (partidas.length === 0) return;
    dejarParaCotizar(guardables());
    setPartidas([]);
    enrutador.push('/ferreteria/cotizacion');
  }

  /** F9 · APARTAR la nota con un número corto, para atender a otro. */
  function apartar(): void {
    const apartada = apartarNota(enEspera, guardables(), cliente?.nombre ?? null, new Date());
    if (apartada === null) return;
    if (!guardarLasNotasEnEspera(apartada.lista)) {
      setAvisoDeEspera('Este dispositivo no deja guardar: la nota sigue aquí.');
      return;
    }
    setPartidas([]);
    setNotaEnCaja(null);
    setAvisoDeEspera(`Nota apartada: la ${String(apartada.numero)}. Se retoma con su número.`);
  }

  /** Retomar una: si hay otra armada, se aparta primero, para no perderla. */
  function retomar(numero: number): void {
    const base =
      partidas.length === 0
        ? { lista: enEspera, numero: null }
        : (apartarNota(enEspera, guardables(), cliente?.nombre ?? null, new Date()) ?? {
            lista: enEspera,
            numero: null,
          });
    const { lista, nota } = retomarNota(base.lista, numero);
    if (nota === null || filas === null) return;
    if (!guardarLasNotasEnEspera(lista)) return;
    const porId = new Map(filas.map((m) => [m.id, m]));
    setNotaEnCaja(null);
    setPartidas(
      nota.partidas.flatMap((g): Partida[] => {
        const material = porId.get(g.productoId);
        return material === undefined
          ? []
          : [{ material, cantidad: g.cantidad, presentacion: g.presentacion }];
      }),
    );
    setAvisoDeEspera(
      base.numero === null
        ? `Retomada la ${String(numero)}.`
        : `Retomada la ${String(numero)}; la que estaba quedó como la ${String(base.numero)}.`,
    );
  }

  /** Lo que se eligió en la hoja del cliente, en la forma que pinta la franja. */
  function elegirCliente(elegido: EleccionDeCliente): void {
    const { cliente: c, ...resto } = elegido;
    setCliente({
      id: c.id,
      nombre: c.nombre,
      obra: c.obras.find((o) => o.id === resto.obraId)?.nombre ?? null,
      saldoCentavos: c.saldoCentavos,
      limiteCentavos: c.limiteCentavos,
      diasVencido: c.diasVencido,
      recoge: resto.firmante,
      recogeAutorizado: resto.autorizadoId !== null,
    });
    setEleccion(resto);
    setEligiendo(false);
    setNotaEnCaja(null);
    setBloqueo(null);
  }

  function quitarCliente(): void {
    setCliente(null);
    setEleccion(null);
    setNotaEnCaja(null);
    setBloqueo(null);
  }

  /** Crear la nota: el primer paso de las dos salidas del mostrador. */
  async function crearLaNota(): Promise<ResultadoNotaMostrador> {
    return invocarComando<ResultadoNotaMostrador>('/api/venta/mandar-a-caja', {
      clienteId: cliente?.id ?? null,
      ...(eleccion?.obraId == null ? {} : { obraId: eleccion.obraId }),
      partidas: partidas.map((p) => ({
        productoId: p.material.id,
        cantidad: p.cantidad,
        ...(p.presentacion === null ? {} : { presentacionId: p.presentacion.id }),
      })),
    });
  }

  async function mandarACaja(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      const nota = await crearLaNota();
      setPartidas([]);
      // El folio se queda a la vista: es el número que el cliente canta en la caja.
      setFolioEnCaja(nota.folio);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo mandar la venta.');
    } finally {
      setEnviando(false);
    }
  }

  /**
   * La otra salida: se lo lleva a crédito, firmando. Son DOS comandos en fila: la
   * remisión pide una orden que ya exista, y si el segundo falla la nota se queda
   * en la caja como pendiente de cobro —recuperable, y el material no ha salido—.
   */
  async function remisionACuenta(): Promise<void> {
    if (cliente === null) return;
    setEnviando(true);
    setError(null);
    setBloqueo(null);
    try {
      // La que ya se mandó para esta remisión, si el intento anterior falló.
      const nota = notaEnCaja ?? (await crearLaNota());
      setNotaEnCaja(nota);
      await invocarComando('/api/credito/remision', {
        ordenId: nota.ordenId,
        clienteId: cliente.id,
        importeCentavos: Number(nota.totalCentavos),
        nombreFirmante: eleccion?.firmante ?? cliente.recoge ?? cliente.nombre,
        ...(eleccion?.obraId == null ? {} : { obraId: eleccion.obraId }),
        ...(eleccion?.autorizadoId == null ? {} : { autorizadoId: eleccion.autorizadoId }),
      });
      setPartidas([]);
      setFolioEnCaja(null);
      setNotaEnCaja(null);
    } catch (fallo) {
      // El muro de la mora llega como 403 con su código de dominio, que no está en el
      // contrato de la ruta: se compara como texto.
      if (fallo instanceof ErrorApi && esElMuroDeLaMora(fallo.error.codigo)) {
        setBloqueo(fallo.error.mensaje);
      } else {
        setError(fallo instanceof Error ? fallo.message : 'No se pudo registrar la remisión.');
      }
    } finally {
      setEnviando(false);
    }
  }

  /**
   * F12 manda a caja y F11 remite a cuenta, con las MISMAS guardas que sus botones.
   * Iban impresas en ellos sin que el teclado las escuchara (C.5 de la 2.4): un atajo
   * que se anuncia y no responde es un botón muerto.
   */
  const alTeclearFuncion = useEffectEvent((evento: KeyboardEvent) => {
    if (evento.key === 'F5') {
      // F5 del navegador recarga; aquí abre la ficha, como dice su botón.
      evento.preventDefault();
      abrirLaFicha();
      return;
    }
    if (evento.key === 'F6') {
      evento.preventDefault();
      abrirElCorte();
      return;
    }
    if (evento.key === 'F8' || evento.key === 'F9') {
      evento.preventDefault();
      if (enviando || partidas.length === 0) return;
      if (evento.key === 'F8') aCotizar();
      else apartar();
      return;
    }
    if (evento.key !== 'F12' && evento.key !== 'F11') return;
    evento.preventDefault();
    if (enviando || partidas.length === 0) return;
    if (evento.key === 'F12' && !cajaCerrada) void mandarACaja();
    if (evento.key === 'F11' && cliente !== null) void remisionACuenta();
  });

  useEffect(() => {
    window.addEventListener('keydown', alTeclearFuncion);
    return () => {
      window.removeEventListener('keydown', alTeclearFuncion);
    };
  }, []);

  const columnasDeLaNota: readonly ColumnaDeTabla<Partida>[] = [
    {
      clave: 'partida',
      titulo: voc.titulo('producto'),
      celda: (p) => (
        <span className="flex flex-col">
          <span className="font-medium">
            {p.material.nombre} {p.material.medida}
          </span>
          <span className="text-xs text-texto-sutil">
            <Cifra
              valor={p.cantidad}
              unidad={p.presentacion?.etiqueta ?? p.material.unidad}
              tamano="xs"
            />{' '}
            × <Dinero centavos={precioDeLaPartida(p)} tamano="xs" />
          </span>
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (p) => <Dinero centavos={precioDeLaPartida(p) * p.cantidad} tamano="sm" />,
    },
    {
      clave: 'acciones',
      titulo: 'Cantidad',
      celda: (p) => (
        <span className="flex justify-end gap-(--espacio-1)">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Quitar una pieza de ${p.material.nombre}`}
            onClick={() => {
              cambiarCantidad(claveDe(p), -1);
            }}
          >
            <Minus />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            aria-label={`Agregar una pieza de ${p.material.nombre}`}
            onClick={() => {
              cambiarCantidad(claveDe(p), 1);
            }}
          >
            <Plus />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Quitar la partida ${p.material.nombre}`}
            onClick={() => {
              cambiarCantidad(claveDe(p), -p.cantidad);
            }}
          >
            <X />
          </Button>
        </span>
      ),
    },
  ];

  const busqueda = (() => {
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudo leer el catálogo del mostrador"
          queHacer="Sin el índice no se encuentra nada. Revisa la conexión y vuelve a leerlo; lo que ya está en la nota no se pierde."
          detalle={falloDeCarga}
          reintentar={
            <Button
              onClick={() => {
                setFalloDeCarga(null);
                setFilas(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        />
      );
    }
    // La forma de la tabla, nunca una rueda: el ojo ya sabe dónde va a mirar.
    if (filas === null) return <EsqueletoDeLista filas={6} />;
    if (palabras.length === 0) {
      return (
        <section aria-label="Punto de partida" className="flex flex-col gap-(--espacio-3)">
          <div className="grid grid-cols-2 gap-(--espacio-2) sm:grid-cols-4">
            {GRUPOS.map((grupo) => (
              <Superficie
                key={grupo}
                como="button"
                type="button"
                interactiva
                relleno={3}
                radio="md"
                className="min-h-20 text-sm font-semibold"
                onClick={() => {
                  setConsulta(grupo);
                }}
              >
                {grupo}
              </Superficie>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-(--espacio-2)">
            <span className="text-sm text-texto-sutil">Listas de trabajo:</span>
            {LISTAS.map((lista) => (
              <Button
                key={lista}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setConsulta(lista);
                }}
              >
                para un {lista}
              </Button>
            ))}
          </div>
        </section>
      );
    }
    if (resultados.length === 0) {
      // La pantalla que salva o pierde la venta. Nunca dice «no hay» y ya.
      return (
        <Vacio
          titulo="No tenemos de esa medida."
          explicacion="Pero éstas le pueden servir — son de la misma familia, no equivalencias declaradas:"
          accion={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Con el enrutador y no recargando: las partidas que ya llevaba
                // tienen que seguir ahí al volver del alta.
                enrutador.push(`/ferreteria/catalogo?alta=${encodeURIComponent(consulta)}`);
              }}
            >
              Dar de alta {voc.enFraseCon('este', 'producto')}
            </Button>
          }
          className="items-stretch text-left"
        >
          <TablaAdaptable
            etiqueta="Materiales de la misma familia"
            principal="material"
            columnas={columnas}
            filas={cercanas(filas, palabras)}
            claveDe={(m) => m.id}
            alActivar={(id) => {
              const material = filas.find((m) => m.id === id);
              if (material !== undefined) agregar(material);
            }}
            tonoDeFila={(m) => (m.existencia <= 0 ? 'tenue' : undefined)}
          />
        </Vacio>
      );
    }
    return (
      <>
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={abrirLaFicha}>
            <Maximize2 aria-hidden="true" />
            Ficha de {nombreParaLaFicha(resultados[0])} · F5
          </Button>
        </div>
        <TablaAdaptable
          etiqueta="Resultados"
          principal="material"
          columnas={columnas}
          filas={resultados}
          claveDe={(m) => m.id}
          alActivar={(id) => {
            const material = resultados.find((m) => m.id === id);
            if (material !== undefined) agregar(material);
          }}
          // Se atenúa, pero NO se esconde: saber que el material existe aunque no
          // haya permite decir «te lo pido para el jueves», que es una venta.
          tonoDeFila={(m) => (m.existencia <= 0 ? 'tenue' : undefined)}
          alto="max-h-[65vh]"
        />
      </>
    );
  })();

  return (
    <div className="p-(--espacio-3) pb-[calc(var(--espacio-12)*2)] xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start xl:gap-(--espacio-4) xl:pb-(--espacio-3)">
      <h1 className="sr-only">Mostrador</h1>

      {/* TERCIARIO · arriba a la derecha en PC, arriba del todo en el pasillo: se
          lee antes de despachar, que es cuando sirve. */}
      <Superficie
        como="section"
        relleno={3}
        radio="md"
        aria-label={`${voc.titulo('cliente')} y obra`}
        className={`mb-(--espacio-3) text-sm xl:col-start-2 xl:row-start-1 xl:mb-0 ${sobreLimite ? 'border-peligro bg-peligro/10' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-(--espacio-2)">
          <p className="font-semibold">{cliente?.nombre ?? 'Público en general · contado'}</p>
          <span className="flex gap-(--espacio-1)">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setEligiendo(true);
              }}
            >
              <UserRound aria-hidden="true" />
              {cliente === null ? 'A cuenta de…' : 'Cambiar'}
            </Button>
            {cliente !== null && (
              <Button type="button" size="sm" variant="ghost" onClick={quitarCliente}>
                Público
              </Button>
            )}
          </span>
        </div>
        {cliente !== null && (
          <>
            <p className="text-texto-sutil">Obra: {cliente.obra ?? 'sin obra asignada'}</p>
            <p>
              Debe <Dinero centavos={cliente.saldoCentavos} tamano="sm" /> ·{' '}
              <Cifra valor={cliente.diasVencido} unidad="d" tamano="sm" /> · límite{' '}
              <Dinero centavos={cliente.limiteCentavos} tamano="sm" />
            </p>
            {/* El color no es el único portador: la condición va escrita. */}
            {sobreLimite && (
              <p className="font-semibold">Sobre su límite · pide PIN para crédito</p>
            )}
            <p className={cliente.recogeAutorizado ? '' : 'font-semibold'}>
              Recoge: {cliente.recoge ?? '—'}{' '}
              {cliente.recogeAutorizado
                ? '· autorizado'
                : '· NO está en la lista. ¿Le hablas antes de despachar?'}
            </p>
          </>
        )}
      </Superficie>

      <main className="flex flex-col gap-(--espacio-3) xl:col-start-1 xl:row-span-2 xl:row-start-1">
        <div className="relative">
          <label htmlFor="buscador" className="sr-only">
            Buscar {voc.singular('producto')} por nombre, medida, acabado o marca
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            id="buscador"
            ref={buscador}
            autoFocus
            value={consulta}
            onChange={(evento) => {
              setConsulta(evento.target.value);
            }}
            placeholder="tornillo 1/4 x 2"
            className="h-[calc(var(--altura-control)*1.25)] pl-(--espacio-10) text-lg"
          />
        </div>

        {/* Miga de pan: enseña dónde estás y se quita POR PARTES, que es como se
            corrige una búsqueda que se pasó de estrecha. */}
        {palabras.length > 0 && (
          <nav aria-label="Filtros de la búsqueda" className="flex flex-wrap gap-(--espacio-1)">
            {palabras.map((palabra, indice) => (
              <Button
                key={`${palabra}-${String(indice)}`}
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`Quitar el filtro ${palabra}`}
                onClick={() => {
                  setConsulta(palabras.filter((_, i) => i !== indice).join(' '));
                }}
              >
                {palabra}
                <X aria-hidden="true" />
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setConsulta('');
              }}
            >
              limpiar
            </Button>
          </nav>
        )}

        {cajaCerrada && (
          <Aviso tono="atencion" titulo="La caja está cerrada.">
            Se arman notas y cotizaciones; no se cobra.
          </Aviso>
        )}
        {error !== null && (
          <Aviso tono="peligro" titulo={error}>
            Lo que ya estaba en pantalla sigue sirviendo.
          </Aviso>
        )}
        {bloqueo !== null && cliente !== null && (
          <Aviso tono="atencion" titulo="Bloqueado por mora: hace falta la llave del dueño.">
            {bloqueo} El dueño o el administrador la da con SU usuario en Cuentas › {cliente.nombre}{' '}
            › La llave del dueño, por{' '}
            <Dinero centavos={Number(notaEnCaja?.totalCentavos ?? total)} tamano="sm" />. Con la
            llave dada, vuelve a F11: la nota {notaEnCaja?.folio ?? ''} ya está en la caja y se usa
            la misma.
          </Aviso>
        )}

        {busqueda}
      </main>

      {/* SECUNDARIO · siempre visible en PC, plegado en una barra en el pasillo. */}
      <Superficie
        como="aside"
        id="la-venta"
        relleno={3}
        radio="md"
        aria-label={voc.conArticulo('orden')}
        className={`${ventaAbierta ? 'fixed inset-x-0 bottom-0 z-20 flex max-h-[70dvh] overflow-y-auto' : 'hidden xl:flex'} flex-col gap-(--espacio-3) xl:static xl:col-start-2 xl:row-start-2 xl:max-h-none`}
      >
        {/* «La venta» es de la tiendita: en una ferretería lo que se arma en el
            pasillo es una NOTA, y es la palabra que el cliente oye en la caja. */}
        <h2 className="text-sm font-semibold text-texto-sutil uppercase">
          {voc.conArticulo('orden')}
        </h2>
        <Tabla
          etiqueta={`Partidas de ${voc.conArticulo('orden').toLowerCase()}`}
          columnas={columnasDeLaNota}
          filas={partidas}
          claveDe={claveDe}
          alto="max-h-[40vh]"
          vacio={
            <Vacio
              titulo="Todavía nada."
              explicacion={`Busque ${voc.enFrase('producto')} y presione Enter sobre el resultado.`}
              className="py-(--espacio-4)"
            />
          }
        />

        {/* Legible de reojo, y NO lo más grande de la pantalla. */}
        <p className="flex items-baseline justify-between">
          <span className="text-sm text-texto-sutil">{partidas.length} partidas</span>
          <Dinero centavos={total} tamano="lg" />
        </p>

        <div className="grid gap-(--espacio-2)">
          <Button
            type="button"
            disabled={partidas.length === 0 || cajaCerrada || enviando}
            cargando={enviando}
            onClick={() => {
              void mandarACaja();
            }}
          >
            Mandar a caja · F12
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={cliente === null || partidas.length === 0 || enviando}
            onClick={() => {
              void remisionACuenta();
            }}
          >
            {sobreLimite ? 'Remisión a cuenta · pasa del límite · F11' : 'Remisión a cuenta · F11'}
          </Button>
          <div className="grid grid-cols-3 gap-(--espacio-1)">
            <Button type="button" variant="ghost" size="sm" onClick={abrirElCorte}>
              <Scissors aria-hidden="true" />
              Cortar · F6
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={partidas.length === 0 || enviando}
              onClick={aCotizar}
            >
              <FileText aria-hidden="true" />
              Cotizar · F8
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={partidas.length === 0 || enviando}
              onClick={apartar}
            >
              <Clock aria-hidden="true" />
              Apartar · F9
            </Button>
          </div>
          {avisoDeEspera !== null && (
            <p role="status" className="text-sm font-medium">
              {avisoDeEspera}
            </p>
          )}
          {enEspera.length > 0 && (
            <section aria-label="Notas en espera" className="flex flex-col gap-(--espacio-1)">
              <h3 className="text-xs font-semibold text-texto-sutil uppercase">En espera</h3>
              {enEspera.map((nota) => (
                <Button
                  key={nota.numero}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-between"
                  disabled={filas === null}
                  onClick={() => {
                    retomar(nota.numero);
                  }}
                >
                  <span>Retomar la {nota.numero}</span>
                  <span className="text-texto-sutil">
                    {nota.quien ?? `${String(nota.partidas.length)} partidas`}
                  </span>
                </Button>
              ))}
            </section>
          )}
          {/* El número, grande y en su sitio: es lo único que el cliente se lleva
              del mostrador, y va a decirlo en voz alta a tres metros. */}
          {folioEnCaja !== null && (
            <Aviso tono="exito" titulo={`${voc.titulo('orden')} ${folioEnCaja} está en la caja.`}>
              <span className="block font-numeros text-3xl font-bold text-texto">
                {folioEnCaja}
              </span>
              Es lo que el cliente dice al pagar.
            </Aviso>
          )}
        </div>
      </Superficie>

      <ElegirClienteDelMostrador
        abierto={eligiendo}
        alCerrar={() => {
          setEligiendo(false);
        }}
        alElegir={elegirCliente}
      />

      <button
        type="button"
        aria-expanded={ventaAbierta}
        aria-controls="la-venta"
        onClick={() => {
          setVentaAbierta((abierta) => !abierta);
        }}
        className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-borde bg-primario p-(--espacio-3) text-primario-texto xl:hidden"
      >
        <span>{partidas.length} partidas</span>
        <span className="flex items-center gap-(--espacio-2) font-semibold">
          <Dinero centavos={total} />
          {ventaAbierta ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
}
