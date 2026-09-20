'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@morphiqpos/ui/primitivas/collapsible';
import { Input } from '@morphiqpos/ui/primitivas/input';
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
 * PANTALLA · restaurante · recetas
 *
 * Se usa a ráfagas —treinta veces en dos días al configurar la carta, dos por
 * semana después— y siempre la usa el dueño. Puede permitirse un formulario;
 * lo que no puede permitirse es aburrir: capturar recetas es trabajo que no
 * paga el primer día, y el único incentivo que funciona es VER el margen.
 *
 * ── Manda el margen, no el nombre ────────────────────────────────────────
 * La jerarquía del documento es 1 margen · 2 si tiene receta · 3 precio, así
 * que el margen lleva semáforo —verde arriba de 60 %, ámbar de 40 a 60, rojo
 * debajo— y la lista se ordena por urgencia: lo que pierde dinero primero, lo
 * que ni siquiera tiene receta después, y hasta el final lo sano. Alfabético
 * escondería los seis platillos que importan entre noventa que no.
 *
 * ── La cantidad se teclea en la unidad que uno quiera ────────────────────
 * En cocina se dice «250 gramos» y «medio litro». Obligar a teclear en unidad
 * base garantiza el error de 1000×. El servidor convierte, guarda las dos
 * cosas y falla si las dimensiones no coinciden.
 *
 * ── Agregar un ingrediente manda la receta ENTERA ────────────────────────
 * `inventario.guardar_receta` reemplaza el escandallo en una transacción.
 * Enviar sólo la línea nueva dejaría al platillo con un único ingrediente.
 *
 * ── Fuera de alcance, para caber en 300 líneas ───────────────────────────
 * Editar o quitar una línea ya capturada, capturar la merma al agregar (se
 * manda en cero y se ve en la fila abierta), el aviso de cordura al guardar
 * («cuesta $412 y se vende en $180») y la importación por Excel.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Las únicas unidades que el comando admite. Ampliarlas es abrir el error de mil. */
const UNIDADES = ['g', 'kg', 'ml', 'l', 'pieza', 'm'] as const;

/** El comando del escandallo, que ya existe (`/api/<dominio>/<verbo>`). */
const RUTA_GUARDAR = '/api/inventario/recetas';

const MARGEN_SANO = 60;
const MARGEN_AJUSTADO = 40;
const PUNTOS_BASE_POR_PUNTO = 100;
const HTTP_DEMASIADOS_INTENTOS = 429;
const CANTIDAD_VALIDA = /^\d{1,10}(?:\.\d{1,4})?$/;

/** Las cinco columnas de PC. En teléfono no hay columnas: hay tarjeta. */
const COLUMNAS = 'md:grid md:grid-cols-[3fr_1.3fr_1fr_1fr_1.3fr] md:gap-3';

export interface ProductoConMargen {
  readonly id: string;
  readonly nombre: string;
  readonly categoria_nombre: string | null;
  readonly precio_venta: number | null;
  readonly costo_calculado_actual: number | null;
  readonly margen_bruto_actual: number | null;
}

export interface LineaDeReceta {
  readonly id: string;
  readonly producto_id: string;
  readonly ingrediente_id: string;
  readonly ingrediente_nombre: string | null;
  readonly cantidad_usada: number | null;
  readonly unidad_usada: string | null;
  readonly merma_porcentaje: number | null;
  readonly costo_linea_calculado: number | null;
}

export interface IngredienteDisponible {
  readonly id: string;
  readonly nombre: string;
}

export interface FilaDeReceta {
  readonly producto: ProductoConMargen;
  readonly lineas: readonly LineaDeReceta[];
}

export interface RecetasProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeReceta[];
  readonly ingredientesIniciales?: readonly IngredienteDisponible[];
}

type Campo = 'productoId' | 'insumoId' | 'cantidad' | 'unidad';
type Borrador = Readonly<Record<Campo, string>>;
const VACIO: Borrador = { productoId: '', insumoId: '', cantidad: '', unidad: 'g' };

