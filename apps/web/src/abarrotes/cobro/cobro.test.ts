import { describe, expect, it } from 'vitest';

import { tonosDe } from '~/cliente/pitido';

import {
  armarCatalogo,
  lineasDeRetomada,
  presentacionDeCobro,
  productoDeCobro,
} from './catalogo.ts';
import {
  cantidadDelImporte,
  layoutDeLaConfiguracion,
  resolverCodigo,
  type Catalogo,
} from './escaneo.ts';
import {
  conCantidad,
  conGranel,
  conPresentacion,
  conProducto,
  paraElServidor,
  porCantidad,
  totalDe,
  type PresentacionDeCobro,
  type ProductoDeCobro,
} from './lineas.ts';

/**
 * El cobro de la tienda, sin navegador (C.10 de la 2.4): la aritmética que tiene que dar el
 * MISMO total que el servidor, y lo que el lector canta.
 */

const COCA: ProductoDeCobro = {
  id: 'coca',
  nombre: 'Coca-Cola 600',
  codigoBarras: '7501055300075',
  precioCentavos: 1_800,
  unidadDeMedida: null,
  existencia: 10,
};
const JAMON: ProductoDeCobro = {
  id: 'jamon',
  nombre: 'Jamón de pierna',
  codigoBarras: '000123',
  precioCentavos: 18_990,
  unidadDeMedida: 'kg',
  existencia: null,
};
const CAJA: PresentacionDeCobro = {
  id: 'caja',
  productoId: 'coca',
  nombre: 'Caja',
  factor: '24',
  codigoBarras: '17501055300072',
  precioCentavos: 38_000,
};
const SIX: PresentacionDeCobro = {
  ...CAJA,
  id: 'six',
  nombre: 'Six',
  factor: '6',
  codigoBarras: '6',
  precioCentavos: null,
};

const CATALOGO: Catalogo = {
  porCodigo: new Map([
    ['7501055300075', COCA],
    ['000123', JAMON],
  ]),
  porId: new Map([
    ['coca', COCA],
    ['jamon', JAMON],
  ]),
  presentacionesPorCodigo: new Map([[CAJA.codigoBarras ?? '', CAJA]]),
};

/** Prefijo 2, seis del artículo, cinco del valor y el control: el EAN-13 de la báscula. */
const PESO = {
  prefijos: ['2'],
  digitosArticulo: 6,
  digitosValor: 5,
  contenido: 'peso' as const,
  decimales: 3,
  verificadorInterno: false,
};

/** El EAN-13 con su dígito de control, para no escribir etiquetas a mano. */
function ean13(doce: string): string {
  let suma = 0;
  for (let i = 0; i < doce.length; i += 1) suma += Number(doce.charAt(i)) * (i % 2 === 0 ? 1 : 3);
  return `${doce}${String((10 - (suma % 10)) % 10)}`;
}

describe('la aritmética del cobro es la del servidor', () => {
  it('redondea al centavo con la mitad hacia arriba, línea por línea', () => {
    // 0.5605 kg a $189.90: 10643.8395 → 10644 centavos.
    expect(porCantidad(18_990, '0.5605')).toBe(10_644);
    expect(porCantidad(18_990, '0.56')).toBe(10_634);
  });

  it('el mismo código incrementa su línea y el total sigue la cantidad', () => {
    const lineas = conProducto(conProducto([], COCA), COCA);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.cantidad).toBe('2');
    expect(totalDe(lineas)).toBe(3_600);
  });

  it('restar hasta cero quita la línea', () => {
    const lineas = conCantidad(conProducto([], COCA), 'coca', -1);
    expect(lineas).toEqual([]);
  });

  it('F-147 · la caja se cobra al precio de la caja, y viaja con su presentación', () => {
    const lineas = conPresentacion([], COCA, CAJA);
    expect(totalDe(lineas)).toBe(38_000);
    expect(lineas[0]?.unidad).toBe('caja (24 pz)');
    expect(paraElServidor(lineas)).toEqual([
      { productoId: 'coca', cantidad: '1', presentacionId: 'caja' },
    ]);
  });

  it('F-147 · sin precio propio, el factor por el de la pieza, como en el servidor', () => {
    expect(totalDe(conPresentacion([], COCA, SIX))).toBe(10_800);
  });

  it('F-148 · cada pesada es su línea: dos bolsas de jamón no son «× 2»', () => {
    const lineas = conGranel(conGranel([], JAMON, '0.56', 'kg'), JAMON, '0.25', 'kg');
    expect(lineas.map((l) => l.cantidad)).toEqual(['0.56', '0.25']);
    expect(new Set(lineas.map((l) => l.clave)).size).toBe(2);
    // El «+» del teclado no convierte una pesada en un kilo más.
    expect(conCantidad(lineas, lineas[0]?.clave ?? '', 1)[0]?.cantidad).toBe('0.56');
  });
});

