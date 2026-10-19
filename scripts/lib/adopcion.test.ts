import { describe, expect, it } from 'vitest';

import { analizarPantalla, estadosPorComponente, pintaConEnvoltorios } from './adopcion.mjs';

/**
 * La puerta de adopción, vista en ROJO y en VERDE a voluntad.
 *
 * Una puerta que sólo se ha visto fallar sobre el código real no se sabe si PUEDE
 * aprobar; una que sólo se ha visto aprobar no se sabe si puede fallar. Aquí hay una
 * pantalla inventada que cumple las cuatro, y cada prueba le mete UNA violación.
 */

interface Hallazgo {
  readonly condicion: string;
  readonly motivo: string;
}

const CUMPLE = `
import { Dinero, ErrorDePantalla, EsqueletoDeLista, Superficie, Tabla, Vacio, dineroEnTexto } from '@morphiqpos/ui/sistema';
export function Pantalla({ filas, estado, total }) {
  if (estado === 'cargando') return <EsqueletoDeLista />;
  if (estado === 'error') return <ErrorDePantalla titulo="No se pudo leer" queHacer="Reintenta" />;
  return (
    <Superficie aria-label={\`Total \${dineroEnTexto(total)}\`}>
      <Tabla columnas={[]} filas={filas} claveDe={(f) => f.id} vacio={<Vacio titulo="Nada aún" />} />
      <p>Total <Dinero centavos={total} /></p>
      <button onClick={() => navigator.clipboard.writeText(dineroEnTexto(total))}>Copiar</button>
    </Superficie>
  );
}`;

function hallazgos(texto: string): Hallazgo[] {
  const { hallazgos: lista, pinta } = analizarPantalla(texto) as {
    hallazgos: Hallazgo[];
    pinta: Record<string, boolean>;
  };
  const faltan = Object.entries(pinta)
    .filter(([, si]) => !si)
    .map(([estado]) => ({ condicion: '1.4', motivo: `no pinta ${estado}` }));
  return [...lista, ...faltan];
}

function conCambio(de: string, a: string): string {
  if (!CUMPLE.includes(de)) throw new Error(`La pantalla base no contiene «${de}»`);
  // Con función: en una cadena de reemplazo `$$` significa `$`, y se comía el dólar
  // que la prueba del importe a mano quiere meter.
  return CUMPLE.replace(de, () => a);
}

