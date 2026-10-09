import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
  TestInfo,
} from '@playwright/test';

import {
  DUENO_DE_DEMO,
  equipoDeDemo,
  esGiroDeDemo,
  type GiroDeDemo,
} from '../../../packages/contracts/src/negocios/equipo-demo.ts';
import { demoPorSlug } from '../../../packages/contracts/src/negocios/index.ts';

import { entrar, type QuienEntra } from './sesion.ts';

/**
 * EL ROL QUE TOCA A CADA PASO (bloque D de la 2.4).
 *
 * Hasta la 2.4 todas las suites entraban como dueño, que lo puede todo: así no se ve si
 * la cajera puede cobrar sin poder cambiar la plantilla, si el mesero ve la cuenta sin
 * ver el costo, ni si la estilista ve SU día y no el de otra. Un negocio no lo opera su
 * dueño solo, y el día completo tiene que operarlo quien lo opera.
 *
 * ── Una entrada por rol y por corrida ─────────────────────────────────────────
 * `LIMITES.entrar` son 20 intentos por origen cada 5 minutos (`limite.ts`, intocable), y
 * `humo-seguridad` quema ese límite a propósito al final. Entrar en cada prueba con cada
 * rol lo agotaría a media corrida, y el fallo diría «429» sobre un PIN correcto: parece
 * fragilidad y es aritmética. Así que cada persona entra UNA vez —por la pantalla de
 * acceso, con su tarjeta y su PIN, que es lo que se prueba— y la sesión se guarda con
 * `storageState`. La siguiente prueba que la necesita la reutiliza mientras el servidor
 * la reconozca; si la rechaza (caducó a las ocho horas, la base se volvió a crear), se
 * entra otra vez.
 *
 * El archivo guarda una cookie de sesión de una DEMO, cuyos PIN son públicos. Aun así no
 * se versiona: `pruebas/e2e/.sesiones` está en `.gitignore`.
 */

export type RolDePrueba = 'dueno' | 'gerente' | 'cajero' | 'mesero' | 'cocina' | 'almacen';

export interface PersonaDeDemo extends QuienEntra {
  readonly rol: RolDePrueba;
}

const CARPETA = join('pruebas', 'e2e', '.sesiones');

/** El giro de una demo: su slug es `demo-acople-<giro>`, y sólo vale si es una demo. */
export function giroDeLaDemo(slug: string): GiroDeDemo {
  const demo = demoPorSlug(slug);
  if (demo === null) {
    throw new Error(`«${slug}» no es una de las cinco demos: aquí no entra ninguna prueba.`);
  }
  const giro = demo.slug.replace(/^demo-acople-/, '');
  if (!esGiroDeDemo(giro)) throw new Error(`La demo «${slug}» no tiene un giro con equipo.`);
  return giro;
}

/**
 * Quién tiene ese rol en esa demo. Con dos personas del mismo rol —las estilistas del
 * salón— se elige por nombre; sin nombre, la primera de la tabla de la siembra.
 */
export function personaDe(slug: string, rol: RolDePrueba, nombre?: string): PersonaDeDemo {
  if (rol === 'dueno') return { slug, nombre: DUENO_DE_DEMO.nombre, pin: DUENO_DE_DEMO.pin, rol };
  const giro = giroDeLaDemo(slug);
  const delRol = equipoDeDemo(giro).filter((e) => e.rol === rol);
  const elegido = nombre === undefined ? delRol[0] : delRol.find((e) => e.nombre === nombre);
  if (elegido === undefined) {
    throw new Error(
      `La demo «${slug}» no tiene a nadie con rol «${rol}»` +
        (nombre === undefined ? '' : ` que se llame ${nombre}`) +
        `. Su equipo: ${equipoDeDemo(giro)
          .map((e) => `${e.nombre} (${e.rol})`)
          .join(', ')}.`,
    );
  }
  return { slug, nombre: elegido.nombre, pin: elegido.pin, rol };
}

/** Las opciones del proyecto (dispositivo, URL, cabeceras del muro) para un contexto propio. */
function opcionesDelProyecto(info: TestInfo): BrowserContextOptions {
  const use = info.project.use;
  const opciones: BrowserContextOptions = {
    ...(use.baseURL === undefined ? {} : { baseURL: use.baseURL }),
    ...(use.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: use.extraHTTPHeaders }),
    ...(use.viewport === undefined ? {} : { viewport: use.viewport }),
    ...(use.userAgent === undefined ? {} : { userAgent: use.userAgent }),
    ...(use.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: use.deviceScaleFactor }),
    ...(use.isMobile === undefined ? {} : { isMobile: use.isMobile }),
    ...(use.hasTouch === undefined ? {} : { hasTouch: use.hasTouch }),
    ...(use.locale === undefined ? {} : { locale: use.locale }),
    ...(use.timezoneId === undefined ? {} : { timezoneId: use.timezoneId }),
    ...(use.colorScheme === undefined ? {} : { colorScheme: use.colorScheme }),
    acceptDownloads: true,
  };
  return opciones;
}

