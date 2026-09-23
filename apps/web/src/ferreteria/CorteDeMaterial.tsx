'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { RadioGroup, RadioGroupItem } from '@morphiqpos/ui/primitivas/radio-group';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Vacio,
} from '@morphiqpos/ui/sistema';
import { Scissors, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type ReactNode } from 'react';

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
 * ── Qué va grande ────────────────────────────────────────────────────────
 * «Primero se ve de dónde se va a cortar y cuánto queda» (`04-INTERFAZ.md`,
 * pantalla 3): por eso lo que queda en la pieza es la cifra más grande del
 * resumen, y el importe de la partida va en la barra, legible pero no dominante
 * —en una ferretería el cliente mira la pieza, no la pantalla—. Lo único más
 * grande que eso es el folio de la nota después de cortar: se canta en la caja.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Cabe la variante de PIEZA CONTINUA (rollo, cable, manguera, cadena). Quedan
 * FUERA la variante de TRAMO —lista los pedazos y sugiere el más chico donde
 * quepa— y la de LÁMINA Y VIDRIO —pide hojas abiertas porque el sistema no
 * lleva geometría (§2.2)—: cambian el bloque «de dónde» entero, no un detalle.
 */

const HTTP_DEMASIADOS_INTENTOS = 429;

const TITULO = 'text-sm font-semibold tracking-wide text-texto-sutil uppercase';
const NOTA = 'text-xs text-texto-sutil';
/** Los campos crecen en el teléfono: se teclean de pie y con una mano. */
const CAMPOS =
  'grid gap-(--espacio-3) md:grid-cols-2 [&_input]:h-[calc(var(--altura-control)*1.4)] [&_input]:font-numeros [&_input]:text-2xl [&_input]:tabular-nums md:[&_input]:text-lg';

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

/**
 * Lo que `ferreteria.cortar_y_agregar` devuelve.
 *
 * Se declara aquí y no se importa del comando: ese módulo es `server-only` y esta
 * pantalla corre en el navegador.
 */
interface CorteHecho {
  readonly folio: string;
  readonly entregado: string;
  readonly merma: string;
  readonly queda: string;
  readonly destino: string;
}

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
  // El sugerido se dice con una palabra, no sólo con el anillo de color.
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
  readonly nota: ReactNode;
  readonly activa: boolean;
}

/**
 * Una opción con su nota: dos de las tres decisiones tienen esta misma forma.
 *
 * La opción ENTERA es la etiqueta de su radio —`Superficie como="label"`—, así que
 * el dedo en el pasillo acierta en cualquier parte del renglón y no en un círculo
 * de 16 px. Y el nombre del radio es el texto de la etiqueta: «Rollo abierto R-114,
 * quedan 37.00 m», que es lo que un lector de pantalla tiene que decir.
 */