describe('verify:adopcion · el analizador', () => {
  it('una pantalla que cumple las cuatro sale LIMPIA', () => {
    expect(hallazgos(CUMPLE)).toEqual([]);
  });

  it('un proveedor sin elementos no es una pantalla', () => {
    const proveedor = `export function P({ children }) { return <Contexto.Provider value={1}>{children}</Contexto.Provider>; }`;
    expect(analizarPantalla(proveedor).interfaz).toBe(false);
  });

  describe('cada violación, por separado, la pone en ROJO', () => {
    const casos: readonly (readonly [string, string, string, string])[] = [
      [
        '1.1',
        'superficie a mano',
        '<p>Total',
        '<p className="rounded-lg border bg-card p-4">Total',
      ],
      [
        '1.1',
        'superficie con sombra',
        '<p>Total',
        '<p className={cn("rounded-md", "bg-muted shadow-1")}>Total',
      ],
      [
        '1.1',
        'Card de primitivas',
        'import {',
        "import { Card } from '@morphiqpos/ui/primitivas/card';\nimport {",
      ],
      [
        '1.2',
        '<table> a mano',
        '<p>Total',
        '<table><tbody><tr><td>x</td></tr></tbody></table><p>Total',
      ],
      [
        '1.2',
        'Table de primitivas',
        'import {',
        "import { Table } from '@morphiqpos/ui/primitivas/table';\nimport {",
      ],
      [
        '1.2',
        'filas a mano',
        '<p>Total',
        '<ul>{filas.map((f) => (<li key={f.id}><span>{f.n}</span><Dinero centavos={f.c} /></li>))}</ul><p>Total',
      ],
      [
        '1.3',
        'Intl con moneda',
        'export function',
        "const P = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });\nexport function",
      ],
      ['1.3', 'formateador propio', '<Dinero centavos={total} />', '{enPesos(total)}'],
      ['1.3', 'dólar en plantilla', '<Dinero centavos={total} />', '{`$${total / 100}`}'],
      ['1.3', '/ 100 formateado', '<Dinero centavos={total} />', '{(total / 100).toFixed(2)}'],
      [
        '1.3',
        'dineroEnTexto como contenido',
        '<Dinero centavos={total} />',
        '{dineroEnTexto(total)}',
      ],
      [
        '1.3',
        'textoParaCampo como contenido',
        '<Dinero centavos={total} />',
        '{textoParaCampo(total)}',
      ],
      [
        '1.1',
        'tesela a mano sobre Link',
        '<p>Total',
        '<Link href="/x" className="rounded-lg border bg-superficie">Ir</Link><p>Total',
      ],
      [
        '1.4',
        'Skeleton de primitivas',
        'import {',
        "import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';\nimport {",
      ],
      ['1.4', 'role alert a mano', '<p>Total', '<p role="alert">Falló</p><p>Total'],
      ['1.4', 'animate-spin', '<p>Total', '<span className="animate-spin" /><p>Total'],
      ['1.4', 'texto Cargando', '<p>Total', '<p>Cargando…</p><p>Total'],
      ['1.4', 'sin esqueleto', 'return <EsqueletoDeLista />;', 'return null;'],
      [
        '1.4',
        'sin error del sistema',
        'return <ErrorDePantalla titulo="No se pudo leer" queHacer="Reintenta" />;',
        'return null;',
      ],
      ['1.4', 'sin vacío', ' vacio={<Vacio titulo="Nada aún" />}', ''],
    ];

    for (const [condicion, nombre, de, a] of casos) {
      it(`${condicion} · ${nombre}`, () => {
        const lista = hallazgos(conCambio(de, a));
        expect(lista.map((h) => h.condicion)).toContain(condicion);
      });
    }
  });

  it('un dineroEnTexto guardado en una constante y pintado después también se ve', () => {
    const texto = conCambio('<Dinero centavos={total} />', '{etiqueta}').replace(
      'export function Pantalla({ filas, estado, total }) {',
      'export function Pantalla({ filas, estado, total }) {\n  const etiqueta = dineroEnTexto(total);',
    );
    expect(hallazgos(texto).map((h) => h.motivo)).toContain(
      'importe en texto pintado como contenido: es <Dinero>',
    );
  });

  it('un Vacio con el mismo nombre que NO viene del sistema no cuenta', () => {
    const texto = CUMPLE.replace(
      "import { Dinero, ErrorDePantalla, EsqueletoDeLista, Superficie, Tabla, Vacio, dineroEnTexto } from '@morphiqpos/ui/sistema';",
      "import { Dinero, ErrorDePantalla, EsqueletoDeLista, Superficie, Tabla, dineroEnTexto } from '@morphiqpos/ui/sistema';\nimport { Vacio } from './mio';",
    );
    expect(hallazgos(texto).map((h) => h.motivo)).toContain('no pinta vacio');
  });

  it('las teselas —un botón por fila— no son filas de datos', () => {
    const texto = conCambio(
      '<p>Total',
      '<ul>{filas.map((f) => (<li key={f.id}><button type="button"><Dinero centavos={f.c} /></button></li>))}</ul><p>Total',
    );
    expect(hallazgos(texto)).toEqual([]);
  });

  it('la tesela hecha con Superficie interactiva tampoco, y una Superficie quieta sí', () => {
    const tesela = conCambio(
      '<p>Total',
      '<ul>{filas.map((f) => (<li key={f.id}><Superficie como="button" interactiva><Dinero centavos={f.c} /></Superficie></li>))}</ul><p>Total',
    );
    expect(hallazgos(tesela)).toEqual([]);
    const fila = conCambio(
      '<p>Total',
      '<ul>{filas.map((f) => (<li key={f.id}><Superficie><span>{f.n}</span><Dinero centavos={f.c} /></Superficie></li>))}</ul><p>Total',
    );
    expect(hallazgos(fila).map((h) => h.condicion)).toContain('1.2');
  });
});

