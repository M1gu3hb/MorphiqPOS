'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · abarrotes · entradas
 *
 * Recibir al proveedor y pedirle bien, de pie, en cinco minutos.
 *
 * ── «Hoy toca» es el corazón de esta pantalla ───────────────────────────
 * El sistema sabe qué proveedor viene hoy porque el proveedor tiene día de
 * visita, y prepara la lista ANTES de que llegue. Eso es lo que convierte el
 * módulo de compras de «trámite de oficina» a «herramienta de mostrador».
 * Abrirla en blanco y esperar a que alguien busque al proveedor es tenerla sin
 * usar.
 *
 * ── La unidad se elige ANTES que la cantidad ────────────────────────────
 * Y la equivalencia se muestra en vivo. Es la prevención del error de
 * inventario número uno: teclear 18 pensando en cajas cuando el campo espera
 * piezas mete 18 piezas donde entraron 216, y nadie lo nota hasta el conteo.
 *
 * ── La caducidad va EN LA ENTRADA, no en el producto ────────────────────
 * «La leche que llegó el jueves» es lo que una tiendita maneja. Pedirla aquí,
 * con la caja en la mano, es la única forma de que se conteste; pedirla después
 * desde el catálogo es no pedirla.
 *
 * ── Y el aviso de cambio de costo trae PRECIO SUGERIDO ──────────────────
 * «El pan subió 5.2 %» no es accionable. «Subió 5.2 %, véndelo a $48 en vez de
 * $46» sí, y es lo que un tendero llamaría «el sistema me avisó antes de que
 * perdiera dinero».
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben quién viene hoy, el sugerido, la captura de la nota con caducidad y el
 * aviso de costo. Queda fuera el canje en la misma nota, que necesita el
 * comando de devolución a proveedor.
 */

const RUTA_RECIBIR = '/api/compras/recibir-nota';
const RUTA_SUGERENCIA = '/api/compras/sugerencia';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Más de esto no es el mercado: es un renglón mal capturado. */
const SUBIDA_QUE_AVISA = 0.05;

export interface ProveedorDelDia {
  readonly id: string;
  readonly nombre: string;
  readonly dia_visita: number | null;
  readonly frecuencia: string | null;
}

export interface RenglonSugerido {
  readonly insumoId: string;
  readonly nombre: string;
  readonly existencia: string;
  readonly ventaCatorceDias: string;
  readonly sugerido: string;
  readonly unidadCompra: string;
}

export interface LineaCapturada {
  readonly insumoId: string;
  readonly nombre: string;
  /** La UNIDAD va primero: es la prevención del error de inventario número uno. */
  readonly unidad: string;
  readonly equivalencia: string;
  readonly cantidad: string;
  readonly costoTotal: string;
  readonly caducaEl: string;
  readonly costoAnteriorCentavos: number | null;
  readonly precioVentaCentavos: number | null;
}

export interface EntradasProps {
  readonly proveedoresIniciales?: readonly ProveedorDelDia[];
  /**
   * YA NO SE USA, y se queda declarado para que nadie lo vuelva a pasar.
   *
   * El almacén es ámbito: lo resuelve el servidor desde la sesión. Cuando esta
   * pantalla lo exigía, `page.tsx` la montaba con la cadena vacía y la pantalla se
   * quedaba en blanco esperando un dato que nadie le iba a dar.
   */
  readonly almacenId?: never;
  readonly hoy?: number;
}

/** El aviso que evita perder dinero: cuánto subió y a cuánto habría que venderlo. */
export interface AvisoDeCosto {
  readonly nombre: string;
  readonly subidaPct: string;
  readonly precioSugeridoCentavos: number;
}

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
}

function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/**
 * Cuánto subió el costo por unidad y a cuánto habría que vender para no perder.
 *
 * El margen se conserva: si vendía al 50 % sobre costo, se sugiere el mismo
 * 50 % sobre el costo nuevo. Sugerir «costo + $2» conservaría el peso y perdería
 * el porcentaje, que es lo que de verdad paga la renta.
 */
export function avisoDeCosto(linea: LineaCapturada): AvisoDeCosto | null {
  const costoTotal = aCentavos(linea.costoTotal);
  const cantidad = Number(linea.cantidad.replace(',', '.'));
  const equivalencia = Number(linea.equivalencia.replace(',', '.'));
  const anterior = linea.costoAnteriorCentavos;
  if (costoTotal === null || anterior === null || anterior <= 0) return null;
  if (!Number.isFinite(cantidad) || !Number.isFinite(equivalencia)) return null;
  const unidades = cantidad * equivalencia;
  if (unidades <= 0) return null;

  const nuevo = costoTotal / unidades;
  const subida = (nuevo - anterior) / anterior;
  if (subida < SUBIDA_QUE_AVISA) return null;

  const precio = linea.precioVentaCentavos;
  const margen = precio === null || precio <= 0 ? 1.5 : precio / anterior;
  return {
    nombre: linea.nombre,
    subidaPct: (subida * 100).toFixed(1),
    precioSugeridoCentavos: Math.ceil((nuevo * margen) / 100) * 100,
  };
}

