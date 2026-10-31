import { playSound, prepararAudio, preloadSound, setSoundVolume } from './motor/reproducir';
import type { Recipe } from './motor/tipos';
import type { NombreDeReceta } from './mapa';

/**
 * EL REPRODUCTOR (DP-11.3): carga cada receta sólo cuando hace falta (Keycap y Thock traen su
 * muestra y pesan 50 KB cada una; las demás, menos de 1 KB) y la toca con el motor de Sound Lab.
 * Lo que decide si suena o no es del gestor; aquí sólo se toca.
 */
const CARGAR: Readonly<Record<NombreDeReceta, () => Promise<{ readonly default: Recipe }>>> = {
  arrive: () => import('./recetas/arrive'),
  bead: () => import('./recetas/bead'),
  boop: () => import('./recetas/boop'),
  check: () => import('./recetas/check'),
  clasp: () => import('./recetas/clasp'),
  confetti: () => import('./recetas/confetti'),
  dawn: () => import('./recetas/dawn'),
  dispatch: () => import('./recetas/dispatch'),
  dusk: () => import('./recetas/dusk'),
  felt: () => import('./recetas/felt'),
  fold: () => import('./recetas/fold'),
  halo: () => import('./recetas/halo'),
  hint: () => import('./recetas/hint'),
  keycap: () => import('./recetas/keycap'),
  nib: () => import('./recetas/nib'),
  notch: () => import('./recetas/notch'),
  pebble: () => import('./recetas/pebble'),
  ping: () => import('./recetas/ping'),
  popover: () => import('./recetas/popover'),
  receipt: () => import('./recetas/receipt'),
  retreat: () => import('./recetas/retreat'),
  shrug: () => import('./recetas/shrug'),
  signal: () => import('./recetas/signal'),
  thock: () => import('./recetas/thock'),
  unclasp: () => import('./recetas/unclasp'),
};

const cargadas = new Map<NombreDeReceta, Promise<Recipe>>();

function receta(nombre: NombreDeReceta): Promise<Recipe> {
  const ya = cargadas.get(nombre);
  if (ya !== undefined) return ya;
  const nueva = CARGAR[nombre]().then((modulo) => modulo.default);
  cargadas.set(nombre, nueva);
  // Si no carga (sin red un momento), no se queda así: el siguiente toque lo vuelve a intentar.
  nueva.catch(() => {
    if (cargadas.get(nombre) === nueva) cargadas.delete(nombre);
  });
  return nueva;
}

/** Toca la receta con esta ganancia (0 a 1). Termina cuando acaba de sonar. */
export async function reproducir(nombre: NombreDeReceta, ganancia: number): Promise<void> {
  const lista = await receta(nombre);
  setSoundVolume(ganancia);
  await playSound(lista);
}

/** La deja sintetizada de antemano, para que el primer toque no espere. */
export async function precargar(nombre: NombreDeReceta): Promise<void> {
  preloadSound(await receta(nombre));
}

/** Desbloquea el audio en el gesto mismo (ver `prepararAudio`). */
export function desbloquearAudio(): Promise<void> {
  return prepararAudio();
}
