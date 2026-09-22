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
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · entradas
 *
 * Recepción y pedido. De dos a cinco veces por semana, encargado o almacén,
 * ritmo EPISÓDICO: aquí cabe la calma y cabe un archivo de doscientas líneas.
 *
 * ── Lo primero que se ve no es la captura: es lo que viene en camino ──────
 * La acción principal es RECIBIR NOTA, pero la pregunta que trae al encargado
 * a esta pantalla es «¿qué viene en camino y qué tengo que pedir?». Si lo que
 * ya viene no se ve antes de pedir, se pide dos veces lo mismo.
 *
 * ── Y «en camino» es la RUTA DEL PROVEEDOR, no un pedido en tránsito ──────
 * Esta franja leía una entidad del puente, `PedidoProveedor`, **que no existe**:
 * el sistema no lleva pedidos a proveedor —no hay tabla, ni comando que los cree—
 * y el puente contestaba `PUENTE_ENTIDAD_DESCONOCIDA`, así que la franja nacía
 * vacía con una banda de error encima.
 *
 * Lo que el sistema SÍ sabe, y es la respuesta útil a la misma pregunta, es
 * cuándo pasa el proveedor: `proveedores.dia_visita` («Bimbo viene martes y
 * viernes») y de ahí los días de cobertura que la sugerencia ya calcula. La
 * franja dice quién llega, en cuántos días, y qué cuesta lo que habría que
 * pedirle. Prometer un tránsito que nadie registra sería peor que no prometerlo.
 *
 * ── El archivo es el camino ① y el manual el ③ ────────────────────────────
 * Doscientas líneas a mano son dos horas mal invertidas y mal capturadas. El
 * archivo tiene su comando —`compras.importar_nota`, que empareja y PROPONE— y
 * su subida vive fuera de esta pantalla: `invocarComando` manda JSON y un archivo
 * necesita multipart. Lo que aquí se puede capturar de punta a punta es el camino
 * ③: el proveedor chico de diez renglones, y se captura contra el catálogo para
 * que no nazcan diez claves duplicadas.
 *
 * ── «Sin emparejar» va arriba del total, no en un reporte ─────────────────
 * Porque una línea sin emparejar QUEDA FUERA de la entrada. El botón de
 * guardar dice cuántas se van a perder ANTES de perderlas. Y el aviso de costo
 * trae el precio de venta sugerido porque en cable y cobre, sin ese aviso, el
 * mostrador vende a pérdida toda la semana sin enterarse.
 *
 * ── Por qué el pedido sugerido lleva la columna DORMIDO ───────────────────
 * Porque es el único momento en que el dinero parado puede cambiar la
 * decisión: ver «$18,400 en brocas ya paradas» justo cuando el vendedor trae
 * promoción de brocas es lo que detiene la compra. En un reporte de fin de mes
 * ese mismo dato no cambia nada. Por eso esas líneas se ordenan primero, y por
 * eso los dos importes los calcula el SERVIDOR: `compras.sugerir_pedido` los
 * devuelve con el costo de la unidad base, y no el navegador multiplicando.
 *
 * ── Teléfono: recepción rápida con foto, y nada más ───────────────────────
 * Existe para el proveedor chico que llega con diez líneas. Las doscientas NO
 * se capturan en teléfono, así que ese bloque ni siquiera se ofrece ahí:
 * ofrecerlo sería prometer algo que acaba en una captura a medias.
 *
 * ── Alcance recortado por el límite de líneas, dicho aquí ─────────────────
 * Quedan fuera, cada uno en su sitio: la SUBIDA del archivo (multipart, no JSON),
 * el comparativo línea por línea de «escanear contra pedido» (que aquí sólo se
 * elige), el alta completa del material —aquí se hace el alta rápida, marcada
 * como incompleta— y el kardex.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Debería venir del proveedor; mientras ese campo no exista, vive aquí. */
const MINIMO_PEDIDO_CENTAVOS = 2_500_000;

/** Desde aquí, el dinero dormido de una línea merece frenar un pedido. */
const UMBRAL_DORMIDO_CENTAVOS = 500_000;

const CLAVE_GUARDAR = 'guardar';

/** Las clases largas viven arriba para que cada elemento quepa en una línea. */
const TARJETA = 'rounded-lg border border-border bg-card p-3 text-card-foreground shadow-1';
const BANDA = 'rounded-md border p-2 text-sm';
const PENDIENTE = `${BANDA} flex flex-wrap items-center gap-2 border-warning bg-warning/20`;
const ELEGIDA =
  'rounded-md border border-primary bg-primary/15 p-2 text-left text-sm font-semibold';
