import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * LAS PANTALLAS USAN LA REGLA, y no una suma propia.
 *
 * `costo-del-platillo.test.ts` prueba la regla —«el costo desconocido no es cero»—; esto
 * prueba que las pantallas heredadas la CUMPLEN: que no han vuelto a sumar sus líneas con
 * `|| 0`, que pintan el estado desconocido con palabras, y que su estado de carga, de error
 * y de vacío son tres cosas distintas y salen en ese orden. `heredado/` no tiene pruebas
 * propias ni sabría importarlas (`checkJs: false`, y el alias `@` de vitest apunta a `src`),
 * así que se leen como texto.
 *
 * ── Cómo se afirma ─────────────────────────────────────────────────────────────────
 * Sobre el código SIN comentarios —el comentario que explica el defecto nombra justo lo que
 * se prohíbe— y sobre el trozo que importa, no sobre el archivo entero: un identificador
 * suelto aparece en la importación, en el render y en el comentario, y borrar el uso real
 * dejaría vivos los otros. Cuando importa el ORDEN, se afirma sobre el orden.
 */

const HEREDADO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'heredado');

/** El código sin comentarios de bloque, de línea ni de JSX. */
function codigoDe(...ruta: string[]): string {
  return readFileSync(join(HEREDADO, ...ruta), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const recetas = codigoDe('pages', 'Recetas.jsx');
const productos = codigoDe('pages', 'Productos.jsx');
const inventario = codigoDe('pages', 'Inventario.jsx');
const fila = codigoDe('components', 'recetas', 'RecetaAccordionRow.jsx');
const dialogoDeReceta = codigoDe('components', 'recetas', 'RecetaFormDialog.jsx');
const ficha = codigoDe('components', 'productos', 'ProductoDesglose.jsx');
const rejilla = codigoDe('components', 'recetas', 'RejillaDeRecetas.jsx');
const foto = codigoDe('components', 'productos', 'ImagenDePlatillo.jsx');

/** Dónde empieza `patron` en `codigo`, o falla diciendo cuál no encontró. */
function dondeEsta(codigo: string, patron: RegExp): number {
  const encontrado = patron.exec(codigo);
  expect(encontrado, `no se encontró ${String(patron)}`).not.toBeNull();
  return encontrado?.index ?? -1;
}

describe('el costo desconocido NO es cero en las pantallas', () => {
  it('Recetas y Productos arman la economía de cada producto con la regla', () => {
    for (const pantalla of [recetas, productos]) {
      expect(pantalla).toMatch(/economia:\s*economiaDelProducto\(\s*p\s*,\s*lines\s*,?\s*\)/);
    }
  });

  it('la ficha imprimible y la vista previa del formulario también', () => {
    expect(ficha).toMatch(/const eco = economiaDelProducto\(\s*producto\s*,\s*lineas\s*,?\s*\)/);
    expect(dialogoDeReceta).toMatch(/economiaDelPlatillo\(\s*precio\s*,\s*paraElCosto\s*,?\s*\)/);
  });

  it('ninguna vuelve a sumar las líneas con `|| 0` ni a sacar el margen de un costo en cero', () => {
    for (const pantalla of [recetas, productos, ficha, dialogoDeReceta]) {
      expect(pantalla).not.toMatch(/costo_linea_calculado\s*\|\|\s*0/);
      expect(pantalla).not.toMatch(/costo_unitario_base_snapshot\s*\|\|\s*0\s*\)\s*,\s*0/);
      expect(pantalla).not.toMatch(/calculateMargin\(/);
    }
  });

  it('la fila de Recetas pinta «Sin receta» / «Costo desconocido» donde iría el costo', () => {
    // El render, no sólo el cálculo: la etiqueta sale en la celda del costo...
    expect(fila).toMatch(
      /cabecera\.etiquetaDelCosto\s*\?\s*\(\s*<CostoDesconocido etiqueta=\{cabecera\.etiquetaDelCosto\}/,
    );
    // ...la utilidad y el margen sin costo son un guion, no un cero...
    expect(fila).toMatch(
      /valor === null \|\| valor === undefined\s*\)\s*\{\s*return <span[^>]*>—</,
    );
    expect(fila).toMatch(
      /margen === null \|\| margen === undefined\s*\)\s*\{\s*return <span[^>]*>—</,
    );
    // ...y la pista de qué hacer va escrita en la fila.
    expect(fila).toMatch(/cabecera\.pista && <p[^>]*>\{cabecera\.pista\}<\/p>/);
  });

  it('la tarjeta de Productos pinta la etiqueta en la caja del costo y guiones en lo demás', () => {
    expect(productos).toMatch(/eco\.costo === null \? \(\s*<p[^>]*>\s*\{eco\.etiqueta\}\s*<\/p>/);
    expect(productos).toMatch(/eco\.utilidad === null \? '—' : formatCurrency\(eco\.utilidad\)/);
    expect(productos).toMatch(/eco\.margen === null \? '—' : formatPercent\(eco\.margen\)/);
    expect(productos).toMatch(/eco\.pista && !sinRecetas && \(/);
  });

  it('la vista previa del formulario de receta no enseña $0.00 con un insumo sin costo', () => {
    expect(dialogoDeReceta).toMatch(
      /calc\.costo === null \? calc\.etiqueta : formatCurrency\(calc\.costo\)/,
    );
    expect(dialogoDeReceta).toMatch(/calc\.margen === null \? '—' : formatPercent\(calc\.margen\)/);
  });

  it('el valor del inventario avisa de los insumos sin costo en vez de sumarlos como cero', () => {
    expect(inventario).toMatch(/sinCostoConExistencias\s*=\s*enriched\.filter\(/);
    expect(inventario).toMatch(/No incluye \{sinCostoConExistencias\}/);
  });
});

describe('cargando, error y vacío son tres cosas distintas, y salen en ese orden', () => {
  const casos: readonly (readonly [string, string, RegExp, RegExp, RegExp])[] = [
    [
      'Recetas',
      recetas,
      /cargandoInicial \? \(\s*<EsqueletoDeRecetas/,
      /falloDeCarga \? \(\s*<ErrorDePantalla/,
      /<EmptyState/,
    ],
    [
      'Productos',
      productos,
      /cargandoInicial \? \(\s*<EsqueletoDeProductos/,
      /falloDeCarga \? \(\s*<ErrorDePantalla/,
      /safeProductos\.length === 0 \? \(/,
    ],
    [
      'Inventario',
      inventario,
      /cargandoInv \? \(\s*<EsqueletoDeInventario/,
      /falloDeCarga \? \(\s*<ErrorDePantalla/,
      /safeIngredientes\.length === 0 \? \(/,
    ],
  ];

  for (const [pantalla, codigo, carga, error, vacio] of casos) {
    it(`${pantalla}: esqueleto primero, después el error y al final el vacío de verdad`, () => {
      const alCargar = dondeEsta(codigo, carga);
      const alFallar = dondeEsta(codigo, error);
      const alEstarVacio = dondeEsta(codigo, vacio);
      expect(alCargar).toBeLessThan(alFallar);
      expect(alFallar).toBeLessThan(alEstarVacio);
    });
  }

  it('Productos e Inventario distinguen «no hay nada» de «la búsqueda no encontró nada»', () => {
    for (const [codigo, hayNada, sinResultados] of [
      [productos, /safeProductos\.length === 0 \? \(/, /filtered\.length === 0 \? \(/],
      [inventario, /safeIngredientes\.length === 0 \? \(/, /filtered\.length === 0 \? \(/],
    ] as const) {
      expect(dondeEsta(codigo, hayNada)).toBeLessThan(dondeEsta(codigo, sinResultados));
    }
  });

  it('un fallo de lectura SIN datos es un error, no «Sin recetas»', () => {
    expect(recetas).toMatch(/falloDeCarga\s*=\s*\(productosError && !productosRaw\)/);
    expect(productos).toMatch(/falloDeCarga = \(productosError && !productos\)/);
    expect(inventario).toMatch(/falloDeCarga = ingError && !ingredientes/);
  });

  it('las cifras del inventario no son «0» provisional mientras carga', () => {
    // Las tres tarjetas de arriba pintan un esqueleto en lugar de la cifra.
    expect(inventario.match(/cargandoInv \? \(\s*<Esqueleto /g)).toHaveLength(3);
  });
});

describe('las columnas de Recetas son fijas y las cifras van a la derecha', () => {
  it('la rejilla de la tabla tiene el nombre flexible y cuatro cifras y una flecha FIJAS', () => {
    expect(rejilla).toMatch(
      /COLUMNAS_DE_LA_TABLA =\s*'@2xl:grid-cols-\[minmax\(0,1fr\)(_\d+(?:\.\d+)?rem){5}\]'/,
    );
  });

  it('la cabecera de cada fila y el encabezado de la lista comparten esa misma rejilla', () => {
    expect(fila).toMatch(/className=\{`[^`]*\$\{REJILLA_DE_FILA\}`\}/);
    expect(rejilla).toMatch(/REJILLA_DE_FILA = `[^`]*\$\{COLUMNAS_DE_LA_TABLA\}`/);
    expect(rejilla).toMatch(/text-\[10px\][^`]*@2xl:grid \$\{COLUMNAS_DE_LA_TABLA\}/);
    expect(recetas).toMatch(/<EncabezadoDeColumnas \/>\s*<div className="space-y-2">/);
  });

  it('las cifras son tabulares y se pegan a la derecha', () => {
    expect(rejilla).toMatch(/min-w-0 text-right[\s\S]*font-heading font-bold tabular-nums/);
  });
});

describe('la foto del platillo tiene proporción fija, carga en diferido y una salida digna', () => {
  it('caja de proporción fija, recorte al centro y dimensiones reservadas', () => {
    expect(foto).toMatch(/aspect-\[16\/9\]/);
    expect(foto).toMatch(/object-cover/);
    expect(foto).toMatch(/width=\{ANCHO_DE_LA_FOTO\}\s*height=\{ALTO_DE_LA_FOTO\}/);
  });

  it('carga en diferido y, si la foto falla, vuelve a la inicial en vez de un hueco roto', () => {
    expect(foto).toMatch(/loading="lazy"/);
    expect(foto).toMatch(/onError=\{\(\) => setUrlRota\(url\)\}/);
    expect(foto).toMatch(
      /hayFoto\s*=\s*typeof url === 'string' && url\.trim\(\) !== '' && urlRota !== url/,
    );
  });

  it('la tarjeta de Productos usa el componente y no pinta un `<img>` por su cuenta', () => {
    expect(productos).toMatch(/<ImagenDePlatillo url=\{p\.imagen_url\} nombre=\{p\.nombre\} \/>/);
    expect(productos).not.toMatch(/<img\b/);
  });
});
