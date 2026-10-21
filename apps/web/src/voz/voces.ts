/**
 * LAS VOCES QUE DE VERDAD PUEDE USAR ESTE DISPOSITIVO · qué listar, en qué orden y cómo
 * llamarlas.
 *
 * ── Qué problema resuelve ─────────────────────────────────────────────────
 * El sistema avisa por voz con la Web Speech API del navegador: las voces no son nuestras,
 * son las que el sistema operativo instaló. Un iPhone trae unas, un Android otras, un
 * Windows con Edge un tercer juego —y algunas de las de Edge y de Chrome están en la nube
 * y callan sin internet—. Mostrar «todas las voces» llena la lista de inglés, francés y
 * voces que no suenan; mostrar una fija elegiría por la persona una voz que quizá no existe.
 *
 * Aquí está la parte PURA de esa decisión (sin navegador, para poder probarla):
 *   · cuáles son español;
 *   · cuáles pueden sonar ahora (sin conexión sólo las locales);
 *   · en qué orden se ofrecen: México primero, luego Estados Unidos y el resto de América,
 *     y al final España y lo demás — porque el negocio y su equipo hablan mexicano;
 *   · cómo se llaman en pantalla, sin los sufijos en inglés que traen los sistemas.
 *
 * Nada de esto toca `speechSynthesis`: recibe la lista de voces como dato. La parte que
 * habla vive en `heredado/lib/voiceAlert.js`, y la que se ve, en
 * `heredado/components/configuracion/ConfiguracionDeVoz.jsx`.
 */

/** Lo que el navegador dice de una voz (`SpeechSynthesisVoice`), sólo lo que usamos. */
export interface VozDelNavegador {
  readonly name: string;
  readonly lang: string;
  readonly voiceURI?: string;
  /** `true` si suena sin internet. `false`: es una voz en la nube. */
  readonly localService?: boolean;
  readonly default?: boolean;
}

/** La frase con la que se escucha una voz: la que oye un mesero de verdad. */
export const MUESTRA_DE_VOZ = 'Mesa cuatro, su orden está lista.';

/**
 * El grupo en que se ofrece una voz, en el orden en que se muestra.
 *   mexico  · es-MX
 *   latino  · es-US, es-419 y el resto de América: suenan a un acento que se entiende aquí
 *   otro    · es-ES y lo demás
 */
export type GrupoDeVoz = 'mexico' | 'latino' | 'otro';

const ORDEN_DE_GRUPO: Readonly<Record<GrupoDeVoz, number>> = { mexico: 0, latino: 1, otro: 2 };

/** Regiones de América donde se habla español (más `419`, «Latinoamérica» de la ISO). */
const REGIONES_LATINAS: ReadonlySet<string> = new Set([
  'US',
  '419',
  'AR',
  'BO',
  'CL',
  'CO',
  'CR',
  'CU',
  'DO',
  'EC',
  'GT',
  'HN',
  'NI',
  'PA',
  'PE',
  'PR',
  'PY',
  'SV',
  'UY',
  'VE',
]);

/** Los nombres de región que `Intl` no da o da distintos de como se dicen aquí. */
const REGION_A_MANO: Readonly<Record<string, string>> = {
  MX: 'México',
  US: 'Estados Unidos',
  '419': 'Latinoamérica',
  ES: 'España',
};

/** Una voz lista para ofrecerla: lo que el selector necesita, ya resuelto. */
export interface VozParaElegir {
  /** Lo que se guarda como preferencia: el nombre de la voz, tal cual lo da el sistema. */
  readonly nombre: string;
  readonly idioma: string;
  readonly region: string;
  readonly grupo: GrupoDeVoz;
  readonly local: boolean;
  /** Cómo se llama en pantalla. */
  readonly etiqueta: string;
}

/**
 * `es_MX` (Android) y `ES-mx` (algunos Linux) son `es-MX`. Sin esto, la mitad de las voces
 * de un teléfono Android no se reconocerían como español.
 */
export function normalizarIdioma(idioma: string | null | undefined): string {
  if (typeof idioma !== 'string') return '';
  const partes = idioma.trim().replace(/_/g, '-').split('-');
  const lengua = (partes[0] ?? '').toLowerCase();
  if (lengua === '') return '';
  const resto = partes.slice(1).map((parte) => (parte.length === 2 ? parte.toUpperCase() : parte));
  return [lengua, ...resto].join('-');
}

/** ¿El idioma es español? Por la LENGUA (`es`, `es-MX`), no por un prefijo de texto. */
export function esEspanol(idioma: string | null | undefined): boolean {
  const normalizado = normalizarIdioma(idioma);
  return normalizado === 'es' || normalizado.startsWith('es-');
}

/** La región de un idioma normalizado: `MX` de `es-MX`, `419` de `es-419`; `''` si no hay. */
function regionDe(idioma: string): string {
  const region = idioma
    .split('-')
    .slice(1)
    .find((parte) => /^(?:[A-Z]{2}|\d{3})$/.test(parte));
  return region ?? '';
}

