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
 * `z.url()` sola NO basta: acepta `localhost:3000` porque lo interpreta como
 * el protocolo `localhost:`. Y una direccion sin esquema en APP_URL produce
 * enlaces rotos en los tickets y en el portal QR, que es justo el tipo de fallo
 * que aparece delante de un cliente.
 */
const urlHttp = (nombre: string) =>
  z.string().refine((valor) => {
    try {
      const url = new URL(valor);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, `${nombre} debe ser una URL http o https completa, con esquema. Ejemplo: http://localhost:3000`);

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
export function validarEntorno(variables: Record<string, string | undefined>): Entorno {
  const resultado = esquemaEntorno.safeParse(variables);

  if (!resultado.success) {
    const problemas = resultado.error.issues.map((incidencia) => {
      const donde = incidencia.path.join('.');
      return donde.length > 0 ? `${donde}: ${incidencia.message}` : incidencia.message;
    });
    throw new ErrorDeEntorno(problemas);
  }

  return resultado.data;
}
