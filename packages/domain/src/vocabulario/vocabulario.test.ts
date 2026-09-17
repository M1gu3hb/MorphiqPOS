import { GIROS } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { crearVocabulario } from './vocabulario.ts';

/**
 * F-017 · El vocabulario del giro.
 *
 * Lo que estas pruebas vigilan, y por qué cada una:
 *   1. que el MISMO plantilla hable distinto según el giro — es el defecto que
 *      encontró `ferreteria` y la razón de que el diccionario no viva en la
 *      plantilla;
 *   2. que el GÉNERO se conjugue, porque «el bahía» delata el sistema;
 *   3. que una entidad apagada se quede apagada en vez de caer a un nombre
 *      neutro que la pantalla enseñaría igual;
 *   4. que el singular y el plural se elijan por el número, que es donde nacen
 *      los «1 mesas» de los estados vacíos.
 */

describe('F-017 · el giro decide cómo habla el sistema', () => {
  it('Don Chuy y La Broca comparten plantilla y NO comparten vocabulario', () => {
    // Los dos están en la plantilla `tienda` tras el renombre de D-01. Si el
    // diccionario viviera en la plantilla —como decía D-04— los dos dirían
    // «producto», y la carpeta de ferretería levantó justo eso como defecto.
    expect(crearVocabulario('tienda').singular('producto')).toBe('producto');
    expect(crearVocabulario('ferreteria').singular('producto')).toBe('material');
    expect(crearVocabulario('ferreteria').plural('producto')).toBe('materiales');
  });

  it('cada giro nombra su unidad de servicio, o la apaga', () => {
    expect(crearVocabulario('restaurante').singular('unidad_servicio')).toBe('mesa');
    expect(crearVocabulario('cafeteria').singular('unidad_servicio')).toBe('pedido');
    // Una tienda no tiene unidad de servicio. NO se traduce: se apaga.
    expect(crearVocabulario('tienda').usa('unidad_servicio')).toBe(false);
    expect(crearVocabulario('ferreteria').usa('unidad_servicio')).toBe(false);
  });

  it('una entidad apagada devuelve vacío, no un nombre neutro', () => {
    // Si devolviera «unidad», la pantalla la enseñaría como si existiera y el
    // botón «Abrir unidad» aparecería en una ferretería.
    const tienda = crearVocabulario('tienda');
    expect(tienda.singular('unidad_servicio')).toBe('');
    expect(tienda.articulo('unidad_servicio')).toBe('');
    expect(tienda.conArticulo('unidad_servicio')).toBe('');
    expect(tienda.termino('preparacion')).toBeNull();
  });
});

describe('F-017 · el género, que es lo que delata a un sistema prestado', () => {
  it('conjuga el artículo por género y número', () => {
    const rest = crearVocabulario('restaurante');
    expect(rest.conArticulo('unidad_servicio')).toBe('La mesa');
    expect(rest.conArticulo('unidad_servicio', true)).toBe('Las mesas');
    expect(rest.conArticulo('cliente')).toBe('El comensal');
    expect(rest.conArticulo('cliente', true)).toBe('Los comensales');
  });

  it('un término femenino nunca sale con artículo masculino', () => {
    // «El mesa» y «el cabina» son el error que se nota en tres segundos.
    //
    // Los giros se recorren desde `GIROS` y no tecleados aquí: así un giro nuevo
    // entra en esta comprobación el día que se declara, y no el día que alguien
    // se acuerda de venir a añadirlo a esta lista.
    for (const giro of GIROS) {
      const v = crearVocabulario(giro);
      for (const entidad of ['unidad_servicio', 'orden', 'linea_orden', 'cliente'] as const) {
        const t = v.termino(entidad);
        if (t === null) continue;
        const esperado = t.genero === 'femenino' ? 'la' : 'el';
        expect(v.articulo(entidad), `${giro}.${entidad}`).toBe(esperado);
      }
    }
  });
});

describe('F-017 · errores y estados vacíos (regla 4)', () => {
  it('el número elige singular o plural', () => {
    const rest = crearVocabulario('restaurante');
    expect(rest.conNumero('unidad_servicio', 1)).toBe('1 mesa');
    expect(rest.conNumero('unidad_servicio', 3)).toBe('3 mesas');
    // El estado vacío: «0 mesas», no «0 mesa».
    expect(rest.conNumero('unidad_servicio', 0)).toBe('0 mesas');
  });

  it('con la entidad apagada, el número sale solo y sin palabra suelta', () => {
    expect(crearVocabulario('tienda').conNumero('unidad_servicio', 4)).toBe('4');
  });

  it('el mismo mensaje se lee bien en los cinco giros', () => {
    // Éste es el uso real: una plantilla de mensaje, cinco lecturas correctas.
    const mensaje = (giro: string): string => {
      const v = crearVocabulario(giro);
      return v.usa('unidad_servicio')
        ? `No se pudo abrir ${v.articulo('unidad_servicio')} ${v.singular('unidad_servicio')}.`
        : 'No se pudo abrir la venta.';
    };
    expect(mensaje('restaurante')).toBe('No se pudo abrir la mesa.');
    expect(mensaje('cafeteria')).toBe('No se pudo abrir el pedido.');
    expect(mensaje('tienda')).toBe('No se pudo abrir la venta.');
  });
});

describe('F-017 · personalización por negocio', () => {
  it('lo que el negocio cambió a mano pisa al diccionario del giro', () => {
    const suyo = crearVocabulario('restaurante', {
      unidad_servicio: { singular: 'tablón', plural: 'tablones', genero: 'masculino' },
    });
    expect(suyo.conArticulo('unidad_servicio')).toBe('El tablón');
    // Y lo que NO personalizó sigue viniendo del giro.
    expect(suyo.singular('responsable')).toBe('mesero');
  });

  it('un giro desconocido cae al diccionario base y NO apaga nada', () => {
    // Un giro que todavía no tiene diccionario —los 73 que faltan— tiene que
    // seguir enseñando pantallas. Apagarlo todo las dejaría en blanco.
    const nuevo = crearVocabulario('taller-mecanico');
    expect(nuevo.singular('orden')).toBe('orden');
    expect(nuevo.singular('cliente')).toBe('cliente');
    expect(nuevo.usa('orden')).toBe(true);
  });

  it('el diccionario base NO suena a restaurante', () => {
    // Si la base dijera «mesa» y «comensal», los 73 giros sin traducir sonarían
    // a restaurante, que es exactamente el defecto que F-017 viene a cerrar.
    const base = crearVocabulario('giro-que-no-existe');
    expect(base.singular('unidad_servicio')).not.toBe('mesa');
    expect(base.singular('cliente')).not.toBe('comensal');
    expect(base.singular('responsable')).not.toBe('mesero');
  });
});
