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
 * PANTALLA · abarrotes · producto
 *
 * La ficha: precio, costo, presentaciones y el impuesto que le toca.
 *
 * ── Por qué el precio de la caja NO es 24 veces el de la pieza ──────────
 * Es menos, siempre, y por eso cada presentación lleva su propio precio en vez
 * de derivarse del factor. Derivarlo haría que el mayoreo no existiera: el
 * sistema cobraría el precio de menudeo multiplicado y nadie compraría la caja.
 *
 * ── Por qué el margen se enseña en PESOS y en PORCENTAJE ────────────────
 * Los dos números deciden cosas distintas. El porcentaje dice si el producto
 * vale la pena en el anaquel; los pesos dicen cuánto deja cada venta, que es lo
 * que se compara contra el esfuerzo de venderlo. Con uno solo se toman
 * decisiones a medias.
 *
 * ── Por qué la caducidad es una PERILLA y no un campo ───────────────────
 * Lo que no caduca no tiene que aparecer en la lista de la mañana. Una lista de
 * caducidades llena de tornillos y bolsas de carbón deja de leerse a la tercera
 * mañana, y entonces no sirve para la leche, que era el punto.
 *
 * ── Por qué el IVA es una lista cerrada ─────────────────────────────────
 * Cero, 8 % de frontera y 16 %. Con un porcentaje libre alguien teclea 15 % y
 * nadie lo ve hasta la declaración.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben la ficha, el precio, el costo, las presentaciones y el régimen fiscal.
 * Queda fuera el kardex del producto, que es su propia pantalla.
 */

const RUTA_ACTUALIZAR = '/api/catalogo/productos/actualizar';
const RUTA_PRECIO = '/api/catalogo/productos/precio';
const RUTA_PRESENTACION = '/api/catalogo/presentacion';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Cerrada a propósito: con un porcentaje libre alguien teclea 15 %. */
const TASAS_IVA = [
  { bp: 0, etiqueta: 'Exento' },
  { bp: 800, etiqueta: '8 % frontera' },
  { bp: 1600, etiqueta: '16 %' },
] as const;

export interface FichaDeProducto {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly codigo_barras: string | null;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad NO sirve: lo expone como
   * `precio_venta`, ya convertido por `dinero`. Llegaba `undefined` y la pantalla
   * enseñaba `$NaN`.
   */
  readonly precio_venta: number | null;
  /** EN PESOS: la entidad sirve `costo_calculado_actual`. */
  readonly costo_calculado_actual: number | null;
  readonly controla_caducidad: boolean;
  readonly tasa_iva_bp: number;
}

export interface PresentacionDeProducto {
  readonly id: string;
  readonly nombre: string;
  /** El puente lo sirve con `conversion: 'decimal'`: es un NÚMERO, no texto. */
  readonly factor: number;
  /**
   * EN PESOS y con el nombre del puente: `Presentacion` sirve
   * `precio_venta_centavos` con la conversión `dinero`.
   *
   * Aquí se leía `precio_centavos`, que no existe: el six de refrescos enseñaba
   * `$NaN` en su renglón con el precio puesto en la base.
   */
  readonly precio_venta_centavos: number | null;
  readonly codigo_barras: string | null;
}

export interface ProductoProps {
  readonly productoId: string;
  readonly fichaInicial?: FichaDeProducto;
  readonly presentacionesIniciales?: readonly PresentacionDeProducto[];
}

