import { describe, expect, it } from 'vitest';

import { ErrorDominio } from '@morphiqpos/contracts/errores';

import {
  aplicarPorcentaje,
  centavos,
  comparar,
  desdeTexto,
  esNegativo,
  formatear,
  negar,
  redondear,
  repartir,
  restar,
  sumar,
} from './index.ts';

/**
 * Estas pruebas se escribieron ANTES que el modulo (R17).
 *
 * No comprueban que "suma bien": comprueban los casos que ROMPEN una
 * implementacion ingenua con numeros de punto flotante. Si alguien reescribe
 * dinero/ con `number`, estas pruebas fallan.
 */

describe('centavos · el constructor', () => {
  it('acepta un entero y lo conserva exacto', () => {
    expect(centavos(12345)).toBe(12345n);
    expect(centavos(-500)).toBe(-500n);
    expect(centavos(0n)).toBe(0n);
  });

  it('rechaza un numero con decimales: el dinero nunca es fraccion de centavo', () => {
    expect(() => centavos(10.5)).toThrow(ErrorDominio);
    expect(() => centavos(0.1 + 0.2)).toThrow(ErrorDominio);
  });

  it('rechaza un numero fuera del rango entero seguro', () => {
    expect(() => centavos(Number.MAX_SAFE_INTEGER + 2)).toThrow(ErrorDominio);
    expect(() => centavos(Number.NaN)).toThrow(ErrorDominio);
    expect(() => centavos(Number.POSITIVE_INFINITY)).toThrow(ErrorDominio);
  });
});

describe('desdeTexto · la frontera de entrada', () => {
  it('convierte pesos con dos decimales sin pasar por punto flotante', () => {
    expect(desdeTexto('123.45')).toBe(12345n);
    expect(desdeTexto('0.01')).toBe(1n);
    expect(desdeTexto('1000')).toBe(100000n);
    expect(desdeTexto('-45.50')).toBe(-4550n);
  });

  // El caso clasico: 1.005 en punto flotante es 1.00499999999999989, asi que
  // Math.round(1.005 * 100) da 100 y no 101. Aqui NO puede pasar.
  it('redondea .005 hacia arriba, que es donde falla el punto flotante', () => {
    expect(desdeTexto('1.005')).toBe(101n);
    expect(desdeTexto('2.675')).toBe(268n);
    expect(desdeTexto('8.165')).toBe(817n);
    expect(desdeTexto('1.004')).toBe(100n);
  });

  it('redondea medio centavo negativo alejandose del cero, no hacia el', () => {
    expect(desdeTexto('-1.005')).toBe(-101n);
    expect(desdeTexto('-1.004')).toBe(-100n);
  });

  it('acepta mas de dos decimales y redondea a centavo', () => {
    expect(desdeTexto('19.999')).toBe(2000n);
    expect(desdeTexto('19.994')).toBe(1999n);
    expect(desdeTexto('0.0049')).toBe(0n);
  });

  it('tolera espacios, signo de pesos y separador de miles', () => {
    expect(desdeTexto('  $1,234.56 ')).toBe(123456n);
    expect(desdeTexto('$0.99')).toBe(99n);
  });

  it('rechaza texto que no es un importe, en vez de devolver cero', () => {
    for (const basura of ['', '   ', 'abc', '12.34.56', '1,2.3.4', '--5', '1e3', '∞']) {
      expect(() => desdeTexto(basura)).toThrow(ErrorDominio);
    }
  });
});

describe('sumar y restar · exactitud', () => {
  it('suma sin deriva lo que el punto flotante estropea', () => {
    // 0.1 + 0.2 !== 0.3 en punto flotante. En centavos es exacto.
    expect(sumar(desdeTexto('0.1'), desdeTexto('0.2'))).toBe(desdeTexto('0.3'));
  });

  // Este es el caso del corte de caja: mil renglones de ticket que deben
  // cuadrar al centavo contra el arqueo.
  it('suma 1000 lineas de 0.07 sin perder un solo centavo', () => {
    const linea = desdeTexto('0.07');
    const lineas = Array.from({ length: 1000 }, () => linea);
    expect(sumar(...lineas)).toBe(7000n);
  });

  it('suma 1000 importes irregulares y da exactamente el total esperado', () => {
    let esperado = 0n;
    const lineas = [];
    for (let i = 1; i <= 1000; i += 1) {
      const monto = centavos(i * 37);
      lineas.push(monto);
      esperado += BigInt(i * 37);
    }
    expect(sumar(...lineas)).toBe(esperado);
  });

  it('suma sin argumentos es cero, no NaN ni undefined', () => {
    expect(sumar()).toBe(0n);
  });

  it('resta, niega y compara', () => {
    expect(restar(centavos(1000), centavos(250))).toBe(750n);
    expect(restar(centavos(250), centavos(1000))).toBe(-750n);
    expect(negar(centavos(1000))).toBe(-1000n);
    expect(esNegativo(centavos(-1))).toBe(true);
    expect(esNegativo(centavos(0))).toBe(false);
    expect(comparar(centavos(100), centavos(200))).toBe(-1);
    expect(comparar(centavos(200), centavos(100))).toBe(1);
    expect(comparar(centavos(100), centavos(100))).toBe(0);
  });
});

