'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso, Cifra, Tabla, Vacio, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import { Check, CircleAlert, Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';
import type { Vocabulario } from '@morphiqpos/domain/vocabulario';

/**
 * F-321 · Dividir la cuenta.
 *
 * ── Por qué este componente es NUEVO y no una edición ────────────────────
 * D-09: mientras Codex trabaje en `apps/web/heredado/` no se modifica un
 * archivo que ya existía ahí. Esto vive al lado, en `apps/web/src/`, donde el
 * sistema de diseño sí vigila los literales; el enganche es **una línea** y está
 * anotada en el `FILE-MAP.md` del modelo.
 *
 * ── La regla que la pantalla tiene que hacer obvia ───────────────────────
 * Lo que se reparte son UNIDADES, no importes. El comensal dice «yo pago mis
 * dos cervezas», no «yo pago $195». Si la pantalla pidiera importes, el mesero
 * tendría que hacer la cuenta de memoria y el servidor tendría que confiar en
 * ella — y ahí es donde una división deja de cuadrar contra la cuenta madre.
 *
 * El servidor calcula los totales de cada parte. Esta pantalla no suma dinero
 * en ningún sitio: sólo cuenta unidades y enseña cuántas faltan por repartir.
 *
 * ── Y por qué el botón se queda apagado hasta que cuadra ─────────────────
 * Es fricción deliberada, la misma que el desglose del pago mixto. Una división
 * con unidades sin repartir es una cuenta madre con sobrante que nadie va a
 * cobrar, y se descubre al cierre. Y una cuenta que no se lleva nada el servidor
 * la rechaza («La parte N quedó vacía»): también apaga el botón, y el contador lo
 * dice con palabras —«Cuenta 3 no lleva ningún platillo»— y no sólo en rojo.
 *
 * ── Cómo se ve: UNA tabla, platillos por cuentas ─────────────────────────
 * Se abre desde la mesa activa, en la tableta del mesero (`04-INTERFAZ` · Mesa
 * activa). Cada renglón es un platillo y cada columna una cuenta, con su «−» y
 * su «+»; la columna «Por repartir» va pegada al nombre. Antes eran tarjetas por
 * cuenta que repetían la lista entera en cada una, y lo que faltaba se sabía
 * sólo como un número global: había que recorrer todas para encontrar DÓNDE.
 * Aquí el renglón que aún tiene unidades sueltas se tiñe y dice cuántas, y el pie
 * dice cuánto se lleva cada cuenta —y cuál se quedó sin nada, que el servidor
 * rechaza—. Los botones miden el alto de un control completo: se tocan con el
 * pulgar, de pie. Con muchas cuentas la tabla se desplaza por dentro, no la
 * página. El botón de dividir se estira hasta la esquina inferior derecha, que
 * es donde cae el pulgar derecho.
 *
 * ── Estados ──────────────────────────────────────────────────────────────
 * Recibe los platillos por props y no lee nada: no hay esqueleto, porque no hay
 * lectura que esperar. El vacío es una GUARDA: `MesaActiva` sólo ofrece «Dividir»
 * con platillos enviados, así que hoy ningún camino lo pinta; si alguna vez llega
 * una lista vacía, dice la verdad en vez de pintar una tabla sin filas. El comando
 * sí puede fallar: eso es un aviso que dice qué NO pasó.
 *
 * ── Lo que se oye ────────────────────────────────────────────────────────
 * UNA sola región viva: el contador. Cada «+» o «−» la cambia y lleva delante, sólo
 * para el lector, qué se movió («Tacos: 1 en la cuenta 1»). Las celdas no son
 * regiones vivas —un `<output>` lo era, y cada toque sonaba dos veces—, y un botón
 * que no puede hacer nada se apaga con `aria-disabled` y NO con `disabled`: el mismo
 * toque que lleva un platillo a cero apagaba el «+» que tenía el foco, y el foco se
 * caía al `body`.
 */

