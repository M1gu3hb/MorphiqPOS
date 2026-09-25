'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  TablaAdaptable,
  Vacio,
  centavosDeTexto,
  textoParaCampo,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Check, ClipboardList, PackageOpen, Plus, TrendingUp, Truck } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import {
  CanjeDeLaNota,
  canjesParaElServidor,
  type ArticuloDelProveedor,
  type CanjeCapturado,
} from './entradas/CanjeDeLaNota.tsx';

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
 * usar. Por eso los de hoy son teselas grandes, arriba y a la izquierda; los de
 * mañana y los demás, una fila de botones que no compite con ellos.
 *
 * ── La unidad se elige ANTES que la cantidad ────────────────────────────
 * Y la equivalencia se muestra en vivo: la columna «Entran» multiplica lo que
 * se teclea. Es la prevención del error de inventario número uno: teclear 18
 * pensando en cajas cuando el campo espera piezas mete 18 piezas donde
 * entraron 216, y nadie lo nota hasta el conteo. Con «Entran» a la vista, el
 * 18 contra el 216 se ve antes de guardar.
 *
 * ── La caducidad va EN LA ENTRADA, no en el producto ────────────────────
 * «La leche que llegó el jueves» es lo que una tiendita maneja. Pedirla aquí,
 * con la caja en la mano, es la única forma de que se conteste; pedirla después
 * desde el catálogo es no pedirla.
 *
 * ── Y el aviso de cambio de costo ────────────────────────────────────────
 * El costo anterior es el que sirve el sugerido: lo que cuesta UNA unidad base
 * (`costoUnitarioCentavos`). Contra él se compara lo que cuesta una unidad de
 * la nota; si subió, la fila se tiñe y dice «subió», y el aviso va pegado al
 * botón de guardar, que es donde se está mirando, con el costo de antes y el de
 * ahora. «Subió 5.2 %, véndelo a $48 en vez de $46» es lo accionable, pero
 * pide el precio de venta, y el sugerido lo sirve (C.10 de la 2.4): con él, el
 * aviso dice a cuánto venderlo para conservar el margen; sin él —un insumo que no
 * se vende tal cual— no se inventa uno.
 *
 * ── PC, tableta y teléfono ──────────────────────────────────────────────
 * En la PC la nota es una tabla densa de captura: se recorre con el tabulador
 * de izquierda a derecha, en el orden de la nota del repartidor. En tableta y
 * teléfono cada renglón es una tarjeta con sus campos uno bajo otro, porque la
 * recepción ocurre de pie a las 6:40 con la caja en la otra mano; y el total a
 * pagar con su botón se queda pegado abajo mientras se captura.
 *
 * ── Y el canje, en la misma nota (C.10 de la 2.4) ───────────────────────
 * Lo que se lleva el repartidor se captura aquí mismo (`entradas/CanjeDeLaNota`):
 * el servidor lo saca del inventario ligado a esta nota y le descuenta a lo que se
 * paga lo que valía, a su costo de antes. Dos movimientos, un documento.
 */

const RUTA_RECIBIR = '/api/compras/recibir-nota';
const RUTA_SUGERENCIA = '/api/compras/sugerencia';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const CANTIDAD_CON_FORMA = /^\d{1,6}(?:[.,]\d{1,4})?$/;

/** Más de esto no es el mercado: es un renglón mal capturado. */
const SUBIDA_QUE_AVISA = 0.05;

/** `0` es domingo, como `getDay()` y `extract(dow)`. */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;

/** Cuántos de «los demás» se enseñan: más que esto es un directorio, no una ruta. */
const OTROS_A_LA_VISTA = 12;

/** Las dos columnas de la PC: la ruta del día y el trabajo con el elegido. */
const MARCO =
  'flex flex-col gap-(--espacio-4) p-(--espacio-3) xl:grid xl:grid-cols-[17rem_minmax(0,1fr)] xl:items-start xl:p-(--espacio-4)';
const ROTULO = 'text-xs font-semibold tracking-wide text-texto-sutil uppercase';
/** De pie y con una mano ocupada el campo crece; en la tabla de la PC, no. */
const CAMPO = 'h-[calc(var(--altura-control)*1.2)] lg:h-(--altura-control)';
/** Desde aquí la nota es tabla (`desde="lg"`): la misma consulta que usa `TablaAdaptable`. */
const NOTA_EN_TABLA = '(min-width: 1024px)';