const OTRA =
  'rounded-md border border-border bg-secondary p-2 text-left text-sm text-secondary-foreground';
const REJILLA = 'grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start';

/** Los tres caminos, en el orden en que resuelven el problema. */
const CAMINOS = [
  { clave: 'archivo', etiqueta: '① Importar archivo', ayuda: '198 líneas en un minuto' },
  { clave: 'pedido', etiqueta: '② Escanear contra pedido', ayuda: 'Enseña lo que no llegó' },
  { clave: 'manual', etiqueta: '③ Manual', ayuda: 'Para diez líneas o menos' },
] as const;

type Camino = (typeof CAMINOS)[number]['clave'];

export interface LineaSinEmparejar {
  readonly id: string;
  readonly codigoProveedor: string;
  readonly descripcion: string;
}

export interface SubidaDeCosto {
  readonly id: string;
  readonly material: string;
  readonly costoAnteriorCentavos: number;
  readonly costoNuevoCentavos: number;
  readonly precioHoyCentavos: number;
  readonly precioSugeridoCentavos: number;
}

/** Una partida capturada a mano, ya atada a un material del catálogo. */
export interface PartidaCapturada {
  readonly insumoId: string;
  readonly nombre: string;
  /** Lo que se teclea: «3» cajas, «12.5» metros. Texto: convierte el servidor. */
  readonly cantidad: string;
  readonly unidad: string;
  /** Cuántas unidades base trae UNA unidad de compra. Texto, por lo mismo. */
  readonly equivalencia: string;
  /** Lo que costó el renglón COMPLETO, en pesos y como texto. */
  readonly costoTotal: string;
}

export interface NotaEnCaptura {
  readonly archivo: string | null;
  readonly lineas: number;
  readonly sinEmparejar: readonly LineaSinEmparejar[];
  readonly subidas: readonly SubidaDeCosto[];
  readonly partidas: readonly PartidaCapturada[];
  readonly totalCentavos: number;
  readonly vence: string | null;
}

/** Un proveedor del catálogo, con lo que hace falta para recibirle. */
export interface ProveedorDeEntrada {
  readonly id: string;
  readonly nombre: string;
  readonly dias_credito: number;
}

/** Un material de ESTE proveedor, para capturar su renglón sin duplicar claves. */
export interface MaterialDeProveedor {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string;
  readonly unidad_compra_default: string | null;
  readonly cantidad_por_compra_default: number | null;
}

/** Quién llega y cuándo. Es lo que el sistema sabe de «en camino». */
export interface RutaDelProveedor {
  readonly proveedor: string;
  /** `null` cuando no tiene ruta: a ése se le llama por teléfono. */
  readonly diasHastaLaVisita: number | null;
  readonly diasDeCobertura: number;
}

export interface LineaSugerida {
  readonly id: string;
  readonly material: string;
  readonly hay: number;
  readonly vendido90d: number;
  /** Ya con su unidad: «4 rollos», «1 caja». El cero se marca aparte. */
  readonly sugerido: string;
  readonly importeCentavos: number;
  readonly dormidoCentavos: number;
  readonly linea: string;
}

/** Lo que contesta `compras.sugerir_pedido`, tal cual. */
interface RespuestaSugerencia {
  readonly proveedor: string;
  readonly diasHastaLaVisita: number | null;
  readonly diasDeCobertura: number;
  readonly renglones: readonly {
    readonly insumoId: string;
    readonly nombre: string;
    readonly existenciaBase: string;
    readonly ventaDelPeriodoBase: string;
    readonly presentacionesSugeridas: number;
    readonly unidadCompra: string;
    readonly importeCentavos: string;
    readonly dormidoCentavos: string;
    readonly alerta: string;
  }[];
}

export interface EntradasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly proveedoresIniciales?: readonly ProveedorDeEntrada[];
  readonly filasIniciales?: readonly LineaSugerida[];
  readonly notaInicial?: NotaEnCaptura;
  readonly rutaInicial?: RutaDelProveedor;
}