export interface LineaParaDividir {
  readonly id: string;
  readonly nombre: string;
  /** Unidades enteras. Una línea de 2.5 kg no se divide por unidades. */
  readonly cantidad: number;
}

export interface DividirCuentaDialogProps {
  readonly abierto: boolean;
  readonly ordenId: string;
  readonly lineas: readonly LineaParaDividir[];
  readonly onCerrar: () => void;
  readonly onDividida: (partes: number) => void;
}

interface Parte {
  /** `lineaId` → cuántas unidades se lleva esta parte. */
  readonly tomas: Readonly<Record<string, number>>;
}

const MAXIMO_PARTES = 8;

/** Una cantidad no entera se enseña con sus decimales: redondearla mentiría. */
function decimalesDe(valor: number): number {
  return Number.isInteger(valor) ? 0 : 2;
}

/** Cuántas unidades se lleva una parte, sumando todos sus platillos. */
function unidadesDe(parte: Parte): number {
  return Object.values(parte.tomas).reduce((a, n) => a + n, 0);
}

interface ControlDeUnidadesProps {
  readonly nombre: string;
  /** «la cuenta 2», ya en frase: va dentro de los nombres de los botones. */
  readonly cuenta: string;
  readonly tomadas: number;
  readonly puedeSumar: boolean;
  readonly bloqueado: boolean;
  readonly alMover: (delta: number) => void;
}

/**
 * Un botón que no puede hacer nada se APAGA sin soltar el foco: `aria-disabled` y el
 * mismo aspecto que `disabled`, que sí lo suelta. El toque se ignora aquí y otra vez
 * en `mover`.
 */
const APAGADO_CON_FOCO = 'aria-disabled:pointer-events-none aria-disabled:opacity-50';

/**
 * «−», las unidades, «+». Cada botón se apaga cuando no puede hacer nada —cero
 * tomadas, o nada por repartir de ese platillo—: un botón que no responde al
 * toque se lee como una pantalla trabada. `disabled` sólo mientras se divide: ahí
 * el foco está en el botón de dividir, no en éstos.
 */
function ControlDeUnidades({
  nombre,
  cuenta,
  tomadas,
  puedeSumar,
  bloqueado,
  alMover,
}: ControlDeUnidadesProps) {
  const puedeQuitar = tomadas > 0;
  return (
    <span className="inline-flex items-center gap-(--espacio-1)">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={`Quitar ${nombre} de ${cuenta}`}
        aria-disabled={puedeQuitar ? undefined : true}
        disabled={bloqueado}
        className={APAGADO_CON_FOCO}
        onClick={() => {
          if (puedeQuitar) alMover(-1);
        }}
      >
        <Minus />
      </Button>
      <span className="inline-block min-w-[3ch] text-center">
        <Cifra
          valor={tomadas}
          decimales={decimalesDe(tomadas)}
          className={tomadas > 0 ? 'font-semibold' : 'text-texto-sutil'}
        />
      </span>
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={`Añadir ${nombre} a ${cuenta}`}
        aria-disabled={puedeSumar ? undefined : true}
        disabled={bloqueado}
        className={APAGADO_CON_FOCO}
        onClick={() => {
          if (puedeSumar) alMover(1);
        }}
      >
        <Plus />
      </Button>
    </span>
  );
}

/** Lo que falta de UN platillo. En cero, la palomita: el tono de la fila nunca va solo. */
function PorRepartir({ valor }: { readonly valor: number }) {
  if (valor > 0) {
    return <Cifra valor={valor} decimales={decimalesDe(valor)} className="font-semibold" />;
  }
  return (
    <span className="inline-flex items-center gap-(--espacio-1) text-texto-sutil">
      <Check aria-hidden="true" className="size-4 text-exito" />
      <Cifra valor={0} />
    </span>
  );
}

interface ArmadoDeColumnas {
  readonly voc: Vocabulario;
  readonly partes: readonly Parte[];
  readonly pendientes: Readonly<Record<string, number>>;
  readonly bloqueado: boolean;
  readonly mover: (indiceParte: number, lineaId: string, delta: number) => void;
}