export interface ProveedorDelDia {
  readonly id: string;
  readonly nombre: string;
  readonly dia_visita: number | null;
  readonly frecuencia: string | null;
}

/**
 * Un renglón de `compras.sugerir_pedido`, con los nombres que el comando sirve
 * (`packages/app/src/abarrotes/sugerencia.ts`). Las cantidades base llegan como
 * texto decimal (`'238.0000'`) y los centavos como texto entero: la columna es
 * `bigint`. Viene de un comando, no del puente: los centavos ya son centavos.
 */
export interface RenglonSugerido {
  readonly insumoId: string;
  readonly nombre: string;
  /** Lo que cuesta UNA unidad base: es el costo anterior de la nota. */
  readonly costoUnitarioCentavos: string;
  /** A cuánto se vende una unidad base hoy; `null` si el insumo no tiene producto. */
  readonly precioVentaCentavos: string | null;
  readonly existenciaBase: string;
  readonly ventaDelPeriodoBase: string;
  /** En presentaciones de compra (cajas, paquetes), no en unidades base. */
  readonly presentacionesSugeridas: number;
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
  /** Lo que costaba una unidad base antes de esta nota. */
  readonly costoAnteriorCentavos: number | null;
  /** A cuánto se vende una unidad base hoy; `null` si el insumo no tiene producto. */
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

/** El aviso que evita perder dinero: cuánto subió y, si se sabe, a cuánto venderlo. */
export interface AvisoDeCosto {
  readonly nombre: string;
  readonly subidaPct: string;
  /** Por unidad base, antes y ahora. */
  readonly anteriorCentavos: number;
  readonly nuevoCentavos: number;
  /** `null` sin precio de venta: sin él no hay margen que conservar. */
  readonly precioSugeridoCentavos: number | null;
}

/** Un renglón de la nota tal como lo pinta la tabla: con su posición y su aviso. */
interface FilaDeNota {
  readonly linea: LineaCapturada;
  readonly indice: number;
  readonly aviso: AvisoDeCosto | null;
}

type Cambiar = (indice: number, cambios: Partial<LineaCapturada>) => void;

function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
}

/** Una cantidad tecleada, con la MISMA forma que exige guardar; `null` si no la tiene. */
function cantidadDe(texto: string): number | null {
  if (!CANTIDAD_CON_FORMA.test(texto)) return null;
  return Number(texto.replace(',', '.'));
}

/** Lo que llega del sugerido viene como texto: se pinta como cifra sólo si lo es. */
function cifraDe(texto: string): number | null {
  const valor = Number(texto);
  return texto === '' || !Number.isFinite(valor) ? null : valor;
}

/** Centavos que el comando sirve como texto entero (`bigint`); `null` si no lo son. */
function centavosEnteros(texto: string): number | null {
  if (!/^\d+$/.test(texto)) return null;
  const valor = Number(texto);
  return Number.isSafeInteger(valor) ? valor : null;
}

/** Cuántas entran de verdad al inventario: 18 cajas que traen 12 son 216. */
function entranDe(linea: LineaCapturada): number | null {
  const cantidad = cantidadDe(linea.cantidad);
  const equivalencia = cantidadDe(linea.equivalencia);
  if (cantidad === null || equivalencia === null) return null;
  return cantidad * equivalencia;
}

function diaDeVisita(proveedor: ProveedorDelDia): string {
  if (proveedor.dia_visita === null) return 'sin ruta';
  return DIAS[proveedor.dia_visita] ?? 'sin ruta';
}

/**
 * Cuánto subió el costo por unidad y, si se sabe el precio, a cuánto vender.
 *
 * El margen se conserva: si vendía al 50 % sobre costo, se sugiere el mismo
 * 50 % sobre el costo nuevo. Sugerir «costo + $2» conservaría el peso y perdería
 * el porcentaje, que es lo que de verdad paga la renta. Sin precio de venta no
 * hay margen que conservar, y suponer uno sería inventarle el precio al tendero.
 *
 * Las unidades son las de «Entran»: las mismas guardas que la columna, antes de
 * leer nada, para que un renglón a medio teclear no tire la pantalla.
 */
