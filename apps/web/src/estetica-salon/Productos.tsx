'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · productos
 *
 * El doble destino del mismo bote: anaquel y cabina.
 *
 * ── El caso que ningún otro modelo tiene ────────────────────────────────
 * El mismo shampoo de un litro puede acabar de dos maneras: se VENDE entero en
 * el anaquel, o se ABRE en cabina y se gasta en dosis durante tres semanas. Es
 * la misma clave de catálogo y son dos existencias con dos unidades distintas
 * —piezas y mililitros—, y el salón necesita las dos.
 *
 * ── Por qué sin esto el salón elige entre dos números malos ─────────────
 * O lleva el inventario de venta y no sabe cuánto producto se gasta en cabina
 * —que es el costo directo de cada servicio, el número que falta para saber si
 * un tinte deja dinero—, o lleva el de cabina y entonces el anaquel dice que
 * hay doce botes cuando hay nueve.
 *
 * ── Por qué abrir una pieza es un TRASPASO ──────────────────────────────
 * Sale una pieza del almacén de venta y entran `factor_apertura` unidades del
 * insumo base en el de cabina. Inventar aquí un segundo mecanismo daría dos
 * kardex, y el que no cuadre será el que nadie mire.
 *
 * ── Y por qué «¿alcanza?» se pregunta contra la AGENDA ──────────────────
 * Contra el consumo de ayer es enterarse el sábado de que el tinte rubio no
 * alcanza para las cuatro citas del sábado.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el catálogo con su destino, el factor de apertura, abrir una pieza y
 * preguntar si alcanza. Queda fuera la compra, que es del tronco.
 */

const RUTA_ABRIR = '/api/productos';
const RUTA_ALCANZA = '/api/inventario/cabina/alcanza';
const RUTA_ACTUALIZAR = '/api/catalogo/productos/actualizar';

const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;

/** Los tres destinos posibles de una clave en un salón. */
const DESTINOS = [
  { clave: 'venta', etiqueta: 'Sólo se vende' },
  { clave: 'cabina', etiqueta: 'Sólo se usa' },
  { clave: 'ambos', etiqueta: 'Las dos cosas' },
] as const;

export interface ProductoDeSalon {
  readonly id: string;
  readonly nombre: string;
  readonly destino: string | null;
  readonly factor_apertura: string | null;
  readonly unidad_cabina: string | null;
}

export interface FaltanteDeCabina {
  readonly insumoId: string;
  readonly hay: string;
  readonly hara_falta: string;
}

export interface ProductosProps {
  readonly productosIniciales?: readonly ProductoDeSalon[];
  readonly almacenVentaId: string;
  readonly almacenCabinaId: string;
}

