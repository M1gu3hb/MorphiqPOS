'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@morphiqpos/ui/primitivas/collapsible';
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
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · alta-rapida-de-producto
 *
 * El diálogo que abre Cobrar cuando el lector canta un código que no está en el
 * catálogo. 5 a 30 veces al día las primeras semanas; 1 a 3 después.
 *
 * ── Por qué existe ───────────────────────────────────────────────────────
 * En hora pico, «este producto no está en el catálogo» tiene dos salidas:
 * perder la venta, o cobrarla sin registrar. Las dos son malas y las dos
 * pasan. Esta pantalla convierte el hueco en el mecanismo por el que el
 * catálogo se completa solo DURANTE la operación normal, sin que nadie se
 * siente a capturar 1,800 productos un domingo.
 *
 * ── Por qué sólo tres campos ─────────────────────────────────────────────
 * Nombre, precio y categoría. El costo es opcional porque se corrige solo en
 * la primera entrada de compra (F-633), y el stock arranca en 0 porque se
 * corrige en el primer conteo. Cada campo de más es un segundo con seis
 * personas en la fila, y un dato que el cajero rellena con basura por salir.
 *
 * ── Por qué la categoría sí es obligatoria ───────────────────────────────
 * Porque de ella salen la TASA DE IVA y el RÉGIMEN DE IEPS. Es la única
 * manera realista de que el catálogo entero quede bien clasificado sin
 * decidir el impuesto producto por producto.
 *
 * ── El código ocupado no es un error: es una bifurcación ─────────────────
 * «Este código ya es de X» es el fallo que más va a pasar, y el camino
 * correcto casi siempre es agregar una presentación a ese producto, no crear
 * otro. Se comprueba al GUARDAR y no al abrir: entre abrir y guardar, la otra
 * caja pudo darlo de alta, y el servidor es el único que sabe la verdad.
 *
 * ── Por qué el precio viaja como TEXTO ───────────────────────────────────
 * R15: el dinero nunca pasa por punto flotante en el navegador. Aquí se valida
 * la forma con una expresión regular y se manda la cadena tal cual; quien
 * convierte a centavos es el servidor, en un solo sitio.
 *
 * ── Lo que quedó fuera, a propósito ──────────────────────────────────────
 * Las presentaciones no se capturan aquí (se agregan desde la ficha), y la
 * tasa de IVA no se muestra junto a la categoría porque hoy el puente no
 * expone ese campo de `CategoriaProducto`: enseñarla exigiría inventarla.
 */

/**
 * El documento no nombra la ruta del comando, así que se usa la convención del
 * monorepo: `/api/<dominio>/<verbo>`.
 */
/**
 * La ruta del alta, que YA EXISTÍA en otro sitio.
 *
 * Aquí decía `/api/abarrotes/alta-rapida` —la convención del giro— y la ruta de
 * verdad es `/api/catalogo/alta-rapida`, porque el alta rápida no es de abarrotes:
 * la usa cualquier mostrador que escanee algo que no está en el catálogo. Con la
 * otra, el botón devolvía la página de error de Next y el producto no se creaba:
 * la venta se perdía o se cobraba a mano, que son las dos salidas que este
 * formulario viene a quitar.
 */
const RUTA_ALTA = '/api/catalogo/alta-rapida';

/** Forma de un importe tecleado. Sin `Number` ni `parseFloat` de por medio. */
const PRECIO_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PRECIO_EN_CERO = /^0+(?:[.,]0{1,2})?$/;

/** El límite de intentos no es un código de error: es el 429. */
const HTTP_DEMASIADOS_INTENTOS = 429;

export interface CategoriaDeAlta {
  readonly id: string;
  readonly nombre: string;
}

/** El producto que ya tiene ese código de barras. */
export interface CodigoOcupado {
  readonly productoId: string;
  readonly nombre: string;
}

export interface ProductoDadoDeAlta {
  readonly id: string;
  readonly nombre: string;
}

export interface AltaRapidaProps {
  /** El código que cantó el lector. Sin él, el alta es de un producto a granel. */
  readonly codigoInicial?: string;
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly categoriasIniciales?: readonly CategoriaDeAlta[];
  readonly conflictoInicial?: CodigoOcupado;
  readonly onGuardado?: (producto: ProductoDadoDeAlta) => void;
  readonly onCancelar?: () => void;
  readonly onAgregarPresentacion?: (productoId: string) => void;
}

type Campo = 'nombre' | 'precio' | 'categoria';