/** `0` es domingo, como `extract(dow)`. */
export function tocanHoy(
  proveedores: readonly ProveedorDelDia[],
  diaSemana: number,
): readonly ProveedorDelDia[] {
  return proveedores.filter((p) => p.dia_visita === diaSemana);
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar la entrada. Lo capturado sigue aquí.';
}

export function Entradas({ proveedoresIniciales, hoy }: EntradasProps) {
  const [proveedores, setProveedores] = useState<readonly ProveedorDelDia[] | null>(
    proveedoresIniciales ?? null,
  );
  const [elegido, setElegido] = useState<ProveedorDelDia | null>(null);
  const [sugerido, setSugerido] = useState<readonly RenglonSugerido[] | null>(null);
  const [lineas, setLineas] = useState<readonly LineaCapturada[]>([]);
  const [diaSemana, setDiaSemana] = useState<number | null>(hoy ?? null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState<string | null>(null);

  useEffect(() => {
    if (hoy !== undefined) return;
    // El día se lee en un efecto y no en el cuerpo: un reloj leído durante el
    // render es un desajuste de hidratación garantizado. Y va en un
    // `setTimeout`: escribir estado de forma síncrona aquí encadena renders.
    const arranque = setTimeout(() => {
      setDiaSemana(new Date().getDay());
    });
    return () => {
      clearTimeout(arranque);
    };
  }, [hoy]);

  useEffect(() => {
    if (proveedoresIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      // Los PROVEEDORES no dependen del almacén: son del negocio.
      //
      // Aquí había una guarda `if (almacenId === '') return;` heredada de cuando
      // esta pantalla consultaba con un id vacío y se llevaba un 22P02 en cada
      // apertura. La guarda tapó el 500 y dejó otra avería en su lugar: `page.tsx`
      // monta esta pantalla con la cadena vacía, así que la consulta NO CORRÍA
      // NUNCA y la pantalla se quedaba en su esqueleto, en blanco, para siempre.
      // El almacén es ámbito y lo resuelve el servidor al recibir la nota.
      consultarPuente<ProveedorDelDia>('Proveedor', { limite: 200, signal: control.signal })
        .then((filas) => {
          if (sigueMontada()) setProveedores(filas);
        })
        .catch(() => {
          if (sigueMontada()) setProveedores([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [proveedoresIniciales]);

  function elegir(proveedor: ProveedorDelDia): void {
    setElegido(proveedor);
    setSugerido(null);
    setLineas([]);
    setGuardada(null);
    invocarComando<{ readonly renglones: readonly RenglonSugerido[] }>(
      `${RUTA_SUGERENCIA}/${proveedor.id}`,
      {},
    )
      .then((datos) => {
        setSugerido(datos.renglones);
      })
      .catch(() => {
        setSugerido([]);
      });
  }

  function agregarDesdeSugerido(renglon: RenglonSugerido): void {
    setLineas([
      ...lineas,
      {
        insumoId: renglon.insumoId,
        nombre: renglon.nombre,
        unidad: renglon.unidadCompra,
        equivalencia: '1',
        cantidad: renglon.sugerido,
        costoTotal: '',
        caducaEl: '',
        costoAnteriorCentavos: null,
        precioVentaCentavos: null,
      },
    ]);
  }

  function cambiar(indice: number, cambios: Partial<LineaCapturada>): void {
    setLineas(lineas.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)));
  }

  function guardar(): void {
    if (elegido === null || lineas.length === 0) return;
    const invalida = lineas.find(
      (l) => !CANTIDAD_CON_FORMA.test(l.cantidad) || aCentavos(l.costoTotal) === null,
    );
    if (invalida !== undefined) {
      setError(`Revisa la cantidad y el costo de «${invalida.nombre}».`);
      return;
    }
    setGuardando(true);
    setError(null);
    invocarComando<{ readonly compraId: string; readonly caducidadesRegistradas: number }>(
      RUTA_RECIBIR,
      {
        // El almacén NO se manda: sale de la sesión del servidor (R16). Esta
        // pantalla no puede saberlo y fingir que sí la dejaba en blanco.
        proveedorId: elegido.id,
        lineas: lineas.map((l) => ({
          insumoId: l.insumoId,
          cantidadCapturada: l.cantidad.replace(',', '.'),
          unidadCapturada: l.unidad,
          equivalencia: l.equivalencia.replace(',', '.'),
          costoTotal: l.costoTotal.replace(',', '.'),
          ...(l.caducaEl === '' ? {} : { caducaEl: l.caducaEl }),
        })),
      },
    )
      .then((salida) => {
        setGuardada(
          salida.caducidadesRegistradas > 0
            ? `Entrada guardada, con ${String(salida.caducidadesRegistradas)} caducidad${
                salida.caducidadesRegistradas === 1 ? '' : 'es'
              }.`
            : 'Entrada guardada.',
        );
        setLineas([]);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  if (proveedores === null || diaSemana === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const hoyToca = tocanHoy(proveedores, diaSemana);
  const avisos = lineas.map(avisoDeCosto).filter((a): a is AvisoDeCosto => a !== null);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Entradas</h1>
        <p className="text-muted-foreground text-sm">Quién viene hoy y qué hay que pedirle.</p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {guardada !== null && <p className="text-sm">{guardada}</p>}

      <section className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <div className="space-y-2">
          <h2 className="font-medium">Hoy toca</h2>
          {hoyToca.length === 0 && (
            <p className="text-muted-foreground text-sm">Hoy no viene nadie de ruta.</p>
          )}
          {hoyToca.map((proveedor) => (
            <Button
              key={proveedor.id}
              variant={elegido?.id === proveedor.id ? 'default' : 'outline'}
              className="h-[calc(var(--altura-control)*1.4)] w-full justify-start text-base"
              onClick={() => {
                elegir(proveedor);
              }}
            >
              {proveedor.nombre}
              <span className="text-muted-foreground ml-2 text-xs">
                {proveedor.frecuencia ?? ''}
              </span>
            </Button>
          ))}

          <Separator className="my-3" />

          <h2 className="font-medium">Los demás</h2>
          {proveedores
            .filter((p) => p.dia_visita !== diaSemana)
            .slice(0, 12)
            .map((proveedor) => (
              <Button
                key={proveedor.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  elegir(proveedor);
                }}
              >
                {proveedor.nombre}
              </Button>
            ))}
        </div>

        <div className="space-y-4">
          {elegido === null && (
            <p className="text-muted-foreground">Elige un proveedor para ver qué pedirle.</p>
          )}

          {elegido !== null && (
            <>
              <h2 className="font-medium">Pedido sugerido · {elegido.nombre}</h2>
              {sugerido === null && <Skeleton className="h-32 w-full" />}
              {sugerido !== null && sugerido.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  No hay sugerencia: falta historia de venta de este proveedor.
                </p>
              )}
              <ul className="divide-y">
                {(sugerido ?? []).map((renglon) => (
                  <li key={renglon.insumoId} className="flex items-center gap-3 py-2">
                    <span className="flex-1">{renglon.nombre}</span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      hay {renglon.existencia} · 14d {renglon.ventaCatorceDias}
                    </span>
                    <span className="font-medium tabular-nums">
                      {renglon.sugerido} {renglon.unidadCompra}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        agregarDesdeSugerido(renglon);
                      }}
                    >
                      Agregar
                    </Button>
                  </li>
                ))}
              </ul>

              <Separator />

              <h2 className="font-medium">La nota</h2>
              {lineas.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  Agrega del sugerido, o captura lo que traiga el repartidor.
                </p>
              )}
              <ul className="space-y-3">
                {lineas.map((linea, indice) => (
                  <li key={`${linea.insumoId}-${String(indice)}`} className="rounded border p-3">
                    <p className="font-medium">{linea.nombre}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div>
                        <Label htmlFor={`unidad-${String(indice)}`}>Unidad</Label>
                        <Input
                          id={`unidad-${String(indice)}`}
                          className="h-[calc(var(--altura-control)*1.2)]"
                          value={linea.unidad}
                          onChange={(evento) => {
                            cambiar(indice, { unidad: evento.target.value });
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`equiv-${String(indice)}`}>Trae</Label>
                        <Input
                          id={`equiv-${String(indice)}`}
                          inputMode="decimal"
                          className="h-[calc(var(--altura-control)*1.2)] text-right"
                          value={linea.equivalencia}
                          onChange={(evento) => {
                            cambiar(indice, { equivalencia: evento.target.value });
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`cant-${String(indice)}`}>Cantidad</Label>
                        <Input
                          id={`cant-${String(indice)}`}
                          inputMode="decimal"
                          className="h-[calc(var(--altura-control)*1.2)] text-right"
                          value={linea.cantidad}
                          onChange={(evento) => {
                            cambiar(indice, { cantidad: evento.target.value });
                          }}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`costo-${String(indice)}`}>Costo total</Label>
                        <Input
                          id={`costo-${String(indice)}`}
                          inputMode="decimal"
                          className="h-[calc(var(--altura-control)*1.2)] text-right"
                          value={linea.costoTotal}
                          onChange={(evento) => {
                            cambiar(indice, { costoTotal: evento.target.value });
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <Label htmlFor={`caduca-${String(indice)}`}>Caduca el (si caduca)</Label>
                      <Input
                        id={`caduca-${String(indice)}`}
                        type="date"
                        className="h-[calc(var(--altura-control)*1.2)] w-48"
                        value={linea.caducaEl}
                        onChange={(evento) => {
                          cambiar(indice, { caducaEl: evento.target.value });
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {avisos.map((aviso) => (
                <p key={aviso.nombre} className="text-sm">
                  {aviso.nombre} subió {aviso.subidaPct} %. Véndelo a{' '}
                  {pesos(aviso.precioSugeridoCentavos)} para no perder margen.
                </p>
              ))}

              <Button
                className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
                disabled={guardando || lineas.length === 0}
                onClick={guardar}
              >
                Guardar entrada
              </Button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
