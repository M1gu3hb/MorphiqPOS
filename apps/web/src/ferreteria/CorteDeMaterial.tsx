'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { RadioGroup, RadioGroupItem } from '@morphiqpos/ui/primitivas/radio-group';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · corte-de-material
 *
 * 8 a 15 veces al día, mostradorista. La acción principal es CORTAR Y AGREGAR.
 *
 * ── Por qué es una pantalla y no un campo de cantidad ────────────────────
 * Porque cortar no es teclear un número: es elegir DE QUÉ PIEZA, decidir CUÁNTO
 * SE DESPERDICIA y decidir QUÉ SE HACE CON LO QUE QUEDA. Tres decisiones, y si
 * el sistema no las pide se toman igual pero fuera del sistema, y el inventario
 * de material continuo se vuelve ficción en semanas (`03-INVENTARIO.md` §9).
 *
 * ── Por qué una sola columna, también en PC ──────────────────────────────
 * Porque el ORDEN de las tres decisiones es parte del contenido: en dos
 * columnas «cuánto» quedaría a la misma altura que «de dónde» y se teclearía la
 * medida antes de elegir el rollo, que es justo el error a prevenir. Lo que sí
 * cambia por dispositivo es el tamaño de los campos y dónde vive la barra de
 * acción: junto al rack se corta de pie, así que en teléfono se fija al pulgar.
 *
 * ── Por qué el abierto viene preseleccionado, con su aviso ───────────────
 * El aviso de «si abres uno nuevo, esos 37 se quedan» es UNA línea de texto y
 * evita el retazo antes de crearlo, que sale infinitamente más barato que
 * rematarlo después. Y el desperdicio se PROPONE: un campo vacío se deja en
 * cero, uno con el valor típico se corrige cuando toca — es la diferencia
 * entre que se registre y que no.
 *
 * ── Por qué la tercera decisión aparece a veces ──────────────────────────
 * Si quedaran 40 m es obvio que sigue siendo un rollo. Sale sólo cuando el
 * sobrante cae bajo el umbral de retazo DE ESE MATERIAL: preguntar siempre
 * sería fricción, preguntar cuando importa es cuidado. Y el costo de darlo de
 * baja va en PESOS: 6.80 m suenan a nada, $61.20 suenan a algo.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Cabe la variante de PIEZA CONTINUA (rollo, cable, manguera, cadena). Quedan
 * FUERA la variante de TRAMO —lista los pedazos y sugiere el más chico donde
 * quepa— y la de LÁMINA Y VIDRIO —pide hojas abiertas porque el sistema no
 * lleva geometría (§2.2)—: cambian el bloque «de dónde» entero, no un detalle.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const HTTP_DEMASIADOS_INTENTOS = 429;

const BLOQUE = 'mt-3 rounded-md border border-border bg-card p-3 text-card-foreground shadow-1';
const TITULO = 'text-xs font-bold uppercase tracking-wide text-muted-foreground';
const OPCION = 'flex items-start gap-3 rounded-md border p-3 hover:bg-accent';
const AVISO = 'mt-2 rounded-md border border-warning/60 bg-warning/15 p-2 text-sm font-medium';
const MALO = 'mt-2 rounded-md border border-destructive bg-destructive/15 p-2 text-sm font-medium';
const NOTA = 'mt-1 text-xs tabular-nums text-muted-foreground';
/** Los campos crecen en el teléfono: se teclean de pie y con una mano. */
const CAMPOS =
  'mt-2 grid gap-3 md:grid-cols-2 [&_input]:h-[calc(var(--altura-control)*1.4)] [&_input]:text-2xl md:[&_input]:text-lg';
const BARRA =
  'fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background p-3 md:static md:mt-3 md:rounded-md md:border';

/** Una pieza física de la que se corta. El descuento sale de ÉSTA, no del total. */
export interface PiezaDeCorte {
  readonly id: string;
  /** R-114: el folio que el mostradorista lee en la etiqueta del rack. */
  readonly folio: string;
  readonly abierta: boolean;
  readonly restante: number;
  /** Cuántas piezas idénticas hay. Sólo dice algo en las cerradas. */
  readonly iguales: number;
}

