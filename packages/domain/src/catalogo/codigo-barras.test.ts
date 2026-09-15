import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  digitoDeControlValido,
  esCodigoInterno,
  interpretarCodigoInterno,
  type LayoutEanInterno,
} from './codigo-barras.ts';

/**
 * F-148 · El código de barras que lleva el peso o el importe dentro.
 *
 * Hoy el jamón empaquetado se teclea, y ahí nacen los errores de dedo que
 * descuadran el inventario. Lo que se prueba aquí es que el código se abra bien
 * —y que cuando venga mal leído, se diga— porque leer mal uno de éstos no da
 * «producto no encontrado»: cobra OTRO importe y la venta se cierra.
 */

/** El más común: `2` + seis de artículo + cinco de peso en gramos + control. */
const PESO: LayoutEanInterno = {
  prefijos: ['2'],
  digitosArticulo: 6,
  digitosValor: 5,
  contenido: 'peso',
  decimales: 3,
  verificadorInterno: false,
};

const IMPORTE: LayoutEanInterno = { ...PESO, contenido: 'importe', decimales: 2 };

function codigoDe(fn: () => unknown): string {
  try {
    fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('esCodigoInterno', () => {
  it('EL DE FÁBRICA SE BUSCA TAL CUAL', () => {
    // Un EAN de fábrica que empiece por 7 no lo generó la báscula: tratarlo
    // como interno lo partiría en artículo y peso y vendería otra cosa.
    expect(esCodigoInterno('7501234567890', PESO)).toBe(false);
  });

  it('el de la báscula se reconoce por su prefijo', () => {
    expect(esCodigoInterno('2012345012349', PESO)).toBe(true);
  });

  it('DOS LAYOUTS EN LA MISMA TIENDA se distinguen por prefijo', () => {
    const soloVeintiuno: LayoutEanInterno = { ...PESO, prefijos: ['21'], digitosArticulo: 5 };
    expect(esCodigoInterno('2112345012346', soloVeintiuno)).toBe(true);
    expect(esCodigoInterno('2212345012340', soloVeintiuno)).toBe(false);
  });

  it('lo que no son trece dígitos no es un EAN-13', () => {
    expect(esCodigoInterno('201234501234', PESO)).toBe(false);
    expect(esCodigoInterno('20123450123A9', PESO)).toBe(false);
  });
});

describe('interpretarCodigoInterno', () => {
  it('SACA EL ARTÍCULO Y EL PESO', () => {
    const leido = interpretarCodigoInterno('2012345012349', PESO);

    expect(leido.codigoArticulo).toBe('012345');
    expect(leido.contenido).toBe('peso');
    // 01234 gramos con tres decimales: 1.234 kg de jamón.
    expect(leido.valor).toBe('1.234');
    // Un peso NO es un importe: devolver centavos aquí invitaría a cobrarlo.
    expect(leido.importeCentavos).toBeNull();
  });

  it('SACA EL IMPORTE EN CENTAVOS', () => {
    const leido = interpretarCodigoInterno('2099999025505', IMPORTE);

    expect(leido.codigoArticulo).toBe('099999');
    expect(leido.valor).toBe('25.50');
    expect(leido.importeCentavos).toBe(2550n);
  });

  it('UN IMPORTE EN PESOS ENTEROS SE ESCALA A CENTAVOS', () => {
    // Hay básculas que embeben el importe sin decimales. Sin escalar, $2,550
    // se cobrarían como $25.50: cien veces menos, en cada venta de mostrador.
    const enteros: LayoutEanInterno = { ...IMPORTE, decimales: 0 };
    const leido = interpretarCodigoInterno('2099999025505', enteros);

    expect(leido.valor).toBe('2550');
    expect(leido.importeCentavos).toBe(255_000n);
  });

  it('EL DÍGITO DE CONTROL ES LO ÚNICO QUE SEPARA UN ERROR DE UNA VENTA MALA', () => {
    // Leyendo mal un dígito de un código de fábrica no se encuentra producto y
    // no pasa nada. Leyendo mal uno de éstos se cobra OTRO importe y la venta
    // se cierra sin que nada falle.
    expect(codigoDe(() => interpretarCodigoInterno('2099999025500', IMPORTE))).toBe(
      'CATALOGO_INVALIDO',
    );
  });

  it('EL VERIFICADOR DE LA BÁSCULA OCUPA UN DÍGITO y hay que descontarlo', () => {
    // Varias Torrey y Rhino meten su propio verificador entre el artículo y el
    // valor. Sin descontarlo, el importe entero sale desplazado.
    const conVerificador: LayoutEanInterno = {
      ...IMPORTE,
      digitosArticulo: 5,
      verificadorInterno: true,
    };
    const leido = interpretarCodigoInterno('2123457012346', conVerificador);

    expect(leido.codigoArticulo).toBe('12345');
    expect(leido.valor).toBe('12.34');
  });

  it('UN LAYOUT QUE SE COME EL DÍGITO DE CONTROL se rechaza', () => {
    // Si el valor llegara hasta la última posición, el control se leería como
    // el último dígito del importe y el precio saldría multiplicado por diez.
    const mal: LayoutEanInterno = { ...IMPORTE, digitosValor: 6 };

    expect(codigoDe(() => interpretarCodigoInterno('2099999025505', mal))).toBe(
      'CATALOGO_INVALIDO',
    );
  });

  it('UN IMPORTE CON TRES DECIMALES no cabe en centavos y se dice', () => {
    // Truncar el tercero cobraría de menos en cada venta, y en silencio.
    const mal: LayoutEanInterno = { ...IMPORTE, decimales: 3 };

    expect(codigoDe(() => interpretarCodigoInterno('2099999025505', mal))).toBe(
      'CATALOGO_INVALIDO',
    );
  });

  it('el peso cero se lee como cero, no como error de formato', () => {
    const leido = interpretarCodigoInterno('2000001000007', PESO);

    expect(leido.codigoArticulo).toBe('000001');
    expect(leido.valor).toBe('0.000');
  });

  it('un código de fábrica no se interpreta', () => {
    expect(codigoDe(() => interpretarCodigoInterno('7501234567890', PESO))).toBe(
      'CATALOGO_INVALIDO',
    );
  });
});

describe('digitoDeControlValido', () => {
  it('acepta un EAN-13 de fábrica bien formado', () => {
    expect(digitoDeControlValido('7501055300013')).toBe(true);
  });

  it('LA ALTERNANCIA IMPORTA: dos dígitos cambiados de sitio no pasan', () => {
    // Es el error típico del escáner y del tecleo. Una suma sin alternar los
    // pesos 1 y 3 daría el mismo control para las dos formas.
    expect(digitoDeControlValido('2012345012349')).toBe(true);
    expect(digitoDeControlValido('2012345013249')).toBe(false);
  });

  it('lo que no son trece dígitos no tiene control que validar', () => {
    expect(digitoDeControlValido('201234501234')).toBe(false);
  });
});