/** El nombre de una región en español: «México», «Argentina», «Latinoamérica». */
export function nombreDeRegion(region: string): string {
  if (region === '') return 'Español';
  const aMano = REGION_A_MANO[region];
  if (aMano !== undefined) return aMano;
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}

function grupoDe(region: string): GrupoDeVoz {
  if (region === 'MX') return 'mexico';
  return REGIONES_LATINAS.has(region) ? 'latino' : 'otro';
}

/**
 * El nombre de una voz sin lo que sobra en pantalla. Windows las llama «Microsoft Sabina -
 * Spanish (Mexico)» y la región ya se muestra aparte: queda «Sabina». Si limpiar la deja
 * vacía, se conserva el original; una voz sin nombre no se puede elegir.
 */
export function nombreCortoDeVoz(nombre: string): string {
  const limpio = nombre
    .replace(/\s*[-–]\s*(?:Spanish|Español)\b.*$/i, '')
    .replace(/^Microsoft\s+/i, '')
    .replace(/\s*\((?:Spanish|Español)\b[^)]*\)\s*$/i, '')
    .trim();
  return limpio === '' ? nombre.trim() : limpio;
}

export interface OpcionesDeLista {
  /**
   * ¿Hay internet? Sin él, las voces en la nube (`localService: false`) no suenan, y
   * ofrecerlas es ofrecer un silencio. Si no se sabe (`undefined`), se asume que sí.
   */
  readonly enLinea?: boolean;
}

/**
 * ¿Puede sonar esta voz AHORA? Una voz local siempre; una de la nube, sólo con internet.
 * `enLinea` desconocido (`undefined`) cuenta como con internet: no se le quita una voz a
 * nadie por una duda.
 */
export function puedeSonar(voz: VozDelNavegador, enLinea: boolean | undefined): boolean {
  return voz.localService !== false || enLinea !== false;
}

/**
 * Las voces en español que SÍ pueden sonar, ordenadas para elegir.
 *
 * Quita: lo que no es español, lo que no tiene nombre y —sin internet— lo que necesita
 * internet. Une las repetidas (un mismo nombre en el mismo idioma aparece dos veces en
 * algunos Android). Ordena por grupo (México, América, otras), luego las locales primero
 * —suenan siempre y sin demora—, luego por nombre.
 */
export function vocesParaElegir(
  voces: readonly VozDelNavegador[],
  opciones: OpcionesDeLista = {},
): VozParaElegir[] {
  const enLinea = opciones.enLinea;
  const vistas = new Set<string>();
  const lista: VozParaElegir[] = [];

  for (const voz of voces) {
    const nombre = typeof voz.name === 'string' ? voz.name.trim() : '';
    if (nombre === '' || !esEspanol(voz.lang)) continue;
    if (!puedeSonar(voz, enLinea)) continue;
    const local = voz.localService !== false;

    const idioma = normalizarIdioma(voz.lang);
    const clave = `${nombre}\u0000${idioma}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    const region = regionDe(idioma);
    lista.push({
      nombre,
      idioma,
      region: nombreDeRegion(region),
      grupo: grupoDe(region),
      local,
      etiqueta: nombreCortoDeVoz(nombre),
    });
  }

  return lista.sort(
    (a, b) =>
      ORDEN_DE_GRUPO[a.grupo] - ORDEN_DE_GRUPO[b.grupo] ||
      Number(b.local) - Number(a.local) ||
      a.etiqueta.localeCompare(b.etiqueta, 'es'),
  );
}

/** La voz con ese nombre en la lista del navegador, o `null` si este dispositivo no la tiene. */
export function encontrarVoz<T extends VozDelNavegador>(
  voces: readonly T[],
  nombre: string | null | undefined,
): T | null {
  if (typeof nombre !== 'string' || nombre === '') return null;
  return voces.find((voz) => voz.name === nombre || voz.voiceURI === nombre) ?? null;
}

/**
 * Qué pasa con la voz que se guardó, dicho para una persona:
 *   · `automatica`    — no eligió ninguna: se usa la mejor que haya.
 *   · `elegida`       — eligió una y este dispositivo la tiene y puede sonar ahora.
 *   · `sin-conexion`  — eligió una de la nube y no hay internet: mientras tanto suena la
 *                       automática, y vuelve la suya con la conexión.
 *   · `no-disponible` — eligió una y ESTE dispositivo no la tiene (cambió de teléfono, o se
 *                       desinstaló): se usa la automática hasta que elija otra.
 */
export type EstadoDeLaEleccion = 'automatica' | 'elegida' | 'sin-conexion' | 'no-disponible';

export function estadoDeLaEleccion(
  voces: readonly VozDelNavegador[],
  guardada: string | null | undefined,
  opciones: OpcionesDeLista = {},
): EstadoDeLaEleccion {
  if (typeof guardada !== 'string' || guardada === '') return 'automatica';
  const voz = encontrarVoz(voces, guardada);
  if (voz === null) return 'no-disponible';
  return puedeSonar(voz, opciones.enLinea) ? 'elegida' : 'sin-conexion';
}