/** El semáforo del margen. La PALABRA acompaña al color: el color nunca va solo. */
export function semaforoDeMargen(margen: number | null): { etiqueta: string; clase: string } {
  if (!Number.isFinite(margen)) return { etiqueta: 'Sin costo', clase: 'bg-muted' };
  const valor = margen ?? 0;
  if (valor >= MARGEN_SANO) return { etiqueta: 'Sano', clase: 'bg-success/30' };
  if (valor >= MARGEN_AJUSTADO) return { etiqueta: 'Ajustado', clase: 'bg-warning/35' };
  return { etiqueta: 'En riesgo', clase: 'bg-destructive/25' };
}

/**
 * La lista es una cola de trabajo, no un catálogo.
 *
 * Sin receta pesa −1: va después de un platillo que ya pierde dinero —ése es el
 * único caso más urgente— y antes de cualquier margen sano.
 */
export function armarFilas(
  productos: readonly ProductoConMargen[],
  lineas: readonly LineaDeReceta[],
): readonly FilaDeReceta[] {
  const porProducto = new Map<string, LineaDeReceta[]>();
  for (const linea of lineas) {
    const grupo = porProducto.get(linea.producto_id) ?? [];
    grupo.push(linea);
    porProducto.set(linea.producto_id, grupo);
  }
  const peso = (fila: FilaDeReceta) =>
    fila.lineas.length === 0 ? -1 : (fila.producto.margen_bruto_actual ?? Number.MAX_SAFE_INTEGER);
  return productos
    .map((producto) => ({ producto, lineas: porProducto.get(producto.id) ?? [] }))
    .sort((a, b) => {
      const orden = peso(a) - peso(b);
      return orden === 0 ? a.producto.nombre.localeCompare(b.producto.nombre, 'es-MX') : orden;
    });
}

const dinero = (valor: number | null): string =>
  Number.isFinite(valor) ? PESOS.format(valor ?? 0) : '—';

/** El límite de intentos no es un código: es el 429, y vive en `estado`. */
function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) return 'Demasiados intentos. Espera un momento.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo leer el recetario.';
}

const aIngrediente = (linea: LineaDeReceta) => ({
  insumoId: linea.ingrediente_id,
  cantidad: String(linea.cantidad_usada ?? 0),
  unidad: linea.unidad_usada ?? 'pieza',
  mermaBp: Math.round((linea.merma_porcentaje ?? 0) * PUNTOS_BASE_POR_PUNTO),
});

async function leerTodo(signal: AbortSignal) {
  const [productos, lineas, ingredientes] = await Promise.all([
    consultarPuente<ProductoConMargen>('ProductoTerminado', { limite: 500, signal }),
    consultarPuente<LineaDeReceta>('RecetaEscandallo', { limite: 2000, signal }),
    consultarPuente<IngredienteDisponible>('Ingrediente', { limite: 500, signal }),
  ]);
  return { filas: armarFilas(productos, lineas), ingredientes };
}