/** Saca del fallo del comando el producto que ya ocupaba el código. */
function codigoOcupadoDe(fallo: unknown): CodigoOcupado | null {
  if (!(fallo instanceof ErrorApi) || fallo.error.codigo !== 'CONFLICTO_ESTADO') return null;
  const datos = fallo.error.datos;
  if (datos === undefined) return null;
  const id = datos['producto_id'];
  const nombre = datos['nombre'];
  if (typeof id !== 'string' || typeof nombre !== 'string') return null;
  return { productoId: id, nombre };
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) {
      return 'Demasiadas altas seguidas. Espera unos segundos y vuelve a guardar.';
    }
    return fallo.message;
  }
  return 'No se pudo guardar. Lo capturado sigue aquí: vuelve a intentarlo.';
}

export function AltaRapida({
  codigoInicial,
  categoriasIniciales,
  conflictoInicial,
  onGuardado,
  onCancelar,
  onAgregarPresentacion,
}: AltaRapidaProps) {
  const voc = useVocabulario();
  const codigo = codigoInicial?.trim() ?? '';

  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [costo, setCosto] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [stock, setStock] = useState('');
  const [minimo, setMinimo] = useState('');

  const [categorias, setCategorias] = useState<readonly CategoriaDeAlta[] | null>(
    categoriasIniciales ?? null,
  );
  const [fallaCategorias, setFallaCategorias] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  // La PRIMERA categoría se crea aquí. Ver el vacío de más abajo.
  const [nuevaCategoria, setNuevaCategoria] = useState('');
  const [creandoCategoria, setCreandoCategoria] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campoMalo, setCampoMalo] = useState<Campo | null>(null);
  const [ocupado, setOcupado] = useState<CodigoOcupado | null>(conflictoInicial ?? null);
  const [guardado, setGuardado] = useState<string | null>(null);

  useEffect(() => {
    if (categoriasIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    consultarPuente<CategoriaDeAlta>('CategoriaProducto', { limite: 200, signal: control.signal })
      .then((filas) => {
        if (sigueMontada()) setCategorias(filas);
      })
      .catch(() => {
        // Lo capturado NO se borra por un fallo de lectura: el cajero ya tecleó.
        if (sigueMontada()) setFallaCategorias('No se pudieron leer las categorías.');
      });

    return () => {
      control.abort();
    };
  }, [categoriasIniciales, intento]);

  /**
   * LA PRIMERA CATEGORÍA, CREADA AQUÍ.
   *
   * ── Lo que había antes, y por qué no servía ───────────────────────
   * El vacío decía «Todavía no hay categorías, y son las que cargan el impuesto» y
   * ofrecía «Crear la primera categoría» apuntando a `/abarrotes/categorias`: una
   * pantalla que **no existe en ninguna parte del sistema**. 404, y el alta de
   * productos bloqueada —la categoría es obligatoria— sin ninguna salida.
   *
   * No hay pantalla de categorías que arreglar el enlace, y no hacía falta: la
   * entidad `CategoriaProducto` tiene `escritura: 'directa'` en el puente, así que
   * se crea desde aquí con la misma ruta con la que esta pantalla ya escribe. El
   * vacío pasa de señalar una puerta cerrada a resolver lo que falta.
   */
  const crearCategoria = async (): Promise<void> => {
    const limpio = nuevaCategoria.trim();
    if (limpio === '') {
      setFallaCategorias('Pon el nombre de la categoría.');
      return;
    }
    setCreandoCategoria(true);
    setFallaCategorias(null);
    try {
      await invocarComando<unknown>('/api/datos/escribir', {
        entidad: 'CategoriaProducto',
        operacion: 'create',
        datos: { nombre: limpio, activo: true },
      });
      setNuevaCategoria('');
      // Se vuelven a leer: el identificador lo pone el servidor y es el que el
      // selector de abajo necesita.
      setIntento((n) => n + 1);
    } catch (fallo: unknown) {
      setFallaCategorias(mensajeDe(fallo));
    } finally {
      setCreandoCategoria(false);
    }
  };

  function cancelar(): void {
    if (onCancelar !== undefined) {
      onCancelar();
      return;
    }
    // Montada en su propia ruta no hay venta a la que volver: se vuelve atrás.
    window.history.back();
  }

  async function enviar(): Promise<void> {
    const nombreLimpio = nombre.trim();
    const precioLimpio = precio.trim();
    if (nombreLimpio === '') {
      setCampoMalo('nombre');
      setError('Escribe el nombre con el que el cajero lo va a reconocer.');
      return;
    }
    if (!PRECIO_CON_FORMA.test(precioLimpio) || PRECIO_EN_CERO.test(precioLimpio)) {
      setCampoMalo('precio');
      setError('El precio va en pesos y centavos, y no puede ser cero.');
      return;
    }
    if (categoriaId === '') {
      setCampoMalo('categoria');
      setError(
        `Elige la categoría: de ahí salen el IVA y el IEPS del ${voc.singular('producto')}.`,
      );
      return;
    }

    setCampoMalo(null);
    setError(null);
    setOcupado(null);
    setEnviando(true);
    try {
      // Todo viaja como texto: quien convierte importes y cantidades es el servidor.
      const producto = await invocarComando<ProductoDadoDeAlta>(RUTA_ALTA, {
        codigo,
        nombre: nombreLimpio,
        precio: precioLimpio,
        costo: costo.trim(),
        categoriaId,
        stockInicial: stock.trim(),
        stockMinimo: minimo.trim(),
      });
      onGuardado?.(producto);
      setGuardado(producto.nombre);
      // Se conserva la categoría: el siguiente suele ser del mismo pasillo.
      setNombre('');
      setPrecio('');
      setCosto('');
    } catch (fallo: unknown) {
      const yaEsDe = codigoOcupadoDe(fallo);
      if (yaEsDe === null) setError(mensajeDe(fallo));
      else setOcupado(yaEsDe);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-dvh justify-center bg-background sm:items-center sm:p-(--espacio-6)">
      {/* Teléfono: el diálogo ES la pantalla, los campos arriba y las acciones
          pegadas abajo, sobre el teclado. Tablet y PC: hoja centrada. */}
      <form
        aria-labelledby="alta-titulo"
        onSubmit={(evento) => {
          evento.preventDefault();
          void enviar();
        }}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') cancelar();
        }}
        className="flex min-h-dvh w-full flex-col gap-(--espacio-4) bg-card p-(--espacio-4) text-card-foreground sm:min-h-0 sm:max-w-2xl sm:rounded-xl sm:border sm:border-border sm:p-(--espacio-6) sm:shadow-3"
      >
        <header>
          <h1 id="alta-titulo" className="text-xl font-bold sm:text-2xl">
            {voc.titulo('producto')} nuevo
          </h1>
          <p className="text-sm text-muted-foreground">
            Tres datos y vuelves a {voc.enFrase('orden')}. Lo demás se corrige solo.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-(--espacio-3)">
          <span className="text-sm text-muted-foreground">Código</span>
          {codigo === '' ? (
            <span className="text-sm">Sin código · se le pone después desde la ficha</span>
          ) : (
            <>
              <span className="font-mono text-lg font-semibold">{codigo}</span>
              <Badge variant="secondary">ya puesto</Badge>
            </>
          )}
        </div>

        {/* El conflicto no vacía nada: ofrece el camino correcto y deja el otro. */}
        {ocupado !== null && (
          <div
            role="alert"
            className="rounded-md border border-warning bg-warning/15 p-(--espacio-3)"
          >
            <p className="text-sm font-medium">
              Este código ya es de «{ocupado.nombre}». ¿Es una presentación nueva de ese producto?
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onAgregarPresentacion?.(ocupado.productoId);
                }}
              >
                Sí · agregar presentación
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOcupado(null);
                }}
              >
                No · corregir el código
              </Button>
            </div>
          </div>
        )}

        {error !== null && (
          <p
            role="alert"
            className="rounded-md border border-destructive bg-destructive/10 p-(--espacio-3) text-sm"
          >
            {error}
          </p>
        )}

        {guardado !== null && (
          <p
            role="status"
            className="rounded-md border border-success bg-success/15 p-(--espacio-3) text-sm"
          >
            «{guardado}» quedó en el catálogo y en la venta. Escanea el siguiente.
          </p>
        )}

        <div className="grid gap-(--espacio-4)">
          <div className="grid gap-2">
            <Label htmlFor="nombre">
              Nombre <span className="text-muted-foreground">· obligatorio</span>
            </Label>
            {/* El foco arranca aquí: el código ya está puesto y es lo único que
                el cajero no tiene que teclear. */}
            <Input
              id="nombre"
              autoFocus
              autoComplete="off"
              value={nombre}
              aria-invalid={campoMalo === 'nombre'}
              placeholder="Gansito Marinela"
              onChange={(evento) => {
                setNombre(evento.target.value);
              }}
            />
          </div>

          <div className="grid gap-(--espacio-4) sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="precio">
                Precio <span className="text-muted-foreground">· obligatorio</span>
              </Label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  $
                </span>
                <Input
                  id="precio"
                  inputMode="decimal"
                  autoComplete="off"
                  className="pl-7"
                  value={precio}
                  aria-invalid={campoMalo === 'precio'}
                  placeholder="18.00"
                  onChange={(evento) => {
                    setPrecio(evento.target.value);
                  }}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="costo">Costo</Label>
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  $
                </span>
                <Input
                  id="costo"
                  inputMode="decimal"
                  autoComplete="off"
                  className="pl-7"
                  value={costo}
                  placeholder="14.20"
                  aria-describedby="costo-nota"
                  onChange={(evento) => {
                    setCosto(evento.target.value);
                  }}
                />
              </div>
              <p id="costo-nota" className="text-xs text-muted-foreground">
                Opcional · se corrige solo en la primera compra.
              </p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="categoria">
              Categoría <span className="text-muted-foreground">· obligatorio</span>
            </Label>

            {categorias === null && fallaCategorias === null && (
              // Esqueleto con la forma del control, no un giro: la hoja no salta
              // cuando llegan las categorías.
              <Skeleton className="h-(--altura-control) w-full rounded-md" />
            )}

            {fallaCategorias !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <p role="alert" className="text-sm">
                  {fallaCategorias}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFallaCategorias(null);
                    setIntento((n) => n + 1);
                  }}
                >
                  Reintentar
                </Button>
              </div>
            )}

            {categorias !== null && categorias.length === 0 && (
              // El vacío ENSEÑA: dice para qué sirve lo que falta y lleva a crearlo.
              <div className="rounded-md border border-dashed border-border p-(--espacio-3)">
                <p className="text-sm font-medium">
                  Todavía no hay categorías, y son las que cargan el impuesto.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  De la categoría salen la tasa de IVA y el régimen de IEPS. Con seis bien puestas,
                  los 1,800 productos quedan clasificados sin decidir uno por uno.
                </p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="grow">
                    <Label htmlFor="categoria-nueva">Nombre de la categoría</Label>
                    <Input
                      id="categoria-nueva"
                      value={nuevaCategoria}
                      placeholder="Despensa, Limpieza, Dulces…"
                      onChange={(evento) => {
                        setNuevaCategoria(evento.target.value);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={creandoCategoria}
                    onClick={() => {
                      void crearCategoria();
                    }}
                  >
                    {creandoCategoria ? 'Creando…' : 'Crear la primera categoría'}
                  </Button>
                </div>
              </div>
            )}

            {categorias !== null && categorias.length > 0 && (
              <>
                <Select
                  value={categoriaId}
                  onValueChange={(valor) => {
                    setCategoriaId(valor);
                  }}
                >
                  <SelectTrigger
                    id="categoria"
                    className="w-full"
                    aria-invalid={campoMalo === 'categoria'}
                    aria-describedby="categoria-nota"
                  >
                    <SelectValue placeholder="Elige la categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((categoria) => (
                      <SelectItem key={categoria.id} value={categoria.id}>
                        {categoria.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="categoria-nota" className="text-xs text-muted-foreground">
                  De aquí salen el IVA y el IEPS del {voc.singular('producto')}.
                </p>
              </>
            )}
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="w-full justify-start">
              ▸ Más datos (stock, mínimo, presentaciones)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-(--espacio-4) pt-(--espacio-3) sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="stock">Stock inicial</Label>
              <Input
                id="stock"
                inputMode="numeric"
                autoComplete="off"
                value={stock}
                placeholder="0"
                onChange={(evento) => {
                  setStock(evento.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minimo">Mínimo para avisar</Label>
              <Input
                id="minimo"
                inputMode="numeric"
                autoComplete="off"
                value={minimo}
                placeholder="0"
                onChange={(evento) => {
                  setMinimo(evento.target.value);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Las presentaciones (caja, paquete, medio kilo) se agregan desde la ficha del producto,
              con la venta ya cobrada.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <footer className="sticky bottom-0 mt-auto flex flex-col-reverse gap-2 border-t border-border bg-card py-(--espacio-3) sm:static sm:mt-0 sm:flex-row sm:justify-end sm:border-0 sm:py-0">
          <Button type="button" variant="ghost" onClick={cancelar}>
            Cancelar · Esc
          </Button>
          <Button type="submit" size="lg" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar y agregar · Enter'}
          </Button>
        </footer>
      </form>
    </main>
  );
}
