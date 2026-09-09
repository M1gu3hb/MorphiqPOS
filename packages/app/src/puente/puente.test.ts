import { describe, expect, it } from 'vitest';

import { CONFIG_POR_OMISION, PUBLICOS } from './configuracion.ts';
import { MAPA } from './mapa.ts';
import { haciaEl, haciaLaBase, LIMITE_MAXIMO, type Conversion } from './tipos.ts';

/**
 * La prueba de IDA Y VUELTA del puente (E3-6).
 *
 * «Se construye un objeto con la forma vieja, se traduce, y debe volver
 * idéntico. Sin esa prueba, un campo mal mapeado rompe una pantalla en
 * silencio.» Y no rompe con un error: rompe con un precio que trae dos ceros de
 * más en un ticket, seis meses después, cuando ya nadie recuerda por qué.
 *
 * Aquí se prueba la CONVERSIÓN y la FORMA del mapa, que es lo que se puede
 * comprobar sin base. El viaje completo contra Postgres —escribir, leer y
 * comparar— vive en las pruebas de integración.
 */

/** Un valor representativo por cada tipo de conversión. */
const MUESTRAS: Readonly<Record<Conversion, readonly unknown[]>> = {
  texto: ['Panini caprese', '', 'Café con leche · 12 oz'],
  entero: [0, 1, 42, -7],
  // Los que más duelen si el redondeo falla.
  dinero: [0, 1, 45.5, 45.55, 0.01, 115, 1234.99, 99999.99],
  decimal: [0, 0.5, 1.25, 250, 1000.125],
  puntos_base: [0, 8, 16, 16.5, 35],
  booleano: [true, false],
  fecha: ['2026-09-09T18:30:00.000Z'],
  dia: ['2026-09-09'],
  json: [{ a: 1 }, [1, 2, 3]],
};

describe('el puente traduce sin perder nada', () => {
  for (const [conversion, valores] of Object.entries(MUESTRAS) as [Conversion, unknown[]][]) {
    it(`«${conversion}» cierra el círculo`, () => {
      for (const original of valores) {
        const enLaBase = haciaLaBase(original, conversion);
        const devuelto = haciaEl(enLaBase, conversion);
        if (conversion === 'json') {
          expect(devuelto).toStrictEqual(original);
        } else if (conversion === 'texto' || conversion === 'dia') {
          expect(devuelto).toBe(original);
        } else if (conversion === 'fecha') {
          expect(devuelto).toBe(original);
        } else {
          expect(devuelto).toBe(original);
        }
      }
    });
  }

  it('el dinero se guarda en centavos ENTEROS', () => {
    // `45.55 * 100` en coma flotante da 4554.999…, y sin el redondeo un
    // producto de 45.55 se guardaría a 45.54. Nadie lo notaría hasta el corte.
    expect(haciaLaBase(45.55, 'dinero')).toBe(4555n);
    expect(haciaLaBase(0.07, 'dinero')).toBe(7n);
    expect(haciaLaBase(1234.995, 'dinero')).toBe(123500n);
  });

  it('el nulo sigue siendo nulo en los dos sentidos', () => {
    for (const conversion of Object.keys(MUESTRAS) as Conversion[]) {
      expect(haciaEl(null, conversion)).toBeNull();
      expect(haciaLaBase(null, conversion)).toBeNull();
      expect(haciaEl(undefined, conversion)).toBeNull();
    }
  });

  it('un objeto convertido a texto no se vuelve «[object Object]»', () => {
    expect(haciaLaBase({ x: 1 }, 'texto')).toBe('{"x":1}');
  });
});

describe('la forma del mapa', () => {
  it('ninguna entidad declara dos campos suyos sobre la misma columna', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      const columnas = Object.values(mapa.campos).map((c) => c.columna);
      // Dos campos apuntando a la misma columna es un error de copiar y pegar
      // que sólo se ve cuando uno pisa al otro al guardar.
      expect(new Set(columnas).size, `${entidad} repite una columna`).toBe(columnas.length);
    }
  });

  it('toda entidad trae `id`: su frontend lo lee siempre', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      expect(Object.keys(mapa.campos), `${entidad} sin id`).toContain('id');
    }
  });

  it('los tres campos automáticos nunca se aceptan del cliente', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      for (const clave of ['id', 'created_date', 'updated_date']) {
        const campo = mapa.campos[clave];
        if (campo === undefined) continue;
        expect(campo.escribible, `${entidad}.${clave}`).toBe(false);
      }
    }
  });

  it('el orden por omisión existe como campo', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      if (mapa.ordenPorOmision === undefined) continue;
      const clave = mapa.ordenPorOmision.replace(/^-/, '');
      expect(Object.keys(mapa.campos), `${entidad} ordena por un campo que no tiene`).toContain(
        clave,
      );
    }
  });

  /**
   * Las reglas 1 y 11 de `F1-01` §3, afirmadas sobre el USO y no sobre el
   * nombre: si alguien vuelve escribible el total de una venta, el servidor
   * dejaría de ser quien decide cuánto se cobra.
   */
  it('ningún importe de una venta se acepta del cliente', () => {
    for (const entidad of ['Venta', 'DetalleVenta'] as const) {
      const mapa = MAPA[entidad];
      expect(mapa).toBeDefined();
      for (const [clave, campo] of Object.entries(mapa?.campos ?? {})) {
        if (campo.conversion !== 'dinero' && campo.conversion !== 'puntos_base') continue;
        expect(campo.escribible, `${entidad}.${clave} se puede escribir desde el cliente`).toBe(
          false,
        );
      }
    }
  });

  it('las entidades transaccionales no se escriben por el puente', () => {
    // Las catorce operaciones de `F1-01` §6 tienen su comando. Escribir una
    // venta campo por campo desde el navegador es el defecto D-07.
    for (const entidad of [
      'Venta',
      'DetalleVenta',
      'MovimientoInventario',
      'CorteCaja',
      'RecetaEscandallo',
    ] as const) {
      expect(MAPA[entidad]?.escritura, entidad).toBe('comando');
    }
  });

  it('el tope de filas existe y no es absurdo', () => {
    expect(LIMITE_MAXIMO).toBeGreaterThan(0);
    expect(LIMITE_MAXIMO).toBeLessThanOrEqual(1000);
  });
});

describe('la lista blanca del portal QR cierra la fuga D-14', () => {
  it('no deja salir la contraseña de presentación', () => {
    expect(PUBLICOS as readonly string[]).not.toContain('presentacion_password');
  });

  it('no deja salir el paquete ni si se muestran costos a caja', () => {
    for (const prohibido of ['paquete_modo', 'mostrar_costos_a_caja', 'modo_presentacion_activo']) {
      expect(PUBLICOS as readonly string[], prohibido).not.toContain(prohibido);
    }
  });

  it('todo lo público existe en la configuración', () => {
    for (const campo of PUBLICOS) {
      expect(Object.keys(CONFIG_POR_OMISION), campo).toContain(campo);
    }
  });

  it('deja salir lo justo para que el menú se vea del negocio', () => {
    for (const necesario of ['nombre_negocio', 'logo_url', 'color_primario', 'simbolo_moneda']) {
      expect(PUBLICOS as readonly string[], necesario).toContain(necesario);
    }
  });
});
