/**
 * Datos sinteticos minimos (`13-PRUEBAS §7`).
 *
 * Los que dependen del esquema —organizaciones, productos, ordenes— llegan con
 * el esquema, en F1.1. Aqui viven los que **no dependen de ninguna tabla** y
 * hacen falta desde ya, porque son los que rompen cosas.
 */

/**
 * Nombres con caracteres peligrosos.
 *
 * `13-PRUEBAS §7` los pide explicitamente, y no es teorico: un nombre de mesa
 * con HTML dentro es la via de SEC-XSS, y un nombre con comillas es como se
 * rompe una consulta mal construida. Un cliente real SI le pone emoji al nombre
 * de un platillo.
 */
export const NOMBRES_PELIGROSOS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  'Mesa "7"',
  "Café D'Amelie",
  'Taco\nde\nsuadero',
  'Té 🍵 con leche',
  'Ñoquis a la crema',
  'Producto\ttabulado',
  'a'.repeat(500),
  '../../etc/passwd',
  "'; DROP TABLE ordenes; --",
  '‮gnp.exe',
] as const;

/** Importes que rompen una implementacion ingenua de dinero. */
export const IMPORTES_DIFICILES = [
  '0.01',
  '0.005',
  '1.005',
  '2.675',
  '19.999',
  '-1.005',
  '999999.99',
  '0',
] as const;

/**
 * Reloj controlado.
 *
 * `13-PRUEBAS §7` pide "reloj y zona horaria controlados". Sin esto, una prueba
 * de corte de caja pasa a las 10 de la manana y falla a medianoche, y nadie
 * entiende por que.
 */
export interface RelojControlado {
  ahora: () => Date;
  avanzar: (milisegundos: number) => void;
  fijar: (momento: Date) => void;
}

/** Momento por omision: un martes cualquiera a media tarde, hora de Ciudad de Mexico. */
export const MOMENTO_BASE = new Date('2026-03-17T20:30:00.000Z');

export function crearRelojControlado(inicio: Date = MOMENTO_BASE): RelojControlado {
  let actual = new Date(inicio.getTime());

  return {
    ahora: () => new Date(actual.getTime()),
    avanzar: (milisegundos) => {
      actual = new Date(actual.getTime() + milisegundos);
    },
    fijar: (momento) => {
      actual = new Date(momento.getTime());
    },
  };
}

/**
 * Generador de identificadores deterministas.
 *
 * En una prueba, un uuid aleatorio hace que el mensaje de fallo cambie en cada
 * corrida y que no se pueda comparar una salida con la anterior.
 */
export function crearGeneradorDeIds(prefijo = 'prueba'): () => string {
  let contador = 0;
  return () => {
    contador += 1;
    return `${prefijo}-${String(contador).padStart(4, '0')}`;
  };
}
