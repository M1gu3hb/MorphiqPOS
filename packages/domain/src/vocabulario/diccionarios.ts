import type { Diccionario, Termino } from './tipos.ts';

/**
 * F-017 · Los diccionarios por giro.
 *
 * Están aquí y no en cada pantalla porque el mismo botón —«Abrir mesa»— tiene
 * que decir «Abrir cabina» en una estética sin que nadie duplique el
 * componente. Duplicar por giro multiplicaría el mantenimiento por 78 y
 * garantizaría que las correcciones lleguen a unos giros sí y a otros no (D-04).
 */

function f(singular: string, plural: string): Termino {
  return { singular, plural, genero: 'femenino' };
}

function m(singular: string, plural: string): Termino {
  return { singular, plural, genero: 'masculino' };
}

/**
 * El diccionario BASE. Es el vocabulario neutro del que parten los demás, y el
 * que se usa cuando un giro no declara una entidad.
 *
 * No es «el de restaurante»: es el que no compromete a ningún giro. Un
 * diccionario base con vocabulario de restaurante haría que cualquier giro sin
 * traducir sonara a restaurante, que es exactamente el defecto que F-017 viene
 * a cerrar.
 */
export const DICCIONARIO_BASE: Diccionario = {
  unidad_servicio: f('unidad', 'unidades'),
  orden: f('orden', 'órdenes'),
  linea_orden: f('línea', 'líneas'),
  responsable: m('responsable', 'responsables'),
  cliente: m('cliente', 'clientes'),
  producto: m('producto', 'productos'),
};

/**
 * Los giros que existen hoy en `organizaciones.giro`.
 *
 * `estetica` NO está aquí todavía: su giro se añade con el arquetipo A3, en la
 * etapa que lo construye. Declararlo antes sería prometer un vocabulario para
 * un negocio que el sistema aún no sabe operar.
 */
export const DICCIONARIOS: Readonly<Record<string, Diccionario>> = {
  restaurante: {
    unidad_servicio: f('mesa', 'mesas'),
    orden: f('cuenta', 'cuentas'),
    linea_orden: m('platillo', 'platillos'),
    responsable: m('mesero', 'meseros'),
    cliente: m('comensal', 'comensales'),
    preparacion: f('cocina', 'cocinas'),
    producto: m('platillo', 'platillos'),
  },

  cafeteria: {
    // En mostrador no hay mesa: hay un pedido que espera de pie. La unidad de
    // servicio es el PEDIDO en la fila, y por eso `cafeteria` la traduce en vez
    // de apagarla — ver F-328 en la carpeta del modelo.
    unidad_servicio: m('pedido', 'pedidos'),
    orden: f('cuenta', 'cuentas'),
    linea_orden: f('bebida', 'bebidas'),
    responsable: m('barista', 'baristas'),
    cliente: m('cliente', 'clientes'),
    preparacion: f('barra', 'barras'),
    producto: m('producto', 'productos'),
  },

  tienda: {
    // Una tienda no tiene unidad de servicio ni preparación: se apagan. No
    // aparecen en este objeto A PROPÓSITO (regla 3).
    orden: f('venta', 'ventas'),
    linea_orden: f('partida', 'partidas'),
    responsable: m('cajero', 'cajeros'),
    cliente: m('cliente', 'clientes'),
    producto: m('producto', 'productos'),
  },

  ferreteria: {
    // La carpeta de `ferreteria` levantó esto como defecto propio: «artículo
    // donde debe decir material, producto donde debe decir pieza». Mismo
    // plantilla que `tienda`, distinto vocabulario — que es la razón por la que
    // el diccionario se teclea por giro y no por plantilla.
    orden: f('nota', 'notas'),
    linea_orden: f('partida', 'partidas'),
    responsable: m('mostradorista', 'mostradoristas'),
    cliente: m('cliente', 'clientes'),
    producto: m('material', 'materiales'),
  },

  farmacia: {
    orden: f('venta', 'ventas'),
    linea_orden: f('partida', 'partidas'),
    responsable: m('dependiente', 'dependientes'),
    cliente: m('paciente', 'pacientes'),
    producto: m('medicamento', 'medicamentos'),
  },
};