export interface Margen {
  readonly pesos: string;
  readonly porcentaje: string;
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
 * Los dos números del margen, porque deciden cosas distintas.
 *
 * El porcentaje dice si vale la pena el anaquel; los pesos, cuánto deja cada
 * venta. Devolver uno solo es tomar la decisión a medias.
 */
export function margenDe(precioCentavos: number, costoCentavos: number): Margen | null {
  if (precioCentavos <= 0) return null;
  const ganancia = precioCentavos - costoCentavos;
  return {
    pesos: PESOS.format(ganancia / 100),
    porcentaje: ((ganancia * 100) / precioCentavos).toFixed(1),
  };
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar. Lo capturado sigue aquí.';
}

export function Producto({ productoId, fichaInicial, presentacionesIniciales }: ProductoProps) {
  // F-017 · Esta pantalla la heredan los dieciocho modelos de retail, y no todos
  // venden «productosº: Ferretería La Broca vende MATERIAL, y su propia carpeta
  // lo levantó como defecto —«artículo donde debe decir material»—. El sustantivo
  // sale del giro del negocio, que es la mitad de lo que hace que una plantilla
  // se sienta propia y no prestada.
  const vocabulario = useVocabulario();
  const [ficha, setFicha] = useState<FichaDeProducto | null>(fichaInicial ?? null);
  const [presentaciones, setPresentaciones] = useState<readonly PresentacionDeProducto[] | null>(
    presentacionesIniciales ?? null,
  );
  const [precio, setPrecio] = useState('');
  const [nueva, setNueva] = useState({ nombre: '', factor: '', precio: '', codigo: '' });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (fichaInicial !== undefined && presentacionesIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const cargar = (): void => {
      // Sin id no se consulta.
      //
      // Estas pantallas se abren SIN nada seleccionado -`page.tsx` las monta con
      // la cadena vacia- y consultar con ella manda un `where id = ''` a una
      // columna uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en
      // cada apertura. El estado de «elige algo» ya esta escrito debajo; lo que
      // faltaba era no pedir datos de lo que nadie eligio.
      if (productoId === '') return;
      if (fichaInicial === undefined) {
        consultarPuente<FichaDeProducto>('ProductoTerminado', {
          filtro: { id: productoId },
          limite: 1,
          signal: control.signal,
        })
          .then((filas) => {
            if (!sigueMontada()) return;
            const primera = filas[0];
            if (primera !== undefined) {
              setFicha(primera);
              setPrecio((primera.precio_venta ?? 0).toFixed(2));
            }
          })
          .catch(() => {
            if (sigueMontada()) setError('No se pudo leer la ficha.');
          });
      }
      if (presentacionesIniciales === undefined) {
        consultarPuente<PresentacionDeProducto>('Presentacion', {
          filtro: { producto_id: productoId },
          limite: 40,
          signal: control.signal,
        })
          .then((filas) => {
            if (sigueMontada()) setPresentaciones(filas);
          })
          .catch(() => {
            if (sigueMontada()) setPresentaciones([]);
          });
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [productoId, fichaInicial, presentacionesIniciales]);

  function guardarPrecio(): void {
    const centavos = aCentavos(precio);
    if (centavos === null) {
      setError('Revisa el precio: sólo pesos y centavos.');
      return;
    }
    setGuardando(true);
    setError(null);
    // `importe` es una cadena en PESOS. Antes iba `precioVentaCentavos` —un número de
    // centavos que el esquema no conoce— y cada guardado contestaba 400.
    invocarComando(RUTA_PRECIO, { productoId, precioVenta: (centavos / 100).toFixed(2) })
      .then(() => {
        setFicha(ficha === null ? null : { ...ficha, precio_venta: centavos / 100 });
        setAviso('Precio guardado.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  function cambiarPerilla(cambios: Partial<FichaDeProducto>): void {
    if (ficha === null) return;
    const siguiente = { ...ficha, ...cambios };
    setFicha(siguiente);
    invocarComando(RUTA_ACTUALIZAR, { productoId, ...cambios }).catch((fallo: unknown) => {
      // Se devuelve la perilla a su sitio: dejarla movida haría creer que se
      // guardó algo que no se guardó, y la lista de la mañana no cambiaría.
      setFicha(ficha);
      setError(mensajeDe(fallo));
    });
  }

  function agregarPresentacion(): void {
    const centavos = aCentavos(nueva.precio);
    if (nueva.nombre.trim() === '' || centavos === null) {
      setError('La presentación necesita nombre y precio.');
      return;
    }
    setGuardando(true);
    setError(null);
    /**
     * Dos cosas que el comando NO acepta como iban:
     *
     *  · `precioCentavos` se llama `precioVentaCentavos` en `entradaCrearPresentacion`;
     *  · `codigoBarras` es `optional()` y NO `nullable()`: mandar `null` es un 400. Sin
     *    código, la clave no viaja.
     */
    const codigo = nueva.codigo.trim();
    invocarComando<PresentacionDeProducto>(RUTA_PRESENTACION, {
      productoId,
      nombre: nueva.nombre.trim(),
      factor: nueva.factor.replace(',', '.'),
      precioVentaCentavos: centavos,
      ...(codigo === '' ? {} : { codigoBarras: codigo }),
    })
      .then((creada) => {
        setPresentaciones([...(presentaciones ?? []), creada]);
        setNueva({ nombre: '', factor: '', precio: '', codigo: '' });
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  // El VACÍO QUE ENSEÑA, y por qué hacía falta.
  //
  // `page.tsx` monta esta pantalla sin producto elegido —se llega a ella desde el
  // catálogo, tocando un renglón— y el efecto, con razón, no consulta con un id
  // vacío. Lo que faltaba es qué enseñar mientras tanto: sin esto, la pantalla se
  // quedaba en su esqueleto PARA SIEMPRE, en blanco, y la suite la daba por
  // probada porque respondía 200.
  if (productoId === '' && fichaInicial === undefined) {
    return (
      <main className="mx-auto max-w-prose space-y-(--espacio-3) p-(--espacio-8) text-center">
        <h1 className="text-xl font-semibold">
          Aquí se abre la ficha de {vocabulario.enFraseCon('un', 'producto')}
        </h1>
        <p className="text-muted-foreground text-sm">
          Precio, costo, margen, impuesto, caducidad y presentaciones. Se llega desde el catálogo:
          toca el renglón {vocabulario.conDeterminante('ese', 'producto')} y su ficha se abre aquí.
        </p>
        <Button asChild>
          <a href="/abarrotes/existencias">Ir a Existencias</a>
        </Button>
      </main>
    );
  }

  if (ficha === null) {
    return (
      <div className="space-y-(--espacio-4) p-(--espacio-6)">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // En centavos enteros: el margen en pesos con decimales sale con tres cifras
  // que nadie puede cobrar.
  const enCentavos = (pesos: number | null): number => Math.round((pesos ?? 0) * 100);
  const margen = margenDe(enCentavos(ficha.precio_venta), enCentavos(ficha.costo_calculado_actual));

  return (
    <main className="mx-auto max-w-3xl space-y-(--espacio-6) p-(--espacio-6)">
      <header>
        <h1 className="text-2xl font-semibold">{ficha.nombre}</h1>
        <p className="text-muted-foreground text-sm">
          {vocabulario.conArticulo('producto')} · {ficha.codigo_barras ?? ficha.sku ?? 'Sin código'}
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {aviso !== null && <p className="text-sm">{aviso}</p>}

      <section className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
        <h2 className="font-medium">Precio y margen</h2>
        <div className="flex items-end gap-(--espacio-3)">
          <div>
            <Label htmlFor="precio">Precio de venta</Label>
            <Input
              id="precio"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.4)] w-40 text-right text-lg"
              value={precio}
              onChange={(evento) => {
                setPrecio(evento.target.value);
              }}
            />
          </div>
          <Button
            className="h-[calc(var(--altura-control)*1.4)]"
            disabled={guardando}
            onClick={guardarPrecio}
          >
            Guardar
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          Cuesta {pesos(enCentavos(ficha.costo_calculado_actual))}
          {margen !== null && ` · deja ${margen.pesos} (${margen.porcentaje} %)`}
        </p>
        {margen === null && <p className="text-sm">Sin precio no hay margen que calcular.</p>}
      </section>

      <section className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
        <h2 className="font-medium">Impuesto</h2>
        <div className="flex flex-wrap gap-2">
          {TASAS_IVA.map((tasa) => (
            <Button
              key={tasa.bp}
              type="button"
              aria-pressed={ficha.tasa_iva_bp === tasa.bp}
              variant={ficha.tasa_iva_bp === tasa.bp ? 'default' : 'outline'}
              onClick={() => {
                cambiarPerilla({ tasa_iva_bp: tasa.bp });
              }}
            >
              {tasa.etiqueta}
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-(--espacio-3) rounded-lg border p-(--espacio-4)">
        <h2 className="font-medium">Caducidad</h2>
        <p className="text-muted-foreground text-sm">
          Enciéndela sólo en lo que de verdad caduca: una lista llena de lo que no se lee.
        </p>
        <Button
          type="button"
          variant={ficha.controla_caducidad ? 'default' : 'outline'}
          className="h-[calc(var(--altura-control)*1.4)]"
          onClick={() => {
            cambiarPerilla({ controla_caducidad: !ficha.controla_caducidad });
          }}
        >
          {ficha.controla_caducidad ? 'Lleva caducidad' : 'No caduca'}
        </Button>
      </section>

      <Separator />

      <section className="space-y-(--espacio-3)">
        <h2 className="font-medium">Presentaciones</h2>
        <p className="text-muted-foreground text-sm">
          Cada una con su precio: el de la caja no es el de la pieza multiplicado.
        </p>
        {presentaciones === null && (
          <Skeleton className="h-[calc(var(--altura-control)*2)] w-full" />
        )}
        <ul className="divide-y">
          {(presentaciones ?? []).map((presentacion) => (
            <li key={presentacion.id} className="flex items-baseline justify-between py-2">
              <span>{presentacion.nombre}</span>
              <span className="text-muted-foreground text-sm">× {String(presentacion.factor)}</span>
              <span className="tabular-nums">
                {pesos(Math.round((presentacion.precio_venta_centavos ?? 0) * 100))}
              </span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-2 gap-(--espacio-3) md:grid-cols-4">
          <div>
            <Label htmlFor="pres-nombre">Nombre</Label>
            <Input
              id="pres-nombre"
              className="h-[calc(var(--altura-control)*1.2)]"
              placeholder="caja de 24"
              value={nueva.nombre}
              onChange={(evento) => {
                setNueva({ ...nueva, nombre: evento.target.value });
              }}
            />
          </div>
          <div>
            <Label htmlFor="pres-factor">Trae</Label>
            <Input
              id="pres-factor"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.2)] text-right"
              value={nueva.factor}
              onChange={(evento) => {
                setNueva({ ...nueva, factor: evento.target.value });
              }}
            />
          </div>
          <div>
            <Label htmlFor="pres-precio">Precio</Label>
            <Input
              id="pres-precio"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.2)] text-right"
              value={nueva.precio}
              onChange={(evento) => {
                setNueva({ ...nueva, precio: evento.target.value });
              }}
            />
          </div>
          <div>
            <Label htmlFor="pres-codigo">Código</Label>
            <Input
              id="pres-codigo"
              className="h-[calc(var(--altura-control)*1.2)]"
              value={nueva.codigo}
              onChange={(evento) => {
                setNueva({ ...nueva, codigo: evento.target.value });
              }}
            />
          </div>
        </div>
        <Button variant="outline" disabled={guardando} onClick={agregarPresentacion}>
          Agregar presentación
        </Button>
      </section>
    </main>
  );
}
