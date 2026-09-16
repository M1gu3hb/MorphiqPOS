'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useMemo, useRef, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { buscar, cercanas, normalizar, type MaterialDeMostrador } from './buscar-material';

/**
 * PANTALLA · ferreteria · mostrador
 *
 * El 70 % del uso del modelo: 25 a 60 ventas al día con el mismo par de manos.
 * La acción principal es BUSCAR, y por eso el foco arranca en el campo.
 *
 * ── Por qué arranca CON los ocho grupos y no en blanco ───────────────────
 * `abarrotes` abre con la lista vacía y «escanea el primer producto». Aquí eso
 * sería un error: la primera pregunta del mostradorista al cliente es «¿de qué
 * es?», y los ocho grupos de línea son esa pregunta convertida en botones. El
 * estado inicial no es un vacío: es un punto de partida.
 *
 * ── Por qué el total NO es lo más grande ─────────────────────────────────
 * En `abarrotes` el total es lo mayor de la aplicación porque el cliente lo lee
 * desde el otro lado. Aquí el cliente no mira la pantalla: mira la pieza que le
 * acaban de poner enfrente. El total importa al final, no durante, y agrandarlo
 * le robaría a la búsqueda el espacio donde de verdad se resuelve la venta.
 *
 * ── Por qué la franja del cliente está arriba y no en el cobro ───────────
 * Porque en una remisión a crédito NO HAY COBRO. El saldo, el límite y quién
 * recoge tienen que verse ANTES de despachar o no se ven nunca. Es la única
 * excepción a «aquí no van avisos», y su ausencia es el dolor 1 del modelo.
 *
 * ── Por qué existe la columna «Dónde» ────────────────────────────────────
 * F-152, la columna que `abarrotes` no tiene. Sin ella el resultado encuentra
 * el material y no termina la venta: el empleado nuevo sabe que hay 2,340 y no
 * sabe de qué gaveta sacarlos.
 *
 * ── Por qué no hay esqueleto mientras se teclea ──────────────────────────
 * El índice vive en memoria del cliente y filtrar es local: por debajo de 100
 * ms no hay nada que anunciar. El esqueleto es sólo para la HIDRATACIÓN del
 * índice, que sí cruza la red, y una sola vez.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Caben la búsqueda con su miga de pan, los ocho grupos, la tabla, la venta, la
 * franja del cliente y las dos salidas. Quedan FUERA, cada una en su pantalla:
 * el corte de material (F6), la ficha con foto (F5), la cotización (F8),
 * suspender (F9) y el diálogo de PIN sobre el límite. La equivalencia real
 * (F-060) y la medida inmediata mayor y menor salen de `equivalencias` y del
 * índice en micrómetros; mientras no existan, el estado de cero resultados
 * aproxima por familia — y lo dice con todas sus letras en la pantalla.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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

// Las clases largas viven arriba para que cada elemento quepa en una línea. La
// rejilla es LA MISMA en la cabecera y en cada fila: así las columnas cuadran
// en PC sin un segundo marcado, y en el pasillo la misma fila es una tarjeta de
// dos renglones — medida arriba, precio y ubicación abajo.
const REJILLA = 'grid grid-cols-3 gap-x-3 gap-y-1 xl:grid-cols-[7rem_7rem_6rem_6rem_6rem_5rem]';
const FILA = `${REJILLA} w-full rounded-md border border-border bg-card p-2 text-left text-card-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring xl:items-center xl:py-1`;
const BANDA = 'mb-3 rounded-md border p-2 text-sm';
const GRUPO =
  'min-h-20 rounded-md border border-border bg-secondary p-2 text-sm font-semibold text-secondary-foreground hover:bg-accent hover:text-accent-foreground';

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
}

interface Partida {
  readonly material: MaterialDeMostrador;
  readonly cantidad: number;
}

export function Mostrador({ filasIniciales, clienteInicial, cajaCerrada = false }: MostradorProps) {
  const [filas, setFilas] = useState<readonly MaterialDeMostrador[] | null>(filasIniciales ?? null);
  const [consulta, setConsulta] = useState('');
  const [partidas, setPartidas] = useState<readonly Partida[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ventaAbierta, setVentaAbierta] = useState(false);
  const buscador = useRef<HTMLInputElement>(null);
  const cliente = clienteInicial ?? null;

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    let vivo = true;
    // El índice se hidrata una vez al abrir. Sus columnas —atributos, ubicación—
    // las escriben migraciones de la Fase 2 que NO están aplicadas, así que
    // contra la base de hoy esto devuelve vacío y cae en el punto de partida.
    consultarPuente<MaterialDeMostrador>('MaterialMostrador', { limite: 6000 })
      .then((leidas) => {
        if (vivo) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        // La pantalla no se vacía por un error de red: se avisa y se sigue.
        if (vivo) {
          setFilas([]);
          setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar el catálogo.');
        }
      });
    return () => {
      vivo = false;
    };
  }, [filasIniciales]);

  const palabras = useMemo(
    () =>
      normalizar(consulta)
        .split(' ')
        .filter((p) => p !== ''),
    [consulta],
  );
  const resultados = useMemo(() => buscar(filas ?? [], palabras), [filas, palabras]);
  const total = partidas.reduce((suma, p) => suma + p.material.precioCentavos * p.cantidad, 0);
  const sobreLimite = cliente !== null && cliente.saldoCentavos > cliente.limiteCentavos;

  useEffect(() => {
    // Escribir desde cualquier parte va al buscador —la acción principal no
    // gasta ninguna tecla— y la letra no se pierde por el camino. Esc limpia la
    // búsqueda; con la búsqueda ya vacía, limpia la venta.
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
    setPartidas((actuales) =>
      actuales.some((p) => p.material.id === material.id)
        ? actuales.map((p) =>
            p.material.id === material.id ? { ...p, cantidad: p.cantidad + 1 } : p,
          )
        : [...actuales, { material, cantidad: 1 }],
    );
  }

  function cambiarCantidad(id: string, paso: number): void {
    setPartidas((actuales) =>
      actuales
        .map((p) => (p.material.id === id ? { ...p, cantidad: p.cantidad + paso } : p))
        .filter((p) => p.cantidad > 0),
    );
  }

  /** Las rutas salen de `05-DATOS-Y-BACKEND` §6; no se inventa ninguna. */
  async function enviar(ruta: string): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await invocarComando(ruta, {
        clienteId: cliente?.id ?? null,
        partidas: partidas.map((p) => ({ productoId: p.material.id, cantidad: p.cantidad })),
      });
      setPartidas([]);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo mandar la venta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="p-3 pb-24 xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start xl:gap-4 xl:pb-3">
      <h1 className="sr-only">Mostrador</h1>

      {/* TERCIARIO · arriba a la derecha en PC, arriba del todo en el pasillo:
          se lee antes de despachar, que es cuando sirve. */}
      <section
        aria-label="Cliente y obra"
        className={`${BANDA} ${sobreLimite ? 'border-destructive bg-destructive/15' : 'border-border bg-card'} xl:col-start-2 xl:row-start-1`}
      >
        <p className="font-semibold">{cliente?.nombre ?? 'Público en general · contado'}</p>
        {cliente !== null && (
          <>
            <p className="text-muted-foreground">Obra: {cliente.obra ?? 'sin obra asignada'}</p>
            <p className="tabular-nums">
              Debe {PESOS.format(cliente.saldoCentavos / 100)} · {cliente.diasVencido} d · límite{' '}
              {PESOS.format(cliente.limiteCentavos / 100)}
            </p>
            {/* El color no es el único portador: la condición va escrita. */}
            {sobreLimite && (
              <p className="font-semibold">Sobre su límite · pide PIN para crédito</p>
            )}
            <p className={cliente.recogeAutorizado ? '' : 'font-semibold'}>
              Recoge: {cliente.recoge ?? '—'}{' '}
              {cliente.recogeAutorizado
                ? '· autorizado'
                : '· ⚠️ no está en la lista. ¿Le hablas antes de despachar?'}
            </p>
          </>
        )}
      </section>

      <main className="xl:col-start-1 xl:row-start-1 xl:row-span-2">
        <label htmlFor="buscador" className="sr-only">
          Buscar material por nombre, medida, acabado o marca
        </label>
        <Input
          id="buscador"
          ref={buscador}
          autoFocus
          value={consulta}
          onChange={(evento) => {
            setConsulta(evento.target.value);
          }}
          placeholder="⌕  tornillo 1/4 x 2"
          className="text-lg"
        />

        {/* Miga de pan: enseña dónde estás y se quita POR PARTES, que es como
            se corrige una búsqueda que se pasó de estrecha. */}
        {palabras.length > 0 && (
          <nav aria-label="Filtros de la búsqueda" className="mt-2 flex flex-wrap gap-1">
            {palabras.map((palabra, indice) => (
              <Button
                key={`${palabra}-${indice}`}
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`Quitar el filtro ${palabra}`}
                onClick={() => {
                  setConsulta(palabras.filter((_, i) => i !== indice).join(' '));
                }}
              >
                {palabra} ✕
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
          <p className={`${BANDA} mt-3 border-border bg-warning/20`}>
            La caja está cerrada. Se arman notas y cotizaciones; no se cobra.
          </p>
        )}
        {error !== null && (
          <p role="alert" className={`${BANDA} mt-3 border-destructive bg-destructive/15`}>
            {error} · Lo que ya estaba en pantalla sigue sirviendo.
          </p>
        )}

        {filas === null ? (
          // Esqueleto con la forma de la tabla, nunca un spinner: el ojo ya sabe
          // dónde va a mirar cuando el índice termine de llegar.
          <div className="mt-3 space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-md xl:h-5" />
            ))}
          </div>
        ) : palabras.length === 0 ? (
          <section aria-label="Punto de partida" className="mt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRUPOS.map((grupo) => (
                <button
                  key={grupo}
                  type="button"
                  className={GRUPO}
                  onClick={() => {
                    setConsulta(grupo);
                  }}
                >
                  {grupo}
                </button>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Listas de trabajo:</p>
            <div className="mt-1 flex flex-wrap gap-2">
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
        ) : resultados.length === 0 ? (
          // Es la pantalla que salva o pierde la venta. Nunca dice «no hay» y ya.
          <section aria-label="Sin resultados exactos" className="mt-3">
            <p className="text-lg font-semibold">No tenemos de esa medida.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Pero éstas le pueden servir — son de la misma familia, no equivalencias declaradas:
            </p>
            <ul className="mt-2 space-y-1">
              {cercanas(filas, palabras).map((material) => (
                <li key={material.id}>
                  <FilaMaterial material={material} onAgregar={agregar} />
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={() => {
                // El alta rápida vive en el catálogo; aquí se llega con lo tecleado.
                window.location.assign(`/ferreteria/catalogo?alta=${encodeURIComponent(consulta)}`);
              }}
            >
              Dar de alta este material
            </Button>
          </section>
        ) : (
          <section aria-label="Resultados" className="mt-3">
            <p className={`${REJILLA} hidden px-2 text-xs text-muted-foreground xl:grid`}>
              <span>Medida</span>
              <span>Acabado</span>
              <span>Marca</span>
              <span>Precio</span>
              <span>Hay</span>
              <span>Dónde</span>
            </p>
            <ul className="space-y-1 xl:space-y-0">
              {resultados.map((material) => (
                <li key={material.id}>
                  <FilaMaterial material={material} onAgregar={agregar} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* SECUNDARIO · siempre visible en PC, plegado en una barra en el pasillo. */}
      <aside
        id="la-venta"
        aria-label="La venta"
        className={`${ventaAbierta ? 'fixed inset-x-0 bottom-0 z-20 max-h-[70dvh] overflow-y-auto' : 'hidden xl:block'} rounded-md border border-border bg-card p-3 text-card-foreground xl:static xl:col-start-2 xl:row-start-2 xl:max-h-none`}
      >
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">La venta</h2>
        {partidas.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            Todavía nada. Busque el material y presione Enter sobre el resultado.
          </p>
        ) : (
          <ul className="my-2 space-y-2">
            {partidas.map((partida) => (
              <li key={partida.material.id} className="border-b border-border pb-2">
                <p className="text-sm font-medium">
                  {partida.material.nombre} {partida.material.medida}
                </p>
                <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
                  <span>
                    {partida.cantidad} {partida.material.unidad} ×{' '}
                    {PESOS.format(partida.material.precioCentavos / 100)}
                  </span>
                  <span className="font-semibold">
                    {PESOS.format((partida.material.precioCentavos * partida.cantidad) / 100)}
                  </span>
                </div>
                <div className="mt-1 flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Quitar una pieza de ${partida.material.nombre}`}
                    onClick={() => {
                      cambiarCantidad(partida.material.id, -1);
                    }}
                  >
                    −
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label={`Agregar una pieza de ${partida.material.nombre}`}
                    onClick={() => {
                      cambiarCantidad(partida.material.id, 1);
                    }}
                  >
                    +
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Quitar la partida ${partida.material.nombre}`}
                    onClick={() => {
                      cambiarCantidad(partida.material.id, -partida.cantidad);
                    }}
                  >
                    Quitar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Grande para leerse de reojo, y NO lo más grande de la pantalla. */}
        <p className="flex items-baseline justify-between text-xl font-semibold tabular-nums">
          <span className="text-sm font-normal text-muted-foreground">
            {partidas.length} partidas
          </span>
          {PESOS.format(total / 100)}
        </p>

        <div className="mt-3 grid gap-2">
          <Button
            type="button"
            disabled={partidas.length === 0 || cajaCerrada || enviando}
            onClick={() => {
              void enviar('/api/venta/nota-mostrador');
            }}
          >
            Mandar a caja · F12
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={cliente === null || partidas.length === 0 || enviando}
            onClick={() => {
              void enviar('/api/venta/remision');
            }}
          >
            {sobreLimite ? 'Remisión a cuenta · pide PIN · F11' : 'Remisión a cuenta · F11'}
          </Button>
        </div>
      </aside>

      <button
        type="button"
        aria-expanded={ventaAbierta}
        aria-controls="la-venta"
        onClick={() => {
          setVentaAbierta((abierta) => !abierta);
        }}
        className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between border-t border-border bg-primary p-3 text-primary-foreground tabular-nums xl:hidden"
      >
        <span>{partidas.length} partidas</span>
        <span className="font-semibold">
          {PESOS.format(total / 100)} {ventaAbierta ? '▾' : '▴'}
        </span>
      </button>
    </div>
  );
}

interface FilaMaterialProps {
  readonly material: MaterialDeMostrador;
  readonly onAgregar: (material: MaterialDeMostrador) => void;
}

/**
 * La misma fila sirve de renglón de tabla en PC y de tarjeta en el pasillo.
 *
 * Es un `button` y no una celda porque el resultado se agrega con Enter y se
 * recorre con Tab: la tabla de atajos lo pide y el navegador ya lo sabe hacer.
 */
function FilaMaterial({ material, onAgregar }: FilaMaterialProps) {
  const agotado = material.existencia === 0;
  const negativo = material.existencia < 0;
  return (
    <button
      type="button"
      onClick={() => {
        onAgregar(material);
      }}
      // Se atenúa, pero NO se esconde: saber que el material existe aunque no
      // haya permite decir «te lo pido para el jueves», que es una venta.
      className={`${FILA} ${agotado || negativo ? 'opacity-70' : ''}`}
      aria-label={`${material.nombre} ${material.medida}, ${PESOS.format(material.precioCentavos / 100)}, hay ${material.existencia} ${material.unidad}, en ${material.ubicacion ?? 'ubicación sin capturar'}`}
    >
      <span className="col-span-2 text-lg font-semibold xl:col-span-1 xl:text-base">
        {material.medida}
      </span>
      <span className="text-sm text-muted-foreground">{material.acabado ?? '—'}</span>
      <span className="text-sm text-muted-foreground">{material.marca ?? '—'}</span>
      <span className="font-semibold tabular-nums">
        {PESOS.format(material.precioCentavos / 100)}
      </span>
      <span className="text-sm tabular-nums">
        {negativo ? '✖ revisar' : `${material.existencia} ${material.unidad}`}
      </span>
      {/* En negritas siempre: en el pasillo es el dato que se está usando. */}
      <span className="text-right font-bold xl:text-left">📍 {material.ubicacion ?? '—'}</span>
    </button>
  );
}