export function avisoDeCosto(linea: LineaCapturada): AvisoDeCosto | null {
  const anterior = linea.costoAnteriorCentavos;
  if (anterior === null || anterior <= 0) return null;
  const costoTotal = aCentavos(linea.costoTotal);
  const unidades = entranDe(linea);
  if (costoTotal === null || unidades === null || unidades <= 0) return null;

  const nuevo = costoTotal / unidades;
  const subida = (nuevo - anterior) / anterior;
  if (subida < SUBIDA_QUE_AVISA) return null;

  const precio = linea.precioVentaCentavos;
  return {
    nombre: linea.nombre,
    subidaPct: (subida * 100).toFixed(1),
    anteriorCentavos: anterior,
    nuevoCentavos: Math.round(nuevo),
    precioSugeridoCentavos:
      precio === null || precio <= 0 ? null : Math.ceil((nuevo * (precio / anterior)) / 100) * 100,
  };
}

/** ¿La nota se pinta como tabla? Decide el tamaño del campo de dinero de cada renglón. */
function useNotaEnTabla(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(NOTA_EN_TABLA);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(NOTA_EN_TABLA).matches,
    // Como `TablaAdaptable`: hasta saber el ancho se pinta la tabla.
    () => true,
  );
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

/** Una cifra, o la raya cuando el dato no está: un «NaN» en el mostrador no dice nada. */
function CifraORaya({
  valor,
  unidad,
  fuerte = false,
}: {
  readonly valor: number | null;
  readonly unidad?: string;
  readonly fuerte?: boolean;
}): ReactElement {
  if (valor === null) return <span className="text-texto-sutil">—</span>;
  return (
    <Cifra
      valor={valor}
      decimales={Number.isInteger(valor) ? 0 : 2}
      tamano="sm"
      className={fuerte ? 'font-semibold' : ''}
      {...(unidad === undefined ? {} : { unidad })}
    />
  );
}

/** El sugerido: se compara de arriba abajo, y lo que se pide es lo que pesa. */
function columnasDelSugerido(
  tituloDelProducto: string,
  enLaNota: ReadonlySet<string>,
  agregar: (renglon: RenglonSugerido) => void,
): readonly ColumnaDeTabla<RenglonSugerido>[] {
  return [
    {
      clave: 'producto',
      titulo: tituloDelProducto,
      celda: (r) => (
        <span className="flex flex-col">
          <span className="font-medium">{r.nombre}</span>
          {/* El tinte de la fila no va solo: la palabra dice por qué. */}
          {enLaNota.has(r.insumoId) ? (
            <span className="inline-flex items-center gap-(--espacio-1) text-xs text-texto-sutil">
              <Check aria-hidden="true" className="size-3" />
              ya en la nota
            </span>
          ) : null}
        </span>
      ),
    },
    {
      clave: 'hay',
      titulo: 'Hay',
      numerica: true,
      celda: (r) => <CifraORaya valor={cifraDe(r.existenciaBase)} />,
    },
    {
      clave: 'catorce',
      titulo: '14 días',
      numerica: true,
      celda: (r) => <CifraORaya valor={cifraDe(r.ventaDelPeriodoBase)} />,
    },
    {
      clave: 'sugerido',
      titulo: 'Sugerido',
      numerica: true,
      celda: (r) => <CifraORaya valor={r.presentacionesSugeridas} unidad={r.unidadCompra} fuerte />,
    },
    {
      clave: 'agregar',
      titulo: 'A la nota',
      celda: (r) => (
        <span className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              agregar(r);
            }}
          >
            <Plus aria-hidden="true" />
            Agregar
          </Button>
        </span>
      ),
    },
  ];
}

/** El costo de UNA unidad de lo que entra, y si subió, la palabra que lo dice. */
function CostoPorUnidad({ fila }: { readonly fila: FilaDeNota }): ReactElement {
  const entran = entranDe(fila.linea);
  const costo = aCentavos(fila.linea.costoTotal);
  if (entran === null || entran <= 0 || costo === null) {
    return <span className="text-texto-sutil">—</span>;
  }
  return (
    <span className="inline-flex flex-col items-end">
      <Dinero centavos={Math.round(costo / entran)} tamano="sm" />
      {fila.aviso === null ? null : (
        <span className="inline-flex items-center gap-(--espacio-1) text-xs font-medium">
          <TrendingUp aria-hidden="true" className="size-3" />
          subió {fila.aviso.subidaPct} %
        </span>
      )}
    </span>
  );
}