/** El código estable de la API, traducido a la frase que sirve en el almacén. */
export function mensajeDe(fallo: unknown): string {
  if (!(fallo instanceof ErrorApi)) {
    return fallo instanceof Error ? fallo.message : 'No se pudo hablar con el servidor.';
  }
  // El límite de intentos no es un código: es el 429, y vive en `estado`.
  if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera y vuelve a intentar.';
  switch (fallo.error.codigo) {
    case 'IDEMPOTENCIA_CONFLICTO':
    case 'COMANDO_EN_CURSO':
      return 'Esa entrada ya se está guardando. No la mandes dos veces.';
    case 'CONFLICTO_ESTADO':
      return 'La nota cambió mientras la capturabas. Vuelve a abrirla antes de guardar.';
    case 'SIN_PERMISO':
    case 'PAQUETE_NO_INCLUYE':
      return 'Tu usuario no puede recibir notas. Pídeselo al encargado.';
    default:
      return fallo.error.mensaje;
  }
}

/** Primero lo que puede frenar una compra; después lo que más cuesta pedir. */
export function ordenarSugeridas(filas: readonly LineaSugerida[]): readonly LineaSugerida[] {
  const frena = (f: LineaSugerida) => (f.dormidoCentavos >= UMBRAL_DORMIDO_CENTAVOS ? 1 : 0);
  return [...filas].sort((a, b) => frena(b) - frena(a) || b.importeCentavos - a.importeCentavos);
}

/** `'40.0000'` → `40`. Para enseñar, no para calcular. */
function comoNumero(texto: string): number {
  const valor = Number.parseFloat(texto);
  return Number.isFinite(valor) ? valor : 0;
}

/** El renglón del servidor, con la forma que esta pantalla pinta. */
function comoLinea(renglon: RespuestaSugerencia['renglones'][number]): LineaSugerida {
  return {
    id: renglon.insumoId,
    material: renglon.nombre,
    hay: comoNumero(renglon.existenciaBase),
    vendido90d: comoNumero(renglon.ventaDelPeriodoBase),
    sugerido: `${String(renglon.presentacionesSugeridas)} ${renglon.unidadCompra}`,
    importeCentavos: Number(renglon.importeCentavos),
    dormidoCentavos: Number(renglon.dormidoCentavos),
    linea: renglon.nombre,
  };
}

/** Cuándo llega, en palabras. «Hoy» y «mañana» se leen de un golpe. */
function cuandoLlega(dias: number | null): string {
  if (dias === null) return 'sin ruta · se le llama';
  if (dias === 0) return 'llega hoy';
  if (dias === 1) return 'llega mañana';
  return `llega en ${String(dias)} días`;
}

