'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Progress } from '@morphiqpos/ui/primitivas/progress';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { ClipboardCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · abarrotes · conteo
 *
 * El conteo cíclico (F-149): contar una zona de anaquel en veinte minutos, a
 * ciegas. Una vez al día, el encargado, de pie, con el teléfono.
 *
 * ── Por qué ésta es la ÚNICA pantalla del modelo hecha para el teléfono ──
 * Porque se cuenta FRENTE AL ANAQUEL, con una mano en el producto. Una PC en el
 * mostrador y un anaquel a cuatro metros producen el peor flujo posible:
 * contar, caminar, teclear de memoria, equivocarse. Es la excepción a la regla
 * del modelo y la justifica dónde ocurre el trabajo, no el gusto.
 *
 * ── Por qué el esperado NO se pinta mientras se cuenta ───────────────────
 * Misma regla del arqueo (§5 de `04-SISTEMA-DE-DISENO.md`) y misma razón: si se
 * muestra, todo el mundo teclea ese número y el conteo deja de existir. El
 * `esperado` llega en la fila y sólo se usa DESPUÉS, en el resumen. Es la
 * condición que esta pantalla no puede romper nunca.
 *
 * ── Por qué dos campos y no uno ──────────────────────────────────────────
 * Porque así se cuenta un anaquel: nueve cajas y cuatro sueltas. Pedir 220 es
 * pedirle al encargado la multiplicación de cabeza, junto a la reja, con frío.
 * La equivalencia se calcula en vivo y se enseña debajo para que él confirme lo
 * que ya sabe, no para que la resuelva.
 *
 * ── Por qué los objetivos táctiles son de 56 px y no de 44 ───────────────
 * Se cuenta de pie, con una mano ocupada y a veces con las manos frías del
 * congelador. Los 44 px del mínimo se pensaron para un pulgar tranquilo.
 *
 * ── Por qué el porcentaje nunca va solo ──────────────────────────────────
 * Un «−1.9 %» a secas no le dice nada a Don Chuy. «−1.9 %, y el promedio del
 * retail mexicano es 1.5–2.5 %» le dice si tiene un problema, y ésa es la única
 * razón por la que se le enseña el número.
 *
 * ── Por qué el motivo por omisión NUNCA es «robo» ────────────────────────
 * El sistema no lo sabe. Acusar sin prueba es la forma más rápida de abrir un
 * conflicto injusto en una tienda donde trabaja la familia.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Caben el conteo a ciegas, el escaneo, el progreso, el resumen de la zona con
 * su recuento y el cierre con ajuste. Queda FUERA el editor de motivo por
 * producto —hoy todos se cierran con el de omisión— y «Ver motivo», que es la
 * ficha del movimiento y vive en el kardex del producto.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/**
 * Nunca «robo»: el sistema no lo sabe y acusar sin prueba rompe una tienda.
 *
 * Es LA CLAVE de `motivos_merma` y no su etiqueta. Aquí decía «diferencia de
 * conteo», una frase, y `movimientos_stock.motivo` apunta a esa tabla desde la
 * migración 062: la base habría contestado `23503` y el cierre de la zona
 * abortaría la transacción entera después de veinte minutos de recorrido.
 */
const MOTIVO_POR_OMISION = 'ajuste_conteo';

/** Lo que se le enseña a una persona. La clave es para la base, no para leerla. */
const MOTIVO_EN_PALABRAS = 'Diferencia de conteo físico';

// Las clases largas viven arriba para que cada elemento quepa en una línea. El
// 3.5rem es el objetivo táctil de 56 px del documento: una medida de diseño con
// una razón detrás, no un número suelto.
const MARCO = 'mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-(--espacio-4) p-(--espacio-4)';
const CAMPO = 'min-h-[3.5rem] text-center text-2xl font-bold tabular-nums';
const PRINCIPAL = 'min-h-[3.5rem] w-full text-lg font-semibold';
const BANDA = 'rounded-md border border-peligro bg-peligro/15 p-2 text-sm';