/**
 * La nota, en el orden en que se lee la del repartidor: qué, en qué unidad,
 * cuánto trae cada una, cuántas, y cuánto costó. «Entran» y «Por unidad» no se
 * teclean: son la equivalencia y el costo en vivo.
 */
function columnasDeLaNota(
  tituloDelProducto: string,
  cambiar: Cambiar,
  enTabla: boolean,
): readonly ColumnaDeTabla<FilaDeNota>[] {
  return [
    {
      clave: 'producto',
      titulo: tituloDelProducto,
      celda: ({ linea }) => <span className="font-medium">{linea.nombre}</span>,
    },
    {
      clave: 'unidad',
      titulo: 'Unidad',
      celda: ({ linea, indice }) => (
        <Input
          id={`unidad-${String(indice)}`}
          aria-label={`Unidad de compra de ${linea.nombre}`}
          className={`w-24 ${CAMPO}`}
          value={linea.unidad}
          onChange={(evento) => {
            cambiar(indice, { unidad: evento.target.value });
          }}
        />
      ),
    },
    {
      clave: 'trae',
      titulo: 'Trae',
      numerica: true,
      celda: ({ linea, indice }) => (
        <Input
          id={`equiv-${String(indice)}`}
          aria-label={`Cuánto trae cada unidad de ${linea.nombre}`}
          inputMode="decimal"
          className={`w-20 text-right ${CAMPO}`}
          value={linea.equivalencia}
          onChange={(evento) => {
            cambiar(indice, { equivalencia: evento.target.value });
          }}
        />
      ),
    },
    {
      clave: 'cantidad',
      titulo: 'Cantidad',
      numerica: true,
      celda: ({ linea, indice }) => (
        <Input
          id={`cant-${String(indice)}`}
          aria-label={`Cantidad de ${linea.nombre}`}
          aria-invalid={linea.cantidad !== '' && cantidadDe(linea.cantidad) === null}
          inputMode="decimal"
          className={`w-20 text-right ${CAMPO}`}
          value={linea.cantidad}
          onChange={(evento) => {
            cambiar(indice, { cantidad: evento.target.value });
          }}
        />
      ),
    },
    {
      clave: 'entran',
      titulo: 'Entran',
      numerica: true,
      celda: ({ linea }) => <CifraORaya valor={entranDe(linea)} fuerte />,
    },
    {
      clave: 'costo',
      titulo: 'Costo total',
      numerica: true,
      celda: ({ linea, indice }) => (
        <CampoDeDinero
          id={`costo-${String(indice)}`}
          aria-label={`Costo total de ${linea.nombre}`}
          // En la tarjeta se teclea de pie y se relee antes de guardar: crece, como
          // los demás campos. En la tabla de la PC, no.
          tamano={enTabla ? 'base' : 'grande'}
          className="ml-auto w-32"
          centavos={centavosDeTexto(linea.costoTotal)}
          alCambiar={(centavos) => {
            cambiar(indice, { costoTotal: centavos === null ? '' : textoParaCampo(centavos) });
          }}
        />
      ),
    },
    {
      clave: 'unitario',
      titulo: 'Por unidad',
      numerica: true,
      celda: (fila) => <CostoPorUnidad fila={fila} />,
    },
    {
      clave: 'caduca',
      titulo: 'Caduca el',
      celda: ({ linea, indice }) => (
        <Input
          id={`caduca-${String(indice)}`}
          aria-label={`Caducidad de ${linea.nombre}, si caduca`}
          type="date"
          className={`w-40 ${CAMPO}`}
          value={linea.caducaEl}
          onChange={(evento) => {
            cambiar(indice, { caducaEl: evento.target.value });
          }}
        />
      ),
    },
  ];
}

function Cabecera(): ReactElement {
  return (
    <header className="flex flex-col gap-(--espacio-1) xl:col-span-2">
      <h1 className="text-2xl font-semibold">Entradas</h1>
      <p className="text-sm text-texto-sutil">Quién viene hoy y qué hay que pedirle.</p>
    </header>
  );
}

