import { describe, expect, it } from 'vitest';

import { slugsConfigurados } from './despliegue.ts';

/**
 * UN DESPLIEGUE, LAS CINCO DEMOS (E3).
 *
 * `ORGANIZACION` es una variable del BUILD: la misma para todas las peticiones,
 * así que con un solo slug **un despliegue sólo puede servir a un negocio**. El
 * encargo pide lo contrario: «Miguel entra con el PIN de un negocio y ve ese
 * negocio. Entra con el de otro y ve el otro. Sin redesplegar.»
 *
 * El camino bueno es el HOST, y sigue ganando — pero necesita cinco registros de
 * DNS que hoy no existen. Así que `ORGANIZACION` admite una LISTA, y esto prueba
 * la parte que se puede probar sin base: qué slugs se van a buscar.
 *
 * Que cada slug EXISTA se comprueba contra la tabla, y que un empleo pertenezca a
 * uno de ellos se comprueba dentro de la consulta: son las dos mitades que esta
 * prueba no cubre, y están en `organizacionDeEmpleo`.
 */
describe('los slugs que ORGANIZACION puede llevar', () => {
  it('uno solo se comporta como siempre', () => {
    // Es producción. Si esto cambiara, cambiaría el negocio al que sirve el
    // despliegue de Miguel, que es lo único que hoy cobra de verdad.
    expect(slugsConfigurados('mh-restaurante')).toEqual(['mh-restaurante']);
  });

  it('varios, separados por comas, EN EL ORDEN ESCRITO', () => {
    // El orden importa: el primero encabeza la pantalla de acceso y es el que
    // las pruebas de extremo a extremo comparan como «el» negocio.
    expect(
      slugsConfigurados(
        'demo-acople-tienda,demo-acople-cafeteria,demo-acople-restaurante,' +
          'demo-acople-ferreteria,demo-acople-estetica',
      ),
    ).toEqual([
      'demo-acople-tienda',
      'demo-acople-cafeteria',
      'demo-acople-restaurante',
      'demo-acople-ferreteria',
      'demo-acople-estetica',
    ]);
  });

  it('los espacios y las comas de más no cuentan', () => {
    // Quien escribe cinco slugs en el panel de Vercel los separa con «, » y a
    // veces deja una coma al final. Eso no es un negocio vacío.
    expect(slugsConfigurados(' demo-acople-tienda , demo-acople-cafeteria , ')).toEqual([
      'demo-acople-tienda',
      'demo-acople-cafeteria',
    ]);
  });

  it('un slug repetido sale una vez', () => {
    // Repetido enseñaría a la misma gente dos veces en la pantalla de acceso.
    expect(slugsConfigurados('demo-acople-tienda,demo-acople-tienda')).toEqual([
      'demo-acople-tienda',
    ]);
  });

  it('las mayúsculas no cuentan: un slug es minúscula', () => {
    expect(slugsConfigurados('Demo-Acople-Tienda')).toEqual(['demo-acople-tienda']);
  });

  it('sin valor, la lista está vacía y quien llama cae a «la única activa»', () => {
    // No es lo mismo que una lista con un elemento vacío: sin `ORGANIZACION` el
    // despliegue usa la única organización activa si hay una sola, y falla
    // nombrando lo que falta si hay varias.
    expect(slugsConfigurados(undefined)).toEqual([]);
    expect(slugsConfigurados('')).toEqual([]);
    expect(slugsConfigurados('  ,  ,  ')).toEqual([]);
  });
});
