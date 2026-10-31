'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dialog, DialogContent, DialogTitle } from '@morphiqpos/ui/primitivas/dialog';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Sheet, SheetContent, SheetTitle } from '@morphiqpos/ui/primitivas/sheet';
import {
  Aviso,
  BarraFija,
  Dinero,
  ErrorDePantalla,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  dineroEnTexto,
} from '@morphiqpos/ui/sistema';
import {
  ArrowLeft,
  Minus,
  Plus,
  Search,
  Send,
  Split,
  TriangleAlert,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ViewTransition, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { consultarPuente, invocarComando, nuevaClave } from '~/cliente/api';
import { valorDelPuente } from '~/cliente/dinero-del-puente';
import { AccionesDeLaMesa } from './AccionesDeLaMesa';
import { puedeAjustarLaCuenta } from './ajustes-de-la-cuenta-por-rol.ts';
import { AnularLineaDialog } from './AnularLineaDialog';
import {
  ESTADOS_DE_MESA,
  EsqueletoDeLaComanda,
  SIN_LINEAS,
  columnasDeLoEnviado,
  columnasDelBorrador,
  importeDe,
  leerLoEnviado,
  precioDe,
  type LineaEnviada,
  type MesaAbierta,
  type MesaActivaProps,
  type ProductoDeComanda,
} from './comanda-de-la-mesa';
import { DividirCuentaDialog } from './DividirCuentaDialog';
import { lineasDelEnvio } from './envio-a-cocina';
import { ListosParaRecoger, useListosDeLaCuenta } from './ListosParaRecoger';
import { useRolDeLaSesion } from './rol-de-la-sesion';
import { liberarMesaConPregunta, useUnionDeLaMesa } from './unir-mesas';
import { useVocabulario } from '~/cliente/vocabulario';
import { sonar } from '~/sonidos/gestor';

/** PANTALLA · restaurante · mesa-activa (en la primera línea: `verify:cobertura` lee 60)
 *
 * La comanda. 80-200 veces al día por mesero. No es una pantalla nueva: es la
 * mesa, abierta. Jerarquía (`04-INTERFAZ`): ENVIAR A COCINA, lo pedido, el
 * catálogo y, al final, el total — el mesero no cobra.
 *
 * ── La mesa se expande a la cuenta ───────────────────────────────────────
 * La cabecera lleva `<ViewTransition>` con `VIAJE.mesa(id)`, el MISMO nombre que
 * la tesela de `MapaDeMesas`: la tesela crece hasta ser esta barra. Por eso se
 * pinta desde el primer instante, con el id de la dirección y antes de que llegue
 * la mesa: si naciera después, el navegador no tendría con quién emparejarla.
 *
 * ── «Cuenta actual» y «Agregar a la cuenta» son DOS bloques ──────────────
 * Lo mandado a cocina no se puede confundir con lo que está por mandarse: en una
 * sola lista el mesero reenvía platillos —el error más caro del turno—. Por eso
 * son dos tablas: la línea del borrador se quita, la enviada sólo se ANULA.
 *
 * ── «Listos para recoger» va arriba de todo ──────────────────────────────
 * Es información que CADUCA, y el catálogo no. Lleva el acento, el tinte con el
 * que el mapa pinta la mesa con la comida lista. La pantalla LEE las comandas de su
 * cuenta cada pocos segundos —cocina marca desde otra pantalla— y ofrece entregarlas
 * (`ListosParaRecoger`); antes lo recibía por props que ninguna página pasaba, y el
 * bloque no se pintaba nunca. En tableta es una franja sobre el catálogo, sin abrir
 * la hoja; en PC, lo primero del panel.
 *
 * ── Lo que quita dinero no se le ofrece al mesero ───────────────────────
 * «Anular» y «Dividir» son de caja y de dirección: al mesero se las enseñaba y el
 * servidor las negaba. Ahora sólo las ve quien puede (`puedeAjustarLaCuenta`).
 *
 * ── En tablet el pedido es una HOJA, no un panel lateral ─────────────────
 * El mesero sostiene la tablet con la izquierda y opera con el pulgar derecho:
 * el botón flotante vive en el borde inferior derecho. Y como con la hoja
 * cerrada no se ve el borrador, cada tesela lleva su cuenta en la esquina.
 *
 * ── Idempotencia y dinero ────────────────────────────────────────────────
 * Una clave por envío, que sólo se renueva cuando el envío triunfa: dos toques
 * no mandan dos comandas. El puente entrega pesos; se pasan a centavos por
 * `centavosDe` —la unidad la decide la conversión del campo— y se suma en centavos.
 *
 * ── Recortado, y queda dicho ─────────────────────────────────────────────
 * Fuera: las pestañas de categoría, la nota de la comanda, «Solicitar cuenta»
 * (pantalla propia: Precuenta), la mesa huérfana y el tiempo de servicio.
 * «Listos» entra por props hasta que el puente filtre la cocina por orden. Y no
 * van costos, márgenes, descuentos ni el cobro: esa separación es control interno.
 */

/** Para cuántas personas se puede abrir, como mucho. */
const PERSONAS_MAXIMAS = 20;

/** Los estados de una mesa que NO está en servicio (los mismos de `apagarSoloSi` del puente). */
const FUERA_DE_SERVICIO: readonly string[] = ['libre', 'limpieza', 'pagada', 'cancelada'];

const volverAlMapa = (): void => {
  window.history.back();
};

export type {
  LineaEnviada,
  MesaAbierta,
  MesaActivaProps,
  ProductoDeComanda,
} from './comanda-de-la-mesa';

export function MesaActiva(props: MesaActivaProps) {
  const voc = useVocabulario();
  const { mesaInicial, productosIniciales } = props;
  /** Desde el primer render: da nombre al viaje antes de que llegue la mesa. */
  const idDeLaDireccion = useSearchParams().get('mesa');
  const router = useRouter();
  const [mesa, setMesa] = useState<MesaAbierta | null>(mesaInicial ?? null);
  // DP-9.6: si esta mesa encabeza un grupo vivo, su pantalla ofrece «Separar mesas».
  const [versionDelGrupo, setVersionDelGrupo] = useState(0);
  const grupo = useUnionDeLaMesa(mesa?.id ?? null, versionDelGrupo);
  const unionId = grupo?.unionId ?? null;
  const [productos, setProductos] = useState<readonly ProductoDeComanda[] | null>(
    productosIniciales ?? (mesaInicial === undefined ? null : []),
  );
  const [enviadas, setEnviadas] = useState<readonly LineaEnviada[]>(props.lineasIniciales ?? []);
  /**
   * Lo enviado NO se pudo leer nunca: no hay «último dato conocido» que enseñar, y
   * pintar el vacío de mesa recién abierta haría que el mesero lo volviera a mandar.
   */
  const [falloLineas, setFalloLineas] = useState<string | null>(null);
  const [releyendo, setReleyendo] = useState(false);
  /** Producto → cantidad todavía sin enviar. Nunca se muta: se recrea. */
  const [borrador, setBorrador] = useState<Readonly<Record<string, number>>>({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [falloEnvio, setFalloEnvio] = useState(false);
  /** Lo que contestó el servidor al rechazar el envío: «vuelve a intentar» solo no basta. */
  const [motivoDelFallo, setMotivoDelFallo] = useState<string | null>(null);
  const [hoja, setHoja] = useState(false);
  /** Para cuántas personas se abre. Dos es la mesa más común de un comedor. */
  const [personasAlAbrir, setPersonasAlAbrir] = useState(2);
  const [abriendo, setAbriendo] = useState(false);
  const [liberando, setLiberando] = useState(false);
  /** F-324 · La línea que se anula: una línea, no un «está abierto» compartido. */
  const [anulando, setAnulando] = useState<LineaEnviada | null>(null);
  /** F-321 · Dividir la cuenta. Sólo se ofrece cuando hay algo que repartir. */
  const [dividiendo, setDividiendo] = useState(false);
  /**
   * Cada vez que se abre «Dividir», un diálogo NUEVO. Se queda montado para poder cerrar
   * con su animación, y así sus partes sobrevivían de una apertura a la otra: tras dividir,
   * lo que se había repartido apuntaba a líneas que ya no existían.
   */
  const [aperturaDeDividir, setAperturaDeDividir] = useState(0);
  /** Cada lectura es un número: «Volver a intentar» lo sube y el efecto relee. */
  const [intento, setIntento] = useState(0);
  const claveEnvio = useRef(nuevaClave());
  const refBusqueda = useRef<HTMLInputElement>(null);
  // Lo que cocina dejó en la ventana: se LEE de las comandas de la cuenta. Cuando la prueba
  // de la pantalla pasa `listosIniciales` no hay red: lo suyo se respeta tal cual.
  const delaCocina = useListosDeLaCuenta(
    mesa?.venta_activa_id ?? null,
    props.listosIniciales !== undefined,
  );
  const listos = props.listosIniciales ?? delaCocina.listos.map((platillo) => platillo.nombre);
  const platillosListos =
    props.listosIniciales === undefined
      ? delaCocina.listos
      : props.listosIniciales.map((nombre) => ({ nombre, cantidad: 1 }));
  const hayAlgoQueDecirDeLaVentana =
    platillosListos.length > 0 ||
    delaCocina.falloDeEntrega !== null ||
    delaCocina.falloDeLectura !== null;
  const rol = useRolDeLaSesion();
  const puedeAjustar = puedeAjustarLaCuenta(rol);

  useEffect(() => {
    if (mesaInicial !== undefined) return;
    // La señal de aborto, no un `let vivo`: además CANCELA las consultas en vuelo.
    const control = new AbortController();
    const señal = control.signal;
    void (async () => {
      try {
        const [mesas, catalogo] = await Promise.all([
          consultarPuente<MesaAbierta>('Mesa', {
            filtro: { id: idDeLaDireccion },
            limite: 1,
            signal: señal,
          }),
          consultarPuente<ProductoDeComanda>('ProductoTerminado', { limite: 300, signal: señal }),
        ]);
        const orden = mesas[0]?.venta_activa_id ?? null;
        // Lo enviado se lee ANTES de pintar la comanda: sin ello, «Cuenta actual»
        // diría «toca un platillo para empezar» sobre una cuenta que ya los lleva.
        const loEnviado =
          orden === null ? SIN_LINEAS : await leerLoEnviado(orden, { signal: señal });
        if (señal.aborted) return;
        setMesa(mesas[0] ?? null);
        setProductos(catalogo);
        if (loEnviado.leidas) {
          setEnviadas(loEnviado.lineas);
          setFalloLineas(null);
        } else {
          setFalloLineas(
            loEnviado.fallo instanceof Error
              ? loEnviado.fallo.message
              : `No se pudo leer ${voc.enFrase('orden')}.`,
          );
        }
      } catch (fallo: unknown) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (señal.aborted) return;
        setError(
          fallo instanceof Error
            ? fallo.message
            : `No se pudo leer ${voc.enFrase('unidad_servicio')}.`,
        );
      }
    })();
    return () => {
      control.abort();
    };
  }, [mesaInicial, voc, idDeLaDireccion, intento]);

  // Una mesa UNIDA a otra no tiene cuenta propia —su consumo pasó a la principal— y el servidor
  // la tiene en servicio: no está libre ni se abre. Decirle «libre» y ofrecer abrirla terminaba en
  // un rechazo del servidor (D-4, cierre del 21-10).
  const enGrupo =
    mesa !== null && mesa.venta_activa_id === null && !FUERA_DE_SERVICIO.includes(mesa.estado);
  const mesaLibre = mesa !== null && mesa.venta_activa_id === null && !enGrupo;
  // Cobrada y sin recoger: no hay comanda que levantar ni cuenta que pedir, sólo limpiarla.
  const porLimpiar = mesa !== null && mesa.estado === 'limpieza';
  const comandaVisible = productos !== null && !mesaLibre && !porLimpiar && !enGrupo;

  useEffect(() => {
    // Sólo con teclado físico (en la tablet el teclado en pantalla taparía el
    // catálogo), y cuando el catálogo APARECE: antes no hay campo que enfocar.
    if (!comandaVisible) return;
    if (window.matchMedia('(min-width: 1280px)').matches) refBusqueda.current?.focus();
  }, [comandaVisible]);

  const catalogo = productos ?? [];
  const texto = busqueda.trim().toLocaleLowerCase('es-MX');
  const visibles = catalogo.filter((p) => p.nombre.toLocaleLowerCase('es-MX').includes(texto));
  const pendientes = catalogo.filter((p) => (borrador[p.id] ?? 0) > 0);
  const piezas = Object.values(borrador).reduce((s, n) => s + n, 0);
  const cantidadDe = (p: ProductoDeComanda): number => borrador[p.id] ?? 0;
  const total =
    enviadas.reduce((s, l) => s + importeDe(l), 0) +
    pendientes.reduce((s, p) => s + precioDe(p) * cantidadDe(p), 0);
  const alergias = mesa?.notas_alergias ?? null;
  const sinEnviar = piezas === 0 || enviando;

  /** Sumar es tocar el platillo; restar, el botón de su línea. */
  const tocar = (productoId: string, delta: number) => () => {
    // DP-11.3: fuera del actualizador (StrictMode lo corre dos veces).
    const queda = (borrador[productoId] ?? 0) + delta;
    sonar(delta > 0 ? 'agregar' : queda > 0 ? 'cantidad' : 'quitar');
    setBorrador((actual) => {
      const siguiente = { ...actual, [productoId]: (actual[productoId] ?? 0) + delta };
      return Object.fromEntries(Object.entries(siguiente).filter(([, n]) => n > 0));
    });
  };

  function reintentar(): void {
    setError(null);
    setProductos(null);
    setIntento((previo) => previo + 1);
  }

  /**
   * ABRIR LA MESA, cuando se llega a una libre. Vive aquí y no en el mapa porque
   * «¿cuántas personas?» es el PRIMER DATO DE LA COMANDA: decide el reparto de la
   * cuenta y el tiempo de servicio, y se contesta ya mirando el catálogo.
   */
  async function abrirLaMesa(): Promise<void> {
    if (mesa?.venta_activa_id != null) return;
    if (mesa === null) return;
    setAbriendo(true);
    setError(null);
    try {
      await invocarComando('/api/restaurante/abrir-mesa', {
        mesaId: mesa.id,
        personas: personasAlAbrir,
      });
      // Se vuelve a leer la mesa en vez de suponer su nuevo estado: la apertura
      // escribe el estado, la cuenta y la hora, y el encabezado los enseña.
      const frescas = await consultarPuente<MesaAbierta>('Mesa', {
        filtro: { id: mesa.id },
        limite: 1,
      });
      setMesa(frescas[0] ?? mesa);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo abrir la mesa.');
    } finally {
      setAbriendo(false);
    }
  }

  /**
   * «MESA LIMPIA»: la mesa cobrada vuelve al servicio. El cobro la deja en limpieza a propósito
   * —hay platos encima— y el paso a libre es de quien la limpia (`restaurante.liberar_mesa`).
   * Las pantallas del modelo no lo ofrecían: el mesero tenía que irse a la pantalla heredada de
   * «Meseros», y mientras tanto la mesa no se podía volver a abrir.
   */
  async function liberarLaMesa(): Promise<void> {
    if (mesa === null) return;
    setLiberando(true);
    setError(null);
    try {
      // DP-9.6: si es la principal de mesas unidas, pregunta «¿Separar o dejarlas unidas?».
      const liberada = await liberarMesaConPregunta(
        mesa.id,
        (entrada) => invocarComando('/api/restaurante/liberar-mesa', entrada),
        unionId !== null,
      );
      if (!liberada) return;
      // Se vuelve a leer la mesa en vez de suponer su estado: queda libre y sin cuenta.
      const frescas = await consultarPuente<MesaAbierta>('Mesa', {
        filtro: { id: mesa.id },
        limite: 1,
      });
      setMesa(frescas[0] ?? mesa);
      setEnviadas([]);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo liberar la mesa.');
    } finally {
      setLiberando(false);
    }
  }

  async function enviarACocina(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null || pendientes.length === 0) return;
    setEnviando(true);
    setFalloEnvio(false);
    const clave = claveEnvio.current;
    // La cantidad viaja como CADENA decimal, que es lo que el comando acepta
    // (`envio-a-cocina.ts`): como número, no llegaba a cocina ni una comanda.
    const lineas = lineasDelEnvio(borrador);
    try {
      const entrada = { ordenId: orden, lineas };
      await invocarComando('/api/restaurante/enviar-pedido', entrada, { idempotencyKey: clave });
      sonar('enviarACocina');
      // Lo enviado cruza al bloque de arriba con identificadores provisionales;
      // los definitivos llegan con la siguiente lectura de la mesa. La línea imita
      // la fila del puente, así que su `total` va en la unidad del puente: se multiplica
      // en centavos —entero por entero— y `valorDelPuente` lo devuelve a esa forma.
      const nuevas = pendientes.map((p, i) => ({
        id: `${clave}-${String(i)}`,
        producto_nombre: p.nombre,
        cantidad: borrador[p.id] ?? 0,
        total: valorDelPuente('DetalleVenta', 'total', precioDe(p) * (borrador[p.id] ?? 0)),
      }));
      setEnviadas([...enviadas, ...nuevas]);
      setBorrador({});
      setHoja(false);
      claveEnvio.current = nuevaClave();
      // Y los definitivos, del servidor: anular o dividir una línea provisional mandaría
      // un identificador que no existe.
      void recargarLineas();
    } catch (fallo: unknown) {
      // Nunca se traga: una comanda perdida en silencio es un plato que no sale. Y se
      // dice POR QUÉ: un rechazo de forma no lo arregla reintentar.
      setMotivoDelFallo(fallo instanceof Error ? fallo.message : null);
      setFalloEnvio(true);
    } finally {
      setEnviando(false);
    }
  }

  const enviar = (): void => {
    void enviarACocina();
  };
  const abrirHoja = (): void => {
    setHoja(true);
  };
  const buscar = (e: ChangeEvent<HTMLInputElement>): void => {
    setBusqueda(e.target.value);
  };

  /**
   * Tras anular o dividir, la cuenta se RELEE: una división reparte líneas entre
   * cuentas nuevas y sólo el servidor sabe cuáles se quedaron en la madre.
   */
  async function recargarLineas(): Promise<void> {
    const orden = mesa?.venta_activa_id ?? null;
    if (orden === null) return;
    // Si nunca se leyeron, el fallo se queda en su bloque: arriba diría «se muestra
    // el último dato conocido», y no hay ninguno.
    const nuncaSeLeyeron = falloLineas !== null;
    setReleyendo(true);
    const loEnviado = await leerLoEnviado(orden);
    setReleyendo(false);
    if (loEnviado.leidas) {
      setEnviadas(loEnviado.lineas);
      setFalloLineas(null);
      return;
    }
    const mensaje =
      loEnviado.fallo instanceof Error
        ? loEnviado.fallo.message
        : `No se pudo releer ${voc.enFrase('orden')}.`;
    if (nuncaSeLeyeron) setFalloLineas(mensaje);
    else setError(mensaje);
  }

  const abrirAnular = (linea: LineaEnviada) => () => {
    setAnulando(linea);
  };
  const cerrarAnular = (): void => {
    setAnulando(null);
  };
  const abrirDividir = (): void => {
    setAperturaDeDividir((n) => n + 1);
    setDividiendo(true);
  };
  const cerrarDividir = (): void => {
    setDividiendo(false);
  };
  const traslaAnulacion = (): void => {
    setAnulando(null);
    void recargarLineas();
  };
  const traslaDivision = (): void => {
    setDividiendo(false);
    void recargarLineas();
  };
  const releerLoEnviado = (): void => {
    void recargarLineas();
  };
  /** La cuenta se mudó: se abre la mesa de destino, que es donde ahora vive. */
  const alCambiarDeMesa = (destino: string): void => {
    router.replace(`/restaurante/mesa-activa?mesa=${encodeURIComponent(destino)}`);
  };
  /** Sin lo enviado no hay total: sumar sólo el borrador daría un total que no es. */
  const totalConocido = falloLineas === null;

  const numero = mesa === null ? '—' : String(mesa.numero);
  const personasDeLaMesa = mesa?.personas_actuales ?? null;
  const mesaId = mesa?.id ?? idDeLaDireccion;

  /* ── La cabecera: la mesa, abierta. Es el DESTINO del viaje del mapa. ───── */
  const barra = (
    <BarraFija className="border-b border-borde">
      <header className="flex flex-wrap items-center gap-x-(--espacio-3) gap-y-(--espacio-2) px-(--espacio-3) py-(--espacio-2)">
        <Button variant="ghost" size="icon" aria-label="Volver al mapa" onClick={volverAlMapa}>
          <ArrowLeft />
        </Button>
        {/* El número es lo más grande: es lo que se grita en el salón. */}
        <h1 className="text-2xl font-bold">
          {voc.titulo('unidad_servicio')}{' '}
          <span className="font-numeros tabular-nums">{numero}</span>
        </h1>
        {mesa !== null && (
          <Badge variant="secondary">
            {ESTADOS_DE_MESA[mesa.estado] ?? mesa.estado.replace(/_/g, ' ')}
          </Badge>
        )}
        {grupo !== null && grupo.unidas.length > 0 && (
          <Badge variant="outline">Unida con {grupo.unidas.join(' · ')}</Badge>
        )}
        {personasDeLaMesa !== null && (
          <span className="inline-flex items-center gap-(--espacio-1) text-sm text-texto-sutil">
            <Users aria-hidden="true" className="size-4" />
            {personasDeLaMesa} personas
          </span>
        )}
        {/* Nunca sólo el icono: un error aquí no es un descuadre, es médico. */}
        {alergias !== null && (
          <Badge variant="destructive">
            <TriangleAlert aria-hidden="true" />
            Alergias: {alergias}
          </Badge>
        )}
      </header>
    </BarraFija>
  );
  /* Por FUERA de la barra: el viaje se pone en su primer nodo, la barra entera. */
  const cabecera =
    mesaId === null ? (
      barra
    ) : (
      <ViewTransition name={VIAJE.mesa(mesaId)} share="auto" default="none">
        {barra}
      </ViewTransition>
    );

  /* «Listos para recoger»: una sola vez a la vista. En PC es lo primero del panel; en tableta
     y teléfono, una franja sobre el catálogo —el panel vive en una hoja cerrada—. */
  const bloqueDeListos = (
    <ListosParaRecoger
      listos={platillosListos}
      entregando={delaCocina.entregando}
      falloDeEntrega={delaCocina.falloDeEntrega}
      falloDeLectura={delaCocina.falloDeLectura}
      alEntregar={delaCocina.entregar}
    />
  );

  /* ── El panel de la cuenta: a la derecha en PC, en la hoja en tableta. ──── */
  const panel = (conListos: boolean) => (
    <div className="flex flex-col gap-(--espacio-4)">
      {conListos ? bloqueDeListos : null}
      {/* «Pedido» es de la CAFETERÍA: aquí lo que se manda es la cuenta. */}
      <section
        aria-label={`${voc.titulo('orden')} actual, ya enviad${voc.terminacion('orden')} a ${voc.enFrase('preparacion')}`}
        className="flex flex-col gap-(--espacio-2)"
      >
        <h2 className="text-xs font-bold tracking-wide text-texto-sutil uppercase">
          {voc.titulo('orden')} actual
        </h2>
        {falloLineas === null ? (
          <>
            <Tabla
              etiqueta={`${voc.titulo('orden')} actual`}
              columnas={columnasDeLoEnviado(voc, abrirAnular, puedeAjustar)}
              filas={enviadas}
              claveDe={(l) => l.id}
              alto="max-h-none"
              vacio={
                <Vacio
                  titulo={`${voc.titulo('unidad_servicio')} ${numero} abiert${voc.terminacion('unidad_servicio')} para ${String(personasDeLaMesa ?? 0)} personas.`}
                  explicacion={`Toca ${voc.enFraseCon('un', 'linea_orden')} para empezar.`}
                  className="px-(--espacio-3) py-(--espacio-4)"
                />
              }
            />
            {enviadas.length > 0 && puedeAjustar && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={abrirDividir}
                aria-label={`Dividir ${voc.enFrase('orden')} de ${voc.enFrase('unidad_servicio')}`}
              >
                <Split aria-hidden="true" />
                Dividir {voc.singular('orden')}
              </Button>
            )}
          </>
        ) : (
          /* No leyó nada: ni el vacío de mesa recién abierta ni «Dividir», que
             repartiría una cuenta que la pantalla no conoce. */
          <ErrorDePantalla
            titulo={`No se pudo leer lo ya enviado a ${voc.enFrase('preparacion')}`}
            queHacer={`Hasta leerlo no se sabe qué lleva ${voc.enFrase('orden')} ni cuánto suma. Antes de volver a mandar ${voc.enFraseCon('un', 'linea_orden')}, confírmalo con ${voc.enFrase('preparacion')}.`}
            detalle={falloLineas}
            reintentar={
              <Button size="sm" variant="outline" cargando={releyendo} onClick={releerLoEnviado}>
                Volver a intentar
              </Button>
            }
          />
        )}
      </section>
      <section
        aria-label={`Agregar a ${voc.enFrase('orden')}, sin enviar`}
        className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)"
      >
        <h2 className="text-xs font-bold tracking-wide text-primario uppercase">
          Agregar a {voc.enFrase('orden')}
        </h2>
        <Tabla
          etiqueta={`Agregar a ${voc.enFrase('orden')}`}
          columnas={columnasDelBorrador(voc, cantidadDe, tocar)}
          filas={pendientes}
          claveDe={(p) => p.id}
          alto="max-h-none"
          vacio={
            <p className="text-sm text-texto-sutil">
              Toca {voc.enFraseCon('un', 'linea_orden')} para agregarlo.
            </p>
          }
        />
      </section>
      <Button
        size="lg"
        className="min-h-[calc(var(--altura-control)*1.6)] w-full text-lg font-bold"
        disabled={sinEnviar}
        onClick={enviar}
      >
        <Send aria-hidden="true" />
        {enviando ? 'Enviando…' : 'ENVIAR A COCINA'}
      </Button>
      {totalConocido && (
        <p className="flex items-baseline justify-between border-t border-borde pt-(--espacio-3)">
          <span className="text-sm font-bold">TOTAL</span>
          <Dinero centavos={total} tamano="lg" />
        </p>
      )}
    </div>
  );

  /* ── MESA LIBRE · lo único que se puede hacer aquí es abrirla. ──────────── */
  const abrir =
    mesa === null ? null : (
      /* El catálogo con la mesa cerrada sería un pedido sin dónde caer. */
      <Superficie
        como="section"
        nivel={2}
        relleno={6}
        aria-label={`Abrir ${voc.enFrase('unidad_servicio')}`}
        className="mx-auto mt-(--espacio-6) flex max-w-md flex-col items-center gap-(--espacio-4) text-center"
      >
        <p className="text-xl font-semibold">
          {voc.titulo('unidad_servicio')} {mesa.numero} está libre
        </p>
        <p className="text-sm text-texto-sutil">
          ¿Para cuántas personas? Es el primer dato de {voc.enFrase('orden')}: de ahí salen el
          reparto y el tiempo de servicio.
        </p>
        <div className="flex items-center justify-center gap-(--espacio-6)">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Una persona menos"
            disabled={personasAlAbrir <= 1}
            onClick={() => {
              setPersonasAlAbrir(Math.max(1, personasAlAbrir - 1));
            }}
          >
            <Minus />
          </Button>
          <span
            aria-live="polite"
            className="min-w-16 font-numeros text-display font-bold tabular-nums"
          >
            {personasAlAbrir}
          </span>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Una persona más"
            disabled={personasAlAbrir >= PERSONAS_MAXIMAS}
            onClick={() => {
              setPersonasAlAbrir(Math.min(PERSONAS_MAXIMAS, personasAlAbrir + 1));
            }}
          >
            <Plus />
          </Button>
        </div>
        <Button
          size="lg"
          className="min-h-[calc(var(--altura-control)*1.6)] w-full text-lg font-bold"
          disabled={abriendo}
          onClick={() => {
            void abrirLaMesa();
          }}
        >
          {abriendo ? 'Abriendo…' : `Abrir ${voc.enFrase('unidad_servicio')}`}
        </Button>
      </Superficie>
    );

  /* ── MESA POR LIMPIAR · cobrada: lo único que se hace aquí es dejarla lista. ── */
  const unida =
    mesa === null ? null : (
      <Superficie
        como="section"
        nivel={2}
        relleno={6}
        aria-label={`${voc.titulo('unidad_servicio')} unid${voc.terminacion('unidad_servicio')} a otra`}
        className="mx-auto mt-(--espacio-6) flex max-w-md flex-col items-center gap-(--espacio-4) text-center"
      >
        <p className="text-xl font-semibold">
          {voc.titulo('unidad_servicio')} {mesa.numero} está unid
          {voc.terminacion('unidad_servicio')} a otra
        </p>
        <p className="text-sm text-texto-sutil">
          Su consumo pasó a {voc.enFrase('orden')} de la principal del grupo: ahí se pide, se manda
          a {voc.enFrase('preparacion')} y se cobra. Al cobrar o cancelar el grupo, vuelve a quedar
          para quien sigue.
        </p>
        <Button variant="outline" size="lg" className="w-full" onClick={volverAlMapa}>
          Volver al mapa
        </Button>
      </Superficie>
    );

  const limpiar =
    mesa === null ? null : (
      <Superficie
        como="section"
        nivel={2}
        relleno={6}
        aria-label={`${voc.titulo('unidad_servicio')} por limpiar`}
        className="mx-auto mt-(--espacio-6) flex max-w-md flex-col items-center gap-(--espacio-4) text-center"
      >
        <p className="text-xl font-semibold">
          {voc.titulo('unidad_servicio')} {mesa.numero} está por limpiar
        </p>
        <p className="text-sm text-texto-sutil">
          {voc.conArticulo('orden')} ya se cobró. Cuando esté recogid
          {voc.terminacion('unidad_servicio')} y limpi{voc.terminacion('unidad_servicio')}, vuelve a
          quedar libre para quien sigue.
        </p>
        <Button
          size="lg"
          className="min-h-[calc(var(--altura-control)*1.6)] w-full text-lg font-bold"
          disabled={liberando}
          cargando={liberando}
          onClick={() => {
            void liberarLaMesa();
          }}
        >
          {voc.titulo('unidad_servicio')} limpi{voc.terminacion('unidad_servicio')}
        </Button>
      </Superficie>
    );

  /* El vacío enseña: dice qué falta y lleva a donde se resuelve. */
  const vacioDelCatalogo = (
    <Vacio
      icono={texto === '' ? <UtensilsCrossed /> : <Search />}
      titulo={
        texto === ''
          ? `Todavía no hay ${voc.plural('producto')}.`
          : `No hay ${voc.plural('producto')} que se llamen así.`
      }
      accion={
        <Button asChild variant="outline">
          <a href="/productos">Ir a {voc.titulo('producto', true)}</a>
        </Button>
      }
    />
  );

  const comanda = (
    <div className="grid gap-(--espacio-4) p-(--espacio-3) xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <section
        aria-label={`Catálogo de ${voc.plural('linea_orden')}`}
        className="flex flex-col gap-(--espacio-3)"
      >
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-5 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            ref={refBusqueda}
            value={busqueda}
            onChange={buscar}
            aria-label={`Buscar ${voc.singular('linea_orden')}`}
            placeholder={`Buscar ${voc.singular('linea_orden')}…`}
            className="h-[calc(var(--altura-control)*1.25)] pl-(--espacio-10) text-lg"
          />
        </div>
        {visibles.length === 0 ? (
          vacioDelCatalogo
        ) : (
          /* La zona de toque nunca baja de 96 px: la acierta un pulgar. */
          <ul className="grid grid-cols-2 gap-(--espacio-2) md:grid-cols-3 xl:grid-cols-4">
            {visibles.map((p) => {
              const agotado = p.agotado === true;
              const enBorrador = cantidadDe(p);
              return (
                <li key={p.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    relleno={3}
                    activa={enBorrador > 0}
                    disabled={agotado}
                    onClick={tocar(p.id, 1)}
                    className={`relative flex min-h-24 w-full flex-col items-start justify-between gap-(--espacio-2) ${agotado ? 'bg-fondo-sutil text-texto-sutil' : ''}`}
                  >
                    <span className="line-clamp-2 pr-(--espacio-6) text-base leading-tight font-semibold">
                      {p.nombre}
                    </span>
                    {/* El precio, en segundo plano; «Agotado», con palabra. */}
                    {agotado ? (
                      <span className="text-xs font-medium">Agotado</span>
                    ) : (
                      <Dinero centavos={precioDe(p)} tamano="xs" className="text-texto-sutil" />
                    )}
                    {/* El anillo solo no dice cuántos: el número sí. */}
                    {enBorrador > 0 && (
                      <span
                        aria-hidden="true"
                        className="absolute top-(--espacio-2) right-(--espacio-2) flex h-[calc(var(--altura-control)*0.6)] min-w-[calc(var(--altura-control)*0.6)] items-center justify-center rounded-full px-(--espacio-1) bg-primario font-numeros text-xs font-bold text-primario-texto tabular-nums"
                      >
                        {enBorrador}
                      </span>
                    )}
                  </Superficie>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Superficie
        como="aside"
        relleno={4}
        aria-label={`Pedido de ${voc.enFrase('unidad_servicio')}`}
        className="sticky top-20 hidden max-h-[calc(100dvh-6rem)] overflow-y-auto xl:block"
      >
        {panel(true)}
      </Superficie>
    </div>
  );

  const contenido = (() => {
    if (productos === null) {
      if (error === null) {
        return <EsqueletoDeLaComanda etiqueta={`Cargando ${voc.enFrase('unidad_servicio')}`} />;
      }
      // No leyó nada: no hay «último dato conocido» que enseñar.
      return (
        <div className="mx-auto max-w-lg p-(--espacio-6)">
          <ErrorDePantalla
            titulo={`No se pudo leer ${voc.enFrase('unidad_servicio')} ni ${voc.enFrase('producto', true)}`}
            queHacer={`Sin eso no se puede levantar la comanda: no se sabría a qué ${voc.singular('orden')} va ni qué se puede pedir. Revisa la conexión y vuelve a intentarlo.`}
            detalle={error}
            reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
          />
        </div>
      );
    }
    if (porLimpiar) return limpiar;
    if (enGrupo) return unida;
    return mesaLibre ? abrir : comanda;
  })();

  return (
    <div className="min-h-dvh bg-fondo pb-28 xl:pb-0">
      {cabecera}
      {productos !== null && error !== null && (
        <Aviso tono="peligro" titulo={error} className="mx-(--espacio-3) mt-(--espacio-3)">
          Se muestra el último dato conocido.
        </Aviso>
      )}
      {comandaVisible && mesa?.venta_activa_id != null ? (
        <div className="px-(--espacio-3) pt-(--espacio-3)">
          <AccionesDeLaMesa
            mesaId={mesa.id}
            ordenId={mesa.venta_activa_id}
            hayEnviado={enviadas.length > 0}
            totalCentavos={
              falloLineas === null ? enviadas.reduce((s, l) => s + importeDe(l), 0) : null
            }
            alCambiarDeMesa={alCambiarDeMesa}
            unionId={unionId}
            alSeparar={() => {
              setVersionDelGrupo((v) => v + 1);
              releerLoEnviado();
            }}
          />
        </div>
      ) : null}
      {comandaVisible && hayAlgoQueDecirDeLaVentana ? (
        <div className="px-(--espacio-3) pt-(--espacio-3) xl:hidden">{bloqueDeListos}</div>
      ) : null}
      {contenido}
      {comandaVisible && (
        /* Tablet y teléfono: la cuenta vive donde alcanza el pulgar derecho. */
        <Button
          size="lg"
          onClick={abrirHoja}
          aria-label={`Abrir el pedido: ${voc.conNumero('linea_orden', piezas)}${totalConocido ? `, ${dineroEnTexto(total)}` : ''}`}
          className="fixed right-(--espacio-4) bottom-(--espacio-4) z-20 min-h-[calc(var(--altura-control)*1.6)] gap-(--espacio-3) rounded-full px-(--espacio-6) text-lg font-bold shadow-3 xl:hidden"
        >
          <span className="font-numeros tabular-nums">{piezas}</span>
          {totalConocido && (
            <>
              <span aria-hidden="true">·</span>
              <Dinero centavos={total} tamano="base" />
            </>
          )}
        </Button>
      )}
      <Sheet open={hoja} onOpenChange={setHoja}>
        <SheetContent side="bottom" className="max-h-[70dvh] overflow-y-auto p-(--espacio-4)">
          <SheetTitle>Pedido de la mesa {mesa?.numero ?? ''}</SheetTitle>
          {panel(false)}
        </SheetContent>
      </Sheet>
      <Dialog open={falloEnvio} onOpenChange={setFalloEnvio}>
        <DialogContent className="border-2 border-peligro">
          <DialogTitle>La comanda NO llegó a {voc.singular('preparacion')}</DialogTitle>
          <Aviso tono="peligro" titulo={motivoDelFallo ?? 'Vuelve a intentar.'}>
            El pedido sigue completo en la pantalla y el reintento usa la misma clave, así que no
            puede duplicarse.
          </Aviso>
          <Button size="lg" disabled={enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Reintentar envío'}
          </Button>
        </DialogContent>
      </Dialog>
      {puedeAjustar && anulando !== null && mesa?.venta_activa_id != null && (
        <AnularLineaDialog
          abierto
          ordenId={mesa.venta_activa_id}
          lineaId={anulando.id}
          nombreDelPlatillo={anulando.producto_nombre}
          /* «Ya se preparó» = cocina lo dejó en la ventana: el insumo ya se gastó. */
          yaSePreparo={
            delaCocina.yaSalieron.has(anulando.producto_nombre) ||
            listos.includes(anulando.producto_nombre)
          }
          onCerrar={cerrarAnular}
          onAnulada={traslaAnulacion}
        />
      )}
      {puedeAjustar && mesa?.venta_activa_id != null && (
        <DividirCuentaDialog
          key={aperturaDeDividir}
          abierto={dividiendo}
          ordenId={mesa.venta_activa_id}
          lineas={enviadas.map((l) => ({
            id: l.id,
            nombre: l.producto_nombre,
            cantidad: l.cantidad,
          }))}
          onCerrar={cerrarDividir}
          onDividida={traslaDivision}
        />
      )}
    </div>
  );
}
