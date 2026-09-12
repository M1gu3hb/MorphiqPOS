/** Mutaciones del selector de paquete (F1.1-C-15). */

const RECETAS = 'packages/app/src/inventario/recetas.ts';
const CARRITO = 'packages/app/src/venta/carrito.ts';

export const contraContratos = [
  {
    nombre: 'volver a escribir la lista de paquetes a mano',
    ruta: CARRITO,
    contrato: 'ningun_comando_escribe_la_lista_a_mano',
    antes: 'paquetes: PAQUETES_MOSTRADOR,',
    despues: "paquetes: ['esencial', 'operativo', 'restaurante_pro'],",
  },
];

/**
 * Abrir recetas a los cinco paquetes.
 *
 * Es el arreglo que alguien haría para "quitar" un 403 en una ferretería, y la
 * prueba tiene que ponerse roja. Si en vez de con el comando real la prueba
 * usara uno de juguete definido dentro del test, esta mutación sobreviviría.
 */
export const contraPruebas = [
  {
    nombre: 'abrir recetas a todos los paquetes',
    ruta: RECETAS,
    // Se cambia también el import para que la mutación COMPILE. Si sólo se
    // cambiara el uso, el módulo no cargaría y la suite se pondría roja por el
    // ReferenceError — que es una señal mucho más débil: probaría que el
    // compilador lo caza, no que la prueba lo caza.
    // El import va en `antes` y la declaración en `tambien`, no al revés:
    // `antes` sustituye la PRIMERA aparición y `tambien` sustituye TODAS.
    // Recetas declara dos comandos, así que al revés quedaba uno mutado y otro
    // apuntando a un identificador que ya no existía.
    antes: "import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';",
    despues: "import { ErrorDominio, PAQUETES } from '@morphiqpos/contracts';",
    tambien: [['paquetes: PAQUETES_OPERATIVOS,', 'paquetes: PAQUETES,']],
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