export interface MaterialContinuo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad: string;
  readonly precioCentavos: number;
  readonly costoCentavos: number;
  readonly desperdicioTipico: number;
  readonly umbralRetazo: number;
  readonly precioRemateCentavos: number;
}

/** Los tres destinos del sobrante que nombra el documento. Ninguno inventado. */
type Destino = 'abierto' | 'remate' | 'baja';

export interface CorteDeMaterialProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly materialInicial?: MaterialContinuo;
  readonly piezasIniciales?: readonly PiezaDeCorte[];
}

/** Dos decimales siempre: 6.8 y 6.80 son el mismo metraje y se leen distinto. */
function metros(valor: number): string {
  return valor.toFixed(2);
}

/** Lo tecleado. La coma decimal es lo que da el teclado del teléfono en es-MX. */
function aNumero(texto: string): number {
  const valor = Number(texto.replace(',', '.'));
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** Abiertas primero: son la respuesta correcta y tienen que verse antes. */
function porAbiertas(a: PiezaDeCorte, b: PiezaDeCorte): number {
  if (a.abierta !== b.abierta) return a.abierta ? -1 : 1;
  return a.restante - b.restante;
}

/** Lo que hace falta saber de una pieza para elegirla sin ir al rack. */
function notaDePieza(pieza: PiezaDeCorte, unidad: string, sugerida: boolean): string {
  if (!pieza.abierta) return `quedan ${metros(pieza.restante)} ${unidad} · hay ${pieza.iguales}`;
  // El sugerido se dice con una palabra, no sólo con el borde de color.
  return `quedan ${metros(pieza.restante)} ${unidad}${sugerida ? ' · sugerido' : ''}`;
}

/**
 * El mensaje del fallo. Los códigos del contrato ya traen `mensaje` en español
 * y para quien está en el mostrador, así que no se traduce dos veces. Lo único
 * que el contrato NO trae como código es el límite de intentos: ése es el 429.
 */
function mensajeDe(fallo: unknown, porDefecto: string): string {
  if (!(fallo instanceof ErrorApi)) return porDefecto;
  if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) return 'Demasiados intentos. Espera un momento.';
  return fallo.error.mensaje;
}

interface OpcionProps {
  readonly valor: string;
  readonly titulo: string;
  readonly nota: string;
  readonly activa: boolean;
}

/** Una opción con su nota: dos de las tres decisiones tienen esta misma forma. */
function Opcion({ valor, titulo, nota, activa }: OpcionProps) {
  const campo = `opcion-${valor}`;
  return (
    <div className={`${OPCION} ${activa ? 'border-primary bg-primary/10' : 'border-border'}`}>
      <RadioGroupItem value={valor} id={campo} className="mt-1" />
      <Label htmlFor={campo} className="flex-1 flex-col items-start gap-0">
        <span className="font-semibold">{titulo}</span>
        <span className="font-normal tabular-nums text-muted-foreground">{nota}</span>
      </Label>
    </div>
  );
}

