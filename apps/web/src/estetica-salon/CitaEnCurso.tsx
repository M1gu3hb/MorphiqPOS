'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  BarraFija,
  Cifra,
  Dinero,
  Esqueleto,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import {
  Check,
  ChevronLeft,
  History,
  Minus,
  Plus,
  ShoppingBag,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import {
  PASO,
  mover,
  sobrante,
  transcurrido,
  type ComponenteDeFormula,
  type Mezcla,
} from './formula-de-cabina';
import { useVocabulario } from '~/cliente/vocabulario';

import { CostoDelServicio } from './CostoDelServicio.tsx';
import { FotosDeLaCita } from './FotosDeLaCita.tsx';
import { GaleriaDeLaClienta } from './GaleriaDeLaClienta.tsx';
import { NotaDeLaCita } from './NotaDeLaCita.tsx';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * PANTALLA · estetica-salon · cita-en-curso
 *
 * Ésta es la pantalla que se toca CON GUANTES DE TINTE, y todo su diseño sale
 * de ahí. 15–30 veces al día, en el teléfono de la estilista, con la clienta ya
 * sentada y las manos ocupadas.
 *
 * ── Por qué la fórmula anterior va arriba de TODO ────────────────────────
 * Antes que los servicios y antes que el precio. Es lo que se necesita en el
 * minuto 10, no al final. Una pantalla que empieza por la lista de servicios
 * obliga a desplazar con el dorso del dedo para llegar a lo único urgente. Es
 * además la única superficie levantada (`nivel` 1): el historial y los
 * servicios van pegados al fondo, y el ojo cae primero donde hay relieve.
 *
 * ── Por qué la fórmula es una TABLA y no una lista suelta ────────────────
 * «6.0 ······ 60 g» es exactamente una columna de material y una de cantidad,
 * con las cifras alineadas a la derecha: se compara de un vistazo con la de
 * hoy. Y la captura es la misma tabla con sus ± en una celda, como toda lista
 * con un control por fila.
 *
 * ── Por qué REPETIR es un botón enorme y está solo ───────────────────────
 * El documento pide 64 px; aquí son 80 (`min-h-20`) porque la clase de 64 la
 * prohíbe la puerta de densidad y porque con guante de tinte el margen sobra,
 * no falta. Se toca con el nudillo, con el dorso o con el meñique limpio. Está
 * SOLO: nada que se pueda tocar por error a un centímetro. El resto de los
 * controles de esta pantalla mide 64 px a densidad normal y crece con ella
 * (`CON_GUANTE`): «controles de 64 px, no de 44» es de §4.6.
 *
 * ── Por qué la cabecera no se va ─────────────────────────────────────────
 * La alergia tiene que estar SIEMPRE a la vista, también cuando la estilista
 * baja a las fotos o a los servicios: la cabecera es una `BarraFija` con el
 * nombre, la alergia con su palabra y el reloj de la cita.
 *
 * ── Por qué «añadir servicio» y «vender producto» están aquí ─────────────
 * Porque el momento en que se sugiere el tratamiento o el shampoo es con la
 * cabeza mojada, no en la salida. Si hay que acordarse en la caja, no se vende:
 * es el 15 % de la venta del salón y depende de estos dos botones.
 *
 * ── Por qué CERRAR SERVICIO no cobra ─────────────────────────────────────
 * Cierra el servicio, consume el material de cabina y deja la cita lista para
 * la caja. La clienta puede tardar veinte minutos más en salir. Por eso aquí NO
 * van el total, la propina ni el descuento: eso es de la pantalla de cobro.
 * Esta pantalla es del trabajo. Va en el color de lo que CIERRA bien (`success`)
 * para que no se confunda con REPETIR, que es el otro botón grande.
 *
 * ── Por qué el error NO vacía la pantalla ────────────────────────────────
 * Si no carga el historial se captura igual y se sincroniza. Perder la captura
 * por un error de red es perder el dato para siempre. Por eso el error es un
 * `Aviso` dentro de la pantalla, nunca un `ErrorDePantalla` que la sustituya.
 *
 * ── Lo demás de la cita, construido (C.10 de la 2.4) ────────────────────
 * La NOTA de la cita, escrita con la clienta sentada (`NotaDeLaCita`,
 * `agenda.anotar`). Las dos FOTOS se suben de verdad y se atan al servicio
 * (`FotosDeLaCita`, `expediente.foto`); antes sólo se marcaban «tomadas» y el
 * momento iba con acento, que el comando rechaza. La GALERÍA de sus fotos
 * (`GaleriaDeLaClienta`). Y lo que le cuesta al salón: el material de la receta de
 * cabina de cada servicio y la comisión cotizada (`CostoDelServicio`).
 *
 * Sin conexión NO hay cola local: es la decisión A-27 (F-988 en EXCEPCIONES) —toda
 * la lógica vive en el servidor—, y una foto o una nota que se da por guardada sin
 * haberse guardado es peor que decir que no se pudo. La pantalla lo dice.
 *
 * `FormulaAplicada` y los campos de salón de `Cliente` los escriben las migraciones
 * 137 y 142, APLICADAS en el acople (`scripts/esquema-esperado.json`).
 */

const DIA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const HORA = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' });

/**
 * 64 px a densidad normal —lo que §4.6 pide para tocar con el nudillo— y que
 * crece con la perilla. `min-h-16` fijo no crecería: por eso la puerta lo prohíbe.
 */
const CON_GUANTE = 'min-h-[calc(var(--altura-control)*1.45)]';
const CUADRO_CON_GUANTE = 'size-[calc(var(--altura-control)*1.45)]';
const CAMPO_CON_GUANTE =
  'h-[calc(var(--altura-control)*1.45)] font-numeros text-xl tabular-nums md:text-xl';
const ROTULO = 'text-xs font-semibold tracking-wide text-texto-sutil uppercase';

export interface VisitaConFormula {
  readonly id: string;
  /** ISO. Se formatea en el cliente: el servidor no sabe la zona del salón. */
  readonly fecha: string;
  readonly servicio: string;
  /**
   * El jsonb congelado, tal cual lo sirve el puente (`conversion: 'json'`): lo que
   * escribe `expediente.capturar_formula`, `{mezclado, usado, sobrante, componentes}`.
   *
   * Los materiales vienen DENTRO, no como campo suelto. Esta pantalla leía
   * `componentes` en la raíz: llegaba `undefined` y «la vez pasada» salía vacía con
   * cualquier clienta que vuelve, y REPETIR guardaba una fórmula sin materiales. Es
   * dato de fuera: se lee con `formulaDe`, que no confía en su forma.
   */
  readonly formula?: unknown;
  /**
   * `minutos_procesado`. NULO si se capturó sin procesado: `capturar_formula` guarda
   * el cero como nulo, y el mismo comando no acepta un nulo de vuelta.
   */
  readonly minutos: number | null;
}

/** Lo que se puede leer de la fórmula congelada de una visita. */
interface FormulaCongelada {
  readonly mezclado: number | null;
  readonly usado: number | null;
  readonly componentes: readonly ComponenteDeFormula[];
}

export interface ServicioDeLaCita {
  readonly id: string;
  /** `servicio_nombre`, que es como lo sirve `CitaServicio`. */
  readonly servicio_nombre: string | null;
  /**
   * EN PESOS: el gemelo honesto de `precio_centavos`, la misma columna, que el puente
   * convierte con `dinero`. Aquí se leía `precio_centavos` y se pasaba tal cual a
   * `<Dinero centavos>`: una cita de $350.00 se veía $3.50 (C.1 de la 2.4). Se lee
   * sólo con `centavosDe`.
   */
  readonly precio_pesos: number;
  readonly estado: string;
  /** El producto-servicio: su receta de cabina es el material. */
  readonly servicio_id?: string;
}

export interface CitaAbierta {
  readonly id: string;
  readonly clienta: string;
  readonly servicio: string;
  readonly hora: string;
  /** Epoch en ms del inicio real. El cronómetro no se guarda: se resta. */
  readonly inicioEn: number;
  /** La clienta, para su galería; nula en un walk-in sin ficha. */
  readonly clienteId?: string | null;
  readonly notas?: string | null;
  /**
   * LAS ALERGIAS NO SON DEL CLIENTE: son de su EXPEDIENTE.
   *
   * `Cliente` no las sirve —la tabla no las tiene— y viven en
   * `ExpedienteBelleza.alergias`, que esta misma pantalla ya lee para la bandera
   * roja. Opcional para que el aviso salga del expediente y no de un `undefined`
   * que se lee como «sin alergias»: en un salón, esa confusión quema una cabeza.
   */
  readonly alergias?: string | null;
}

export interface CitaEnCursoProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly citaInicial?: CitaAbierta;
  readonly visitasIniciales?: readonly VisitaConFormula[];
  readonly serviciosIniciales?: readonly ServicioDeLaCita[];
}

