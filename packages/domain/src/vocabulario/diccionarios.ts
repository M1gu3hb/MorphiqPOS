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
 * Las claves son EXACTAMENTE las de `GIROS`
 * (`packages/contracts/src/comandos/ambito.ts`), y un contrato lo ata en las DOS
 * direcciones: un giro sin diccionario habla con el vocabulario base —suena a
 * cualquier negocio, que es el defecto que F-017 viene a cerrar— y un
 * diccionario sin giro es vocabulario que ninguna organización puede pedir,
 * porque el `check` de la columna no deja escribir ese valor.
 *
 * `estetica` ya está. Aquí decía que su giro llegaba «con el arquetipo A3, en la
 * etapa que lo construye» y que declararlo antes sería prometer un vocabulario
 * para un negocio que el sistema aún no sabía operar. Esa etapa es ésta: la
 * migración 164 abre el `check` de la columna y las doce pantallas del modelo
 * están en pie, así que el vocabulario ya no promete nada — lo entrega.
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

  // El vocabulario está tecleado desde la tabla de `04-INTERFAZ.md §4.1` del
  // modelo, que lo documenta hasta el género. Lo heredan los once modelos de
  // «servicios con cita», y por eso cada palabra que se cambie aquí se cambia
  // para once negocios distintos.
  estetica: {
    // Nunca «mesa». En barbería es *silla* y en spa es *cabina*: la palabra final
    // la elige la dueña con la personalización del negocio (`vocabulario_negocio`,
    // migración 059). Lo que se declara aquí es la del salón.
    unidad_servicio: f('estación', 'estaciones'),
    // El walk-in también es una cita. Nunca «cuenta» ni «ticket» en la agenda:
    // la agenda es lo que se abre cuarenta veces al día.
    orden: f('cita', 'citas'),
    // Lo que se vende es un SERVICIO. «Producto» es lo del anaquel y «platillo»
    // no existe aquí.
    linea_orden: m('servicio', 'servicios'),
    // La tabla dice «m/f · el/la» y no fija un valor por omisión, y `Genero`
    // admite uno solo: se queda el del diccionario base. La palabra que de
    // verdad manda —*barbero*, *manicurista*, *terapeuta*— la elige la dueña al
    // configurar, que es el mecanismo que la propia tabla nombra.
    responsable: m('estilista', 'estilistas'),
    // FEMENINO POR OMISIÓN, y es la decisión que este modelo puso sobre la mesa
    // (§4.1.1): *«el clienta llegó» delata el sistema en el primer segundo, y en
    // este giro el 90 % son mujeres*. El masculino es la excepción y sale de la
    // ficha de la persona, no de invertir este valor.
    cliente: f('clienta', 'clientas'),
    producto: m('producto', 'productos'),
    // `preparacion` NO aparece A PROPÓSITO: un salón no tiene cocina ni barra, y
    // una entidad que el giro no usa se APAGA, no se traduce a cadena vacía
    // (regla 3). Es lo primero que hay que borrar el día que alguien arranque
    // otro giro de servicios copiando el bloque de `cafeteria`.
  },
};
