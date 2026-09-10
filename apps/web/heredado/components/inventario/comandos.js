'use client';

/**
 * Lo que las pantallas de inventario, recetas y compras necesitan para hablar
 * con los comandos y que el puente de entidades no da.
 *
 * Son tres cosas, y las tres nacen del mismo cambio de fondo (F1-04 §14.3): el
 * stock dejó de ser una columna que se escribe y pasó a ser la proyección de un
 * ledger que vive en un ALMACÉN. Su frontend nunca supo que existían los
 * almacenes —no hay ni una mención en las 5 958 líneas de estas pantallas—,
 * así que hay que resolver cuál es antes de mandar un ajuste o un inventario
 * inicial.
 *
 * Nada de esto pinta nada: no hay ni una clase ni un texto visible aquí.
 */

/**
 * El id del almacén donde entra y sale la mercancía de esta sucursal.
 *
 * `inventario.ajustar` e `inventario.inicial` lo exigen (`entradaAjustarStock`,
 * `entradaInventarioInicial`) y el puente no expone la entidad `Almacen`: la
 * única puerta que lo publica es `GET /api/inventario/resumen`, que devuelve
 * los almacenes activos de la organización con el principal primero.
 *
 * NO se cachea a propósito. Un id de almacén guardado en memoria sobrevive a un
 * cambio de sesión —y con él, de organización— y lo que llegaría al comando
 * sería el almacén de otro negocio; el comando lo rechazaría con
 * «El insumo o almacén no existe», que es un mensaje imposible de entender
 * desde la pantalla. Quien lo llama lo resuelve UNA vez antes de su bucle, no
 * una vez por línea.
 */
export async function obtenerAlmacenPrincipalId() {
  const respuesta = await fetch('/api/inventario/resumen', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  // Mismo patrón que `api/cliente.ts:95`: si el cuerpo no es JSON, el `null`
  // cae directo en el `throw` de abajo. El fallo se propaga, no se traga.
  const cuerpo = await respuesta.json().catch(() => null);
  if (!cuerpo || cuerpo.ok !== true) {
    throw new Error(cuerpo?.error?.mensaje || 'No se pudo consultar el almacén de la sucursal.');
  }
  const almacenes = Array.isArray(cuerpo.datos?.almacenes) ? cuerpo.datos.almacenes : [];
  const principal = almacenes.find((a) => a?.principal) || almacenes[0];
  if (!principal?.id) {
    throw new Error('Esta sucursal no tiene un almacén donde registrar el inventario.');
  }
  return principal.id;
}

/**
 * Un número de la pantalla, como el decimal que exigen los esquemas.
 *
 * Todas las cantidades e importes de los comandos entran COMO TEXTO
 * (`/^\d{1,10}(?:\.\d{1,4})?$/`), nunca como `number`: es lo que impide que
 * `Math.round(1234.995 * 100)` se coma un centavo por línea. Y el redondeo a
 * cuatro decimales no es cosmético: `0.29 * 1000` en coma flotante da
 * 289.99999999999994, que el esquema rechazaría por tener catorce decimales.
 * Cuatro es exactamente lo que guarda `numeric(14,4)`.
 */
export function textoDecimal(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '0';
  // `toFixed(4)` siempre deja punto y cuatro cifras, así que el recorte de
  // ceros de la derecha nunca puede comerse un cero significativo: en «1500»
  // no hay punto que recortar porque aquí siempre es «1500.0000».
  const limpio = numero.toFixed(4).replace(/\.?0+$/, '');
  return limpio === '' || limpio === '-' ? '0' : limpio;
}

/**
 * Un costo por unidad base, con los dos decimales que admiten los comandos de
 * insumo (`entradaCrearInsumo.costoUnitario`, `entradaActualizarCostoInsumo`).
 *
 * Dos decimales de peso son UN centavo, y un centavo es exactamente lo que
 * guarda `insumos.costo_unitario_centavos`: es `bigint`, no admite fracciones.
 * Redondear aquí no pierde nada que la base fuera a conservar — el propio
 * `compras.registrar` redondea igual con `costoPorUnidad`.
 */
export function textoImporte(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return '0';
  return numero.toFixed(2);
}

/**
 * Una clave de idempotencia que sale del CONTENIDO, no del azar.
 *
 * El importador de CSV llama a un comando por fila: con una clave aleatoria,
 * reimportar el mismo archivo duplicaría el inventario entero. Con ésta, la
 * segunda pasada topa con la ejecución ya confirmada y el comando devuelve el
 * resultado de la primera sin volver a escribir (`comando.ts:137`).
 *
 * El contenido va DENTRO de la clave porque el registro de idempotencia se
 * resuelve por clave: dos filas distintas con la misma clave devolverían la
 * misma respuesta y la segunda no se guardaría nunca.
 */
export function claveDeContenido(prefijo, contenido) {
  const texto = typeof contenido === 'string' ? contenido : JSON.stringify(contenido);
  // FNV-1a de 32 bits. No es criptografía: es un identificador estable entre
  // dos ejecuciones del mismo archivo, y la longitud entra en la clave para
  // que dos textos distintos no colisionen sólo por el hash.
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefijo}-${texto.length.toString(36)}-${hash.toString(16).padStart(8, '0')}`;
}
