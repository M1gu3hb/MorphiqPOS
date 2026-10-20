import { z } from 'zod';

/**
 * Validacion de las variables de entorno (F1.0-T12).
 *
 * `04-ARQUITECTURA §8`: "Validadas con zod al arrancar: **si falta una, el
 * proceso no inicia.** Nada de valores por defecto silenciosos."
 *
 * El criterio de aceptacion de la tarea dice por que importa: borrar una
 * variable tiene que producir "un error claro al arrancar, no un fallo
 * silencioso a las tres pantallas". Un `process.env.X ?? ''` que se propaga
 * hasta una consulta vacia es exactamente el fallo que este archivo impide.
 */

/** Longitud minima de un secreto. 32 bytes en base64url son 43 caracteres. */
const LARGO_MINIMO_SECRETO = 32;

/** Valores marcadores de `.env.example`. Sirven para copiar, no para arrancar. */
const MARCADORES = ['cambia-esto', 'cambiar', 'todo', 'xxx', 'placeholder'];

/**
 * URL http o https.
 *
 * `z.url()` sola NO basta: acepta `localhost:3000` porque lo interpreta como el
 * protocolo `localhost:`. Una direccion sin esquema en APP_URL produce enlaces
 * rotos en los tickets y en el portal QR — el tipo de fallo que aparece delante
 * de un cliente.
 *
 * Se valida con expresion regular y no con `new URL()` porque este paquete no
 * tiene los tipos de Node ni del DOM: `contracts` no depende de nada, y eso
 * incluye el entorno de ejecucion. La restriccion la impuso el compilador, y
 * esta bien que asi sea.
 */