describe('redondear · la unica definicion de redondeo del sistema', () => {
  it('redondea a la mitad alejandose del cero', () => {
    expect(redondear(5n, 2n)).toBe(3n); // 2.5  -> 3
    expect(redondear(7n, 2n)).toBe(4n); // 3.5  -> 4
    expect(redondear(-5n, 2n)).toBe(-3n); // -2.5 -> -3
    expect(redondear(4n, 3n)).toBe(1n); // 1.33 -> 1
    expect(redondear(5n, 3n)).toBe(2n); // 1.66 -> 2
  });

  it('rechaza dividir entre cero en vez de devolver infinito', () => {
    expect(() => redondear(10n, 0n)).toThrow(ErrorDominio);
  });
});

describe('aplicarPorcentaje · impuestos y descuentos en puntos base', () => {
  // 16 % = 1600 puntos base. Se usa entero para que el porcentaje tampoco
  // pase nunca por punto flotante.
  const IVA = 1600;

  it('calcula el IVA de un total impar sin fraccion de centavo', () => {
    expect(aplicarPorcentaje(centavos(12345), IVA)).toBe(1975n); // 1975.2 -> 1975
    expect(aplicarPorcentaje(centavos(333), IVA)).toBe(53n); // 53.28 -> 53
    expect(aplicarPorcentaje(centavos(1), IVA)).toBe(0n); // 0.16  -> 0
    expect(aplicarPorcentaje(centavos(97), IVA)).toBe(16n); // 15.52 -> 16
  });

  it('redondea el medio centavo hacia arriba, igual que desdeTexto', () => {
    // 3125 centavos al 16 % = 500.0 exacto; 3126 al 16 % = 500.16
    expect(aplicarPorcentaje(centavos(3125), IVA)).toBe(500n);
    // 50 centavos al 50 % = 25 exacto; 51 al 50 % = 25.5 -> 26
    expect(aplicarPorcentaje(centavos(51), 5000)).toBe(26n);
    expect(aplicarPorcentaje(centavos(-51), 5000)).toBe(-26n);
  });

  it('el 0 % y el 100 % son identidades', () => {
    expect(aplicarPorcentaje(centavos(9999), 0)).toBe(0n);
    expect(aplicarPorcentaje(centavos(9999), 10000)).toBe(9999n);
  });

  it('rechaza puntos base que no sean enteros', () => {
    expect(() => aplicarPorcentaje(centavos(100), 16.5)).toThrow(ErrorDominio);
  });
});

describe('repartir · la propina que no puede perder ni inventar centavos', () => {
  // El caso literal del criterio de aceptacion: $1.00 entre 3 meseros.
  it('reparte 100 centavos entre 3 y suma exactamente 100', () => {
    const partes = repartir(centavos(100), 3);
    expect(partes).toEqual([34n, 33n, 33n]);
    expect(sumar(...partes)).toBe(100n);
  });

  it('reparte 10 entre 3 y entre 4 sin perder residuo', () => {
    expect(repartir(centavos(10), 3)).toEqual([4n, 3n, 3n]);
    expect(repartir(centavos(10), 4)).toEqual([3n, 3n, 2n, 2n]);
  });

  it('reparte exacto cuando divide sin residuo', () => {
    expect(repartir(centavos(900), 3)).toEqual([300n, 300n, 300n]);
  });

  it('reparte un importe negativo sin perder centavos', () => {
    const partes = repartir(centavos(-100), 3);
    expect(sumar(...partes)).toBe(-100n);
    expect(partes).toEqual([-34n, -33n, -33n]);
  });

  it('reparte cero', () => {
    expect(repartir(centavos(0), 3)).toEqual([0n, 0n, 0n]);
  });

  it('la suma de las partes es siempre el total, para cualquier importe y divisor', () => {
    for (let monto = 0; monto <= 200; monto += 1) {
      for (let partes = 1; partes <= 9; partes += 1) {
        const trozos = repartir(centavos(monto), partes);
        expect(trozos).toHaveLength(partes);
        expect(sumar(...trozos)).toBe(BigInt(monto));
      }
    }
  });

  it('rechaza un numero de partes invalido en vez de devolver lista vacia', () => {
    expect(() => repartir(centavos(100), 0)).toThrow(ErrorDominio);
    expect(() => repartir(centavos(100), -1)).toThrow(ErrorDominio);
    expect(() => repartir(centavos(100), 2.5)).toThrow(ErrorDominio);
  });
});

describe('formatear · la frontera de salida, con moneda explicita (R15)', () => {
  it('formatea con dos decimales siempre', () => {
    expect(formatear(centavos(12345), 'MXN')).toBe('$123.45');
    expect(formatear(centavos(5), 'MXN')).toBe('$0.05');
    expect(formatear(centavos(0), 'MXN')).toBe('$0.00');
    expect(formatear(centavos(100000), 'MXN')).toBe('$1,000.00');
  });

  it('formatea negativos con el signo delante del simbolo', () => {
    expect(formatear(centavos(-4550), 'MXN')).toBe('-$45.50');
  });

  it('ida y vuelta: lo que se formatea se vuelve a leer igual', () => {
    for (const monto of [0, 1, 99, 100, 12345, 100000, -4550, 999999999]) {
      const texto = formatear(centavos(monto), 'MXN');
      expect(desdeTexto(texto)).toBe(BigInt(monto));
    }
  });
});
