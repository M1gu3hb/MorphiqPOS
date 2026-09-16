'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente } from '~/cliente/api';

/**
 * PANTALLA · abarrotes · existencias
 *
 * Contesta tres preguntas y ninguna más: qué hay, qué falta y qué se me va a
 * echar a perder. 3 a 8 veces al día, encargado y dueño. No tiene acción
 * principal: la acción es MIRAR, y los filtros son el instrumento.
 *
 * ── Por qué los tres contadores son BOTONES ──────────────────────────────
 * Cada número dispara una decisión distinta —bajo mínimo es *qué pido*, por
 * vencer es *qué remato*, negativo es *qué entrada no capturé*— y un contador
 * que sólo informa obliga a buscar a mano las 63 filas que acaba de contar.
 * Por eso cada uno es además su filtro, con los atajos `m`, `v`, `n` y `/`.
 *
 * ── Por qué «Hay» enseña las dos lentes ──────────────────────────────────
 * `238 pz (9 cj + 4)`: el tendero cuenta cajas y el sistema cuenta piezas. Sin
 * la conversión a la vista el número no se cree y se recuenta el anaquel, que
 * es justo el trabajo que esta pantalla evita. Y «Vendido 14d» en vez de «este
 * mes» porque el ciclo de compra del giro es semanal: un mes llega tarde.
 *
 * ── Ninguna marca viaja en el color ──────────────────────────────────────
 * El negativo lleva ✖ y su razón al pasar el cursor —«probablemente falta
 * capturar una entrada», que es lo que suele ser y no un robo
 * (`03-INVENTARIO.md` §9, error 2)—; el mínimo ▼ y el que se vence ◔.
 *
 * ── Tres dispositivos, tres formas, no una encogida ──────────────────────
 * PC: tabla completa. Tablet (md): pierde «Vendido 14d» y «Proveedor», porque
 * quien la trae repone anaquel y no decide la compra. Teléfono: contadores
 * apilados y debajo SÓLO lo que urge, agrupado por proveedor, que es el orden
 * del recorrido al mayorista.
 *
 * ── Qué NO va aquí ───────────────────────────────────────────────────────
 * Costos ni márgenes; el kardex, que vive en la ficha del producto; y los
 * movimientos del día, que viven en Entradas.
 *
 * ── Lo que hoy no se abre, y lo que quedó fuera de alcance ───────────────
 * Lee `Ingrediente` por el puente, que ya trae nombre, mínimo y el
 * `stock_actual` proyectado del ledger; `vendido_14d`, `caduca_el` y
 * `piezas_por_caja` viven en columnas que las migraciones de la Fase 2
 * escriben y NO aplican: hoy llegan nulas y se muestra «—» sin romper nada.
 * Los desplegables de Zona y Proveedor quedan FUERA: `ZonaAnaquel` no está
 * unida a `Ingrediente` en el mapa del puente, y el de proveedor no cabía en
 * el tope de 300 líneas. Se suplen con la búsqueda y con el agrupado.
 */

/** Horizonte del contador de caducidad: siete días es lo que cabe rematar. */
const DIAS_DE_AVISO = 7;
const LIMITE_LECTURA = 400;
const MILISEGUNDOS_POR_DIA = 86_400_000;
const SIN_PROVEEDOR = 'Sin proveedor';

const FORMATO_DIA = new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' });

const CLASE_CONTADOR =
  'flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring';
const CLASE_INACTIVO = 'border-border bg-card hover:bg-accent hover:text-accent-foreground';
const CLASE_TARJETA =
  'flex items-center justify-between gap-2 rounded-md border border-border bg-card p-3';

export interface FilaExistencia {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string | null;
  readonly stock_actual: number | null;
  readonly stock_minimo: number | null;
  readonly piezas_por_caja: number | null;
  readonly vendido_14d: number | null;
  readonly caduca_el: string | null;
  readonly proveedor_nombre: string | null;
}

/** Las cuatro lentes. `todo` es la que no filtra nada. */
export type Lente = 'todo' | 'minimo' | 'vence' | 'negativo';

/** Clave, título y el pie que dice para qué sirve el número. */
const CONTADORES = [
  ['minimo', 'Bajo mínimo', 'qué pido'],
  ['vence', 'Se vence', `en ${String(DIAS_DE_AVISO)} días · qué remato`],
  ['negativo', 'En negativo', 'revisar hoy · qué entrada falta'],
] as const;

export interface ExistenciasProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaExistencia[];
  /** Hoy inyectable, para comprobar la caducidad sin viajar en el tiempo. */
  readonly ahora?: number;
}

export function esNegativo(fila: FilaExistencia): boolean {
  return (fila.stock_actual ?? 0) < 0;
}

/** Bajo mínimo excluye el negativo a propósito: son dos problemas distintos. */
export function estaBajoMinimo(fila: FilaExistencia): boolean {
  const hay = fila.stock_actual ?? 0;
  const minimo = fila.stock_minimo ?? 0;
  return minimo > 0 && hay >= 0 && hay < minimo;
}