function archivoDe(persona: PersonaDeDemo): string {
  // Sin acentos ni espacios en el nombre del archivo: «Toño» y «Rubén» también entran.
  const limpio = persona.nombre
    .normalize('NFD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();
  return join(CARPETA, `${persona.slug}-${persona.rol}-${limpio}.json`);
}

/**
 * ¿El servidor reconoce todavía esta sesión? Sólo un 200 de `/api/catalogo/sesion`, que
 * admite todos los roles: un 401 es que no hay, y un 403 es que la hubo y se revocó —el
 * reseteo de la demo borra las terminales de todos menos la de quien lo pide—.
 */
async function sesionViva(request: APIRequestContext): Promise<boolean> {
  const respuesta = await request.get('/api/catalogo/sesion');
  return respuesta.status() === 200;
}

/**
 * Un navegador con la sesión de esa persona abierta, en el dispositivo del proyecto.
 *
 * Entra por la pantalla de acceso SÓLO si no hay una sesión guardada que el servidor
 * reconozca. Quien la pide la cierra (`context.close()`) al terminar.
 */
export async function contextoDe(
  browser: Browser,
  info: TestInfo,
  persona: PersonaDeDemo,
  archivo: string = archivoDe(persona),
  dispositivo?: StorageState,
): Promise<BrowserContext> {
  mkdirSync(CARPETA, { recursive: true });
  const base = opcionesDelProyecto(info);

  if (existsSync(archivo)) {
    const guardado = await browser.newContext({ ...base, storageState: archivo });
    const mismoAparato =
      dispositivo === undefined ||
      cookieDelDispositivo(await guardado.storageState()) === cookieDelDispositivo(dispositivo);
    if (mismoAparato && (await sesionViva(guardado.request))) return guardado;
    await guardado.close();
  }

  // El aparato se CONSERVA al volver a entrar: una sesión caducada en la PC del
  // mostrador vuelve a entrar en la PC del mostrador, no en una terminal nueva. Sin
  // aparato guardado, el estado del muro de Vercel si la corrida lo trae.
  const muro = info.project.use.storageState;
  const previo =
    dispositivo ?? (existsSync(archivo) ? soloElAparato(archivo) : undefined) ?? undefined;
  const contexto = await browser.newContext({
    ...base,
    ...(previo === undefined
      ? typeof muro === 'string'
        ? { storageState: muro }
        : {}
      : { storageState: previo }),
  });
  const page = await contexto.newPage();
  await entrar(page, persona);
  await page.close();
  await contexto.storageState({ path: archivo });
  return contexto;
}

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** La cookie que identifica el APARATO (la terminal), no la sesión. */
const COOKIE_DEL_DISPOSITIVO = 'morphiqpos_dispositivo';

function cookieDelDispositivo(estado: StorageState): string | null {
  return estado.cookies.find((c) => c.name === COOKIE_DEL_DISPOSITIVO)?.value ?? null;
}

/** Del estado guardado, sólo lo que es del aparato: la cookie del dispositivo y las del muro. */
function soloElAparato(archivo: string): StorageState {
  const estado = JSON.parse(readFileSync(archivo, 'utf8')) as StorageState;
  return {
    ...estado,
    cookies: estado.cookies.filter((c) => !c.name.startsWith('morphiqpos_sesion')),
  };
}

/**
 * Las personas de un día, cada una con su navegador. Se piden por rol y se cierran
 * todas juntas al final.
 */
export class Equipo {
  readonly #abiertos = new Map<string, BrowserContext>();

  constructor(
    private readonly browser: Browser,
    private readonly slug: string,
  ) {}

  /** La pestaña de esa persona. La primera vez abre su navegador (y entra si hace falta). */
  async pagina(info: TestInfo, rol: RolDePrueba, nombre?: string): Promise<Page> {
    const persona = personaDe(this.slug, rol, nombre);
    const clave = `${persona.rol}:${persona.nombre}`;
    let contexto = this.#abiertos.get(clave);
    if (contexto === undefined) {
      contexto = await contextoDe(this.browser, info, persona);
      this.#abiertos.set(clave, contexto);
    }
    const abiertas = contexto.pages();
    return abiertas[0] ?? (await contexto.newPage());
  }

  /**
   * OTRA PERSONA EN LA MISMA TERMINAL: la gerente que viene al mostrador a devolver una
   * venta, el que entra al segundo turno. La terminal va firmada en la sesión al entrar
   * (`identidad/entrar.ts`), así que esto ENTRA de verdad, con su PIN, en el aparato de
   * quien ya está ahí —su cookie del dispositivo— y no en uno nuevo. Es un navegador
   * aparte para que la sesión de quien estaba no se pierda: en la PC real, el cajero
   * vuelve a entrar después; aquí sigue en su pestaña.
   */
  async paginaEnLaTerminalDe(
    info: TestInfo,
    deQuien: { readonly rol: RolDePrueba; readonly nombre?: string },
    rol: RolDePrueba,
    nombre?: string,
  ): Promise<Page> {
    const dueñaDelAparato = await this.pagina(info, deQuien.rol, deQuien.nombre);
    const anfitrion = personaDe(this.slug, deQuien.rol, deQuien.nombre);
    const persona = personaDe(this.slug, rol, nombre);
    const clave = `${persona.rol}:${persona.nombre}@${anfitrion.rol}:${anfitrion.nombre}`;
    let contexto = this.#abiertos.get(clave);
    if (contexto === undefined) {
      const estado = await dueñaDelAparato.context().storageState();
      const aparato: StorageState = {
        ...estado,
        cookies: estado.cookies.filter((c) => !c.name.startsWith('morphiqpos_sesion')),
      };
      const archivo = archivoDe(persona).replace(/\.json$/, `-en-${anfitrion.rol}.json`);
      contexto = await contextoDe(this.browser, info, persona, archivo, aparato);
      this.#abiertos.set(clave, contexto);
    }
    const abiertas = contexto.pages();
    return abiertas[0] ?? (await contexto.newPage());
  }

  async cerrar(): Promise<void> {
    for (const contexto of this.#abiertos.values()) await contexto.close();
    this.#abiertos.clear();
  }
}