/**
 * EL ENVOLTORIO LOCAL DE UN ESTADO (verify:adopcion, cierre de la 2.4).
 *
 * `MesaActiva` pinta su espera con `EsqueletoDeLaComanda`, que arma tres `Esqueleto` del
 * sistema con la forma de la comanda; la puerta sólo reconocía el nombre base y la daba en
 * rojo por «no pinta Esqueleto». El nombre propone; el MÓDULO decide: cuenta sólo si la
 * función de ese nombre pinta la pieza del sistema.
 */
describe('verify:adopcion · los envoltorios locales de un estado', () => {
  const PANTALLA = `
import { ErrorDePantalla, Vacio } from '@morphiqpos/ui/sistema';
import { EsqueletoDeLaComanda } from './comanda';
export function Mesa({ estado }) {
  if (estado === 'cargando') return <EsqueletoDeLaComanda etiqueta="Cargando la mesa" />;
  if (estado === 'error') return <ErrorDePantalla titulo="No se pudo leer" queHacer="Reintenta" />;
  return <Vacio titulo="Sin platillos" />;
}`;

  const PINTA = `
import { Esqueleto } from '@morphiqpos/ui/sistema';
export function EsqueletoDeLaComanda({ etiqueta }) {
  return <div aria-label={etiqueta}><Esqueleto className="h-8" /></div>;
}
export const otra = () => <p>nada</p>;`;

  const NO_PINTA = `
export function EsqueletoDeLaComanda() {
  return <div className="h-8" />;
}`;

  it('el analizador NOMBRA el envoltorio, sin darlo por bueno', () => {
    const analisis = analizarPantalla(PANTALLA);
    expect(analisis.envoltorios).toEqual([
      { nombre: 'EsqueletoDeLaComanda', modulo: './comanda', estado: 'cargando' },
    ]);
    expect(analisis.pinta.cargando).toBe(false);
  });

  it('cuenta si la función de ese nombre pinta el Esqueleto del sistema', () => {
    const { pinta, envoltorios } = analizarPantalla(PANTALLA);
    expect(pintaConEnvoltorios(pinta, envoltorios, () => PINTA)).toEqual({
      vacio: true,
      cargando: true,
      error: true,
    });
  });

  it('un envoltorio que sólo se LLAMA así, y pinta un <div>, no cuenta', () => {
    const { pinta, envoltorios } = analizarPantalla(PANTALLA);
    expect(pintaConEnvoltorios(pinta, envoltorios, () => NO_PINTA).cargando).toBe(false);
  });

  it('un módulo que no se puede leer no cuenta', () => {
    const { pinta, envoltorios } = analizarPantalla(PANTALLA);
    expect(pintaConEnvoltorios(pinta, envoltorios, () => null).cargando).toBe(false);
  });

  it('un Esqueleto que no viene del sistema tampoco hace bueno al envoltorio', () => {
    const ajeno = PINTA.replace("'@morphiqpos/ui/sistema'", "'./mio'");
    expect(estadosPorComponente(ajeno).get('EsqueletoDeLaComanda')?.cargando).toBe(false);
  });

  it('lee cada componente del módulo por separado', () => {
    const estados = estadosPorComponente(PINTA);
    expect(estados.get('EsqueletoDeLaComanda')?.cargando).toBe(true);
    expect(estados.get('otra')).toEqual({ vacio: false, cargando: false, error: false });
  });

  it('un componente de biblioteca con ese prefijo no es un envoltorio local', () => {
    const deFuera = PANTALLA.replace("'./comanda'", "'otra-biblioteca'");
    expect(analizarPantalla(deFuera).envoltorios).toEqual([]);
  });
});
