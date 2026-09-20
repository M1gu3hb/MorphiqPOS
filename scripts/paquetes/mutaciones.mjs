/** Mutaciones del selector de paquete (F1.1-C-15). */

const RECETAS = 'packages/app/src/inventario/recetas.ts';
const CARRITO = 'packages/app/src/venta/carrito.ts';
const MESAS = 'packages/app/src/restaurante/mesas.ts';

export const contraContratos = [
  {
    nombre: 'volver a escribir la lista de paquetes a mano',
    ruta: CARRITO,
    contrato: 'ningun_comando_escribe_la_lista_a_mano',
    antes: 'paquetes: PAQUETES_MOSTRADOR,',
    despues: "paquetes: ['tienda', 'cafeteria', 'restaurante'],",
  },
];

/**
 * Abrir las MESAS a las tres plantillas.
 *
 * ── Por qué mesas y ya no recetas ───────────────────────────────
 * Esta mutación era «abrir recetas a todos los paquetes», y con el renombre de
 * D-01 dejó de ser destructiva: `MODULOS_POR_PLANTILLA` le da a `tienda` el
 * bloque de operación entero, recetas incluidas, así que abrir recetas a las
 * tres plantillas es AHORA lo correcto. Una mutación que ya no rompe nada no
 * es una prueba superada: es una prueba que hay que sustituir, porque el arnés
 * dejaría de vigilar lo que decía vigilar.
 *
 * Lo que sigue estando cerrado por plantilla —y es lo que de verdad hay que
 * proteger— es la SALA: mesas, mesero y cocina sólo existen en `restaurante`.
 * Abrirlas a las tres es exactamente el arreglo que alguien haría para «quitar»
 * un 403 en una tienda, y la prueba tiene que ponerse roja.
 */
export const contraPruebas = [
  {
    nombre: 'abrir las mesas a todas las plantillas',
    ruta: MESAS,
    // Se cambia también el import para que la mutación COMPILE. Si sólo se
    // cambiara el uso, el módulo no cargaría y la suite se pondría roja por el
    // ReferenceError — que es una señal mucho más débil: probaría que el
    // compilador lo caza, no que la prueba lo caza.
    // El import va en `antes` y la declaración en `tambien`, no al revés:
    // `antes` sustituye la PRIMERA aparición y `tambien` sustituye TODAS.
    // Mesas declara dos comandos, así que al revés quedaba uno mutado y otro
    // apuntando a un identificador que ya no existía.
    antes: "import { ErrorDominio, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';",
    despues: "import { ErrorDominio, PAQUETES } from '@morphiqpos/contracts';",
    tambien: [['paquetes: PAQUETES_RESTAURANTE,', 'paquetes: PAQUETES,']],
  },
];

export const inocuas = [
  {
    nombre: 'una línea en blanco de más en recetas',
    ruta: RECETAS,
    antes: 'export const guardarReceta',
    despues: '\nexport const guardarReceta',
  },
];