export interface ProductoDeConteo {
  readonly id: string;
  readonly nombre: string;
  readonly zona: string;
  /** Para convertir cajas a piezas en vivo. */
  readonly piezasPorCaja: number;
  /** A CIEGAS: no se pinta hasta el resumen. Ver el docblock. */
  readonly esperado: number;
  /**
   * `null` cuando quien cuenta no ve costos.
   *
   * El puente restringe este campo a quien ve costos de insumo, y el cajero
   * cuenta igual —en una tiendita es quien está y quien conoce el anaquel—, así
   * que llega sin él. El resumen entonces enseña las PIEZAS y calla el importe,
   * en vez de multiplicar por cero y decir que no falta nada.
   */
  readonly costoCentavos: number | null;
  readonly codigo: string | null;
}

export interface ConteoProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly ProductoDeConteo[];
  readonly zonaInicial?: string;
  readonly diasSinContar?: number;
}

export interface ResumenDeZona {
  readonly cuadraron: number;
  readonly faltaron: number;
  readonly sobraron: number;
  readonly faltanteCentavos: number;
  readonly sobranteCentavos: number;
  readonly netoCentavos: number;
  readonly porcentaje: number;
  /** `false` si algún producto contado llegó sin costo: el importe no se enseña. */
  readonly importeVisible: boolean;
  readonly desviados: readonly ProductoDeConteo[];
}