/** Lo que falta para abrir una pieza. Se dice TODO, no el primer hueco. */
export function loQueFalta(producto: ProductoDeSalon): readonly string[] {
  const huecos: string[] = [];
  if (producto.factor_apertura === null) huecos.push('cuánto rinde al abrirse');
  if (producto.unidad_cabina === null) huecos.push('en qué se mide en cabina');
  return huecos;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

export function Productos({ productosIniciales, almacenVentaId, almacenCabinaId }: ProductosProps) {
  const voc = useVocabulario();
  const [productos, setProductos] = useState<readonly ProductoDeSalon[] | null>(
    productosIniciales ?? null,
  );
  const [elegido, setElegido] = useState<ProductoDeSalon | null>(null);
  const [factor, setFactor] = useState('');
  const [unidad, setUnidad] = useState('');
  const [piezas, setPiezas] = useState('1');
  const [faltantes, setFaltantes] = useState<readonly FaltanteDeCabina[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (productosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ProductoDeSalon>('ProductoTerminado', {
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setProductos(filas);
        })
        .catch(() => {
          if (sigueMontada()) setProductos([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productosIniciales]);

  function abrir(producto: ProductoDeSalon): void {
    setElegido(producto);
    setFactor(producto.factor_apertura ?? '');
    setUnidad(producto.unidad_cabina ?? '');
    setError(null);
    setAviso(null);
  }

  function guardarFicha(destino?: string): void {
    if (elegido === null) return;
    if (factor !== '' && !CANTIDAD_CON_FORMA.test(factor)) {
      setError('El rendimiento va con hasta cuatro decimales.');
      return;
    }
    setOcupado(true);
    setError(null);
    const siguiente: ProductoDeSalon = {
      ...elegido,
      destino: destino ?? elegido.destino,
      factor_apertura: factor === '' ? null : factor.replace(',', '.'),
      unidad_cabina: unidad === '' ? null : unidad,
    };
    invocarComando(RUTA_ACTUALIZAR, {
      productoId: elegido.id,
      destino: siguiente.destino,
      factorApertura: siguiente.factor_apertura,
      unidadCabina: siguiente.unidad_cabina,
    })
      .then(() => {
        setElegido(siguiente);
        setProductos((productos ?? []).map((p) => (p.id === elegido.id ? siguiente : p)));
        setAviso('Guardado.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function abrirPieza(): void {
    if (elegido === null) return;
    const cuantas = Number(piezas);
    if (!Number.isInteger(cuantas) || cuantas <= 0) {
      setError('Cuántas piezas se abren.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly unidadesACabina: string; readonly unidadCabina: string }>(
      `${RUTA_ABRIR}/${elegido.id}/abrir`,
      { almacenVentaId, almacenCabinaId, piezas: cuantas },
    )
      .then((salida) => {
        setAviso(`Entraron ${salida.unidadesACabina} ${salida.unidadCabina} a cabina.`);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function preguntarSiAlcanza(): void {
    setOcupado(true);
    setError(null);
    invocarComando<{ readonly alcanza: boolean; readonly faltantes: readonly FaltanteDeCabina[] }>(
      RUTA_ALCANZA,
      { almacenCabinaId, consumoEsperado: [] },
    )
      .then((salida) => {
        // Se devuelven TODOS los faltantes: quien va a comprar hace un viaje, y
        // enterarse de uno en uno son tres viajes.
        setFaltantes(salida.faltantes);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (productos === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[20rem_1fr]">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">{voc.titulo('producto', true)}</h1>
        <ul className="divide-y">
          {productos.map((producto) => (
            <li key={producto.id}>
              <button
                type="button"
                className={`w-full py-2 text-left ${elegido?.id === producto.id ? 'font-medium' : ''}`}
                onClick={() => {
                  abrir(producto);
                }}
              >
                {producto.nombre}
                <span className="text-muted-foreground ml-2 text-xs">
                  {DESTINOS.find((d) => d.clave === producto.destino)?.etiqueta ?? 'sin destino'}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <Separator />

        <Button
          variant="outline"
          className="w-full"
          disabled={ocupado}
          onClick={preguntarSiAlcanza}
        >
          ¿Alcanza para lo agendado?
        </Button>
        {faltantes !== null && faltantes.length === 0 && (
          <p className="text-sm">Alcanza para todo lo que está agendado.</p>
        )}
        {faltantes !== null && faltantes.length > 0 && (
          <ul className="text-sm">
            {faltantes.map((faltante) => (
              <li key={faltante.insumoId}>
                Falta: hay {faltante.hay} y hacen falta {faltante.hara_falta}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {aviso !== null && <p className="text-sm">{aviso}</p>}

        {elegido === null && (
          <p className="text-muted-foreground">
            Elige {voc.enFraseCon('un', 'producto')} para ver su destino.
          </p>
        )}

        {elegido !== null && (
          <>
            <h2 className="text-xl font-medium">{elegido.nombre}</h2>

            <div className="flex flex-wrap gap-2">
              {DESTINOS.map((destino) => (
                <Button
                  key={destino.clave}
                  type="button"
                  variant={elegido.destino === destino.clave ? 'default' : 'outline'}
                  onClick={() => {
                    guardarFicha(destino.clave);
                  }}
                >
                  {destino.etiqueta}
                </Button>
              ))}
            </div>

            {elegido.destino !== 'venta' && (
              <>
                <Separator />
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="factor">Rinde al abrirse</Label>
                    <Input
                      id="factor"
                      inputMode="decimal"
                      className="h-[calc(var(--altura-control)*1.2)] text-right"
                      placeholder="1000"
                      value={factor}
                      onChange={(evento) => {
                        setFactor(evento.target.value);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="unidad">Se mide en</Label>
                    <Input
                      id="unidad"
                      className="h-[calc(var(--altura-control)*1.2)]"
                      placeholder="ml"
                      value={unidad}
                      onChange={(evento) => {
                        setUnidad(evento.target.value);
                      }}
                    />
                  </div>
                </div>
                <p className="text-muted-foreground text-sm">
                  Si entrara «uno» en vez del rendimiento, el consumo de tres semanas daría negativo
                  al segundo servicio.
                </p>
                <Button
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => {
                    guardarFicha();
                  }}
                >
                  Guardar la ficha
                </Button>

                <Separator />

                <div className="flex items-end gap-3">
                  <div className="w-28">
                    <Label htmlFor="piezas">Piezas</Label>
                    <Input
                      id="piezas"
                      inputMode="numeric"
                      className="h-[calc(var(--altura-control)*1.4)] text-right text-lg"
                      value={piezas}
                      onChange={(evento) => {
                        setPiezas(evento.target.value);
                      }}
                    />
                  </div>
                  <Button
                    className="h-[calc(var(--altura-control)*1.4)]"
                    disabled={ocupado || loQueFalta(elegido).length > 0}
                    onClick={abrirPieza}
                  >
                    Abrir en cabina
                  </Button>
                </div>
                {loQueFalta(elegido).length > 0 && (
                  <p className="text-sm">Falta por decir: {loQueFalta(elegido).join(' y ')}.</p>
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
