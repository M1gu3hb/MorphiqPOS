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
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

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
 * ── El archivo es el camino ① y el manual el ③ ────────────────────────────
 * Doscientas líneas a mano son dos horas mal invertidas y mal capturadas. De
 * 198 líneas quedan 12 por resolver, y ésa es la diferencia entre capturar la
 * entrada el mismo día o «el fin de semana» — y las del fin de semana dejan
 * existencias en negativo toda la semana siguiente.
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
 * ese mismo dato no cambia nada. Por eso esas líneas se ordenan primero.
 *
 * ── Teléfono: recepción rápida con foto, y nada más ───────────────────────
 * Existe para el proveedor chico que llega con diez líneas. Las doscientas NO
 * se capturan en teléfono, así que ese bloque ni siquiera se ofrece ahí:
 * ofrecerlo sería prometer algo que acaba en una captura a medias.
 *
 * ── Alcance recortado por el límite de 300 líneas, dicho aquí ─────────────
 * Quedan fuera, cada uno en su sitio: el comparativo línea por línea de
 * «escanear contra pedido» (que aquí sólo se elige), el alta completa del
 * material, la captura manual partida a partida con su conversión de unidad en
 * vivo, y el kardex.
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

export interface NotaEnCaptura {
  readonly archivo: string | null;
  readonly lineas: number;
  readonly sinEmparejar: readonly LineaSinEmparejar[];
  readonly subidas: readonly SubidaDeCosto[];
  readonly totalCentavos: number;
  readonly vence: string | null;
}

export interface PedidoEnCamino {
  readonly id: string;
  readonly proveedor: string;
  readonly lineas: number;
  readonly llega: string;
  readonly totalCentavos: number;
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

export interface EntradasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly pedidosIniciales?: readonly PedidoEnCamino[];
  readonly filasIniciales?: readonly LineaSugerida[];
  readonly notaInicial?: NotaEnCaptura;
  readonly proveedores?: readonly string[];
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

export function Entradas({
  pedidosIniciales,
  filasIniciales,
  notaInicial,
  proveedores = ['Distribuidor Truper', 'Aceros del Norte', 'Cables MX'],
}: EntradasProps) {
  const sembrada = pedidosIniciales !== undefined || filasIniciales !== undefined;
  const [enCamino, setEnCamino] = useState<readonly PedidoEnCamino[] | null>(
    sembrada ? (pedidosIniciales ?? []) : null,
  );
  const [sugeridas, setSugeridas] = useState<readonly LineaSugerida[]>(filasIniciales ?? []);
  const [nota, setNota] = useState<NotaEnCaptura | null>(notaInicial ?? null);
  const [proveedor, setProveedor] = useState(proveedores[0] ?? '');
  const [aCredito, setACredito] = useState(true);
  const [dias, setDias] = useState('30');
  const [camino, setCamino] = useState<Camino>('archivo');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (pedidosIniciales !== undefined || filasIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    Promise.all([
      consultarPuente<PedidoEnCamino>('PedidoProveedor', { limite: 20, signal: control.signal }),
      consultarPuente<LineaSugerida>('LineaSugerida', { limite: 120, signal: control.signal }),
    ])
      .then(([llegando, porPedir]) => {
        if (!sigueMontada()) return;
        setEnCamino(llegando);
        setSugeridas(porPedir);
      })
      // La pantalla NUNCA se vacía por un error de red: se avisa y se sigue,
      // porque lo ya capturado vale más que un lienzo limpio.
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setEnCamino([]);
        setError(mensajeDe(fallo));
      });
    return () => {
      control.abort();
    };
  }, [pedidosIniciales, filasIniciales]);

  const ordenadas = useMemo(() => ordenarSugeridas(sugeridas), [sugeridas]);
  const estimado = ordenadas.reduce((suma, f) => suma + f.importeCentavos, 0);
  const faltante = Math.max(0, MINIMO_PEDIDO_CENTAVOS - estimado);
  const pendientes = nota?.sinEmparejar.length ?? 0;

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
      totalCentavos: 0,
      vence: null,
    });
  }

  if (enCamino === null) {
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
        <p className="text-sm text-muted-foreground">Recepción y pedido · {proveedor}</p>
      </header>

      {error !== null && (
        <p role="alert" className={`${BANDA} mb-3 border-destructive bg-destructive/15`}>
          ⚠️ {error} · Lo que ya estaba capturado sigue en pantalla.
        </p>
      )}

      <div className={REJILLA}>
        {/* PRIMERO SE VE · lo que ya viene, para no volver a pedirlo. */}
        <section aria-label="Pedidos en camino" className={`${TARJETA} xl:col-start-2`}>
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">En camino</h2>
          {enCamino.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nada en camino. Lo que pidas desde aquí aparecerá en esta franja hasta que llegue.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {enCamino.map((pedido) => (
                <li key={pedido.id} className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-medium">{pedido.proveedor}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {pedido.lineas} líneas · llega {pedido.llega} ·{' '}
                    {PESOS.format(pedido.totalCentavos / 100)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <main className={`${TARJETA} xl:col-start-1 xl:row-start-1 xl:row-span-2`}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Select value={proveedor} onValueChange={setProveedor}>
                <SelectTrigger id="proveedor" className="mt-1 w-full">
                  <SelectValue placeholder="Elige el proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((nombre) => (
                    <SelectItem key={nombre} value={nombre}>
                      {nombre}
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
                  Sube el archivo del proveedor y el sistema empareja lo que reconoce; tú resuelves
                  sólo lo que no, y te avisa de lo que subió de costo antes de que se venda a
                  pérdida. Una entrada capturada el mismo día evita una semana en negativo.
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
                            <a href={`/ferreteria/catalogo?buscar=${encodeURI(linea.descripcion)}`}>
                              Buscar…
                            </a>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={ocupado !== null}
                            onClick={() => {
                              void ejecutar('/api/entradas/alta-material', linea.id, {
                                proveedor,
                                codigoProveedor: linea.codigoProveedor,
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
                  <section aria-label="Materiales que subieron de costo" className="mt-3">
                    <h2 className="text-sm font-semibold">
                      ⚠ {nota.subidas.length} materiales subieron de costo
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
                    disabled={ocupado !== null}
                    onClick={() => {
                      void ejecutar('/api/entradas/recibir', CLAVE_GUARDAR, {
                        proveedor,
                        aCredito,
                        dias: Number(dias),
                        camino,
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
            Pedido sugerido · {proveedor}
          </h2>
          {ordenadas.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Sin sugerencias: se arman con la venta de los últimos 90 días. Recibe un par de notas
              y esta lista empieza a decir qué pedir y qué no.
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
                    Hay {fila.hay} · vendido 90 d {fila.vendido90d}
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
            <Button type="button" variant="outline" size="sm" disabled={ordenadas.length === 0}>
              Copiar
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={ordenadas.length === 0}>
              Mandar por WhatsApp
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