/** Sólo enteros positivos: aquí no hay media pieza ni media caja. */
function enteroDe(texto: string): number {
  const valor = Number.parseInt(texto, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** Cajas y piezas es como se CUENTA un anaquel; piezas es como se GUARDA. */
export function equivalenciaEnPiezas(cajas: string, piezas: string, porCaja: number): number {
  return enteroDe(cajas) * Math.max(1, porCaja) + enteroDe(piezas);
}

/**
 * El corte de la zona. Sólo entran los productos ya contados: una zona a medias
 * daría un porcentaje falso, y ese porcentaje es lo único que el dueño se lleva.
 */
export function resumirConteo(
  filas: readonly ProductoDeConteo[],
  conteos: Readonly<Record<string, number>>,
): ResumenDeZona {
  let cuadraron = 0;
  let faltaron = 0;
  let sobraron = 0;
  let faltanteCentavos = 0;
  let sobranteCentavos = 0;
  let valorEsperado = 0;
  let importeVisible = true;
  const desviados: ProductoDeConteo[] = [];

  for (const fila of filas) {
    const contado = conteos[fila.id];
    if (contado === undefined) continue;
    // Un costo ausente no es un costo de cero: quien cuenta no lo ve. Se apunta y
    // el importe se calla; contar 0 haría que un faltante de mil pesos se
    // enseñara como «$0.00 · 0.0 %», que es peor que no enseñar nada.
    const costo = fila.costoCentavos;
    if (costo === null) importeVisible = false;
    valorEsperado += fila.esperado * (costo ?? 0);
    const diferencia = contado - fila.esperado;
    if (diferencia === 0) {
      cuadraron += 1;
      continue;
    }
    desviados.push(fila);
    if (diferencia < 0) faltanteCentavos += -diferencia * (costo ?? 0);
    else sobranteCentavos += diferencia * (costo ?? 0);
    if (diferencia < 0) faltaron += 1;
    else sobraron += 1;
  }

  const neto = sobranteCentavos - faltanteCentavos;
  return {
    cuadraron,
    faltaron,
    sobraron,
    faltanteCentavos,
    sobranteCentavos,
    netoCentavos: neto,
    porcentaje: valorEsperado === 0 ? 0 : (Math.abs(neto) / valorEsperado) * 100,
    importeVisible,
    desviados,
  };
}

/** El límite de intentos no es un código del contrato: es el 429 del transporte. */
function mensajeDeFallo(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Demasiados intentos seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede ajustar el inventario.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo leer la zona de hoy.';
}

const pesos = (centavos: number): string => PESOS.format(centavos / 100);

export interface CampoDeConteoProps {
  readonly id?: string;
  readonly etiqueta?: string;
  readonly valor?: string;
  readonly alCambiar?: (valor: string) => void;
}

/** Los dos campos son el mismo control: uno cuenta cajas y el otro sueltas. */
export function CampoDeConteo({ id, etiqueta, valor, alCambiar }: CampoDeConteoProps) {
  return (
    <div className="flex-1">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={valor ?? ''}
        className={CAMPO}
        onChange={(evento) => {
          alCambiar?.(evento.target.value);
        }}
      />
    </div>
  );
}

export function Conteo({ filasIniciales, zonaInicial, diasSinContar }: ConteoProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly ProductoDeConteo[] | null>(filasIniciales ?? null);
  const [conteos, setConteos] = useState<Readonly<Record<string, number>>>({});
  const [idActual, setIdActual] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cajas, setCajas] = useState('');
  const [piezas, setPiezas] = useState('');
  const [enResumen, setEnResumen] = useState(false);
  const [cerrada, setCerrada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // Un centinela `let vivo` el compilador lo da por siempre-verdadero: la
    // pregunta se le hace a la señal, que además corta la petición de verdad.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    consultarPuente<ProductoDeConteo>('ConteoDeZona', { limite: 400, signal: control.signal })
      .then((leidas) => {
        if (sigueMontada()) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        // La pantalla nunca se vacía por un error de red: se avisa y se sigue.
        if (sigueMontada()) {
          setFilas([]);
          setError(mensajeDeFallo(fallo));
        }
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales]);

  useEffect(() => {
    // Los atajos `+` y `−` del layout de PC. `Enter` no vive aquí: lo resuelve
    // el envío del formulario, que es lo que el escáner manda al terminar.
    function alTeclear(evento: KeyboardEvent): void {
      if (evento.target instanceof HTMLInputElement) return;
      if (evento.key === '+') setPiezas((v) => String(enteroDe(v) + 1));
      else if (evento.key === '-') setPiezas((v) => String(Math.max(0, enteroDe(v) - 1)));
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, []);

  const pendientes = useMemo(
    () => (filas ?? []).filter((fila) => conteos[fila.id] === undefined),
    [filas, conteos],
  );
  const actual = useMemo(
    () => (filas ?? []).find((fila) => fila.id === idActual) ?? pendientes[0] ?? null,
    [filas, idActual, pendientes],
  );
  const resumen = useMemo(() => resumirConteo(filas ?? [], conteos), [filas, conteos]);

  const zona = zonaInicial ?? filas?.[0]?.zona ?? 'Zona de hoy';
  const contados = Object.keys(conteos).length;
  const total = filas?.length ?? 0;

  function elegir(producto: ProductoDeConteo | undefined): void {
    if (producto === undefined) return;
    setIdActual(producto.id);
    setBusqueda('');
    setCajas('');
    setPiezas('');
  }

  /** El escáner teclea el código y manda Enter: eso tiene que bastar. */
  function buscar(): void {
    const texto = busqueda.trim().toLowerCase();
    if (texto === '') return;
    elegir((filas ?? []).find((f) => f.codigo === texto || f.nombre.toLowerCase().includes(texto)));
  }

  function registrar(): void {
    if (actual === null) return;
    const piezasContadas = equivalenciaEnPiezas(cajas, piezas, actual.piezasPorCaja);
    setConteos((actuales) => ({ ...actuales, [actual.id]: piezasContadas }));
    setCajas('');
    setPiezas('');
    setIdActual(null);
  }

  function recontar(id: string): void {
    setConteos((previos) => Object.fromEntries(Object.entries(previos).filter(([k]) => k !== id)));
    setIdActual(id);
    setEnResumen(false);
  }

  async function cerrarZona(): Promise<void> {
    setGuardando(true);
    setError(null);
    try {
      // El documento no nombra la ruta: se usa /api/<dominio>/<verbo> por
      // convención. Va un renglón POR PRODUCTO con su motivo; no es un botón
      // mágico que cuadra el inventario sin dejar rastro de quién y por qué.
      //
      // Se mandan TODOS los contados y no sólo los desviados: el servidor sella
      // el esperado de cada renglón al anotarlo, así que un producto que cuadró
      // deja constancia de que se contó y cuadró. Mandar sólo los desviados haría
      // que un conteo de cuarenta productos con dos diferencias pareciera un
      // conteo de dos.
      //
      // `insumoId` y no `productoId`: lo que se cuenta es el insumo —es el que
      // tiene zona y el que `toma_conteos` lleva—, y `id` de la fila ya es el suyo.
      // `contado` como TEXTO: quien convierte cantidades es el servidor.
      await invocarComando('/api/inventario/ajustar-conteo', {
        zona,
        motivo: MOTIVO_POR_OMISION,
        nota: MOTIVO_EN_PALABRAS,
        movimientos: Object.entries(conteos).map(([id, contado]) => ({
          insumoId: id,
          contado: String(contado),
        })),
      });
      setCerrada(true);
    } catch (fallo: unknown) {
      setError(mensajeDeFallo(fallo));
    } finally {
      setGuardando(false);
    }
  }

  // Esqueletos con la forma de los campos y del botón: la pantalla no salta al
  // llegar el dato y el pulgar ya sabe dónde va a caer.
  if (filas === null) {
    return (
      <div className={MARCO}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-md" />
        ))}
      </div>
    );
  }

  // El vacío ENSEÑA qué es un conteo cíclico: es la primera vez que el encargado
  // lo lee, y de eso depende que mañana vuelva a abrir la pantalla.
  if (filas.length === 0) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-(--espacio-6)">
        <Vacio
          icono={<ClipboardCheck />}
          titulo="Hoy no toca ninguna zona."
          explicacion="El conteo cíclico parte el anaquel en zonas y cuenta una al día, en veinte minutos, en vez de cerrar la cortina un domingo entero. La que más se mueve vuelve a tocar antes."
          accion={
            <Button asChild className={PRINCIPAL}>
              <a href="/configuracion">Programar las zonas del anaquel</a>
            </Button>
          }
        />
      </div>
    );
  }

  if (enResumen) {
    return (
      <div className={MARCO}>
        <h1 className="text-xl font-bold">
          {zona} · {total} productos
        </h1>
        {error !== null && (
          <p className={BANDA} role="alert">
            {error}
          </p>
        )}
        {/* Flecha Y palabra en cada renglón: el color nunca carga solo. */}
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <span aria-hidden>✓</span> {resumen.cuadraron} cuadraron
          </li>
          <li className="rounded-md bg-peligro/15 p-1">
            <span aria-hidden>▼</span> {resumen.faltaron} faltaron
            {resumen.importeVisible && <> · −{pesos(resumen.faltanteCentavos)}</>}
          </li>
          <li className="rounded-md bg-exito/15 p-1">
            <span aria-hidden>▲</span> {resumen.sobraron} sobró
            {resumen.importeVisible && <> · +{pesos(resumen.sobranteCentavos)}</>}
          </li>
        </ul>
        <div className="border-t border-borde pt-(--espacio-3)">
          {resumen.importeVisible ? (
            <>
              <p className="text-lg font-bold tabular-nums">
                Diferencia neta {resumen.netoCentavos < 0 ? '−' : '+'}
                {pesos(Math.abs(resumen.netoCentavos))} ({resumen.porcentaje.toFixed(1)} %)
              </p>
              {/* Sin este renglón el porcentaje no le dice nada a Don Chuy. */}
              <p className="text-sm text-texto-sutil">
                El promedio del retail mexicano es 1.5–2.5 %.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold tabular-nums">
                Diferencia neta {resumen.sobraron - resumen.faltaron >= 0 ? '+' : '−'}
                {Math.abs(resumen.sobraron - resumen.faltaron)} productos
              </p>
              {/* Se dice por qué falta el peso, en vez de enseñar un cero. */}
              <p className="text-sm text-texto-sutil">
                El importe en pesos lo ve quien ve costos. El conteo se cierra igual.
              </p>
            </>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {resumen.desviados.map((p) => (
            <li key={p.id} className="rounded-md border border-borde bg-superficie p-2 text-sm">
              <p className="text-texto">
                {p.nombre} · esperado {p.esperado} · contaste {conteos[p.id] ?? 0}
              </p>
              {/* En palabras y no la clave: la clave es para la base. */}
              <p className="text-xs text-texto-sutil">Motivo: {MOTIVO_EN_PALABRAS}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-1"
                onClick={() => {
                  recontar(p.id);
                }}
              >
                ¿Recontar {p.nombre}?
              </Button>
            </li>
          ))}
        </ul>
        {cerrada ? (
          <p role="status" className="rounded-md border border-borde p-2 text-sm">
            Zona cerrada. Cada ajuste quedó como un movimiento con su motivo.
          </p>
        ) : (
          <Button
            type="button"
            className={PRINCIPAL}
            disabled={guardando}
            onClick={() => {
              void cerrarZona();
            }}
          >
            {guardando ? 'Ajustando…' : 'Ajustar todo y cerrar la zona'}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className={MARCO}>
      <header>
        <h1 className="text-xl font-bold">Zona: {zona}</h1>
        <p className="text-sm text-texto-sutil">
          {diasSinContar === undefined ? '' : `Hace ${diasSinContar} días · `}
          {total} prod.
        </p>
      </header>

      {error !== null && (
        <p className={BANDA} role="alert">
          {error} · Se sigue contando con lo que ya hay.
        </p>
      )}

      <div className="flex flex-col gap-(--espacio-4) xl:grid xl:grid-cols-[16rem_1fr]">
        {/* En teléfono no hay lista: estorba, y el diagrama del documento no la
            tiene. De tablet arriba es una cinta; en PC, la columna izquierda
            del layout de dos columnas que el documento sí decide. */}
        <nav
          aria-label={`${voc.titulo('producto', true)} de la zona`}
          className="hidden gap-2 overflow-x-auto md:flex xl:flex-col xl:overflow-x-visible"
        >
          {filas.map((fila) => (
            <Button
              key={fila.id}
              type="button"
              size="sm"
              variant={conteos[fila.id] === undefined ? ('ghost' as const) : ('secondary' as const)}
              aria-current={fila.id === actual?.id}
              className="justify-start whitespace-nowrap xl:w-full"
              onClick={() => {
                elegir(fila);
              }}
            >
              <span aria-hidden>{conteos[fila.id] === undefined ? '·' : '✓'}</span>
              {fila.nombre}
            </Button>
          ))}
        </nav>

        <section className="flex flex-col gap-(--espacio-4)">
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              buscar();
            }}
          >
            <Label htmlFor="buscador" className="sr-only">
              Escanea o busca {voc.enFraseCon('un', 'producto')}
            </Label>
            <Input
              id="buscador"
              value={busqueda}
              autoComplete="off"
              placeholder="⌕ escanea o busca"
              className="min-h-[3.5rem]"
              onChange={(evento) => {
                setBusqueda(evento.target.value);
              }}
            />
          </form>

          {actual === null ? (
            <p className="text-lg font-semibold">Ya contaste los {total} productos de la zona.</p>
          ) : (
            <form
              className="flex flex-col gap-(--espacio-3)"
              onSubmit={(evento) => {
                evento.preventDefault();
                registrar();
              }}
            >
              {/* Ni una palabra del esperado aquí: es la regla del arqueo. */}
              <h2 className="text-2xl font-bold">{actual.nombre}</h2>
              <div className="flex gap-(--espacio-3)">
                <CampoDeConteo id="cajas" etiqueta="cajas" valor={cajas} alCambiar={setCajas} />
                <CampoDeConteo id="piezas" etiqueta="piezas" valor={piezas} alCambiar={setPiezas} />
              </div>
              <p aria-live="polite" className="text-center text-lg font-semibold tabular-nums">
                = {equivalenciaEnPiezas(cajas, piezas, actual.piezasPorCaja)} pz
              </p>
              <Button type="submit" className={PRINCIPAL}>
                SIGUIENTE ✓
              </Button>
            </form>
          )}
        </section>
      </div>

      <footer className="mt-auto flex flex-col gap-2 pt-(--espacio-4)">
        <p className="text-sm">
          Contados {contados} de {total}
        </p>
        <Progress
          value={(contados / total) * 100}
          aria-label={`Contados ${contados} de ${total}`}
        />
        <Button
          type="button"
          variant="outline"
          className={PRINCIPAL}
          disabled={contados === 0}
          onClick={() => {
            setEnResumen(true);
          }}
        >
          Terminar zona
        </Button>
      </footer>
    </div>
  );
}