export function seVence(fila: FilaExistencia, ahora: number): boolean {
  if (fila.caduca_el === null) return false;
  const fecha = Date.parse(`${fila.caduca_el}T00:00:00`);
  if (Number.isNaN(fecha)) return false;
  return Math.ceil((fecha - ahora) / MILISEGUNDOS_POR_DIA) <= DIAS_DE_AVISO;
}

/** `238 pz (9 cj + 4)`: la lente del sistema y la del anaquel, juntas. */
export function formatoHay(fila: FilaExistencia): string {
  const hay = fila.stock_actual ?? 0;
  const unidad = fila.unidad_base ?? 'pz';
  const entero = Number.isInteger(hay);
  const cantidad = entero ? String(hay) : hay.toFixed(1);
  const porCaja = fila.piezas_por_caja;
  // A granel no hay cajas, y en negativo la conversión no significa nada.
  if (porCaja === null || porCaja <= 1 || hay <= 0 || !entero) return `${cantidad} ${unidad}`;
  const cajas = Math.floor(hay / porCaja);
  if (cajas === 0) return `${cantidad} ${unidad}`;
  return `${cantidad} ${unidad} (${String(cajas)} cj + ${String(hay - cajas * porCaja)})`;
}

function texto(valor: number | null): string {
  return valor === null ? '—' : String(valor);
}

function fechaCorta(caduca: string | null): string {
  if (caduca === null) return '—';
  const fecha = new Date(`${caduca}T00:00:00`);
  return Number.isNaN(fecha.getTime()) ? '—' : FORMATO_DIA.format(fecha);
}

function proveedorDe(fila: FilaExistencia): string {
  return fila.proveedor_nombre ?? SIN_PROVEEDOR;
}

/** Símbolo, clase y razón. El color nunca es el único portador del significado. */
function marcaDe(fila: FilaExistencia, ahora: number): readonly [string, string, string] | null {
  const negra = 'bg-destructive text-destructive-foreground';
  if (esNegativo(fila)) return ['✖', negra, 'Probablemente falta capturar una entrada'];
  if (estaBajoMinimo(fila)) return ['▼', 'bg-warning/30 text-foreground', 'Por debajo del mínimo'];
  if (seVence(fila, ahora))
    return ['◔', 'bg-accent text-accent-foreground', 'Se vence esta semana'];
  return null;
}

function Hay({ fila, ahora }: { readonly fila: FilaExistencia; readonly ahora: number }) {
  const marca = marcaDe(fila, ahora);
  if (marca === null) return <span>{formatoHay(fila)}</span>;
  return (
    <span className={`rounded px-1 ${marca[1]}`} title={marca[2]}>
      {marca[0]} {formatoHay(fila)}
    </span>
  );
}