const claveDeParte = (indice: number): string => `parte-${String(indice)}`;

function columnasDe({
  voc,
  partes,
  pendientes,
  bloqueado,
  mover,
}: ArmadoDeColumnas): readonly ColumnaDeTabla<LineaParaDividir>[] {
  const deLasPartes = partes.map((parte, indice): ColumnaDeTabla<LineaParaDividir> => ({
    clave: claveDeParte(indice),
    titulo: `${voc.titulo('orden')} ${String(indice + 1)}`,
    numerica: true,
    celda: (linea) => (
      <ControlDeUnidades
        nombre={linea.nombre}
        cuenta={`${voc.enFrase('orden')} ${String(indice + 1)}`}
        tomadas={parte.tomas[linea.id] ?? 0}
        puedeSumar={(pendientes[linea.id] ?? 0) > 0}
        bloqueado={bloqueado}
        alMover={(delta) => {
          mover(indice, linea.id, delta);
        }}
      />
    ),
  }));
  return [
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (linea) => (
        <span className="line-clamp-2 min-w-40">
          <Cifra valor={linea.cantidad} decimales={decimalesDe(linea.cantidad)} /> ×{' '}
          <span className="font-medium">{linea.nombre}</span>
        </span>
      ),
    },
    {
      clave: 'pendiente',
      titulo: 'Por repartir',
      numerica: true,
      celda: (linea) => <PorRepartir valor={pendientes[linea.id] ?? 0} />,
    },
    ...deLasPartes,
  ];
}

/**
 * El pie: cuántas unidades se lleva cada cuenta. Una cuenta vacía no pasa del
 * servidor —cada parte tiene que llevarse algo—; en cuanto ya no falta nada por
 * repartir, esa cuenta es lo único que queda por resolver: cambia de PALABRA
 * («Vacía») y lleva el icono de alerta, además del rojo.
 */