interface EleccionDeProveedor {
  readonly elegido: ProveedorDelDia | null;
  readonly alElegir: (proveedor: ProveedorDelDia) => void;
}

/** Mañana y los demás: a mano, pero sin competir con los de hoy. */
function GrupoDeProveedores({
  titulo,
  proveedores,
  conDia,
  elegido,
  alElegir,
}: EleccionDeProveedor & {
  readonly titulo: string;
  readonly proveedores: readonly ProveedorDelDia[];
  readonly conDia: boolean;
}): ReactElement | null {
  if (proveedores.length === 0) return null;
  return (
    <div className="flex flex-col gap-(--espacio-2)">
      <h2 className={ROTULO}>{titulo}</h2>
      {/* Una fila que se desliza en el teléfono, una columna en la PC: la ruta
          de hoy no se empuja fuera de la pantalla. */}
      <ul className="flex gap-(--espacio-2) overflow-x-auto pb-(--espacio-1) xl:flex-col xl:overflow-visible xl:pb-0">
        {proveedores.map((proveedor) => {
          const esElElegido = elegido?.id === proveedor.id;
          return (
            <li key={proveedor.id} className="shrink-0">
              <Button
                type="button"
                variant={esElElegido ? 'secondary' : 'outline'}
                aria-pressed={esElElegido}
                className="xl:w-full xl:justify-start"
                onClick={() => {
                  alElegir(proveedor);
                }}
              >
                {esElElegido ? <Check aria-hidden="true" /> : null}
                <span className="min-w-0 truncate">{proveedor.nombre}</span>
                {conDia ? (
                  <span className="text-xs font-normal text-texto-sutil xl:ml-auto">
                    {diaDeVisita(proveedor)}
                  </span>
                ) : null}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RutaDelDia({
  proveedores,
  diaSemana,
  elegido,
  alElegir,
}: EleccionDeProveedor & {
  readonly proveedores: readonly ProveedorDelDia[];
  readonly diaSemana: number;
}): ReactElement {
  const hoyToca = tocanHoy(proveedores, diaSemana);
  const manana = (diaSemana + 1) % 7;
  const demas = proveedores
    .filter((p) => p.dia_visita !== diaSemana && p.dia_visita !== manana)
    .slice(0, OTROS_A_LA_VISTA);

  return (
    <aside aria-label="Proveedores" className="flex min-w-0 flex-col gap-(--espacio-4)">
      <section aria-labelledby="hoy-toca" className="flex flex-col gap-(--espacio-2)">
        <h2 id="hoy-toca" className={ROTULO}>
          Hoy toca · {DIAS[diaSemana]}
        </h2>
        {hoyToca.length === 0 ? (
          <p className="text-sm text-texto-sutil">Hoy no viene nadie de ruta.</p>
        ) : (
          <ul className="grid gap-(--espacio-2) sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
            {hoyToca.map((proveedor) => {
              const esElElegido = elegido?.id === proveedor.id;
              return (
                <li key={proveedor.id}>
                  <Superficie
                    como="button"
                    type="button"
                    interactiva
                    activa={esElElegido}
                    aria-pressed={esElElegido}
                    relleno={3}
                    radio="md"
                    onClick={() => {
                      alElegir(proveedor);
                    }}
                    className="flex min-h-[calc(var(--altura-control)*1.4)] w-full items-center gap-(--espacio-3)"
                  >
                    <Truck aria-hidden="true" className="size-5 shrink-0 text-texto-sutil" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base font-semibold">{proveedor.nombre}</span>
                      <span className="text-xs text-texto-sutil">{proveedor.frecuencia ?? ''}</span>
                    </span>
                    {/* El anillo no es lo único que dice cuál está elegido. */}
                    {esElElegido ? (
                      <Check aria-hidden="true" className="size-5 shrink-0 text-primario" />
                    ) : null}
                  </Superficie>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <GrupoDeProveedores
        titulo="Mañana"
        proveedores={tocanHoy(proveedores, manana)}
        conDia={false}
        elegido={elegido}
        alElegir={alElegir}
      />
      <GrupoDeProveedores
        titulo="Los demás"
        proveedores={demas}
        conDia
        elegido={elegido}
        alElegir={alElegir}
      />
    </aside>
  );
}

export function Entradas({ proveedoresIniciales, hoy }: EntradasProps) {
  const voc = useVocabulario();
  const notaEnTabla = useNotaEnTabla();
  const [proveedores, setProveedores] = useState<readonly ProveedorDelDia[] | null>(
    proveedoresIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada intento de lectura es un número: reintentar lo sube y el efecto lee otra
  // vez. El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState<ProveedorDelDia | null>(null);
  const [sugerido, setSugerido] = useState<readonly RenglonSugerido[] | null>(null);
  const [sugeridoFallo, setSugeridoFallo] = useState(false);
  const [lineas, setLineas] = useState<readonly LineaCapturada[]>([]);
  const [diaSemana, setDiaSemana] = useState<number | null>(hoy ?? null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardada, setGuardada] = useState<string | null>(null);
  /** Todo lo que se le compra a este proveedor: lo que el canje puede llevarse. */
  const [articulos, setArticulos] = useState<readonly ArticuloDelProveedor[]>([]);
  const [canjes, setCanjes] = useState<readonly CanjeCapturado[]>([]);

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
        .catch((fallo: unknown) => {
          // Una lista que no se leyó NO es una lista vacía: «hoy no viene nadie»
          // sobre una red caída es mentirle a quien tiene al repartidor enfrente.
          if (sigueMontada())
            setFalloDeCarga(
              fallo instanceof Error ? fallo.message : 'No se pudo leer la lista de proveedores.',
            );
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [proveedoresIniciales, intento]);

  function reintentarCarga(): void {
    setFalloDeCarga(null);
    setProveedores(null);
    setIntento((previo) => previo + 1);
  }

  function pedirSugerido(proveedor: ProveedorDelDia): void {
    setSugerido(null);
    setSugeridoFallo(false);
    setArticulos([]);
    setCanjes([]);
    invocarComando<{
      readonly renglones: readonly RenglonSugerido[];
      readonly articulos: readonly ArticuloDelProveedor[];
    }>(`${RUTA_SUGERENCIA}/${proveedor.id}`, {})
      .then((datos) => {
        setSugerido(datos.renglones);
        setArticulos(datos.articulos);
      })
      .catch(() => {
        setSugeridoFallo(true);
      });
  }

  function elegir(proveedor: ProveedorDelDia): void {
    setElegido(proveedor);
    setLineas([]);
    setGuardada(null);
    pedirSugerido(proveedor);
  }

  function agregarDesdeSugerido(renglon: RenglonSugerido): void {
    setLineas([
      ...lineas,
      {
        insumoId: renglon.insumoId,
        nombre: renglon.nombre,
        unidad: renglon.unidadCompra,
        equivalencia: '1',
        cantidad: String(renglon.presentacionesSugeridas),
        costoTotal: '',
        caducaEl: '',
        // Lo que costaba una unidad base: contra esto se mide si subió.
        costoAnteriorCentavos: centavosEnteros(renglon.costoUnitarioCentavos),
        precioVentaCentavos:
          renglon.precioVentaCentavos === null
            ? null
            : centavosEnteros(renglon.precioVentaCentavos),
      },
    ]);
  }

  function cambiar(indice: number, cambios: Partial<LineaCapturada>): void {
    setLineas(lineas.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)));
  }

  function guardar(): void {
    // Un doble toque llega antes que el re-pintado que deshabilita el botón, y
    // cada llamada lleva su propia clave de idempotencia: la nota entraría dos veces.
    if (guardando) return;
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
    invocarComando<{
      readonly compraId: string;
      readonly caducidadesRegistradas: number;
      readonly canjeCentavos: string;
    }>(RUTA_RECIBIR, {
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
      canjes: canjesParaElServidor(canjes),
    })
      .then((salida) => {
        const conCanje = salida.canjeCentavos !== '0' ? ' El canje ya se descontó.' : '';
        setGuardada(
          salida.caducidadesRegistradas > 0
            ? `Entrada guardada, con ${String(salida.caducidadesRegistradas)} caducidad${
                salida.caducidadesRegistradas === 1 ? '' : 'es'
              }.${conCanje}`
            : `Entrada guardada.${conCanje}`,
        );
        setLineas([]);
        setCanjes([]);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setGuardando(false);
      });
  }

  if (falloDeCarga !== null) {
    return (
      <main className={MARCO}>
        <Cabecera />
        <ErrorDePantalla
          className="max-w-2xl xl:col-span-2"
          titulo="No se pudo leer la lista de proveedores."
          queHacer="Sin ella no se sabe quién viene hoy ni qué pedirle. Revisa la conexión y vuelve a intentarlo."
          detalle={falloDeCarga}
          reintentar={
            <Button type="button" onClick={reintentarCarga}>
              Volver a intentar
            </Button>
          }
        />
      </main>
    );
  }

  if (proveedores === null || diaSemana === null) {
    return (
      <main className={MARCO}>
        <Cabecera />
        {/* La forma de la ruta y del panel, no una rueda: al llegar los datos
            nada salta de sitio. */}
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo quién viene hoy"
          className="flex flex-col gap-(--espacio-4) xl:col-span-2 xl:grid xl:grid-cols-[17rem_minmax(0,1fr)]"
        >
          <div className="flex flex-col gap-(--espacio-2)">
            <Esqueleto className="h-4 w-32" />
            {Array.from({ length: 3 }, (_, indice) => (
              <Esqueleto key={indice} className="h-[calc(var(--altura-control)*1.4)] w-full" />
            ))}
          </div>
          <Esqueleto className="h-64 w-full rounded-lg" />
        </div>
      </main>
    );
  }

  if (proveedores.length === 0) {
    return (
      <main className={MARCO}>
        <Cabecera />
        <Vacio
          icono={<Truck />}
          titulo="Todavía no hay proveedores dados de alta."
          explicacion="En cuanto cada proveedor tenga su día de visita, aquí aparece quién viene hoy y qué hay que pedirle antes de que llegue."
          className="xl:col-span-2"
        />
      </main>
    );
  }

  const tituloDelProducto = voc.titulo('producto');
  const enLaNota = new Set(lineas.map((l) => l.insumoId));
  const filasDeLaNota: readonly FilaDeNota[] = lineas.map((linea, indice) => ({
    linea,
    indice,
    aviso: avisoDeCosto(linea),
  }));
  const conAviso = filasDeLaNota.flatMap((fila) =>
    fila.aviso === null
      ? []
      : [{ clave: `${fila.linea.insumoId}-${String(fila.indice)}`, aviso: fila.aviso }],
  );
  const aPagar = lineas.reduce((suma, l) => suma + (aCentavos(l.costoTotal) ?? 0), 0);
  const sinCosto = lineas.filter((l) => aCentavos(l.costoTotal) === null).length;

  const sugeridoPintado = (() => {
    if (elegido === null) return null;
    if (sugeridoFallo) {
      return (
        <Aviso
          tono="peligro"
          titulo={`No se pudo leer el sugerido de ${elegido.nombre}.`}
          accion={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                pedirSugerido(elegido);
              }}
            >
              Volver a pedir
            </Button>
          }
        >
          Sin el sugerido no hay de dónde agregar a la nota. Revisa la conexión y vuelve a pedirlo.
        </Aviso>
      );
    }
    if (sugerido === null) return <EsqueletoDeLista filas={5} />;
    return (
      <TablaAdaptable
        desde="md"
        principal="producto"
        etiqueta={`Pedido sugerido de ${elegido.nombre}`}
        columnas={columnasDelSugerido(tituloDelProducto, enLaNota, agregarDesdeSugerido)}
        filas={sugerido}
        claveDe={(r) => r.insumoId}
        tonoDeFila={(r) => (enLaNota.has(r.insumoId) ? 'exito' : undefined)}
        alto="max-h-[50vh]"
        vacio={
          <Vacio
            icono={<PackageOpen />}
            titulo={`No hay sugerencia: falta historia de ${voc.plural('orden')} de este proveedor.`}
            className="py-(--espacio-6)"
          />
        }
      />
    );
  })();

  return (
    <main className={MARCO}>
      <Cabecera />

      <RutaDelDia
        proveedores={proveedores}
        diaSemana={diaSemana}
        elegido={elegido}
        alElegir={elegir}
      />

      <div className="flex min-w-0 flex-col gap-(--espacio-4) xl:col-start-2">
        {elegido === null ? (
          <Superficie nivel={0} className="border-dashed">
            <Vacio
              icono={<ClipboardList />}
              titulo="Elige un proveedor para ver qué pedirle."
              explicacion="El sugerido cruza lo que se vendió en 14 días con lo que hay en el anaquel: queda listo antes de que llegue el repartidor."
            />
          </Superficie>
        ) : (
          <>
            <Superficie
              como="section"
              aria-labelledby="sugerido-titulo"
              className="flex flex-col gap-(--espacio-3)"
            >
              <div className="flex flex-col gap-(--espacio-1)">
                <h2 id="sugerido-titulo" className="text-lg font-semibold">
                  Pedido sugerido · {elegido.nombre}
                </h2>
                <p className="text-sm text-texto-sutil">
                  Lo que se vendió en 14 días contra lo que hay. El sistema sugiere; tú decides.
                </p>
              </div>
              {sugeridoPintado}
            </Superficie>

            <Superficie
              como="section"
              aria-labelledby="nota-titulo"
              className="flex flex-col gap-(--espacio-3)"
            >
              <div className="flex flex-col gap-(--espacio-1)">
                <h2 id="nota-titulo" className="text-lg font-semibold">
                  Recibir nota · {elegido.nombre}
                </h2>
                <p className="text-sm text-texto-sutil">
                  Primero la unidad, luego la cantidad: «Entran» dice cuántas suben al inventario.
                </p>
              </div>

              <TablaAdaptable
                desde="lg"
                principal="producto"
                etiqueta={`Nota de ${elegido.nombre}`}
                columnas={columnasDeLaNota(tituloDelProducto, cambiar, notaEnTabla)}
                filas={filasDeLaNota}
                claveDe={(fila) => `${fila.linea.insumoId}-${String(fila.indice)}`}
                tonoDeFila={(fila) => (fila.aviso === null ? undefined : 'advertencia')}
                // En tarjeta, un campo por renglón en el teléfono: dos en fila no caben
                // con la caja en la otra mano.
                columnasDeTarjeta="adaptable"
                vacio={
                  <Vacio
                    icono={<PackageOpen />}
                    titulo="Agrega del sugerido, o captura lo que traiga el repartidor."
                    className="py-(--espacio-6)"
                  />
                }
              />

              <CanjeDeLaNota articulos={articulos} canjes={canjes} onCambiar={setCanjes} />

              {conAviso.map(({ clave, aviso }) => (
                <Aviso
                  key={clave}
                  tono="atencion"
                  titulo={`${aviso.nombre} subió ${aviso.subidaPct} %.`}
                >
                  Por unidad pasó de <Dinero centavos={aviso.anteriorCentavos} tamano="sm" /> a{' '}
                  <Dinero centavos={aviso.nuevoCentavos} tamano="sm" />.{' '}
                  {aviso.precioSugeridoCentavos === null ? (
                    'Revisa su precio de venta.'
                  ) : (
                    <>
                      Véndelo a <Dinero centavos={aviso.precioSugeridoCentavos} tamano="sm" /> para
                      no perder margen.
                    </>
                  )}
                </Aviso>
              ))}
              {error === null ? null : (
                <Aviso tono="peligro" titulo={error}>
                  No entró nada al inventario.
                </Aviso>
              )}
              {guardada === null ? null : <Aviso tono="exito" titulo={guardada} />}

              {/* El total y su botón se quedan a la vista mientras se captura: de pie,
                  con la nota larga, bajar a buscarlos es perder el renglón. */}
              <div className="sticky bottom-0 z-10 flex flex-col gap-(--espacio-3) border-t border-borde bg-superficie py-(--espacio-3) sm:flex-row sm:items-center sm:justify-between">
                <p className="flex flex-wrap items-baseline gap-x-(--espacio-2)">
                  <span className="text-sm text-texto-sutil">A pagar</span>
                  <Dinero centavos={aPagar} tamano="lg" />
                  {sinCosto > 0 && lineas.length > 0 ? (
                    <span className="text-xs text-texto-sutil">· falta el costo de {sinCosto}</span>
                  ) : null}
                </p>
                <Button
                  type="button"
                  size="lg"
                  className="h-[calc(var(--altura-control)*1.4)] w-full text-base sm:w-auto sm:min-w-64"
                  disabled={lineas.length === 0}
                  cargando={guardando}
                  onClick={guardar}
                >
                  Guardar entrada
                </Button>
              </div>
            </Superficie>
          </>
        )}
      </div>
    </main>
  );
}