export function Existencias({ filasIniciales, ahora }: ExistenciasProps) {
  const [filas, setFilas] = useState<readonly FilaExistencia[] | null>(filasIniciales ?? null);
  const [error, setError] = useState<string | null>(null);
  const [lente, setLente] = useState<Lente>('todo');
  const [busqueda, setBusqueda] = useState('');
  const campoBusqueda = useRef<HTMLInputElement>(null);
  /**
   * El reloj NO se lee durante el render: leerlo ahí da un valor distinto en el
   * servidor y en el navegador —que es un desajuste de hidratación por
   * renglón— y encima hace del componente una función impura. Entra por el
   * efecto, en el siguiente turno del bucle.
   */
  const [reloj, setReloj] = useState<number | null>(ahora ?? null);
  useEffect(() => {
    if (ahora !== undefined) return;
    const primero = setTimeout(() => {
      setReloj(Date.now());
    });
    return () => {
      clearTimeout(primero);
    };
  }, [ahora]);
  const hoy = reloj ?? 0;

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // Centinela por señal y no por bandera: un `let vivo` el compilador lo da
    // por siempre-verdadero, y además deja la lectura sin cancelar.
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    consultarPuente<FilaExistencia>('Ingrediente', {
      orden: 'nombre',
      limite: LIMITE_LECTURA,
      signal: control.signal,
    })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        if (!sigueMontada()) return;
        setError(fallo instanceof Error ? fallo.message : 'No se pudieron leer las existencias.');
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales]);

  // La misma tecla devuelve a «todo»: es lo que espera quien la pulsa dos veces
  // sin mirar la pantalla.
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent) => {
      const destino = evento.target;
      if (destino instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(destino.tagName)) return;
      if (evento.key === '/') {
        evento.preventDefault();
        campoBusqueda.current?.focus();
        return;
      }
      const atajos: Record<string, Lente> = { n: 'negativo', m: 'minimo', v: 'vence' };
      const pedida = atajos[evento.key.toLowerCase()];
      if (pedida !== undefined) setLente((actual) => (actual === pedida ? 'todo' : pedida));
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const datos = useMemo(() => filas ?? [], [filas]);
  const resumen = useMemo(
    () => ({
      minimo: datos.filter(estaBajoMinimo),
      vence: datos.filter((fila) => seVence(fila, hoy)),
      negativo: datos.filter(esNegativo),
    }),
    [datos, hoy],
  );

  const visibles = useMemo(() => {
    const aguja = busqueda.trim().toLowerCase();
    const delFiltro = lente === 'todo' ? datos : resumen[lente];
    return aguja === ''
      ? delFiltro
      : delFiltro.filter((fila) => fila.nombre.toLowerCase().includes(aguja));
  }, [datos, resumen, busqueda, lente]);

  // En teléfono, sin lente elegida, sólo se enseña lo que urge: la lista entera
  // en 390 px es un catálogo, y quien mira va camino al mayorista.
  const porProveedor = useMemo(() => {
    const urgentes =
      lente === 'todo' ? visibles.filter((f) => esNegativo(f) || estaBajoMinimo(f)) : visibles;
    const grupos = new Map<string, FilaExistencia[]>();
    for (const fila of urgentes) {
      const lista = grupos.get(proveedorDe(fila)) ?? [];
      lista.push(fila);
      grupos.set(proveedorDe(fila), lista);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es-MX'));
  }, [visibles, lente]);

  if (filas === null && error === null) {
    // Esqueletos con la forma final —tres contadores y sus filas— para que la
    // pantalla no salte al llegar el dato y el ojo ya sepa dónde mirar.
    return (
      <div className="p-4">
        <h1 className="mb-4 text-2xl font-bold">Existencias</h1>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {CONTADORES.map(([clave]) => (
            <Skeleton key={clave} className="h-24 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Existencias</h1>
        <p className="text-sm text-muted-foreground">
          Qué hay, qué falta y qué se va a echar a perder · {String(datos.length)} productos
        </p>
      </header>

      {/* La banda de error NUNCA vacía la pantalla: un dato de hace un minuto
          sirve para ir al mayorista; una pantalla en blanco, no. */}
      {error !== null && (
        <p role="alert" className="mb-3 rounded-md border border-destructive p-2 text-sm">
          {error}
          {datos.length > 0 ? ' · Se muestra el último dato conocido.' : ' · Vuelve a intentarlo.'}
        </p>
      )}

      {datos.length === 0 ? (
        <section className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="mb-2 text-lg font-medium">Aquí va a vivir tu anaquel.</p>
          <p className="mx-auto mb-4 max-w-prose text-sm text-muted-foreground">
            En cuanto captures tu primera entrada de mercancía, esta pantalla te dice qué está bajo
            mínimo, qué se vence esta semana y qué salió en negativo porque faltó capturar algo.
          </p>
          <Button asChild>
            <a href="/inventario">Capturar mi primera entrada</a>
          </Button>
        </section>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {CONTADORES.map(([clave, titulo, pie]) => {
              const activo = lente === clave;
              return (
                <button
                  key={clave}
                  type="button"
                  aria-pressed={activo}
                  className={`${CLASE_CONTADOR} ${activo ? 'border-primary bg-primary/15' : CLASE_INACTIVO}`}
                  onClick={() => {
                    setLente(activo ? 'todo' : clave);
                  }}
                >
                  <span className="text-xs font-medium uppercase tracking-wide">{titulo}</span>
                  <span className="text-4xl font-bold leading-none tabular-nums">
                    {String(resumen[clave].length)}
                  </span>
                  {/* La palabra, no sólo el borde: el filtro activo se lee. */}
                  <span className="text-xs text-muted-foreground">
                    {activo ? 'filtrando · toca para quitar' : pie}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              ref={campoBusqueda}
              type="search"
              value={busqueda}
              aria-label="Buscar producto"
              placeholder="Buscar producto…  (tecla /)"
              className="min-w-48 flex-1"
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
            />
            {lente !== 'todo' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLente('todo');
                }}
              >
                Ver todo
              </Button>
            )}
          </div>

          {/* TABLET Y PC. «Vendido 14d» y «Proveedor» sólo aparecen en lg. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Hay</TableHead>
                  <TableHead className="text-right">Mín</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Vendido 14d</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead className="hidden lg:table-cell">Proveedor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell className="font-medium">{fila.nombre}</TableCell>
                    <TableCell className="tabular-nums">
                      <Hay fila={fila} ahora={hoy} />
                    </TableCell>
                    <TableCell className="text-right">{texto(fila.stock_minimo)}</TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      {texto(fila.vendido_14d)}
                    </TableCell>
                    <TableCell>{fechaCorta(fila.caduca_el)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{proveedorDe(fila)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {visibles.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nada cae en este filtro. Buena señal.
              </p>
            )}
          </div>

          {/* TELÉFONO. Otra pantalla, no la misma encogida. */}
          <div className="md:hidden">
            {porProveedor.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nada urgente ahora mismo. El anaquel está en orden.
              </p>
            ) : (
              porProveedor.map(([nombre, suyas]) => (
                <section key={nombre} className="mb-4">
                  <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide">
                    {nombre} · {String(suyas.length)}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {suyas.map((fila) => (
                      <li key={fila.id} className={CLASE_TARJETA}>
                        <span className="min-w-0 flex-1 truncate font-medium">{fila.nombre}</span>
                        <span className="tabular-nums">
                          <Hay fila={fila} ahora={hoy} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