export function CorteDeMaterial({ materialInicial, piezasIniciales }: CorteDeMaterialProps) {
  const voc = useVocabulario();
  const [material, setMaterial] = useState<MaterialContinuo | null>(materialInicial ?? null);
  const [piezas, setPiezas] = useState<readonly PiezaDeCorte[] | null>(piezasIniciales ?? null);
  const [piezaId, setPiezaId] = useState<string | null>(null);
  const [medidaTexto, setMedidaTexto] = useState('');
  const [sobranteTexto, setSobranteTexto] = useState<string | null>(null);
  const [destino, setDestino] = useState<Destino>('abierto');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (materialInicial !== undefined && piezasIniciales !== undefined) return;
    const control = new AbortController();
    // Si sigue montada se pregunta con una FUNCIÓN y no con un centinela: un
    // `let vivo = true` el compilador lo da por siempre-verdadero.
    const sigueMontada = () => !control.signal.aborted;
    Promise.all([
      consultarPuente<MaterialContinuo>('MaterialContinuo', { limite: 1, signal: control.signal }),
      consultarPuente<PiezaDeCorte>('PiezaDeMaterial', { limite: 60, signal: control.signal }),
    ])
      .then(([materiales, leidas]) => {
        if (!sigueMontada()) return;
        setMaterial(materialInicial ?? materiales[0] ?? null);
        setPiezas(piezasIniciales ?? leidas);
      })
      .catch((fallo: unknown) => {
        // La pantalla no se vacía por un error de red: se avisa y se sigue.
        if (!sigueMontada()) return;
        setPiezas(piezasIniciales ?? []);
        setError(
          mensajeDe(fallo, `No se pudo leer qué hay de ${voc.enFraseCon('este', 'producto')}.`),
        );
      });
    return () => {
      control.abort();
    };
  }, [materialInicial, piezasIniciales, voc]);

  const ordenadas = [...(piezas ?? [])].sort(porAbiertas);
  // La preselección se DERIVA; no se escribe con un setState dentro del efecto.
  const elegida = ordenadas.find((p) => p.id === piezaId) ?? ordenadas[0] ?? null;

  if (piezas === null) {
    // Con la forma de los tres bloques, no un spinner: el ojo ya sabe dónde va
    // a mirar y la pantalla no salta cuando llega el dato.
    return (
      <div className="mx-auto w-full max-w-3xl p-3">
        <Skeleton className="h-20 w-full rounded-md" />
        <Skeleton className="mt-3 h-40 w-full rounded-md" />
        <Skeleton className="mt-3 h-40 w-full rounded-md" />
      </div>
    );
  }

  // El vacío ENSEÑA qué es una pieza continua y por qué el corte necesita una,
  // en vez de disculparse por no tener datos.
  if (material === null || elegida === null) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-start gap-3 p-5">
        <h1 className="text-xl font-bold">Cortar {voc.singular('producto')}</h1>
        <p className="text-muted-foreground">
          {material === null
            ? `${voc.conDeterminante('ningun', 'producto')} está marcado todavía como pieza continua. Continuo es el que se vende por medida: cable, manguera, cadena, tubo.`
            : `No hay ninguna pieza de ${material.nombre} registrada. Un corte descuenta de una pieza concreta con su folio; sin piezas, el metraje sería inventado.`}
        </p>
        <Button asChild>
          <a href="/ferreteria/mostrador">Registrar la primera pieza</a>
        </Button>
      </div>
    );
  }

  const medida = aNumero(medidaTexto);
  const sobrante = aNumero(sobranteTexto ?? metros(material.desperdicioTipico));
  const descuento = medida + sobrante;
  const queda = elegida.restante - descuento;
  // El umbral es del MATERIAL: 6.80 m de cable son un retazo y 6.80 m de
  // manguera de riego son un rollo chico que se vende igual.
  const retazoChico = queda > 0 && queda < material.umbralRetazo;
  const excede = descuento > elegida.restante;
  // Único sitio donde una medida fraccionaria toca dinero: se redondea al
  // centavo UNA vez (R15). El servidor la rehace; esto es para verla antes.
  const importe = PESOS.format(Math.round(medida * material.precioCentavos) / 100);
  const abiertos = ordenadas.filter((p) => p.abierta).reduce((suma, p) => suma + p.restante, 0);
  const destinos = [
    { clave: 'abierto' as const, texto: 'Dejarlo como rollo abierto', nota: '' },
    {
      clave: 'remate' as const,
      texto: 'Marcarlo como retazo de remate',
      nota: `sugerido ${PESOS.format(material.precioRemateCentavos / 100)} / ${material.unidad}`,
    },
    {
      clave: 'baja' as const,
      texto: 'Darlo de baja (desperdicio)',
      nota: `costo ${PESOS.format(Math.round(queda * material.costoCentavos) / 100)}`,
    },
  ];

  function alMedir(evento: ChangeEvent<HTMLInputElement>): void {
    setMedidaTexto(evento.target.value);
  }

  function alSobrar(evento: ChangeEvent<HTMLInputElement>): void {
    setSobranteTexto(evento.target.value);
  }

  function elegirDestino(valor: string): void {
    // El literal lleva su propio `as const`: venir de un arreglo no lo vuelve
    // constante, y `Destino` sí lo es.
    setDestino(valor as Destino);
  }

  async function cortar(): Promise<void> {
    if (material === null || elegida === null) return;
    setEnviando(true);
    setError(null);
    try {
      // El documento no nombra la ruta: /api/<dominio>/<verbo> por convención.
      await invocarComando('/api/ferreteria/cortar', {
        materialId: material.id,
        piezaId: elegida.id,
        medida,
        desperdicio: sobrante,
        destinoSobrante: retazoChico ? destino : 'abierto',
      });
      router.push('/ferreteria/mostrador');
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo registrar el corte.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-3 pb-32 md:pb-4">
      <h1 className="text-xl font-bold md:text-2xl">Cortar · {material.nombre}</h1>

      {error !== null && (
        <p role="alert" className={MALO}>
          {error}
        </p>
      )}

      <section aria-labelledby="t-donde" className={BLOQUE}>
        <h2 id="t-donde" className={TITULO}>
          De dónde
        </h2>
        <RadioGroup className="mt-2" value={elegida.id} onValueChange={setPiezaId}>
          {ordenadas.map((pieza) => (
            <Opcion
              key={pieza.id}
              valor={pieza.id}
              activa={pieza.id === elegida.id}
              titulo={`${pieza.abierta ? 'Rollo abierto' : 'Rollo cerrado'} ${pieza.folio}`}
              nota={notaDePieza(pieza, material.unidad, pieza.id === elegida.id)}
            />
          ))}
        </RadioGroup>
        {!elegida.abierta && abiertos > 0 && (
          <p role="alert" className={AVISO}>
            ⚠️ Hay {metros(abiertos)} {material.unidad} abiertos. Si abres uno nuevo, esos se
            quedan.
          </p>
        )}
      </section>

      <section aria-labelledby="t-cuanto" className={BLOQUE}>
        <h2 id="t-cuanto" className={TITULO}>
          Cuánto
        </h2>
        <div className={CAMPOS}>
          <div>
            <Label className="flex-col items-start gap-1">
              Medida entregada ({material.unidad})
              <Input inputMode="decimal" autoFocus value={medidaTexto} onChange={alMedir} />
            </Label>
            <p className={NOTA}>
              {PESOS.format(material.precioCentavos / 100)} / {material.unidad}
            </p>
          </div>
          <div>
            <Label className="flex-col items-start gap-1">
              Desperdicio ({material.unidad})
              <Input
                inputMode="decimal"
                value={sobranteTexto ?? metros(material.desperdicioTipico)}
                onChange={alSobrar}
              />
            </Label>
            <p className={NOTA}>
              Propuesto por {voc.enFrase('producto')}. Corrígelo si el corte salió distinto.
            </p>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-2 border-t border-border pt-2 text-sm">
          <dt>Se descuenta del rollo</dt>
          <dd className="text-right font-semibold tabular-nums">
            {metros(descuento)} {material.unidad}
          </dd>
          <dt>Queda en {elegida.folio}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {metros(queda)} {material.unidad}
            {retazoChico ? ' · ⚠️ retazo chico' : ''}
          </dd>
        </dl>
        {excede && (
          <p role="alert" className={MALO}>
            No alcanza: en {elegida.folio} sólo quedan {metros(elegida.restante)} {material.unidad}.
          </p>
        )}
      </section>

      {/* Sólo cuando importa: con 40 m sobrantes, preguntar esto es fricción. */}
      {retazoChico && (
        <section aria-labelledby="t-resto" className={BLOQUE}>
          <h2 id="t-resto" className={TITULO}>
            Qué hacer con lo que queda
          </h2>
          <RadioGroup className="mt-2" value={destino} onValueChange={elegirDestino}>
            {destinos.map((opcion) => (
              <Opcion
                key={opcion.clave}
                valor={opcion.clave}
                activa={opcion.clave === destino}
                titulo={opcion.texto}
                nota={opcion.nota}
              />
            ))}
          </RadioGroup>
        </section>
      )}

      <footer className={BARRA}>
        <p className="text-sm">
          Importe de la partida <span className="text-2xl font-bold tabular-nums">{importe}</span>
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.history.back();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="lg"
            disabled={medida <= 0 || excede || enviando}
            onClick={() => {
              void cortar();
            }}
          >
            {enviando ? 'Cortando…' : 'Cortar y agregar'}
          </Button>
        </div>
      </footer>
    </div>
  );
}