export interface FilasDeFormulaProps {
  readonly componentes?: readonly ComponenteDeFormula[];
  readonly minutos?: number;
}

interface FilaCita {
  readonly id: string;
  readonly agendada_para: string;
  readonly inicio_real: string | null;
  readonly cliente_id?: string | null;
  readonly notas?: string | null;
}

interface FilaClienta {
  readonly nombre: string;
  /**
   * La 142 añade los campos de salón a la tabla viva de clientes, y el puente NO
   * los sirve: `Cliente` no declara `alergias`.
   *
   * Opcional a propósito. Las alergias que esta pantalla enseña salen del
   * EXPEDIENTE —`ExpedienteBelleza.alergias`, que la agenda ya lee para la bandera
   * roja— y un `undefined` aquí se leería como «sin alergias», que en un salón es
   * la confusión que quema una cabeza.
   */
  readonly alergias?: string | null;
}

/** Punto de partida de una clienta nueva. NUNCA un formulario en blanco. */
const BASE: Mezcla = {
  mezclado: 90,
  usado: 90,
  componentes: [
    { nombre: '6.0', cantidad: 60, unidad: 'g' },
    { nombre: 'ox 20 vol', cantidad: 90, unidad: 'ml' },
  ],
  minutos: 35,
};

/** Un campo vacío es un cero, no un NaN: el sobrante tiene que cuadrar siempre. */
function entero(texto: string): number {
  const valor = Number.parseInt(texto, 10);
  return Number.isNaN(valor) ? 0 : Math.max(0, valor);
}

