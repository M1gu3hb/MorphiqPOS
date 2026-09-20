import { GIROS } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { DICCIONARIOS } from './diccionarios.ts';
import { crearVocabulario } from './vocabulario.ts';

/**
 * F-017 · `GIROS` y las claves de `DICCIONARIOS` son LA MISMA LISTA.
 *
 * ── Por qué hace falta un contrato para esto ───────────────────────────────
 * Porque nada en el código lo obliga. `DICCIONARIOS` es un
 * `Record<string, Diccionario>` y tiene que serlo —`crearVocabulario` recibe el
 * giro como `string` porque la columna de la base es texto y puede traer
 * cualquier cosa—, así que añadir un giro en `ambito.ts` y olvidar su
 * diccionario COMPILA, pasa el typecheck y no rompe ninguna pantalla. Lo que
 * hace es peor: el negocio nuevo cae al vocabulario BASE y dice «unidad»,
 * «orden» y «cliente» en todas las pantallas. Nadie lo reporta como defecto; sólo
 * se siente prestado. `farmacia` está hoy en los dos lados por disciplina, no
 * por una regla.
 *
 * Y la dirección contraria importa igual: un diccionario cuyo giro no existe es
 * vocabulario que NINGUNA organización puede pedir, porque
 * `organizaciones_giro_check` no deja escribir ese valor en la columna. Se
 * escribe, se revisa, se mantiene — y no lo lee nadie.
 *
 * Las palabras de más abajo están tecleadas A MANO desde la tabla de
 * `04-INTERFAZ.md §4.1`, y NO se derivan de `DICCIONARIOS`. Es deliberado: una
 * prueba que afirma contra la misma constante que produce el valor no prueba
 * nada —se cambia el diccionario, cambian las dos, y sigue verde—.
 */

/** Las claves del objeto, que son los giros que saben hablar. */
const CON_DICCIONARIO = Object.keys(DICCIONARIOS);

describe('F-017 · ningún giro se queda sin diccionario, ni al revés', () => {
  it('las dos listas se leyeron: si una saliera vacía, lo de abajo pasaría solo', () => {
    // El fallo clásico de un contrato de comparación: el extractor devuelve un
    // conjunto vacío y las dos afirmaciones siguientes se cumplen sin mirar nada.
    expect(GIROS.length).toBeGreaterThan(0);
    expect(CON_DICCIONARIO.length).toBeGreaterThan(0);
  });

  it('cada giro de `GIROS` tiene su diccionario', () => {
    const mudos = GIROS.filter((giro) => DICCIONARIOS[giro] === undefined);

    expect(
      mudos,
      `Estos giros existen y no saben hablar: ${mudos.join(', ')}. Caen al DICCIONARIO_BASE, ` +
        'así que sus pantallas dicen «unidad», «orden» y «cliente» — el defecto exacto que ' +
        'F-017 existe para cerrar. Se declaran en packages/domain/src/vocabulario/diccionarios.ts.',
    ).toEqual([]);
  });

  it('cada diccionario pertenece a un giro de `GIROS`', () => {
    const giros: readonly string[] = GIROS;
    const huerfanos = CON_DICCIONARIO.filter((clave) => !giros.includes(clave));

    expect(
      huerfanos,
      `Estos diccionarios no tienen giro: ${huerfanos.join(', ')}. Ninguna organización puede ` +
        'pedirlos: `organizaciones_giro_check` no deja escribir ese valor en la columna, así ' +
        'que es vocabulario que nadie va a ver. Añade el giro a GIROS ' +
        '(packages/contracts/src/comandos/ambito.ts) o quita el diccionario.',
    ).toEqual([]);
  });
});

describe('F-017 · el diccionario de `estetica` (04-INTERFAZ §4.1)', () => {
  it('habla como una estética: estación, cita, servicio, estilista, clienta', () => {
    const v = crearVocabulario('estetica');

    // Nunca «mesa»: es la primera línea de la tabla del modelo.
    expect(v.singular('unidad_servicio')).toBe('estación');
    expect(v.plural('unidad_servicio')).toBe('estaciones');
    // Nunca «cuenta» ni «ticket» en la agenda. El walk-in también es una cita.
    expect(v.singular('orden')).toBe('cita');
    expect(v.plural('orden')).toBe('citas');
    // Lo que se vende es un servicio, no un producto ni un platillo.
    expect(v.singular('linea_orden')).toBe('servicio');
    expect(v.singular('responsable')).toBe('estilista');
    // Y el del anaquel sigue siendo «producto»: la tabla lo declara así.
    expect(v.singular('producto')).toBe('producto');
  });

  it('`cliente` es FEMENINO por omisión: «la clienta», nunca «el clienta»', () => {
    // §4.1.1, textual: «"el clienta llegó" delata el sistema en el primer
    // segundo. Y en este giro el 90% son mujeres, así que el valor por omisión
    // tiene que ser femenino y la excepción tiene que funcionar».
    const v = crearVocabulario('estetica');

    expect(v.singular('cliente')).toBe('clienta');
    expect(v.plural('cliente')).toBe('clientas');
    expect(v.conArticulo('cliente')).toBe('La clienta');
    expect(v.conArticulo('cliente', true)).toBe('Las clientas');
    // El estado vacío, que es donde más se nota el descuido (regla 4).
    expect(v.conNumero('cliente', 1)).toBe('1 clienta');
    expect(v.conNumero('cliente', 0)).toBe('0 clientas');
  });

  it('la excepción del género sigue funcionando desde la ficha del negocio', () => {
    // La regla de §4.1.1 es «femenino por omisión, masculino si la ficha dice
    // hombre». Lo segundo NO se resuelve invirtiendo el diccionario: se resuelve
    // con la personalización, que es la que pisa al giro.
    const conFicha = crearVocabulario('estetica', {
      cliente: { singular: 'cliente', plural: 'clientes', genero: 'masculino' },
    });

    expect(conFicha.conArticulo('cliente')).toBe('El cliente');
  });

  it('NO declara `preparacion`: la entidad está apagada, no traducida', () => {
    // Regla 3: «si un giro no usa una entidad, no se traduce: se apaga». Un
    // salón no tiene cocina ni barra.
    //
    // La mutación que esto caza es la que va a ocurrir de verdad: arrancar otro
    // giro de servicios copiando el bloque de `cafeteria`, que trae
    // `preparacion: f('barra', 'barras')` dentro. El menú de Miguel traduce esa
    // entidad (`/cocina`, `entidad: 'preparacion'`), así que el copia-pega le
    // pone una barra a un salón.
    expect(Object.keys(DICCIONARIOS['estetica'] ?? {})).not.toContain('preparacion');

    // El segundo cerrojo, y dice lo que ve la pantalla. Hoy sólo puede fallar si
    // falla el de arriba —un giro que existe apaga lo que no declara— y se
    // conserva porque es la propiedad que de verdad importa: que el resolutor
    // devuelva vacío y no un nombre neutro que el menú pintaría igual.
    const v = crearVocabulario('estetica');
    expect(v.usa('preparacion')).toBe(false);
    expect(v.singular('preparacion')).toBe('');
    expect(v.conArticulo('preparacion')).toBe('');
  });
});
