import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { leerMigraciones } from './lectura.ts';

/**
 * Pruebas de la lectura de migraciones. No tocan Postgres: el módulo bajo prueba
 * sólo lee archivos, y por eso vive separado del ejecutor.
 *
 * Cubren lo que decide si una migración se aplica y en qué orden: nombre,
 * numeración, orden y hash. La parte que sí toca Postgres —transacción de la
 * tanda, ledger, deteccion de migraciones editadas— vive en
 * `ejecutor.integracion.test.ts` (F1.1-T02+), que ejecuta SQL de verdad.
 *
 * Esa separación es deliberada, y responde a la corrección del acta de F1.0:
 * lo que no toca Postgres no se llama prueba de integración.
 */

const carpetas: string[] = [];

function carpetaCon(archivos: Record<string, string>): string {
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-migraciones-'));
  carpetas.push(carpeta);
  for (const [nombre, contenido] of Object.entries(archivos)) {
    writeFileSync(join(carpeta, nombre), contenido);
  }
  return carpeta;
}

afterEach(() => {
  while (carpetas.length > 0) {
    rmSync(carpetas.pop()!, { recursive: true, force: true });
  }
});

describe('lectura de migraciones', () => {
  it('las ordena por el prefijo numérico, no por el nombre del archivo', () => {
    // Ordenadas como texto, "010" iría antes que "002". Si el orden fuera el del
    // sistema de archivos, una migración que crea una tabla correría después de
    // la que le agrega una columna.
    const carpeta = carpetaCon({
      '010_agregar_columna.sql': 'select 10;',
      '002_crear_tabla.sql': 'select 2;',
      '001_extensiones.sql': 'select 1;',
    });

    expect(leerMigraciones(carpeta).map((m) => m.version)).toEqual([1, 2, 10]);
  });

  it('ignora lo que no sea .sql', () => {
    const carpeta = carpetaCon({
      '001_inicial.sql': 'select 1;',
      'README.md': '# notas',
    });

    expect(leerMigraciones(carpeta)).toHaveLength(1);
  });

  it('rechaza un nombre que no siga NNN_snake_case.sql', () => {
    for (const malo of ['1_inicial.sql', 'inicial.sql', '001-inicial.sql', '001_Inicial.sql']) {
      const carpeta = carpetaCon({ [malo]: 'select 1;' });
      expect(() => leerMigraciones(carpeta), malo).toThrow(/nombre inválido/);
    }
  });

  // Sin esto el orden lo decidiría el sistema de archivos, que difiere entre
  // Windows y Linux: la misma tanda se aplicaría distinto en local y en CI.
  it('rechaza dos migraciones con la misma versión', () => {
    const carpeta = carpetaCon({
      '003_productos.sql': 'select 1;',
      '003_categorias.sql': 'select 2;',
    });

    expect(() => leerMigraciones(carpeta)).toThrow(/comparten la versión 3/);
  });

  it('extrae el nombre sin el prefijo', () => {
    const carpeta = carpetaCon({ '007_sesiones_de_caja.sql': 'select 1;' });
    expect(leerMigraciones(carpeta)[0]?.nombre).toBe('sesiones_de_caja');
  });
});

describe('hash del contenido', () => {
  it('cambia cuando cambia el SQL', () => {
    const antes = leerMigraciones(carpetaCon({ '001_a.sql': 'create table t (id int);' }));
    const despues = leerMigraciones(carpetaCon({ '001_a.sql': 'create table t (id bigint);' }));

    expect(antes[0]?.hash).not.toBe(despues[0]?.hash);
  });

  // Con `core.autocrlf` de Windows, un checkout reescribe los finales de línea.
  // Si el hash cambiara por eso, el ejecutor gritaría que TODAS las migraciones
  // fueron editadas cada vez que alguien clona en otra máquina.
  it('NO cambia por el final de línea ni por espacio al final', () => {
    const unix = leerMigraciones(carpetaCon({ '001_a.sql': 'create table t (\n  id int\n);\n' }));
    const windows = leerMigraciones(
      carpetaCon({ '001_a.sql': 'create table t (\r\n  id int\r\n);\r\n\r\n' }),
    );

    expect(windows[0]?.hash).toBe(unix[0]?.hash);
  });

  it('es estable entre lecturas del mismo contenido', () => {
    const carpeta = carpetaCon({ '001_a.sql': 'select 1;' });
    expect(leerMigraciones(carpeta)[0]?.hash).toBe(leerMigraciones(carpeta)[0]?.hash);
  });

  it('distingue contenidos distintos de la misma longitud', () => {
    const uno = leerMigraciones(carpetaCon({ '001_a.sql': 'select 1;' }));
    const dos = leerMigraciones(carpetaCon({ '001_a.sql': 'select 2;' }));

    expect(uno[0]?.hash).not.toBe(dos[0]?.hash);
  });
});