const esCifra = (valor: unknown): valor is number =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const esNombre = (valor: unknown): valor is string =>
  typeof valor === 'string' && valor.trim() !== '';

/** Un material tal como lo acepta `capturar_formula`: si no, REPETIR lo rechazaría. */
function esComponente(valor: unknown): valor is ComponenteDeFormula {
  if (typeof valor !== 'object' || valor === null) return false;
  const { nombre, cantidad, unidad } = valor as Record<string, unknown>;
  return esNombre(nombre) && esCifra(cantidad) && esNombre(unidad);
}

/**
 * La fórmula congelada de una visita, leída con desconfianza.
 *
 * Una fila vieja o a medio escribir no tira la pantalla: lo que no tiene la forma
 * se queda fuera, y un material sin nombre no llega a REPETIR.
 */
function formulaDe(visita: VisitaConFormula): FormulaCongelada {
  const crudo = visita.formula;
  const objeto: Readonly<Record<string, unknown>> =
    typeof crudo === 'object' && crudo !== null ? (crudo as Record<string, unknown>) : {};
  const { mezclado, usado, componentes } = objeto;
  return {
    mezclado: esCifra(mezclado) ? mezclado : null,
    usado: esCifra(usado) ? usado : null,
    componentes: Array.isArray(componentes)
      ? (componentes as readonly unknown[]).filter(esComponente)
      : [],
  };
}

function mezclaDe(visita: VisitaConFormula): Mezcla {
  const { mezclado, usado, componentes } = formulaDe(visita);
  // Una fila sin mezclado ni usado se lee por la suma de sus materiales: el
  // sobrante sale en cero y no inventa un desperdicio.
  const gramos = componentes.reduce((suma, c) => suma + c.cantidad, 0);
  return {
    mezclado: mezclado ?? gramos,
    usado: usado ?? gramos,
    componentes,
    // El procesado vacío llega NULO y el comando exige un número: REPETIR mandaba
    // `minutos: null` y la fórmula no se guardaba.
    minutos: visita.minutos ?? 0,
  };
}

function armar(
  fila: FilaCita | undefined,
  clienta: FilaClienta | undefined,
  lineas: readonly ServicioDeLaCita[],
): CitaAbierta | null {
  if (fila === undefined) return null;
  const arranque = Date.parse(fila.inicio_real ?? fila.agendada_para);
  return {
    id: fila.id,
    clienta: clienta?.nombre ?? 'Sin registrar',
    servicio: lineas[0]?.servicio_nombre ?? 'Servicio',
    hora: HORA.format(new Date(fila.agendada_para)),
    inicioEn: Number.isNaN(arranque) ? Date.now() : arranque,
    alergias: clienta?.alergias ?? null,
    clienteId: fila.cliente_id ?? null,
    notas: fila.notas ?? null,
  };
}

function mensajeDe(fallo: unknown, porOmision: string, voc: Vocabulario): string {
  // Una estilista sólo ve las citas que atiende ella; el servidor lo dice con
  // SIN_PERMISO y aquí se traduce, porque «403» no explica nada en el lavabo.
  if (fallo instanceof ErrorApi && fallo.error.codigo === 'SIN_PERMISO') {
    return (
      `${voc.conDeterminante('este', 'orden')} l${voc.terminacion('orden')} atiende otra persona. ` +
      'Aquí sólo ves las tuyas.'
    );
  }
  return fallo instanceof Error ? fallo.message : porOmision;
}

/** Material a la izquierda, cantidad a la derecha: se lee a medio metro del espejo. */
const COLUMNAS_DE_FORMULA: readonly ColumnaDeTabla<ComponenteDeFormula>[] = [
  {
    clave: 'material',
    titulo: 'Material',
    celda: (c) => <span className="text-lg font-semibold">{c.nombre}</span>,
  },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    numerica: true,
    celda: (c) => <Cifra valor={c.cantidad} unidad={c.unidad} tamano="lg" />,
  },
];

/**
 * Un renglón del historial: UN material de una visita.
 *
 * Material y cantidad son dos columnas de verdad, como en «la vez pasada», y no
 * dos `<span>` alineados a mano dentro de una celda: el lector oye una fila por
 * material y no «6.0 60 g ox 20 vol 90 ml 35 min» de corrido.
 */