function Opcion({ valor, titulo, nota, activa }: OpcionProps) {
  const campo = `opcion-${valor}`;
  return (
    <Superficie
      como="label"
      htmlFor={campo}
      nivel={0}
      radio="md"
      relleno={3}
      interactiva
      activa={activa}
      className="flex items-start gap-(--espacio-3)"
    >
      <RadioGroupItem value={valor} id={campo} className="mt-1" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{titulo}</span>
        {nota === null ? null : (
          <span className="text-sm text-texto-sutil tabular-nums">{nota}</span>
        )}
      </span>
    </Superficie>
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
  /** El fallo de un COMANDO: se leyó, y cortar no salió. */
  const [error, setError] = useState<string | null>(null);
  /**
   * El fallo de una LECTURA. Es otro estado y se pinta distinto: si no se leyó nada
   * no hay de qué cortar —`ErrorDePantalla`—; si falló la relectura de después de un
   * corte, lo de antes sigue a la vista con su aviso. La cadena vacía es un fallo
   * sin detalle técnico que enseñar.
   */
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** El corte que se acaba de hacer: su folio y lo que quedó. */
  const [hecho, setHecho] = useState<CorteHecho | null>(null);
  /**
   * Cuántas veces hay que volver a leer.
   *
   * Un corte cambia la pieza —o la cierra— así que después de cortar la pantalla
   * vuelve a preguntar en vez de suponer el nuevo restante. Es un contador y no un
   * `setPiezas` a mano porque lo que manda es lo que la base dice.
   */
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (materialInicial !== undefined && piezasIniciales !== undefined) return;
    const control = new AbortController();
    // Si sigue montada se pregunta con una FUNCIÓN y no con un centinela: un
    // `let vivo = true` el compilador lo da por siempre-verdadero.
    const sigueMontada = () => !control.signal.aborted;
    // EN DOS PASOS, y no en paralelo: las piezas se piden POR MATERIAL. Pedirlas
    // sueltas traía el rack de todos los materiales continuos del negocio, y con
    // dos rollos de cable y dos de manguera la pantalla ofrecía cortar manguera
    // desde la pantalla del cable.
    consultarPuente<MaterialContinuo>('MaterialContinuo', { limite: 1, signal: control.signal })
      .then(async (materiales) => {
        const elMaterial = materialInicial ?? materiales[0] ?? null;
        if (!sigueMontada()) return;
        setMaterial(elMaterial);
        if (elMaterial === null) {
          setPiezas(piezasIniciales ?? []);
          return;
        }
        const leidas = await consultarPuente<PiezaDeCorte>('PiezaDeMaterial', {
          filtro: { producto_id: elMaterial.id },
          limite: 60,
          signal: control.signal,
        });
        if (!sigueMontada()) return;
        setPiezas(piezasIniciales ?? leidas);
      })
      .catch((fallo: unknown) => {
        // La pantalla no se vacía por un error de red: lo que ya estaba a la vista
        // se queda, y el fallo se dice. Un vacío aquí mentiría —diría «no hay
        // piezas» cuando lo que no hubo fue respuesta—.
        if (!sigueMontada()) return;
        setFalloDeCarga(mensajeDe(fallo, fallo instanceof Error ? fallo.message : ''));
      });
    return () => {
      control.abort();
    };
  }, [materialInicial, piezasIniciales, vuelta]);

  /** Se limpia EN EL CLIC y no en el efecto: el efecto sólo vuelve a preguntar. */
  function volverALeer(): void {
    setFalloDeCarga(null);
    setVuelta((cuantas) => cuantas + 1);
  }

  const ordenadas = [...(piezas ?? [])].sort(porAbiertas);
  // La preselección se DERIVA; no se escribe con un setState dentro del efecto.
  const elegida = ordenadas.find((p) => p.id === piezaId) ?? ordenadas[0] ?? null;
  const encabezadoSinMaterial = (
    <h1 className="text-xl font-bold md:text-2xl">Cortar {voc.singular('producto')}</h1>
  );

  if (piezas === null && falloDeCarga !== null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-(--espacio-3) p-(--espacio-3)">
        {encabezadoSinMaterial}
        <ErrorDePantalla
          titulo={`No se pudo leer qué hay de ${voc.enFraseCon('este', 'producto')}.`}
          queHacer="Sin las piezas no se sabe de qué rollo cortar ni cuánto le queda. Revisa la conexión y vuelve a leerlas; no se ha cortado nada."
          {...(falloDeCarga === '' ? {} : { detalle: falloDeCarga })}
          reintentar={<Button onClick={volverALeer}>Volver a leer</Button>}
        />
      </div>
    );
  }

  if (piezas === null) {
    // Con la forma de los bloques, no una rueda: el ojo ya sabe dónde va a mirar
    // y la pantalla no salta cuando llega el dato.
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-(--espacio-3) p-(--espacio-3)">
        <Esqueleto className="h-(--altura-control) w-2/3" />
        <Superficie relleno={3} radio="md" className="flex flex-col gap-(--espacio-3)">
          <Esqueleto className="h-4 w-24" />
          <EsqueletoDeLista filas={2} />
        </Superficie>
        <Superficie relleno={3} radio="md" className="flex flex-col gap-(--espacio-3)">
          <Esqueleto className="h-4 w-20" />
          <div className="grid gap-(--espacio-3) md:grid-cols-2">
            <Esqueleto className="h-[calc(var(--altura-control)*1.4)] w-full" />
            <Esqueleto className="h-[calc(var(--altura-control)*1.4)] w-full" />
          </div>
        </Superficie>
      </div>
    );
  }

  // El vacío ENSEÑA qué es una pieza continua y por qué el corte necesita una,
  // en vez de disculparse por no tener datos.
  if (material === null || elegida === null) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-3) p-(--espacio-5)">
        {encabezadoSinMaterial}
        <Superficie relleno={0} radio="md">
          <Vacio
            icono={<Scissors />}
            titulo={
              material === null
                ? `${voc.conDeterminante('ningun', 'producto')} está marcado todavía como pieza continua.`
                : `No hay ninguna pieza de ${material.nombre} registrada.`
            }
            explicacion={
              material === null
                ? 'Continuo es el que se vende por medida: cable, manguera, cadena, tubo.'
                : 'Un corte descuenta de una pieza concreta con su folio; sin piezas, el metraje sería inventado.'
            }
            accion={
              <Button asChild>
                <a href="/ferreteria/mostrador">Registrar la primera pieza</a>
              </Button>
            }
          />
        </Superficie>
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
  const importeCentavos = Math.round(medida * material.precioCentavos);
  const abiertos = ordenadas.filter((p) => p.abierta).reduce((suma, p) => suma + p.restante, 0);
  const avisarAbiertos = !elegida.abierta && abiertos > 0;
  const destinos: readonly {
    readonly clave: Destino;
    readonly texto: string;
    readonly nota: ReactNode;
  }[] = [
    { clave: 'abierto', texto: 'Dejarlo como rollo abierto', nota: null },
    {
      clave: 'remate',
      texto: 'Marcarlo como retazo de remate',
      nota: (
        <>
          sugerido <Dinero centavos={material.precioRemateCentavos} tamano="sm" /> /{' '}
          {material.unidad}
        </>
      ),
    },
    {
      clave: 'baja',
      texto: 'Darlo de baja (desperdicio)',
      // En pesos y con peso: es lo que hace que el mostradorista se lo piense.
      nota: (
        <>
          costo{' '}
          <Dinero
            centavos={Math.round(queda * material.costoCentavos)}
            tamano="base"
            className="font-semibold text-texto"
          />
        </>
      ),
    },
  ];

  function alMedir(evento: ChangeEvent<HTMLInputElement>): void {
    setMedidaTexto(evento.target.value);
  }

  function alSobrar(evento: ChangeEvent<HTMLInputElement>): void {
    setSobranteTexto(evento.target.value);
  }

  function elegirDestino(valor: string): void {
    // Radix entrega un `string`; los únicos valores que puede traer son las tres
    // claves de `destinos`, que sí son `Destino`.
    setDestino(valor as Destino);
  }

  async function cortar(): Promise<void> {
    if (material === null || elegida === null) return;
    setEnviando(true);
    setError(null);
    try {
      // El documento no nombra la ruta: /api/<dominio>/<verbo> por convención.
      const salida = await invocarComando<CorteHecho>('/api/ferreteria/cortar', {
        materialId: material.id,
        piezaId: elegida.id,
        medida,
        desperdicio: sobrante,
        destinoSobrante: retazoChico ? destino : 'abierto',
      });
      // NO se navega al mostrador: el corte abrió una nota con su folio, y ése es
      // el número que el cliente canta en la caja. Irse sin enseñarlo deja al
      // mostradorista sin nada que decirle. Se limpia la medida —el siguiente
      // corte es otro— y se vuelven a leer las piezas, que acaban de cambiar.
      setHecho(salida);
      setMedidaTexto('');
      setSobranteTexto(null);
      volverALeer();
    } catch (fallo) {
      setError(mensajeDe(fallo, 'No se pudo registrar el corte.'));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-(--espacio-3) p-(--espacio-3) pb-[calc(var(--espacio-16)*2)] md:pb-(--espacio-4)">
      <h1 className="text-xl font-bold md:text-2xl">Cortar · {material.nombre}</h1>

      {error !== null && (
        <Aviso tono="peligro" titulo={error}>
          El corte no se registró: la pieza no se descontó y no se agregó nada a{' '}
          {voc.conArticulo('orden').toLowerCase()}.
        </Aviso>
      )}

      {/* Se leyó antes y la relectura de después del corte falló: lo de la vista
          es de ANTES de cortar, y eso se dice en vez de vaciar la pantalla. */}
      {falloDeCarga !== null && (
        <Aviso
          tono="peligro"
          titulo="No se pudieron volver a leer las piezas."
          accion={
            <Button type="button" variant="outline" size="sm" onClick={volverALeer}>
              Volver a leer
            </Button>
          }
        >
          Lo que queda en cada rollo es de antes del último corte.
          {falloDeCarga === '' ? null : ` ${falloDeCarga}`}
        </Aviso>
      )}

      {/* EL FOLIO, que es lo único que el cliente se lleva del pasillo, y lo que
          quedó del rollo, que es lo que el mostradorista tiene que rotular. */}
      {hecho !== null && (
        <Aviso tono="exito" titulo={`${voc.titulo('orden')} ${hecho.folio} está en la caja.`}>
          <span className="block font-numeros text-3xl font-bold text-texto">{hecho.folio}</span>
          Cortados {hecho.entregado} {material.unidad} · merma {hecho.merma} {material.unidad}.{' '}
          {hecho.queda === '0'
            ? 'La pieza se acabó y se cerró.'
            : `Quedan ${hecho.queda} ${material.unidad}: rotúlalos.`}
        </Aviso>
      )}

      <Superficie
        como="section"
        aria-labelledby="t-donde"
        relleno={3}
        radio="md"
        className="flex flex-col gap-(--espacio-2)"
      >
        <h2 id="t-donde" className={TITULO}>
          De dónde
        </h2>
        <RadioGroup
          aria-labelledby="t-donde"
          aria-describedby={avisarAbiertos ? 'aviso-abiertos' : undefined}
          className="gap-(--espacio-2)"
          value={elegida.id}
          onValueChange={setPiezaId}
        >
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
        {/* UNA línea, pegada a la elección que la provoca, y no un recuadro: es
            un recordatorio, no un muro. El icono y el texto la cargan, no el color. */}
        {avisarAbiertos && (
          <p id="aviso-abiertos" className="flex items-start gap-(--espacio-2) text-sm font-medium">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-advertencia" />
            <span>
              Hay {metros(abiertos)} {material.unidad} abiertos. Si abres uno nuevo, esos se quedan.
            </span>
          </p>
        )}
      </Superficie>

      <Superficie
        como="section"
        aria-labelledby="t-cuanto"
        relleno={3}
        radio="md"
        className="flex flex-col gap-(--espacio-3)"
      >
        <h2 id="t-cuanto" className={TITULO}>
          Cuánto
        </h2>
        <div className={CAMPOS}>
          <div className="flex flex-col gap-1">
            <Label className="flex-col items-start gap-1">
              Medida entregada ({material.unidad})
              <Input inputMode="decimal" autoFocus value={medidaTexto} onChange={alMedir} />
            </Label>
            <p className={NOTA}>
              <Dinero centavos={material.precioCentavos} tamano="xs" /> / {material.unidad}
            </p>
          </div>
          <div className="flex flex-col gap-1">
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
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-(--espacio-3) gap-y-(--espacio-2) border-t border-borde pt-(--espacio-3)">
          <dt className="text-sm text-texto-sutil">Se descuenta del rollo</dt>
          <dd className="text-right">
            <Cifra valor={descuento} decimales={2} unidad={material.unidad} tamano="sm" />
          </dd>
          <dt className="font-semibold">Queda en {elegida.folio}</dt>
          <dd className="flex flex-wrap items-baseline justify-end gap-x-(--espacio-2) text-right">
            <Cifra
              valor={queda}
              decimales={2}
              unidad={material.unidad}
              tamano="lg"
              className={`font-bold ${excede ? 'text-peligro' : ''}`}
            />
            {retazoChico && (
              <span className="inline-flex items-center gap-1 text-sm font-medium">
                <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-advertencia" />
                retazo chico
              </span>
            )}
          </dd>
        </dl>
        {excede && (
          <Aviso
            tono="peligro"
            titulo={`No alcanza: en ${elegida.folio} sólo quedan ${metros(elegida.restante)} ${material.unidad}.`}
          />
        )}
      </Superficie>

      {/* Sólo cuando importa: con 40 m sobrantes, preguntar esto es fricción. */}
      {retazoChico && (
        <Superficie
          como="section"
          aria-labelledby="t-resto"
          relleno={3}
          radio="md"
          className="flex flex-col gap-(--espacio-2)"
        >
          <h2 id="t-resto" className={TITULO}>
            Qué hacer con lo que queda
          </h2>
          <RadioGroup
            aria-labelledby="t-resto"
            className="gap-(--espacio-2)"
            value={destino}
            onValueChange={elegirDestino}
          >
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
        </Superficie>
      )}

      {/* En el teléfono, fija al pulgar: junto al rack se corta de pie y con una
          mano. En PC, en su sitio al pie de las tres decisiones. */}
      <Superficie
        como="footer"
        nivel={3}
        radio="md"
        relleno={3}
        className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-between gap-(--espacio-2) rounded-none border-x-0 border-b-0 pb-[max(var(--espacio-3),env(safe-area-inset-bottom))] md:static md:rounded-md md:border md:pb-(--espacio-3) md:shadow-1"
      >
        <p className="flex items-baseline gap-(--espacio-2) text-sm text-texto-sutil">
          Importe de {voc.enFrase('linea_orden')}
          <Dinero centavos={importeCentavos} tamano="lg" className="text-texto" />
        </p>
        <div className="flex w-full gap-(--espacio-2) md:w-auto">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => {
              window.history.back();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="lg"
            className="flex-1 md:flex-none"
            disabled={medida <= 0 || excede || enviando}
            cargando={enviando}
            onClick={() => {
              void cortar();
            }}
          >
            {enviando ? null : <Scissors aria-hidden="true" />}
            {enviando ? 'Cortando…' : 'Cortar y agregar'}
          </Button>
        </div>
      </Superficie>
    </div>
  );
}