export function Recetas({ filasIniciales, ingredientesIniciales }: RecetasProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeReceta[] | null>(filasIniciales ?? null);
  const [insumos, setInsumos] = useState<readonly IngredienteDisponible[]>(
    ingredientesIniciales ?? [],
  );
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return undefined;
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    leerTodo(control.signal)
      .then((leido) => {
        if (!sigueMontada()) return;
        setFilas(leido.filas);
        setInsumos(leido.ingredientes);
      })
      // La pantalla no se vacía por un fallo de red: a media captura, el dueño
      // prefiere el último dato conocido a una hoja en blanco.
      .catch((fallo: unknown) => {
        if (sigueMontada()) setError(mensajeDeFallo(fallo));
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales]);

  // Un solo borrador para toda la lista: aunque haya dos platillos abiertos,
  // nadie captura dos recetas a la vez, y `productoId` dice de quién es.
  const escribir = (productoId: string, cambio: Partial<Borrador>) => {
    setBorrador((previo) => ({
      ...(previo.productoId === productoId ? previo : VACIO),
      ...cambio,
      productoId,
    }));
  };

  const agregar = async (fila: FilaDeReceta) => {
    const datos = borrador.productoId === fila.producto.id ? borrador : VACIO;
    if (datos.insumoId === '' || !CANTIDAD_VALIDA.test(datos.cantidad)) {
      setError('Elige un ingrediente y escribe una cantidad como 250 o 0.5.');
      return;
    }
    setGuardando(fila.producto.id);
    try {
      await invocarComando(RUTA_GUARDAR, {
        productoId: fila.producto.id,
        ingredientes: [
          ...fila.lineas.map(aIngrediente),
          { insumoId: datos.insumoId, cantidad: datos.cantidad, unidad: datos.unidad, mermaBp: 0 },
        ],
      });
      // Se relee entero: el costo y el margen los recalcula el servidor en
      // cascada, y son los dos números por los que alguien captura esto.
      const leido = await leerTodo(new AbortController().signal);
      setFilas(leido.filas);
      setBorrador(VACIO);
      setError(null);
    } catch (fallo: unknown) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setGuardando(null);
    }
  };

  if (filas === null) {
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Recetas</h1>
        {/* Esqueletos con la forma de la fila, nunca un giro: así nada salta al
            llegar el dato y el ojo ya sabe dónde va a mirar. */}
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, indice) => (
            <Skeleton key={indice} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (filas.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="max-w-md text-lg">
          Todavía no hay platillos en la carta. Sin platillos no hay recetas, y sin recetas no
          sabemos cuánto cuesta cada plato ni cuánto ganas con él.
        </p>
        <Button asChild>
          <a href="/restaurante/productos">Crear mi primer {voc.singular('linea_orden')}</a>
        </Button>
      </div>
    );
  }

  const conReceta = filas.filter((fila) => fila.lineas.length > 0).length;

  return (
    <div className="p-4">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Recetas</h1>
        {/* La cobertura, arriba: capturar quince recetas y creer que terminaste
            es lo que hace que el consumo teórico no cuadre nunca. */}
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">{conReceta}</strong> de {filas.length} platillos
          tienen receta
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="mb-3 rounded-md border border-destructive p-2 text-sm">
          {error}
        </p>
      )}

      <div aria-hidden className={`hidden px-3 pb-1 text-xs text-muted-foreground ${COLUMNAS}`}>
        {['Platillo', 'Receta', 'Costo', 'Precio', 'Margen'].map((titulo) => (
          <span key={titulo}>{titulo}</span>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {filas.map((fila) => (
          <Platillo
            key={fila.producto.id}
            fila={fila}
            insumos={insumos}
            datos={borrador.productoId === fila.producto.id ? borrador : VACIO}
            guardando={guardando === fila.producto.id}
            alEscribir={(cambio) => {
              escribir(fila.producto.id, cambio);
            }}
            alAgregar={() => {
              void agregar(fila);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

interface ParametrosDePlatillo {
  readonly fila: FilaDeReceta;
  readonly insumos: readonly IngredienteDisponible[];
  readonly datos: Borrador;
  readonly guardando: boolean;
  readonly alEscribir: (cambio: Partial<Borrador>) => void;
  readonly alAgregar: () => void;
}

/** Una fila expandible. Vive aquí abajo para no anidar el archivo entero. */
function Platillo({
  fila,
  insumos,
  datos,
  guardando,
  alEscribir,
  alAgregar,
}: ParametrosDePlatillo) {
  const voc = useVocabulario();
  const producto = fila.producto;
  const semaforo = semaforoDeMargen(producto.margen_bruto_actual);
  const cifra = Number.isFinite(producto.margen_bruto_actual)
    ? ` · ${String(Math.round(producto.margen_bruto_actual ?? 0))}%`
    : '';
  const insignia = (
    <Badge variant="outline" className={`${semaforo.clase} border-border`}>
      {semaforo.etiqueta}
      {cifra}
    </Badge>
  );

  return (
    <li>
      <Collapsible className="rounded-lg border border-border bg-card shadow-1">
        <CollapsibleTrigger
          className={`group flex w-full flex-col gap-1 p-3 text-left md:items-center ${COLUMNAS}`}
        >
          <span className="flex items-start justify-between gap-2">
            <span className="flex flex-col">
              <span className="font-medium">{producto.nombre}</span>
              <span className="text-xs text-muted-foreground">
                {producto.categoria_nombre ?? 'Sin categoría'}
              </span>
            </span>
            <span className="md:hidden">{insignia}</span>
          </span>
          <span className="text-sm">
            {fila.lineas.length === 0 ? (
              <Badge variant="secondary">Sin receta</Badge>
            ) : (
              <span className="text-muted-foreground">
                {String(fila.lineas.length)} ingrediente{fila.lineas.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
          <span className="text-sm tabular-nums">
            <span className="text-muted-foreground md:hidden">Costo </span>
            {dinero(producto.costo_calculado_actual)}
          </span>
          <span className="text-sm tabular-nums">
            <span className="text-muted-foreground md:hidden">Precio </span>
            {dinero(producto.precio_venta)}
          </span>
          <span className="hidden items-center justify-between gap-2 md:flex">
            {insignia}
            <span aria-hidden className="transition-transform group-data-[state=open]:rotate-180">
              ▾
            </span>
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent className="border-t border-border p-3">
          {fila.lineas.length === 0 ? (
            // El vacío explica la consecuencia; el botón de abajo es su salida.
            <p className="mb-3 text-sm">
              {voc.conDeterminante('este', 'linea_orden')} no tiene receta. Sin receta no sabemos
              cuánto cuesta ni cuánto ganas con él.
            </p>
          ) : (
            <ul className="mb-3 flex flex-col text-sm">
              {fila.lineas.map((linea) => (
                <li
                  key={linea.id}
                  className="flex justify-between gap-3 border-b border-border py-1"
                >
                  <span>
                    {linea.ingrediente_nombre ?? 'Ingrediente'} ·{' '}
                    {String(linea.cantidad_usada ?? 0)} {linea.unidad_usada ?? ''} · merma{' '}
                    {String(linea.merma_porcentaje ?? 0)}%
                  </span>
                  <span className="tabular-nums">{dinero(linea.costo_linea_calculado)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* La acción principal. En teléfono los campos se apilan a lo ancho
              completo; de tablet para arriba es una línea, que es como se
              capturan treinta seguidas sin levantar la mano del teclado. */}
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(evento) => {
              evento.preventDefault();
              alAgregar();
            }}
          >
            <Select
              value={datos.insumoId}
              onValueChange={(valor) => {
                alEscribir({ insumoId: valor });
              }}
            >
              <SelectTrigger aria-label="Ingrediente" className="w-full sm:w-56">
                <SelectValue placeholder="Elige el ingrediente" />
              </SelectTrigger>
              <SelectContent>
                {insumos.map((insumo) => (
                  <SelectItem key={insumo.id} value={insumo.id}>
                    {insumo.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Cantidad"
              inputMode="decimal"
              placeholder="250"
              className="w-24"
              value={datos.cantidad}
              onChange={(evento) => {
                alEscribir({ cantidad: evento.target.value });
              }}
            />
            {/* La unidad la elige quien captura: en cocina se dice «250 gramos»,
                no «250». Convertir es trabajo del servidor, no del cocinero. */}
            <Select
              value={datos.unidad}
              onValueChange={(valor) => {
                alEscribir({ unidad: valor });
              }}
            >
              <SelectTrigger aria-label="Unidad de la cantidad" className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIDADES.map((unidad) => (
                  <SelectItem key={unidad} value={unidad}>
                    {unidad}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Agregar ingrediente'}
            </Button>
          </form>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
