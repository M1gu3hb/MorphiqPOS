import { z } from 'zod';

/**
 * Las entradas de los cinco comandos públicos.
 *
 * ── Lo que NINGUNA declara ────────────────────────────────────────────────
 * Un precio. Ni `precio`, ni `precio_venta`, ni `subtotal`, ni `total`. El
 * comensal dice QUÉ quiere y CUÁNTO quiere; lo que cuesta lo decide el catálogo
 * dentro de la transacción. Y no es sólo que no se lean: `validar()` aplica
 * `strict()`, así que una propiedad que estos esquemas no declaran **rechaza la
 * petición entera** en vez de ignorarse. Es la diferencia entre «no lo usamos»
 * y «no entra», y es lo que impide que mañana alguien lo lea «porque ya venía
 * en el objeto» — el defecto P0-07, y la mitad de D-17.
 *
 * ── Por qué hay topes en todo ─────────────────────────────────────────────
 * Esto lo llama un desconocido. Un carrito de diez mil líneas o una nota de un
 * megabyte no son casos de uso: son la forma barata de tumbar la cocina.
 */

/** Hasta 999.9999 unidades. Cuatro decimales es la escala de `numeric(14,4)`. */
const CANTIDAD = /^\d{1,3}(?:\.\d{1,4})?$/;

const MAXIMO_LINEAS = 40;
const MAXIMO_PERSONAS = 50;
const MAXIMO_NOTA = 300;
const MAXIMO_COMENTARIO = 500;
const MAXIMO_NOMBRE = 80;

const cantidadPedida = z
  .string()
  .regex(CANTIDAD, 'La cantidad no es válida.')
  .refine((valor) => BigInt(valor.replace('.', '')) !== 0n, 'La cantidad debe ser mayor que cero.');

const notaCorta = z.string().trim().max(MAXIMO_NOTA).default('');

/** Los tres del FAB de atención (`qrUtils.js:31-35`). */
export const entradaCrearSolicitud = z.object({
  tipo: z.enum(['ordenar', 'cuenta', 'ayuda']),
});

export const entradaAbrirMesa = z.object({
  personas: z.number().int().min(1).max(MAXIMO_PERSONAS),
  clienteNombre: z.string().trim().max(MAXIMO_NOMBRE).default(''),
  notas: notaCorta,
  /** Información de seguridad: viaja primero y en instantánea (regla 9). */
  notasAlergias: notaCorta,
  celebracionEspecial: z.boolean().default(false),
  tipoCelebracion: z.string().trim().max(MAXIMO_NOMBRE).default(''),
});

/**
 * La línea del carrito, ESTRICTA a propósito.
 *
 * `validar()` aplica `strict()` sólo al objeto RAÍZ; los anidados se quedan con
 * el comportamiento por omisión de zod, que descarta en silencio lo que no
 * declaran. Aquí eso no basta: un `precio_venta` dentro de un item se
 * descartaría sin que nadie se entere, y «se ignoró» es una garantía más débil
 * que «no entró». Con `strict()` la petición entera se rechaza y el comensal ve
 * un error, que es lo que hay que ver cuando alguien manipula el carrito.
 */
const itemDelCarrito = z
  .object({
    productoId: z.uuid(),
    cantidad: cantidadPedida,
    notas: notaCorta,
  })
  .strict();

export const entradaEnviarPedido = z.object({
  items: z.array(itemDelCarrito).min(1).max(MAXIMO_LINEAS),
  notaGeneral: notaCorta,
});

/**
 * La propina que elige el comensal.
 *
 * **`monto_manual` no está**, y no es un olvido: `ordenes` no tiene columna
 * donde guardar un importe de propina —sólo `propina_puntos_base`— y `pagos`
 * la recibe hasta el cobro. Inventar la columna no me toca. Queda anotado en
 * el informe; mientras tanto, el comensal elige porcentaje, nada, o decidir en
 * la caja, que es lo que la base sabe representar hoy.
 */
export const entradaPedirCuenta = z.object({
  propinaTipo: z.enum(['sin_propina', 'porcentaje', 'decidir_en_caja']),
  /** Sólo se usa con `porcentaje`; el importe lo calcula el servidor. */
  propinaPorcentaje: z.number().int().min(0).max(100).default(0),
});

export const entradaValorar = z.object({
  score: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(MAXIMO_COMENTARIO).default(''),
});