const URL_HTTP = /^https?:\/\/[^\s/?#]+\S*$/;

const urlHttp = (nombre: string) =>
  z
    .string()
    .regex(
      URL_HTTP,
      `${nombre} debe ser una URL http o https completa, con esquema. Ejemplo: http://localhost:3000`,
    );

const secreto = (nombre: string, para: string) =>
  z
    .string()
    .min(
      LARGO_MINIMO_SECRETO,
      `${nombre} debe tener al menos ${LARGO_MINIMO_SECRETO} caracteres. ${para} ` +
        "Genera uno con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    )
    .refine(
      (valor) => !MARCADORES.some((marca) => valor.toLowerCase().includes(marca)),
      `${nombre} todavia tiene el valor de ejemplo de .env.example. ${para}`,
    );

export const esquemaEntorno = z.object({
  // --- Base de datos ---
  DATABASE_URL: z
    .string()
    .refine(
      (valor) => valor.startsWith('postgres://') || valor.startsWith('postgresql://'),
      'DATABASE_URL debe ser una URL de Postgres (postgres://…). MorphiqPOS no ' +
        'soporta otro motor: el modelo usa indices parciales unicos y triggers.',
    ),

  // --- Almacenamiento de archivos ---
  STORAGE_ENDPOINT: urlHttp('STORAGE_ENDPOINT'),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ACCESS_KEY: z.string().min(1),
  STORAGE_SECRET_KEY: z.string().min(1),

  // --- Secretos ---
  SESSION_SECRET: secreto('SESSION_SECRET', 'Firma las cookies de sesion del servidor.'),
  PIN_PEPPER: secreto(
    'PIN_PEPPER',
    'Es la pimienta del hash de los PIN de empleado (P0-01). Rotarla invalida ' +
      'TODOS los PIN y obliga a reenrolar a todo el mundo, asi que se fija una vez.',
  ),

  // --- Aplicacion ---
  APP_URL: urlHttp('APP_URL'),

  /**
   * LOS OTROS ORIGENES DESDE LOS QUE SE SIRVE ESTE MISMO DESPLIEGUE.
   *
   * Lista separada por comas, y OPCIONAL. `APP_URL` sigue siendo la direccion
   * canonica —la de los enlaces de un ticket, la del portal QR— y esto es solo
   * la lista de origenes que la frontera de escritura tambien acepta.
   *
   * ── El defecto que obliga a que esto exista ─────────────────────────────
   * La frontera de escritura compara el `Origin` del navegador contra `APP_URL`
   * y rechaza con 403 cualquier otro. Correcto contra CSRF, y a la vez: un
   * despliegue de Vercel se sirve SIEMPRE por su dominio `*.vercel.app` ademas
   * del dominio propio. Con `APP_URL` puesta al dominio propio —y su DNS
   * todavia sin configurar— la aplicacion contestaba 403 a TODA escritura
   * hecha desde la URL del despliegue, empezando por `/api/auth/entrar`: NADIE
   * podia ni entrar. Ninguna puerta lo vio, porque las suites corren con
   * `APP_URL=http://localhost:3200`, donde el origen siempre coincide.
   *
   * Lo encontro el rastreador la primera vez que alguien toco la aplicacion
   * desplegada de verdad.
   *
   * ── Por que una lista y no el Host de la peticion ────────────────────────
   * Porque el origen esperado tiene que nacer de la CONFIGURACION y nunca de la
   * peticion (R-17): leer el `Host` seria dejar que quien ataca lo declare. Una
   * lista la escribe quien despliega, igual que `ORGANIZACION`, que ya admite
   * varios negocios por la misma razon.
   */
  APP_URL_ALTERNAS: z.string().trim().optional(),

  /**
   * A que negocio sirve ESTE despliegue, por su `slug`.
   *
   * La pantalla de acceso ensena la lista de empleados ANTES de que exista
   * sesion, asi que el servidor tiene que saber de que organizacion son sin
   * preguntarle al navegador: quien elige la organizacion nunca es el cliente
   * (R16). Antes eso lo decia la terminal enrolada con un codigo de seis
   * digitos; ese codigo no lo pidio nadie y se ha retirado.
   *
   * Es OPCIONAL a proposito: si la base tiene UNA sola organizacion activa
   * —el caso de un negocio con su propio dominio— se resuelve sola. Con varias
   * y sin esta variable, el arranque falla diciendo cual falta, en vez de
   * elegir una por su cuenta.
   */
  ORGANIZACION: z.string().trim().min(1).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TZ: z.string().default('America/Mexico_City'),
});

export type Entorno = z.infer<typeof esquemaEntorno>;

/** Error de configuracion. No es un error de dominio: el proceso no puede seguir. */
export class ErrorDeEntorno extends Error {
  readonly problemas: readonly string[];

  constructor(problemas: readonly string[]) {
    super(
      [
        'La configuracion del entorno no es valida y el proceso no puede arrancar:',
        '',
        ...problemas.map((problema) => `  · ${problema}`),
        '',
        'Copia .env.example a .env y completalo. Ninguna variable tiene valor por',
        'defecto silencioso: un valor inventado aqui se convierte en un fallo raro',
        'tres pantallas despues (04-ARQUITECTURA §8).',
      ].join('\n'),
    );
    this.name = 'ErrorDeEntorno';
    this.problemas = problemas;
  }
}

/**
 * Valida y devuelve el entorno, o lanza `ErrorDeEntorno`.
 *
 * Se le pasa el objeto de variables a proposito, en vez de leer `process.env`
 * por dentro: asi se puede probar sin ensuciar el proceso.
 */
/** Un hostname completo y nada más: sin esquema, ruta, puerto ni comodín. */
const HOSTNAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * LOS ORÍGENES DE UN PREVIEW DE VERCEL (cierre del restaurante, 2.4).
 *
 * Un preview se sirve por el hostname de su despliegue y por el alias de su rama, y ninguno
 * está en `APP_URL_ALTERNAS`, que se escribe a mano: entrar contestaba 403 desde el preview y
 * verificarlo desde fuera exigía crear una variable por rama. Vercel inyecta esos dos
 * hostnames EXACTOS en `VERCEL_URL` y `VERCEL_BRANCH_URL`: son configuración de la plataforma
 * —quien despliega—, no el `Host` de la petición, así que R-17 se sostiene. Sólo cuentan con
 * `VERCEL_ENV=preview`: producción sigue con su lista escrita. Ni comodines ni esquemas: un
 * valor que no es un hostname completo se ignora.
 */
function origenesDelPreview(variables: Record<string, string | undefined>): string[] {
  if (variables['VERCEL_ENV'] !== 'preview') return [];
  return [variables['VERCEL_URL'], variables['VERCEL_BRANCH_URL']]
    .map((valor) => valor?.trim() ?? '')
    .filter((host) => HOSTNAME.test(host))
    .map((host) => `https://${host}`);
}

export function validarEntorno(variables: Record<string, string | undefined>): Entorno {
  const resultado = esquemaEntorno.safeParse(variables);

  if (!resultado.success) {
    const problemas = resultado.error.issues.map((incidencia) => {
      const donde = incidencia.path.join('.');
      return donde.length > 0 ? `${donde}: ${incidencia.message}` : incidencia.message;
    });
    throw new ErrorDeEntorno(problemas);
  }

  const delPreview = origenesDelPreview(variables);
  if (delPreview.length === 0) return resultado.data;
  const escritas = (resultado.data.APP_URL_ALTERNAS ?? '')
    .split(',')
    .map((valor) => valor.trim())
    .filter((valor) => valor.length > 0);
  return {
    ...resultado.data,
    APP_URL_ALTERNAS: [...new Set([...escritas, ...delPreview])].join(','),
  };
}