interface RenglonDelHistorial {
  readonly clave: string;
  readonly visita: VisitaConFormula;
  /** El primero de su visita lleva la fecha, el servicio y el procesado. */
  readonly primero: boolean;
  /** Nulo en una visita que se guardó sin materiales: un renglón que lo dice. */
  readonly componente: ComponenteDeFormula | null;
}

function renglonesDelHistorial(
  visitas: readonly VisitaConFormula[],
): readonly RenglonDelHistorial[] {
  return visitas.flatMap((visita): readonly RenglonDelHistorial[] => {
    const { componentes } = formulaDe(visita);
    if (componentes.length === 0) {
      return [{ clave: visita.id, visita, primero: true, componente: null }];
    }
    return componentes.map((componente, indice) => ({
      clave: `${visita.id}-${String(indice)}`,
      visita,
      primero: indice === 0,
      componente,
    }));
  });
}

/** Las seis visitas: la vista que se acuerda de todo cuando gritan desde el lavabo. */
const COLUMNAS_DEL_HISTORIAL: readonly ColumnaDeTabla<RenglonDelHistorial>[] = [
  {
    clave: 'visita',
    titulo: 'Visita',
    celda: ({ visita, primero }) =>
      primero ? (
        <span className="flex flex-col">
          <span className="font-semibold">{DIA.format(new Date(visita.fecha))}</span>
          <span className="text-xs text-texto-sutil">{visita.servicio}</span>
          {visita.minutos === null ? null : (
            <span className="text-xs text-texto-sutil">
              <Cifra valor={visita.minutos} unidad="min" tamano="xs" /> de proceso
            </span>
          )}
        </span>
      ) : (
        // A la vista, la fecha va sólo en el primer renglón; quien recorre la tabla
        // fila por fila la oye en cada uno.
        <span className="sr-only">{DIA.format(new Date(visita.fecha))}</span>
      ),
  },
  {
    clave: 'material',
    titulo: 'Material',
    celda: ({ componente }) =>
      componente === null ? (
        <span className="text-texto-sutil">Sin componentes capturados</span>
      ) : (
        componente.nombre
      ),
  },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    numerica: true,
    celda: ({ componente }) =>
      componente === null ? null : (
        <Cifra valor={componente.cantidad} unidad={componente.unidad} tamano="sm" />
      ),
  },
];