function pieDeParte(voc: Vocabulario, parte: Parte, faltan: number): ReactNode {
  const unidades = unidadesDe(parte);
  if (unidades > 0) return <Cifra valor={unidades} decimales={decimalesDe(unidades)} />;
  if (faltan !== 0) {
    return (
      <span className="text-xs text-texto-sutil">
        {voc.conDeterminante('ningun', 'linea_orden')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-(--espacio-1) text-xs font-semibold text-peligro">
      <CircleAlert aria-hidden="true" className="size-4" />
      Vací{voc.terminacion('orden')}
    </span>
  );
}

/** «3» · «2 y 3» · «2, 3 y 5»: los números de las cuentas, dichos como en una frase. */
function enumerar(numeros: readonly number[]): string {
  const ultimo = numeros.at(-1);
  if (ultimo === undefined) return '';
  const antes = numeros.slice(0, -1).map(String);
  return antes.length === 0 ? String(ultimo) : `${antes.join(', ')} y ${String(ultimo)}`;
}

/** Por qué no se puede dividir todavía, en palabras. `null` si ya se puede. */
function loQueFalta(voc: Vocabulario, faltan: number, vacias: readonly number[]): string | null {
  if (faltan !== 0) return `Faltan ${String(faltan)} por repartir`;
  if (vacias.length === 0) return null;
  const varias = vacias.length > 1;
  return `${voc.titulo('orden', varias)} ${enumerar(vacias.map((i) => i + 1))} no lleva${varias ? 'n' : ''} ${voc.enFraseCon('ningun', 'linea_orden')}`;
}

/** El último «+» o «−»: qué platillo y en qué cuenta. */
interface Movimiento {
  readonly lineaId: string;
  readonly indiceParte: number;
}

/**
 * Lo que se movió, dicho para el lector de pantalla delante del contador: «Tacos: 1
 * en la cuenta 1.». Es lo único que dice cuántas lleva la celda que se acaba de tocar.
 */
function queSeMovio(
  voc: Vocabulario,
  lineas: readonly LineaParaDividir[],
  partes: readonly Parte[],
  ultimo: Movimiento | null,
): string {
  if (ultimo === null) return '';
  const linea = lineas.find((l) => l.id === ultimo.lineaId);
  const parte = partes[ultimo.indiceParte];
  if (linea === undefined || parte === undefined) return '';
  const tomadas = parte.tomas[linea.id] ?? 0;
  return `${linea.nombre}: ${String(tomadas)} en ${voc.enFrase('orden')} ${String(ultimo.indiceParte + 1)}. `;
}

function pieDe(
  voc: Vocabulario,
  partes: readonly Parte[],
  faltan: number,
): Readonly<Record<string, ReactNode>> {
  return {
    platillo: `${voc.titulo('linea_orden', true)} por ${voc.singular('orden')}`,
    pendiente: <Cifra valor={faltan} decimales={decimalesDe(faltan)} className="font-semibold" />,
    ...Object.fromEntries(
      partes.map((parte, indice) => [claveDeParte(indice), pieDeParte(voc, parte, faltan)]),
    ),
  };
}

export function DividirCuentaDialog({
  abierto,
  ordenId,
  lineas,
  onCerrar,
  onDividida,
}: DividirCuentaDialogProps) {
  const voc = useVocabulario();
  const [partes, setPartes] = useState<readonly Parte[]>([{ tomas: {} }, { tomas: {} }]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<Movimiento | null>(null);

  const pendientes = useMemo(() => contarPendientes(lineas, partes), [lineas, partes]);
  const faltanPorRepartir = useMemo(
    () => Object.values(pendientes).reduce((a, n) => a + n, 0),
    [pendientes],
  );
  // Las cuentas que no se llevan nada: el servidor las rechaza.
  const vacias = partes.flatMap((parte, indice) => (unidadesDe(parte) === 0 ? [indice] : []));
  const razon = loQueFalta(voc, faltanPorRepartir, vacias);

  function mover(indiceParte: number, lineaId: string, delta: number): void {
    setUltimo({ lineaId, indiceParte });
    setPartes((previas) =>
      previas.map((parte, i) => {
        if (i !== indiceParte) return parte;
        const actual = parte.tomas[lineaId] ?? 0;
        const siguiente = actual + delta;
        // No se puede tomar de menos que cero ni más de lo que queda sin
        // repartir: la pantalla no deja construir una división que el servidor
        // va a rechazar.
        if (siguiente < 0) return parte;
        if (delta > 0 && (pendientes[lineaId] ?? 0) <= 0) return parte;
        return { tomas: { ...parte.tomas, [lineaId]: siguiente } };
      }),
    );
  }

  async function dividir(): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await invocarComando('/api/restaurante/dividir-cuenta', {
        ordenId,
        // Sólo unidades. El importe de cada parte lo calcula el servidor, y el
        // nombre del campo es el que el comando declara: `particiones`, con
        // `cantidad` por línea.
        particiones: partes.map((parte) => ({
          tomas: Object.entries(parte.tomas)
            .filter(([, cantidad]) => cantidad > 0)
            .map(([lineaId, cantidad]) => ({ lineaId, cantidad })),
        })),
      });
      onDividida(partes.length);
      onCerrar();
    } catch (fallo) {
      setError(
        fallo instanceof Error ? fallo.message : `No se pudo dividir ${voc.enFrase('orden')}.`,
      );
    } finally {
      setEnviando(false);
    }
  }

  const columnas = columnasDe({ voc, partes, pendientes, bloqueado: enviando, mover });
  const enElMaximo = partes.length >= MAXIMO_PARTES;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(v) => {
        if (!v) onCerrar();
      }}
    >
      {/* Ancho de tableta en horizontal: dos o tres cuentas caben sin desplazar.
          En teléfono se desplaza por dentro y el botón nunca queda fuera. */}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl lg:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Dividir {voc.enFrase('orden')}</DialogTitle>
          <DialogDescription>
            Reparte {voc.enFrase('linea_orden', true)} entre {voc.enFrase('orden', true)}. Los
            totales los calcula el sistema.
          </DialogDescription>
        </DialogHeader>

        {lineas.length === 0 ? (
          <Vacio
            icono={<UtensilsCrossed />}
            titulo={`Todavía no hay ${voc.plural('linea_orden')} que repartir`}
            explicacion={`Sólo se reparte lo que ya se envió a ${voc.enFrase('preparacion')}.`}
            accion={
              <Button type="button" variant="outline" onClick={onCerrar}>
                Volver a {voc.enFrase('unidad_servicio')}
              </Button>
            }
            className="py-(--espacio-8)"
          />
        ) : (
          <>
            <Tabla
              etiqueta={`Dividir ${voc.enFrase('orden')}`}
              columnas={columnas}
              filas={lineas}
              claveDe={(linea) => linea.id}
              tonoDeFila={(linea) => ((pendientes[linea.id] ?? 0) > 0 ? 'advertencia' : undefined)}
              pie={pieDe(voc, partes, faltanPorRepartir)}
              alto="max-h-[55dvh]"
            />

            <div className="flex flex-wrap items-center justify-between gap-(--espacio-3)">
              <span className="inline-flex flex-wrap items-center gap-(--espacio-2)">
                <Button
                  type="button"
                  variant="outline"
                  disabled={enElMaximo || enviando}
                  onClick={() => {
                    setPartes((p) => [...p, { tomas: {} }]);
                  }}
                >
                  <Plus aria-hidden="true" />
                  Añadir {voc.enFraseCon('otro', 'orden')}
                </Button>
                {enElMaximo ? (
                  <span className="text-xs text-texto-sutil">
                    Hasta {MAXIMO_PARTES} {voc.plural('orden')}
                  </span>
                ) : null}
              </span>
              {/* El contador de lo que falta: es lo que explica por qué el botón
                  de dividir está apagado —unidades sueltas o una cuenta vacía—.
                  Un botón inerte sin motivo es la forma más rápida de que alguien
                  cierre el diálogo y cobre mal. Es la ÚNICA región viva. */}
              <p
                role="status"
                className={`inline-flex items-center gap-(--espacio-2) text-sm ${razon === null ? 'text-texto-sutil' : 'font-medium text-texto'}`}
              >
                <span className="sr-only">{queSeMovio(voc, lineas, partes, ultimo)}</span>
                {razon === null ? (
                  <Check aria-hidden="true" className="size-4 text-exito" />
                ) : (
                  <CircleAlert
                    aria-hidden="true"
                    className={`size-4 ${faltanPorRepartir === 0 ? 'text-peligro' : 'text-advertencia'}`}
                  />
                )}
                {razon ?? 'Todo repartido'}
              </p>
            </div>

            {/* Qué pasó y, sobre todo, qué NO pasó: la cuenta sigue entera. */}
            {error !== null && (
              <Aviso tono="peligro" titulo={error}>
                No se dividió nada: {voc.enFrase('orden')} sigue como estaba.
              </Aviso>
            )}

            {/* Cancelar a su ancho y Dividir estirado hasta la esquina inferior
                derecha, donde cae el pulgar. En teléfono, uno sobre otro. */}
            <DialogFooter className="sm:grid sm:grid-cols-[auto_minmax(0,1fr)]">
              <Button type="button" variant="outline" size="lg" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button
                type="button"
                size="lg"
                cargando={enviando}
                disabled={razon !== null || enviando}
                onClick={() => {
                  void dividir();
                }}
              >
                {enviando
                  ? 'Dividiendo…'
                  : `Dividir en ${String(partes.length)} ${voc.plural('orden')}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Cuántas unidades de cada línea siguen sin asignarse a ninguna parte. */
export function contarPendientes(
  lineas: readonly LineaParaDividir[],
  partes: readonly Parte[],
): Readonly<Record<string, number>> {
  const pendientes: Record<string, number> = {};
  for (const linea of lineas) {
    const repartidas = partes.reduce((a, parte) => a + (parte.tomas[linea.id] ?? 0), 0);
    pendientes[linea.id] = linea.cantidad - repartidas;
  }
  return pendientes;
}