export function Entradas({
  proveedoresIniciales,
  filasIniciales,
  notaInicial,
  rutaInicial,
}: EntradasProps) {
  const voc = useVocabulario();
  const sembrada = proveedoresIniciales !== undefined || filasIniciales !== undefined;
  const [proveedores, setProveedores] = useState<readonly ProveedorDeEntrada[] | null>(
    sembrada ? (proveedoresIniciales ?? []) : null,
  );
  const [materiales, setMateriales] = useState<readonly MaterialDeProveedor[]>([]);
  const [ruta, setRuta] = useState<RutaDelProveedor | null>(rutaInicial ?? null);
  const [sugeridas, setSugeridas] = useState<readonly LineaSugerida[]>(filasIniciales ?? []);
  const [nota, setNota] = useState<NotaEnCaptura | null>(notaInicial ?? null);
  /** Lo que se dice después de copiar o de abrir WhatsApp. Sin esto, tocar no se ve. */
  const [avisoDelPedido, setAvisoDelPedido] = useState<string | null>(null);
  const [proveedorId, setProveedorId] = useState(proveedoresIniciales?.[0]?.id ?? '');
  const [folio, setFolio] = useState('');
  const [aCredito, setACredito] = useState(true);
  const [dias, setDias] = useState('30');
  const [camino, setCamino] = useState<Camino>('archivo');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // La captura manual, un renglón a la vez.
  const [material, setMaterial] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');

  // ── Los proveedores del catálogo, que es de donde sale todo lo demás ─────
  useEffect(() => {
    if (sembrada) return;
    const control = new AbortController();
    consultarPuente<ProveedorDeEntrada>('Proveedor', { limite: 50, signal: control.signal })
      .then((lista) => {
        if (control.signal.aborted) return;
        setProveedores(lista);
        setProveedorId((actual) => (actual === '' ? (lista[0]?.id ?? '') : actual));
      })
      // La pantalla NUNCA se vacía por un error de red: se avisa y se sigue,
      // porque lo ya capturado vale más que un lienzo limpio.
      .catch((fallo: unknown) => {
        if (control.signal.aborted) return;
        setProveedores([]);
        setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [sembrada]);

  // ── Del proveedor elegido: su ruta, su sugerencia y sus materiales ───────
  useEffect(() => {
    if (proveedorId === '' || filasIniciales !== undefined) return;
    const control = new AbortController();
    void (async () => {
      try {
        const [sugerencia, delProveedor] = await Promise.all([
          invocarComando<RespuestaSugerencia>('/api/compras/sugerencia', { proveedorId }),
          consultarPuente<MaterialDeProveedor>('Ingrediente', {
            filtro: { proveedor_default_id: proveedorId },
            limite: 200,
            signal: control.signal,
          }),
        ]);
        if (control.signal.aborted) return;
        setRuta({
          proveedor: sugerencia.proveedor,
          diasHastaLaVisita: sugerencia.diasHastaLaVisita,
          diasDeCobertura: sugerencia.diasDeCobertura,
        });
        setSugeridas(sugerencia.renglones.map(comoLinea));
        setMateriales(delProveedor);
      } catch (fallo: unknown) {
        if (control.signal.aborted) return;
        setError(mensajeDe(fallo));
      }
    })();
    return () => {
      control.abort();
    };
  }, [proveedorId, filasIniciales]);

  const proveedor = useMemo(
    () => (proveedores ?? []).find((p) => p.id === proveedorId) ?? null,
    [proveedores, proveedorId],
  );
  const ordenadas = useMemo(() => ordenarSugeridas(sugeridas), [sugeridas]);

  /**
   * EL PEDIDO EN TEXTO · lo que se copia y lo que se manda.
   *
   * Los dos botones de abajo tenían `disabled` y NINGÚN `onClick`: en cuanto había
   * una línea sugerida se encendían y no hacían nada. Y no es un adorno —es el
   * final del trabajo de esta pantalla: lo que se pide se pide por teléfono o por
   * WhatsApp, y lo que hace falta es el texto, no un pedido en el sistema (aquí no
   * hay tabla de pedidos a propósito: ver la cabecera).
   */
  function pedidoEnTexto(): string {
    const renglones = ordenadas.map((fila) => `${fila.sugerido} · ${fila.material}`);
    return [
      ruta === null ? 'Pedido' : `Pedido para ${ruta.proveedor}`,
      ...renglones,
      `Estimado ${PESOS.format(estimado / 100)}`,
    ].join('\n');
  }

  async function copiarElPedido(): Promise<void> {
    try {
      await navigator.clipboard.writeText(pedidoEnTexto());
      setAvisoDelPedido('Pedido copiado. Pégalo donde lo vayas a mandar.');
    } catch {
      // El portapapeles lo puede negar el navegador —permiso, o pestaña sin foco—.
      // Decirlo es mejor que no hacer nada: el texto sigue en la pantalla.
      setAvisoDelPedido('El navegador no dejó copiar. Selecciona la lista y cópiala a mano.');
    }
  }

  /**
   * Abre WhatsApp con el pedido ESCRITO y sin mandar.
   *
   * La misma regla que el fiado de `abarrotes`: el sistema redacta, la persona
   * manda. Un mensaje automático a un proveedor —o a una vecina— rompe la relación
   * que sostiene el negocio, y además aquí no hay número: se elige en WhatsApp.
   */
  function mandarElPedidoPorWhatsApp(): void {
    const url = `https://wa.me/?text=${encodeURIComponent(pedidoEnTexto())}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setAvisoDelPedido('WhatsApp abierto con el pedido escrito. Elige a quién y mándalo tú.');
  }
  const estimado = ordenadas.reduce((suma, f) => suma + f.importeCentavos, 0);
  const faltante = Math.max(0, MINIMO_PEDIDO_CENTAVOS - estimado);
  const pendientes = nota?.sinEmparejar.length ?? 0;
  const partidas = nota?.partidas ?? [];

  /**
   * El documento no nombra rutas de escritura para esta pantalla, así que se
   * usa la convención `/api/<dominio>/<verbo>`. Al resolver un pendiente se
   * quita de la nota; al guardar, la nota entera se cierra.
   */
  async function ejecutar(ruta: string, clave: string, entrada: Record<string, unknown>) {
    setOcupado(clave);
    setError(null);
    try {
      await invocarComando(ruta, entrada);
      setNota((previa) =>
        clave === CLAVE_GUARDAR || previa === null
          ? null
          : {
              ...previa,
              sinEmparejar: previa.sinEmparejar.filter((l) => l.id !== clave),
              subidas: previa.subidas.filter((s) => s.id !== clave),
            },
      );
      if (clave === CLAVE_GUARDAR) setFolio('');
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setOcupado(null);
    }
  }

  function iniciar() {
    setNota({
      archivo: null,
      lineas: 0,
      sinEmparejar: [],
      subidas: [],
      partidas: [],
      totalCentavos: 0,
      vence: null,
    });
  }

  /**
   * Agrega un renglón capturado a mano, CONTRA EL CATÁLOGO.
   *
   * Contra el catálogo y no como texto libre: diez notas capturadas con el nombre
   * escrito a mano son diez claves nuevas para el mismo tornillo, y entonces el
   * inventario de la ferretería vuelve a no servir. Si el material no está, el
   * camino es el alta rápida, que esta misma pantalla ofrece.
   */
  function agregarPartida(): void {
    const buscado = material.trim().toLowerCase();
    const elegido = materiales.find((m) => m.nombre.toLowerCase() === buscado);
    if (elegido === undefined) {
      setError(
        `«${material.trim()}» no es un ${voc.singular('producto')} de este proveedor. Elígelo de ` +
          'la lista, o dalo de alta primero.',
      );
      return;
    }
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(cantidad.trim())) {
      setError('La cantidad va con hasta cuatro decimales.');
      return;
    }
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(costo.trim())) {
      setError('El costo del renglón va en pesos y centavos.');
      return;
    }
    setError(null);
    const partida: PartidaCapturada = {
      insumoId: elegido.id,
      nombre: elegido.nombre,
      cantidad: cantidad.trim(),
      unidad: elegido.unidad_compra_default ?? elegido.unidad_base,
      equivalencia: String(elegido.cantidad_por_compra_default ?? 1),
      costoTotal: costo.trim(),
    };
    setNota((previa) => {
      const base = previa ?? {
        archivo: null,
        lineas: 0,
        sinEmparejar: [],
        subidas: [],
        partidas: [],
        totalCentavos: 0,
        vence: null,
      };
      const juntas = [...base.partidas, partida];
      return {
        ...base,
        partidas: juntas,
        lineas: juntas.length,
        // En CENTAVOS y con enteros: sumar pesos con decimales en el navegador es
        // cómo un total acaba en 1234.9999999.
        totalCentavos: juntas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
      };
    });
    setMaterial('');
    setCantidad('');
    setCosto('');
  }

  function quitarPartida(insumoId: string): void {
    setNota((previa) => {
      if (previa === null) return previa;
      const juntas = previa.partidas.filter((p) => p.insumoId !== insumoId);
      return {
        ...previa,
        partidas: juntas,
        lineas: juntas.length,
        totalCentavos: juntas.reduce((suma, p) => suma + aCentavos(p.costoTotal), 0),
      };
    });
  }

  if (proveedores === null) {
    // Esqueletos con la forma de los tres bloques, nunca un giro que gira: el
    // ojo ya sabe dónde va a mirar cuando lleguen los datos.
    return (
      <div className="p-3">
        <h1 className="text-2xl font-bold">Entradas</h1>
        <div className={`mt-3 ${REJILLA}`}>
          <Skeleton className="h-40 w-full rounded-lg xl:h-80" />
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Entradas</h1>
        <p className="text-sm text-muted-foreground">
          Recepción y pedido · {proveedor?.nombre ?? 'sin proveedor'}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className={`${BANDA} mb-3 border-destructive bg-destructive/15`}>
          <TriangleAlert aria-hidden="true" className="inline size-4 shrink-0" /> {error} · Lo que
          ya estaba capturado sigue en pantalla.
        </p>
      )}

      <div className={REJILLA}>
        {/* PRIMERO SE VE · quién llega, para no volver a pedirle lo que trae. */}
        <section aria-label="Ruta del proveedor" className={`${TARJETA} xl:col-start-2`}>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">En camino</h2>
          {ruta === null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Elige un proveedor y aquí sale cuándo pasa y qué conviene pedirle.
            </p>
          ) : (
            <>
              <p className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium">{ruta.proveedor}</span>
                <span className="tabular-nums text-muted-foreground">
                  {cuandoLlega(ruta.diasHastaLaVisita)}
                </span>
              </p>
              <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                Se pide para {ruta.diasDeCobertura} días · {ordenadas.length}{' '}
                {voc.plural('producto')} por pedir · {PESOS.format(estimado / 100)}
              </p>
              {/* Lo que el sistema NO sabe, dicho aquí y no fingido. */}
              <p className="mt-2 text-xs text-muted-foreground">
                El sistema no lleva pedidos en tránsito: lo que se ve es la ruta del proveedor y lo
                que habría que pedirle hoy.
              </p>
            </>
          )}
        </section>

        <main className={`${TARJETA} xl:col-start-1 xl:row-start-1 xl:row-span-2`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Select
                value={proveedorId}
                onValueChange={(valor) => {
                  setProveedorId(valor);
                  const elegido = proveedores.find((p) => p.id === valor);
                  // Los días los pone el proveedor: teclearlos cada vez es cómo
                  // una nota queda a 30 cuando el trato era a 15.
                  if (elegido !== undefined) setDias(String(elegido.dias_credito));
                }}
              >
                <SelectTrigger id="proveedor" className="mt-1 w-full">
                  <SelectValue placeholder="Elige el proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Binario: un segmentado se lee de un golpe y no abre nada. */}
            <div role="group" aria-label="Forma de pago" className="flex gap-1">
              <Button
                type="button"
                variant={aCredito ? 'default' : 'outline'}
                aria-pressed={aCredito}
                onClick={() => {
                  setACredito(true);
                }}
              >
                Crédito
              </Button>
              <Button
                type="button"
                variant={aCredito ? 'outline' : 'default'}
                aria-pressed={!aCredito}
                onClick={() => {
                  setACredito(false);
                }}
              >
                Contado
              </Button>
            </div>
            {aCredito && (
              <>
                <div className="w-24">
                  <Label htmlFor="dias">Días</Label>
                  <Input
                    id="dias"
                    inputMode="numeric"
                    value={dias}
                    className="mt-1"
                    onChange={(evento) => {
                      setDias(evento.target.value);
                    }}
                  />
                </div>
                {/* A crédito el folio es OBLIGATORIO: es lo que se concilia
                    cuando el proveedor reclame, y el servidor lo exige. */}
                <div className="w-36">
                  <Label htmlFor="folio">Folio de la nota</Label>
                  <Input
                    id="folio"
                    value={folio}
                    className="mt-1"
                    onChange={(evento) => {
                      setFolio(evento.target.value);
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Los tres caminos. En teléfono no se ofrecen. */}
          <div className="mt-3 hidden gap-2 md:grid md:grid-cols-3">
            {CAMINOS.map((paso) => (
              <button
                key={paso.clave}
                type="button"
                aria-pressed={camino === paso.clave}
                className={camino === paso.clave ? ELEGIDA : OTRA}
                onClick={() => {
                  setCamino(paso.clave);
                  if (nota === null) iniciar();
                }}
              >
                {paso.etiqueta}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {paso.ayuda}
                </span>
              </button>
            ))}
          </div>

          {/* El proveedor chico de diez líneas, en el pasillo. */}
          <div className="mt-3 md:hidden">
            <Label htmlFor="foto">Recepción rápida · foto de la nota</Label>
            <Input id="foto" type="file" accept="image/*" capture="environment" className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">
              Hasta diez líneas. Las notas largas se capturan en la computadora.
            </p>
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {nota === null ? (
              // El VACÍO enseña qué resuelve la pantalla, y abre el camino.
              <>
                <p className="font-semibold">Todavía no hay ninguna nota en captura.</p>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  Elige un camino y captura la nota del proveedor: el sistema empareja lo que
                  reconoce, tú resuelves sólo lo que no, y te avisa de lo que subió de costo antes
                  de que se venda a pérdida. Una entrada capturada el mismo día evita una semana en
                  negativo.
                </p>
                <Button type="button" className="mt-3" onClick={iniciar}>
                  Recibir nota
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm tabular-nums">
                  <span className="font-medium">Archivo:</span> {nota.archivo ?? 'sin cargar'} ·{' '}
                  {nota.lineas} líneas · {nota.lineas - pendientes} emparejadas ✓ ·{' '}
                  <span className="font-semibold">{pendientes}</span> sin emparejar ⚠
                </p>

                {/* ── El camino ③, capturado contra el catálogo ────────────── */}
                <section aria-label={`Capturar ${voc.singular('linea_orden')}`} className="mt-3">
                  <h2 className="text-sm font-semibold">Capturar {voc.singular('linea_orden')}</h2>
                  <div className="mt-1 flex flex-wrap items-end gap-2">
                    <div className="min-w-48 flex-1">
                      <Label htmlFor="material">{voc.titulo('producto')}</Label>
                      <Input
                        id="material"
                        list="materiales-del-proveedor"
                        value={material}
                        placeholder={
                          materiales.length === 0
                            ? `Este proveedor no tiene ${voc.plural('producto')} dados de alta`
                            : 'Escribe y elige de la lista'
                        }
                        className="mt-1"
                        onChange={(evento) => {
                          setMaterial(evento.target.value);
                        }}
                      />
                      {/* La lista es la del CATÁLOGO: capturar por texto libre
                          crea diez claves nuevas para el mismo tornillo. */}
                      <datalist id="materiales-del-proveedor">
                        {materiales.map((m) => (
                          <option key={m.id} value={m.nombre} />
                        ))}
                      </datalist>
                    </div>
                    <div className="w-24">
                      <Label htmlFor="cantidad">Cantidad</Label>
                      <Input
                        id="cantidad"
                        inputMode="decimal"
                        value={cantidad}
                        className="mt-1"
                        onChange={(evento) => {
                          setCantidad(evento.target.value);
                        }}
                      />
                    </div>
                    <div className="w-28">
                      <Label htmlFor="costo">Costo del renglón</Label>
                      <Input
                        id="costo"
                        inputMode="decimal"
                        value={costo}
                        className="mt-1"
                        onChange={(evento) => {
                          setCosto(evento.target.value);
                        }}
                      />
                    </div>
                    <Button type="button" variant="secondary" onClick={agregarPartida}>
                      Agregar
                    </Button>
                  </div>
                  {partidas.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {partidas.map((p) => (
                        <li
                          key={p.insumoId}
                          className={`${BANDA} flex flex-wrap items-center gap-2 border-border bg-muted`}
                        >
                          <span className="flex-1">{p.nombre}</span>
                          <span className="tabular-nums">
                            {p.cantidad} {p.unidad} · {PESOS.format(aCentavos(p.costoTotal) / 100)}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              quitarPartida(p.insumoId);
                            }}
                          >
                            Quitar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {pendientes > 0 && (
                  <section aria-label="Líneas sin emparejar" className="mt-3">
                    <h2 className="text-sm font-semibold">
                      Sin emparejar — resuélvelas o quedan fuera
                    </h2>
                    <ul className="mt-1 space-y-1">
                      {nota.sinEmparejar.map((linea) => (
                        <li key={linea.id} className={PENDIENTE}>
                          <span className="font-mono text-xs">{linea.codigoProveedor}</span>
                          <span className="flex-1">{linea.descripcion}</span>
                          <Button asChild size="sm" variant="outline">
                            <a
                              href={`/ferreteria/mostrador?buscar=${encodeURIComponent(linea.descripcion)}`}
                            >
                              Buscar…
                            </a>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={ocupado !== null}
                            onClick={() => {
                              // El alta RÁPIDA: nombre y clave del proveedor. El
                              // precio nace en cero y queda como pendiente del
                              // catálogo; inventarlo aquí acaba en la etiqueta.
                              void ejecutar('/api/entradas/alta-material', linea.id, {
                                codigoProveedor: linea.codigoProveedor,
                                descripcion: linea.descripcion,
                                costo: '',
                              });
                            }}
                          >
                            Alta
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {nota.subidas.length > 0 && (
                  <section
                    aria-label={`${voc.titulo('producto', true)} que subieron de costo`}
                    className="mt-3"
                  >
                    <h2 className="text-sm font-semibold">
                      ⚠ {nota.subidas.length} {voc.plural('producto')} subieron de costo
                    </h2>
                    <ul className="mt-1 space-y-1">
                      {nota.subidas.map((subida) => (
                        <li key={subida.id} className={`${BANDA} border-border bg-muted`}>
                          <p className="tabular-nums">
                            <span className="font-medium">{subida.material}</span>{' '}
                            {PESOS.format(subida.costoAnteriorCentavos / 100)} →{' '}
                            {PESOS.format(subida.costoNuevoCentavos / 100)}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 tabular-nums">
                            <span className="text-muted-foreground">
                              Venta sugerida {PESOS.format(subida.precioSugeridoCentavos / 100)}{' '}
                              (hoy {PESOS.format(subida.precioHoyCentavos / 100)})
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={ocupado !== null}
                              onClick={() => {
                                void ejecutar('/api/precios/aplicar-sugerido', subida.id, {
                                  materialId: subida.id,
                                  precioCentavos: subida.precioSugeridoCentavos,
                                });
                              }}
                            >
                              Aplicar
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <p className="tabular-nums">
                    <span className="text-lg font-semibold">
                      {PESOS.format(nota.totalCentavos / 100)}
                    </span>{' '}
                    <span className="text-sm text-muted-foreground">
                      {aCredito ? `· vence ${nota.vence ?? `a ${dias} días`}` : '· de contado'}
                    </span>
                  </p>
                  <Button
                    type="button"
                    disabled={ocupado !== null || proveedorId === ''}
                    onClick={() => {
                      // Las partidas van en la forma que pide `lineaDeCompra`: la
                      // equivalencia es cuántas unidades base trae UNA de compra,
                      // y sin ella «3 cajas» no dice cuántos kilos entraron.
                      void ejecutar('/api/entradas/recibir', CLAVE_GUARDAR, {
                        proveedorId,
                        folio: folio.trim() === '' ? null : folio.trim(),
                        aCredito,
                        dias: Number(dias),
                        camino,
                        lineas: partidas.map((p) => ({
                          insumoId: p.insumoId,
                          cantidadCapturada: p.cantidad,
                          unidadCapturada: p.unidad,
                          equivalencia: p.equivalencia,
                          costoTotal: p.costoTotal,
                        })),
                      });
                    }}
                  >
                    {pendientes > 0 ? `Guardar · ${pendientes} quedan fuera` : 'Guardar entrada'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </main>

        <section aria-label="Pedido sugerido" className={`${TARJETA} xl:col-start-2`}>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">
            Pedido sugerido · {proveedor?.nombre ?? '—'}
          </h2>
          {ordenadas.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin sugerencias: se arman con la venta de los últimos días y el mínimo de cada
              material. Recibe un par de notas y esta lista empieza a decir qué pedir y qué no.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {ordenadas.map((fila) => (
                <li key={fila.id} className="py-2">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{fila.material}</span>
                    <span className="font-semibold tabular-nums">
                      {fila.importeCentavos === 0 ? '▸ 0 ◂' : fila.sugerido}
                    </span>
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    Hay {fila.hay} · vendido {fila.vendido90d}
                  </p>
                  {/* El color no es el único portador: la razón va escrita. */}
                  <p
                    className={`mt-1 text-xs tabular-nums ${
                      fila.dormidoCentavos >= UMBRAL_DORMIDO_CENTAVOS
                        ? 'font-semibold text-destructive-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {fila.dormidoCentavos >= UMBRAL_DORMIDO_CENTAVOS ? '⚠ ' : ''}
                    {PESOS.format(fila.dormidoCentavos / 100)} dormido en {fila.linea}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-border pt-2 text-sm tabular-nums">
            Estimado {PESOS.format(estimado / 100)} ·{' '}
            {faltante === 0
              ? 'llega al mínimo del proveedor'
              : `faltan ${PESOS.format(faltante / 100)} para el mínimo`}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ordenadas.length === 0}
              onClick={() => {
                void copiarElPedido();
              }}
            >
              Copiar
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={ordenadas.length === 0}
              onClick={mandarElPedidoPorWhatsApp}
            >
              Mandar por WhatsApp
            </Button>
          </div>
          {avisoDelPedido !== null && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {avisoDelPedido}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * `'123.45'` → `12345`. Enteros, y con la misma regla que el servidor.
 *
 * `Math.round(x * 100)` pierde el medio centavo justo en el caso que importa
 * —`1234.995 * 100` da `123499.4999…`— así que se parte por el punto y se
 * rellenan los centavos. Esto SÓLO se usa para enseñar el total mientras se
 * captura: lo que se guarda va como texto y lo convierte el servidor.
 */
function aCentavos(pesos: string): number {
  const [enteros, decimales = ''] = pesos.trim().split('.');
  const centavos = `${decimales}00`.slice(0, 2);
  return Number.parseInt(enteros ?? '0', 10) * 100 + Number.parseInt(centavos, 10);
}
