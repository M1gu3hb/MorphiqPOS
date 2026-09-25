import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { hallazgosDeUnidades } from './unidades.mjs';

/**
 * El analizador de `verify:unidades`, sobre un programa en memoria: una pantalla que lee
 * `precio_centavos` de una fila del puente sin `centavosDe` es un hallazgo; con él, no.
 * Y un objeto que NO es fila del puente, aunque tenga un campo con ese nombre, no cuenta.
 */
const UNIDADES = {
  CitaServicio: { precio_centavos: 'pesos', precio_pesos: 'pesos' },
  CarteraFiado: { saldo_centavos: 'centavos' },
} as const;

const CABECERA = `
declare function consultarPuente<T>(entidad: string): Promise<readonly T[]>;
declare function centavosDe(e: string, c: string, v: unknown): number | null;
interface ServicioDeLaCita { precio_centavos: number; precio_pesos: number; nombre: string }
interface Cartera { saldo_centavos: number }
`;

function analizar(cuerpo: string): { campo: string; como: string }[] {
  const pantalla = `${CABECERA}\nexport async function pantalla() {\n${cuerpo}\n}\n`;
  const opciones: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
  };
  const anfitrion = ts.createCompilerHost(opciones);
  // Las bibliotecas (`Promise`, `Array`) las sirve el anfitrión real: sin ellas nada tiene
  // tipo y el analizador no vería una sola fila.
  const deVerdad = anfitrion.getSourceFile.bind(anfitrion);
  anfitrion.getSourceFile = (nombre, version, ...resto) =>
    nombre === '/pantalla.ts'
      ? ts.createSourceFile(nombre, pantalla, version, true)
      : deVerdad(nombre, version, ...resto);
  const programa = ts.createProgram({
    rootNames: ['/pantalla.ts'],
    options: opciones,
    host: anfitrion,
  });
  return hallazgosDeUnidades(programa, UNIDADES, ['/pantalla.ts']);
}

describe('verify:unidades · el analizador', () => {
  it('marca la lectura directa de un campo de dinero de una fila del puente (C.1)', () => {
    const hallazgos = analizar(`
      const filas = await consultarPuente<ServicioDeLaCita>('CitaServicio');
      return filas.map((s) => s.precio_centavos);`);
    expect(hallazgos.map((h) => h.campo)).toEqual(['precio_centavos']);
  });

  it('acepta la lectura por centavosDe con la entidad y el campo escritos', () => {
    const hallazgos = analizar(`
      const filas = await consultarPuente<ServicioDeLaCita>('CitaServicio');
      return filas.map((s) => centavosDe('CitaServicio', 'precio_pesos', s.precio_pesos));`);
    expect(hallazgos).toEqual([]);
  });

  it('marca leer el nombre que miente aunque se convierta: el código nuevo lee el gemelo', () => {
    const mal = analizar(`
      const filas = await consultarPuente<ServicioDeLaCita>('CitaServicio');
      return filas.map((s) => centavosDe('CitaServicio', 'precio_centavos', s.precio_centavos));`);
    expect(mal.map((h) => h.como)).toEqual(['nombre que miente: lee precio_pesos']);
    const bien = analizar(`
      const filas = await consultarPuente<ServicioDeLaCita>('CitaServicio');
      return filas.map((s) => centavosDe('CitaServicio', 'precio_pesos', s.precio_pesos));`);
    expect(bien).toEqual([]);
  });

  it('no acepta centavosDe con OTRO campo o con otra entidad', () => {
    const hallazgos = analizar(`
      const filas = await consultarPuente<ServicioDeLaCita>('CitaServicio');
      const a = filas.map((s) => centavosDe('CitaServicio', 'otro', s.precio_centavos));
      const b = filas.map((s) => centavosDe('CarteraFiado', 'precio_centavos', s.precio_centavos));
      return [a, b];`);
    expect(hallazgos).toHaveLength(2);
  });

  it('también los campos que ya llegan en centavos pasan por el mismo camino', () => {
    const hallazgos = analizar(`
      const [c] = await consultarPuente<Cartera>('CarteraFiado');
      return c?.saldo_centavos;`);
    expect(hallazgos.map((h) => h.campo)).toEqual(['saldo_centavos']);
  });

  it('marca desestructurar un campo de dinero de una fila', () => {
    const hallazgos = analizar(`
      const [s] = await consultarPuente<ServicioDeLaCita>('CitaServicio');
      if (s === undefined) return 0;
      const { precio_centavos } = s;
      return precio_centavos;`);
    expect(hallazgos.map((h) => h.como)).toEqual(['desestructurado']);
  });

  it('no confunde un objeto que no es fila del puente aunque el campo se llame igual', () => {
    const hallazgos = analizar(`
      const respuestaDeUnComando: { precio_centavos: number } = { precio_centavos: 35000 };
      return respuestaDeUnComando.precio_centavos;`);
    expect(hallazgos).toEqual([]);
  });
});
