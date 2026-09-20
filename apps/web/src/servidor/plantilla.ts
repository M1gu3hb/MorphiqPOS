import 'server-only';

import {
  INICIO_POR_PLANTILLA,
  rutaDeModeloSinSesion,
  segunElDato,
  type Plantilla,
} from '@morphiqpos/contracts';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { CABECERA_RUTA } from '../../middleware';
import { sesionDelServidor } from './http';

/**
 * La guarda de las pantallas de un modelo.
 *
 * ── Qué no comprobaba nadie ────────────────────────────────────────────────
 * El envoltorio de `(modelos)` sólo inyectaba vocabulario. No miraba la
 * plantilla ni el módulo, así que **cualquiera con sesión abría cualquier
 * pantalla de cualquier modelo tecleando la ruta**: un abarrotes podía entrar al
 * mapa de mesas y una ferretería a la agenda de una estética. No era un agujero
 * de datos —los comandos sí comprueban, y fallan cerrado— pero sí de producto:
 * la plantilla dejaba de decidir en cuanto alguien escribía una URL.
 *
 * ── Por qué redirige en vez de devolver 404 ────────────────────────────────
 * Porque la pantalla EXISTE; lo que no corresponde es a este negocio. Un 404
 * diría «esto no está construido», que es mentira y manda a buscar código que
 * ya está. Mandarlo a SU pantalla de inicio dice la verdad —«tu negocio abre
 * aquí»— y deja al usuario en un sitio donde puede trabajar.
 *
 * ── Por qué una guarda por modelo y no una por ruta ────────────────────────
 * Porque el modelo ES la unidad: las doce pantallas de una estética son de la
 * plantilla `estetica`, no una por una. Un `layout.tsx` por carpeta de modelo
 * cubre las doce y no se puede olvidar ninguna, que es la misma razón por la
 * que el vocabulario se inyecta en el envoltorio y no en cada pantalla.
 *
 * ── Y las cuatro que se saltan, que casi quedan inservibles ────────────────
 * Cubrir el modelo entero cubrió también las dos pantallas de ENTRAR con PIN y
 * las dos que abre el cliente con el QR de su mesa. Una guarda que manda al
 * login a quien está mirando el login es un bucle, y un comensal con el teléfono
 * en la mano no tiene sesión de negocio ni la va a tener nunca. Son las mismas
 * cuatro que no cuelgan de ningún menú —`RUTAS_DE_MODELO_SIN_SESION`— y
 * `verify:acople` ata esa lista con las filas declaradas en
 * `EXCEPCIONES-COBERTURA.md`.
 */
export async function exigirPlantilla(esperada: Plantilla): Promise<void> {
  // La ruta la pone el middleware: un `layout.tsx` no la recibe.
  const ruta = (await headers()).get(CABECERA_RUTA) ?? '';
  if (rutaDeModeloSinSesion(ruta)) return;

  const sesion = await sesionDelServidor();

  // Sin sesión no hay plantilla que comprobar, y tampoco hay nada que enseñar:
  // estas pantallas leen datos del negocio. Al PIN.
  if (sesion === null) redirect('/login-pos');

  if (sesion.paquete !== esperada) {
    redirect(segunElDato(INICIO_POR_PLANTILLA, sesion.paquete) ?? '/');
  }
}