function columnasDeServicios(voc: Vocabulario): readonly ColumnaDeTabla<ServicioDeLaCita>[] {
  return [
    {
      clave: 'servicio',
      titulo: voc.titulo('linea_orden'),
      celda: (s) => (
        <span className="flex flex-wrap items-center gap-(--espacio-2)">
          <span className="text-base font-medium">{s.servicio_nombre ?? 'Servicio'}</span>
          {/* La palabra, no sólo el tono de la fila: el tono solo no se lee. */}
          {s.estado === 'cerrado' && (
            <Badge variant="secondary">
              <Check aria-hidden="true" />
              Cerrado
            </Badge>
          )}
        </span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      // La columna no admite nulo: un nulo aquí sería una lectura rota, y se pinta
      // $0.00 en vez de tirar la tabla con la clienta sentada.
      celda: (s) => (
        <Dinero
          centavos={centavosDe('CitaServicio', 'precio_pesos', s.precio_pesos) ?? 0}
          tamano="sm"
        />
      ),
    },
  ];
}

/** La captura: la misma tabla de la fórmula, con los ± de diez en diez en su celda. */
function columnasDeCaptura(
  mezcla: Mezcla,
  alCambiar: (siguiente: Mezcla) => void,
): readonly ColumnaDeTabla<ComponenteDeFormula>[] {
  return [
    ...COLUMNAS_DE_FORMULA,
    {
      clave: 'ajustar',
      titulo: `De ${String(PASO)} en ${String(PASO)}`,
      numerica: true,
      celda: (c) => {
        const indice = mezcla.componentes.indexOf(c);
        return (
          <span className="flex justify-end gap-(--espacio-2)">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className={CUADRO_CON_GUANTE}
              aria-label={`Quitar ${String(PASO)} a ${c.nombre}`}
              onClick={() => {
                alCambiar(mover(mezcla, indice, -PASO));
              }}
            >
              <Minus aria-hidden="true" className="size-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className={CUADRO_CON_GUANTE}
              aria-label={`Añadir ${String(PASO)} a ${c.nombre}`}
              onClick={() => {
                alCambiar(mover(mezcla, indice, PASO));
              }}
            >
              <Plus aria-hidden="true" className="size-5" />
            </Button>
          </span>
        );
      },
    },
  ];
}

export function FilasDeFormula({ componentes = [], minutos = 0 }: FilasDeFormulaProps) {
  return (
    <div className="flex flex-col gap-(--espacio-2)">
      <Tabla
        etiqueta="Fórmula"
        columnas={COLUMNAS_DE_FORMULA}
        filas={componentes}
        claveDe={(c) => c.nombre}
        // Con los materiales ya leídos de `formula`, esto sólo sale si la visita de
        // verdad se guardó sin ellos. No promete una captura: AJUSTAR mueve los
        // materiales que hay y no tiene con qué añadir otro.
        vacio={<Vacio titulo="Esa visita se guardó sin materiales." className="py-(--espacio-4)" />}
      />
      <p className="text-sm text-texto-sutil">
        <Cifra valor={minutos} unidad="min" /> de proceso
      </p>
    </div>
  );
}

interface CapturaDeFormulaProps {
  readonly mezcla: Mezcla;
  readonly alCambiar: (siguiente: Mezcla) => void;
  readonly alGuardar: () => void;
  readonly alCancelar: () => void;
}

/** F-154: lo que se mezcló, lo que se usó y cuánto tiempo. El sobrante no se teclea. */
function CapturaDeFormula({ mezcla, alCambiar, alGuardar, alCancelar }: CapturaDeFormulaProps) {
  return (
    <div className="flex flex-col gap-(--espacio-4) border-t border-borde pt-(--espacio-4)">
      <div className="grid grid-cols-2 gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="mezclado">Mezclé (g)</Label>
          <Input
            id="mezclado"
            type="number"
            inputMode="numeric"
            className={CAMPO_CON_GUANTE}
            value={mezcla.mezclado}
            onChange={(evento) => {
              alCambiar({ ...mezcla, mezclado: entero(evento.target.value) });
            }}
          />
        </div>
        <div className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor="usado">Usé (g)</Label>
          <Input
            id="usado"
            type="number"
            inputMode="numeric"
            className={CAMPO_CON_GUANTE}
            value={mezcla.usado}
            onChange={(evento) => {
              alCambiar({ ...mezcla, usado: entero(evento.target.value) });
            }}
          />
        </div>
      </div>
      <p className="text-sm text-texto-sutil">
        Sobrante al bote:{' '}
        <Cifra
          valor={sobrante(mezcla.mezclado, mezcla.usado)}
          unidad="g"
          tamano="sm"
          className="font-semibold text-texto"
        />
      </p>

      <Tabla
        etiqueta="Fórmula que se captura"
        columnas={columnasDeCaptura(mezcla, alCambiar)}
        filas={mezcla.componentes}
        claveDe={(c) => c.nombre}
      />

      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="minutos">Procesado (min)</Label>
        <Input
          id="minutos"
          type="number"
          inputMode="numeric"
          className={CAMPO_CON_GUANTE}
          value={mezcla.minutos}
          onChange={(evento) => {
            alCambiar({ ...mezcla, minutos: entero(evento.target.value) });
          }}
        />
      </div>

      <div className="flex gap-(--espacio-3)">
        <Button type="button" className={`flex-1 text-base ${CON_GUANTE}`} onClick={alGuardar}>
          <Check aria-hidden="true" className="size-5" />
          Guardar fórmula
        </Button>
        <Button type="button" variant="ghost" className={CON_GUANTE} onClick={alCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/** La forma de la pantalla, no una rueda: el bloque de «la vez pasada» sale primero. */
function EsqueletoDeLaCita({ etiqueta }: { readonly etiqueta: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={etiqueta}
      className="mx-auto flex w-full max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6)"
    >
      <div className="flex items-center gap-(--espacio-3)">
        <Esqueleto redondo className="size-(--altura-control)" />
        <div className="flex flex-1 flex-col gap-(--espacio-2)">
          <Esqueleto className="h-5 w-1/2" />
          <Esqueleto className="h-4 w-2/3" />
        </div>
      </div>
      <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* El hueco de «la vez pasada» se reserva con la forma que va a tener,
            para que nada salte al cargar. En el teléfono va arriba de todo. */}
        <div className="order-1 flex flex-col gap-(--espacio-4) md:order-2">
          <Esqueleto className="h-80 w-full rounded-lg" />
          <Esqueleto className="h-40 w-full rounded-lg" />
        </div>
        <Esqueleto className="order-2 h-80 w-full rounded-lg md:order-1" />
      </div>
    </div>
  );
}

export function CitaEnCurso({
  citaInicial,
  visitasIniciales,
  serviciosIniciales,
}: CitaEnCursoProps) {
  const voc = useVocabulario();
  const sinRed = citaInicial !== undefined;
  const [cita, setCita] = useState<CitaAbierta | null>(citaInicial ?? null);
  const [servicios, setServicios] = useState<readonly ServicioDeLaCita[]>(serviciosIniciales ?? []);
  const [visitas, setVisitas] = useState<readonly VisitaConFormula[] | null>(
    visitasIniciales ?? (sinRed ? [] : null),
  );
  const [ahora, setAhora] = useState<number | null>(null);
  const [mezcla, setMezcla] = useState<Mezcla | null>(null);
  /** Sube cuando se guarda una foto: la galería se vuelve a leer. */
  const [fotosGuardadas, setFotosGuardadas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guardada, setGuardada] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (sinRed) return;
    // La agenda trae las DOS llaves en la URL. Encadenar cita → clienta costaría
    // un viaje entero justo en el minuto en que ella ya está sentada.
    const parametros = new URLSearchParams(window.location.search);
    const citaId = parametros.get('cita');
    const clientaId = parametros.get('clienta');
    // El centinela es la señal de aborto y no un `let vivo`: además de decir si
    // la pantalla sigue montada, CANCELA las cuatro lecturas en vuelo.
    const control = new AbortController();
    const señal = control.signal;
    void (async () => {
      try {
        const [citas, clientas, lineas, formulas] = await Promise.all([
          consultarPuente<FilaCita>('Cita', { filtro: { id: citaId }, limite: 1, signal: señal }),
          consultarPuente<FilaClienta>('Cliente', {
            filtro: { id: clientaId },
            limite: 1,
            signal: señal,
          }),
          consultarPuente<ServicioDeLaCita>('CitaServicio', {
            filtro: { cita_id: citaId },
            limite: 20,
            signal: señal,
          }),
          // El historial se degrada SOLO: si no carga, la captura sigue en pie.
          consultarPuente<VisitaConFormula>('FormulaAplicada', {
            filtro: { cliente_id: clientaId },
            orden: '-fecha',
            limite: 6,
            signal: señal,
          }).catch(() => null),
        ]);
        if (señal.aborted) return;
        setCita(armar(citas[0], clientas[0], lineas));
        setServicios(lineas);
        setVisitas(formulas ?? []);
        if (formulas === null) setError('No cargó el historial. Captura igual: se sincroniza.');
      } catch (fallo: unknown) {
        // Un aborto no es un error: es esta misma pantalla, que ya no está.
        if (señal.aborted) return;
        setVisitas([]);
        setError(mensajeDe(fallo, `No se pudo leer ${voc.enFrase('orden')}.`, voc));
      }
    })();
    return () => {
      control.abort();
    };
  }, [sinRed, voc]);

  useEffect(() => {
    // El reloj nace en un `setTimeout` y no en el cuerpo del efecto: escribir
    // estado ahí lo prohíbe react-hooks/set-state-in-effect, y además el primer
    // valor tiene que nacer en el cliente o la hidratación pinta otro minuto.
    const marcar = (): void => {
      setAhora(Date.now());
    };
    const primero = setTimeout(marcar);
    const reloj = setInterval(marcar, 20_000);
    return () => {
      clearTimeout(primero);
      clearInterval(reloj);
    };
  }, []);

  async function capturar(valores: Mezcla): Promise<void> {
    if (cita === null) return;
    try {
      // §7 del documento sólo nombra la LECTURA `ultima-formula`; la escritura
      // va por la convención /api/<dominio>/<verbo>. La primera captura de una
      // clienta nueva es también la que le crea el historial.
      await invocarComando('/api/expediente/capturar-formula', { citaId: cita.id, ...valores });
      setGuardada(true);
      setMezcla(null);
    } catch (fallo: unknown) {
      // Nunca se traga: una fórmula perdida en silencio no se recupera jamás.
      setError(mensajeDe(fallo, 'No se guardó la fórmula. Vuelve a intentarlo.', voc));
    }
  }

  async function cerrarServicio(): Promise<void> {
    const linea = servicios.find((s) => s.estado !== 'cerrado');
    if (linea === undefined) return;
    setCerrando(true);
    try {
      /**
       * EL CUERPO VA VACÍO, y eso es lo correcto.
       *
       * El identificador del servicio viaja EN LA RUTA. Lo que se mandaba aquí
       * —`{citaId}`— no es un campo de `agenda.cerrar_servicio`, y lo que ese
       * comando sí pedía era `almacenId`, que esta pantalla no tiene ni debe
       * pedir: un salón tiene un almacén y la estilista no elige de qué bodega
       * salió el tinte. Resultado medido: zod rechazaba la petición y **ninguna
       * pantalla podía cerrar un servicio**, así que ninguna cita llegaba a
       * `terminada` y la pantalla de cobro no listaba nada. Ahora el almacén lo
       * resuelve el servidor cuando no llega.
       *
       * `consumos` se queda en su valor por omisión —vacío— porque lo que se
       * mezcló se declara en la cabina (F-430), no aquí. Cerrar sin consumos no
       * toca el inventario: es el caso del corte, que no gasta producto.
       */
      await invocarComando(`/api/cita-servicios/${linea.id}/cerrar`, {});
      setServicios(servicios.map((s) => (s.id === linea.id ? { ...s, estado: 'cerrado' } : s)));
    } catch (fallo: unknown) {
      setError(mensajeDe(fallo, `No se pudo cerrar ${voc.enFrase('linea_orden')}.`, voc));
    } finally {
      setCerrando(false);
    }
  }

  if (visitas === null) {
    return <EsqueletoDeLaCita etiqueta={`Cargando ${voc.enFrase('orden')}`} />;
  }

  const ultima = visitas[0] ?? null;
  const punto = ultima === null ? BASE : mezclaDe(ultima);
  const alergias = cita?.alergias ?? null;
  const nombre = cita?.clienta ?? 'Sin registrar';
  const primero = nombre.split(' ')[0] ?? nombre;
  const reloj = cita === null || ahora === null ? '--:--' : transcurrido(cita.inicioEn, ahora);
  const abiertos = servicios.filter((s) => s.estado !== 'cerrado');

  return (
    <div className="pb-[calc(var(--espacio-12)*3)] md:pb-(--espacio-6)">
      <BarraFija className="border-b border-borde">
        <header className="mx-auto flex max-w-6xl items-start gap-(--espacio-2) p-(--espacio-3) md:px-(--espacio-6)">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Volver a la agenda"
            onClick={() => {
              window.history.back();
            }}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-(--espacio-1)">
            <div className="flex flex-wrap items-center gap-x-(--espacio-3) gap-y-(--espacio-1)">
              <h1 className="text-2xl font-bold md:text-3xl">{nombre}</h1>
              {/* La alergia SIEMPRE visible y con palabra, no sólo con color: un error
                  aquí no es un descuadre, es una urgencia médica. */}
              {alergias !== null && (
                <Badge
                  variant="destructive"
                  className="px-(--espacio-2) py-(--espacio-1) text-sm [&>svg]:size-4"
                >
                  <TriangleAlert aria-hidden="true" />
                  {`Alergia · ${alergias}`}
                </Badge>
              )}
            </div>
            <p className="flex flex-wrap items-center gap-x-(--espacio-3) gap-y-(--espacio-1) text-sm text-texto-sutil">
              <span>{`${cita?.servicio ?? 'Servicio'} · ${cita?.hora ?? '--:--'}`}</span>
              <span className="inline-flex items-center gap-(--espacio-1) font-medium text-texto">
                <Timer aria-hidden="true" className="size-4" />
                en curso <span className="font-numeros text-base tabular-nums">{reloj}</span>
              </span>
            </p>
          </div>
        </header>
      </BarraFija>

      <div className="mx-auto flex max-w-6xl flex-col gap-(--espacio-4) p-(--espacio-3) md:p-(--espacio-6)">
        {error !== null && <Aviso tono="peligro" titulo={error} />}
        {guardada && <Aviso tono="exito" titulo="Fórmula guardada en su historial." />}

        {/* Teléfono: una columna, la cita primero. Tablet y PC: el historial a la
            izquierda —la vista que se acuerda de todo cuando la estilista grita
            «¿qué le pusimos la vez pasada?»— y la cita en curso a la derecha. */}
        <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:items-start">
          <Superficie
            como="section"
            nivel={0}
            relleno={3}
            aria-labelledby="titulo-historial"
            className="order-2 flex flex-col gap-(--espacio-3) md:order-1"
          >
            <h2 id="titulo-historial" className={ROTULO}>
              Historial
            </h2>
            {visitas.length === 0 ? (
              <Vacio
                icono={<History />}
                titulo={`${primero} viene por primera vez.`}
                explicacion="La primera fórmula que guardes hoy le crea su historial."
                className="py-(--espacio-6)"
              />
            ) : (
              <Tabla
                etiqueta={`Historial de ${nombre}`}
                columnas={COLUMNAS_DEL_HISTORIAL}
                filas={renglonesDelHistorial(visitas)}
                claveDe={(r) => r.clave}
                alto="max-h-[70vh]"
              />
            )}
          </Superficie>

          <div className="order-1 flex flex-col gap-(--espacio-4) md:order-2">
            <Superficie
              como="section"
              relleno={3}
              aria-labelledby="titulo-formula"
              className="flex flex-col gap-(--espacio-4) md:p-(--espacio-4)"
            >
              <div className="flex flex-col gap-(--espacio-1)">
                <h2
                  id="titulo-formula"
                  className="text-sm font-semibold tracking-wide text-texto uppercase"
                >
                  {ultima === null
                    ? 'Fórmula de partida'
                    : `La vez pasada · ${DIA.format(new Date(ultima.fecha))}`}
                </h2>
                {ultima === null && (
                  <p className="text-sm text-texto-sutil">
                    {`${primero} viene por primera vez. Ésta es la fórmula base del servicio: ajústala y queda como su punto de partida.`}
                  </p>
                )}
              </div>

              <FilasDeFormula componentes={punto.componentes} minutos={punto.minutos} />

              {mezcla === null ? (
                <div className="flex flex-col gap-(--espacio-3)">
                  {/* Solo y enorme: se toca con el nudillo o con el dorso del dedo. */}
                  <Button
                    type="button"
                    className="min-h-20 w-full text-lg"
                    // SIN CITA no hay nada que guardar: `capturar` se iba de vuelta en su
                    // primera línea y el botón no hacía nada, sin decir por qué. El
                    // rastreador lo contó como muerto, y lo era en ese estado.
                    disabled={cita === null}
                    title={cita === null ? 'Abre una cita para guardar su fórmula' : undefined}
                    onClick={() => {
                      void capturar(punto);
                    }}
                  >
                    <Check aria-hidden="true" className="size-5" />
                    {ultima === null ? 'Guardar y crear su historial' : 'Repetir igual'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={`w-full ${CON_GUANTE}`}
                    onClick={() => {
                      setMezcla(punto);
                    }}
                  >
                    <SlidersHorizontal aria-hidden="true" />
                    Ajustar
                  </Button>
                </div>
              ) : (
                <CapturaDeFormula
                  mezcla={mezcla}
                  alCambiar={setMezcla}
                  alGuardar={() => {
                    void capturar(mezcla);
                  }}
                  alCancelar={() => {
                    setMezcla(null);
                  }}
                />
              )}
            </Superficie>

            <Superficie
              como="section"
              nivel={0}
              relleno={3}
              aria-labelledby="titulo-servicios"
              className="flex flex-col gap-(--espacio-3)"
            >
              <h2 id="titulo-servicios" className={ROTULO}>
                {voc.titulo('linea_orden', true)}
              </h2>
              <Tabla
                etiqueta={voc.titulo('linea_orden', true)}
                columnas={columnasDeServicios(voc)}
                filas={servicios}
                claveDe={(s) => s.id}
                tonoDeFila={(s) => (s.estado === 'cerrado' ? 'exito' : undefined)}
                vacio={
                  <Vacio
                    titulo={`Todavía no hay ${voc.plural('linea_orden')} en ${voc.enFraseCon('este', 'orden')}.`}
                    className="py-(--espacio-4)"
                  />
                }
              />
              <div className="grid gap-(--espacio-3) sm:grid-cols-2">
                <Button asChild variant="secondary" className={CON_GUANTE}>
                  <a href="/productos?tipo=servicio">
                    <Plus aria-hidden="true" />
                    Añadir {voc.singular('linea_orden')}
                  </a>
                </Button>
                <Button asChild variant="secondary" className={CON_GUANTE}>
                  <a href="/productos?tipo=anaquel">
                    <ShoppingBag aria-hidden="true" />
                    Vender {voc.singular('producto')}
                  </a>
                </Button>
              </div>
            </Superficie>

            <section aria-labelledby="titulo-fotos" className="flex flex-col gap-(--espacio-2)">
              <h2 id="titulo-fotos" className={ROTULO}>
                Fotos
              </h2>
              <FotosDeLaCita
                citaServicioId={abiertos[0]?.id ?? servicios[0]?.id ?? null}
                alGuardar={() => {
                  setFotosGuardadas((n) => n + 1);
                }}
              />
              {cita?.clienteId == null ? null : (
                <GaleriaDeLaClienta clienteId={cita.clienteId} lectura={fotosGuardadas} />
              )}
            </section>

            {cita === null ? null : (
              <>
                <section aria-labelledby="titulo-nota" className="flex flex-col gap-(--espacio-2)">
                  <h2 id="titulo-nota" className={ROTULO}>
                    Nota
                  </h2>
                  <NotaDeLaCita citaId={cita.id} notaInicial={cita.notas ?? null} />
                </section>

                <section aria-labelledby="titulo-costo" className="flex flex-col gap-(--espacio-2)">
                  <h2 id="titulo-costo" className={ROTULO}>
                    Lo que le cuesta al salón
                  </h2>
                  <CostoDelServicio
                    citaId={cita.id}
                    servicioIds={servicios
                      .map((s) => s.servicio_id)
                      .filter((id): id is string => id !== undefined)}
                    precioCentavos={servicios.reduce(
                      (suma, s) =>
                        suma + (centavosDe('CitaServicio', 'precio_pesos', s.precio_pesos) ?? 0),
                      0,
                    )}
                  />
                </section>
              </>
            )}

            {/* Pegado abajo en el teléfono, donde llega el pulgar con la otra mano
                ocupada. En tablet vuelve al flujo, al pie de la cita: ahí la
                pantalla cabe entera. */}
            <Superficie
              nivel={3}
              radio="sm"
              relleno={3}
              className="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-(--espacio-1) rounded-none border-x-0 border-b-0 pb-[max(var(--espacio-3),env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0 md:shadow-0"
            >
              <Button
                type="button"
                variant="success"
                className="min-h-20 w-full text-lg"
                disabled={cerrando || abiertos.length === 0}
                cargando={cerrando}
                onClick={() => {
                  void cerrarServicio();
                }}
              >
                {cerrando ? 'Cerrando…' : 'Cerrar servicio'}
              </Button>
              <p className="text-center text-xs text-texto-sutil">
                Cerrar no cobra: consume el material de cabina y deja la cita lista para la caja.
              </p>
            </Superficie>
          </div>
        </div>
      </div>
    </div>
  );
}