describe('lo que cantó el lector', () => {
  it('el catálogo manda primero: un código de fábrica que empieza por 2 es lo que es', () => {
    const deFabrica = { ...COCA, id: 'importado', codigoBarras: ean13('200000000001') };
    const catalogo: Catalogo = {
      ...CATALOGO,
      porCodigo: new Map([[deFabrica.codigoBarras, deFabrica]]),
    };
    expect(resolverCodigo(deFabrica.codigoBarras, catalogo, PESO)).toMatchObject({
      tipo: 'producto',
      producto: { id: 'importado' },
    });
  });

  it('la caja se reconoce por el código de la presentación', () => {
    expect(resolverCodigo(CAJA.codigoBarras ?? '', CATALOGO, null)).toMatchObject({
      tipo: 'presentacion',
      presentacion: { id: 'caja' },
    });
  });

  it('F-148 · la etiqueta de la báscula es una pesada del artículo, en su unidad', () => {
    expect(resolverCodigo(ean13('200012300560'), CATALOGO, PESO)).toMatchObject({
      tipo: 'pesada',
      producto: { id: 'jamon' },
      cantidad: '0.56',
      unidad: 'kg',
    });
  });

  it('F-148 · sin la báscula declarada, la etiqueta NO se interpreta', () => {
    expect(resolverCodigo(ean13('200012300560'), CATALOGO, null)).toMatchObject({
      tipo: 'desconocido',
    });
  });

  it('F-148 · un dígito mal leído no vende otra cosa', () => {
    const buena = ean13('200012300560');
    const mala = `${buena.slice(0, 12)}${String((Number(buena.at(-1)) + 1) % 10)}`;
    expect(resolverCodigo(mala, CATALOGO, PESO).tipo).toBe('malLeido');
  });

  it('F-148 · por importe, la cantidad que da EXACTAMENTE lo impreso', () => {
    const cantidad = cantidadDelImporte(10_634, 18_990);
    expect(porCantidad(18_990, cantidad)).toBe(10_634);
  });

  it('una báscula mal guardada se ignora: mejor no interpretar que interpretar mal', () => {
    expect(layoutDeLaConfiguracion(PESO)).toEqual(PESO);
    expect(layoutDeLaConfiguracion({ ...PESO, prefijos: ['7'] })).toBeNull();
    expect(layoutDeLaConfiguracion({ ...PESO, contenido: 'precio' })).toBeNull();
    expect(layoutDeLaConfiguracion(null)).toBeNull();
  });
});

describe('el pitido', () => {
  it('uno corto al agregar; dos que BAJAN cuando el código no existe', () => {
    expect(tonosDe('agregado')).toHaveLength(1);
    const [primero, segundo] = tonosDe('desconocido');
    expect(segundo?.hz).toBeLessThan(primero?.hz ?? 0);
    expect(segundo?.desde).toBeGreaterThan((primero?.desde ?? 0) + (primero?.dura ?? 0) - 0.001);
  });
});

describe('el catálogo del cobro, desde el puente', () => {
  it('lo que se vende por medida cobra el KILO, no `precio_venta`', () => {
    const jamon = productoDeCobro({
      id: 'j',
      nombre: 'Jamón',
      precio_venta: 0,
      codigo_barras: '000123',
      tipo_venta: 'variable_medida',
      unidad_variable: 'kg',
      precio_por_unidad_variable: 189.9,
    });
    expect(jamon.precioCentavos).toBe(18_990);
    expect(jamon.unidadDeMedida).toBe('kg');
  });

  it('el factor del puente vuelve a texto sin ceros de más', () => {
    const caja = presentacionDeCobro({
      id: 'c',
      producto_id: 'coca',
      nombre: 'Caja',
      factor: 24,
      codigo_barras: '1750',
      precio_venta_pesos: 380,
    });
    expect(caja.factor).toBe('24');
    expect(caja.precioCentavos).toBe(38_000);
  });

  it('una presentación de un producto que no está en el catálogo no se escanea', () => {
    const catalogo = armarCatalogo([COCA], [{ ...CAJA, productoId: 'otro' }]);
    expect(catalogo.presentacionesPorCodigo.size).toBe(0);
  });
});

describe('la venta apartada, de vuelta (F6)', () => {
  it('la caja vuelve como caja, la pesada como pesada y las piezas con sus piezas', () => {
    const { lineas, perdidos } = lineasDeRetomada(
      [
        {
          productoId: 'coca',
          nombre: 'Coca-Cola 600',
          cantidad: '3.0000',
          codigoBarras: '7501055300075',
          cantidadBaseConsumo: null,
        },
        {
          productoId: 'coca',
          nombre: 'Coca-Cola 600 · Caja',
          cantidad: '2.0000',
          codigoBarras: CAJA.codigoBarras,
          cantidadBaseConsumo: '48.0000',
        },
        {
          productoId: 'jamon',
          nombre: 'Jamón',
          cantidad: '0.5600',
          codigoBarras: null,
          cantidadBaseConsumo: null,
        },
        {
          productoId: 'se-fue',
          nombre: 'Descontinuado',
          cantidad: '1.0000',
          codigoBarras: null,
          cantidadBaseConsumo: null,
        },
      ],
      CATALOGO,
    );
    expect(lineas.map((l) => [l.clave, l.cantidad])).toEqual([
      ['coca', '3'],
      ['coca:caja', '2'],
      ['jamon:pesada:1', '0.56'],
    ]);
    expect(perdidos).toEqual(['Descontinuado']);
  });
});
