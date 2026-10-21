/**
 * CUÁNDO EL CACHÉ DE CONSULTAS DEJA DE SER DE QUIEN LO LLENÓ.
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * El `QueryClient` era un singleton de módulo: UNO para toda la vida de la pestaña, con
 * independencia de quién estuviera dentro. Entrar y salir recargan la página, y eso lo
 * escondía; pero hay caminos que no la recargan —la sesión que otra pestaña cambia por la
 * cookie compartida, la que se revoca o vence con la pantalla abierta, el modo de paquete
 * que se cambia desde Configuración—, y en todos ellos lo que había en el caché seguía
 * pintándose con los datos del contexto ANTERIOR (otro empleo, otro rol que recibe otros
 * campos, otra plantilla con otra cocina) hasta que cada consulta se refrescara por su
 * cuenta. Peor: una respuesta que salió ANTES del cambio y llega DESPUÉS repintaba la
 * pantalla nueva con datos de la vieja.
 *
 * ── La solución ────────────────────────────────────────────────────────────
 * Un `QueryClient` POR CONTEXTO. Cuando el contexto cambia se descarta el cliente entero
 * (con sus consultas en vuelo) y se monta uno vacío: lo que llegue tarde cae en un caché
 * que nadie mira. No depende de que cada consulta recuerde incluir al usuario en su clave,
 * que es exactamente lo que se olvida.
 *
 * Este archivo es la decisión, pura y probada; `proveedores/ProveedorDeConsultas.tsx` es
 * la pieza de React que la ejecuta.
 */

/** Lo que de la sesión identifica un contexto. Todo es opcional: la sesión guardada puede venir coja. */
export interface IdentidadDelContexto {
  readonly id?: string | null | undefined;
  readonly organizacionId?: string | null | undefined;
  readonly paquete?: string | null | undefined;
}

/**
 * La clave del contexto: negocio, empleo y plantilla. `null` si no hay nadie dentro.
 *
 * Los tres cuentan. El EMPLEO (no la persona) porque cada empleo tiene su rol y el puente
 * recorta los campos por rol; el NEGOCIO porque un dueño general cambia de demostración
 * con la misma persona; la PLANTILLA porque decide qué cocina, qué menú y qué módulos hay.
 */
export function claveDeContexto(identidad: IdentidadDelContexto | null | undefined): string | null {
  if (identidad === null || identidad === undefined) return null;
  const id = identidad.id ?? '';
  if (id === '') return null;
  return [identidad.organizacionId ?? '-', id, identidad.paquete ?? '-'].join(':');
}

/** El estado que se arrastra entre dos pintadas. */
export interface EstadoDeContexto {
  /** El contexto al que pertenece el cliente vigente; `null` mientras no se sabe quién es. */
  readonly clave: string | null;
  /**
   * Cuántas veces se ha entrado o salido de forma EXPLÍCITA (`login` / `logout` del
   * contexto de autenticación). Una entrada con el mismo empleo sigue siendo una entrada
   * nueva: se parte de cero.
   */
  readonly sesion: number;
  /** Cuántos clientes se han creado: es la `key` de React que remonta el árbol. */
  readonly generacion: number;
}

export const CONTEXTO_INICIAL: EstadoDeContexto = { clave: null, sesion: 0, generacion: 0 };

export interface TransicionDeContexto {
  readonly estado: EstadoDeContexto;
  /** `true`: hay que descartar el cliente de consultas y crear uno vacío. */
  readonly reiniciar: boolean;
}

/**
 * Qué hacer cuando la sesión cambia.
 *
 * Se reinicia cuando:
 *   · quien estaba DENTRO ya no es el mismo (otro empleo, otro negocio, otra plantilla) o
 *     salió (`clave` pasa a `null`): lo que hay en el caché es suyo;
 *   · hubo una entrada o salida explícita (`sesion` cambió).
 *
 * NO se reinicia al pasar de «todavía no se sabe quién es» (`clave === null` desde el
 * arranque) a «es fulano»: las consultas que ya salieron en ese tramo viajaron con la
 * cookie, que es lo que manda, y tirarlas sería montar toda la pantalla dos veces en cada
 * carga. Lo guardado en `sessionStorage` que el servidor desmiente SÍ es un cambio (de la
 * guardada a la real), y cae en el primer caso.
 */
export function siguienteContexto(
  previo: EstadoDeContexto,
  clave: string | null,
  sesion: number,
): TransicionDeContexto {
  const cambioDeQuienEstabaDentro = previo.clave !== null && previo.clave !== clave;
  const entradaOSalida = previo.sesion !== sesion;
  if (!cambioDeQuienEstabaDentro && !entradaOSalida) {
    return clave === previo.clave
      ? { estado: previo, reiniciar: false }
      : { estado: { ...previo, clave }, reiniciar: false };
  }
  return {
    estado: { clave, sesion, generacion: previo.generacion + 1 },
    reiniciar: true,
  };
}

/**
 * ¿Cambió la plantilla EN ESTA SESIÓN? Lo decide la configuración, que es lo que el dueño
 * toca en Configuración → Paquete sin que nada recargue la página.
 *
 * `previa` es la última plantilla ya asentada (la configuración había terminado de cargar);
 * `actual` es la de ahora. Mientras la configuración carga, `actual` es `null` y no se
 * decide nada: la plantilla de omisión (`tienda`) no es una plantilla, es un marcador.
 */
export function cambioDePlantilla(
  previa: string | null,
  actual: string | null,
): { readonly asentada: string | null; readonly reiniciar: boolean } {
  if (actual === null) return { asentada: previa, reiniciar: false };
  if (previa === null) return { asentada: actual, reiniciar: false };
  return { asentada: actual, reiniciar: previa !== actual };
}

/**
 * Las consultas que sobreviven a un cambio de plantilla: la configuración misma, que es
 * justo lo que acaba de cambiar y de lo que depende cada pantalla para saber dónde está.
 */
export const RAICES_QUE_NO_SE_REINICIAN: readonly string[] = ['config'];

export function sobreviveAlCambioDePlantilla(clave: readonly unknown[]): boolean {
  const raiz = clave[0];
  return typeof raiz === 'string' && RAICES_QUE_NO_SE_REINICIAN.includes(raiz);
}
