import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { diferenciasDeContrato, type ContratoEsquema } from './contrato-esquema.ts';

const BASE: ContratoEsquema = {
  columnas: [
    {
      clave: 'ordenes.total_centavos',
      tabla: 'ordenes',
      columna: 'total_centavos',
      tipo: 'bigint',
      noNula: true,
      defaultSql: '0',
    },
  ],
  restricciones: [
    {
      clave: 'ordenes.orden_total_no_negativo',
      tabla: 'ordenes',
      nombre: 'orden_total_no_negativo',
      tipo: 'check',
      definicion: 'CHECK ((total_centavos >= 0))',
    },
    {
      clave: 'pagos.pagos_orden_fk',
      tabla: 'pagos',
      nombre: 'pagos_orden_fk',
      tipo: 'foreign_key',
      definicion: 'FOREIGN KEY (orden_id) REFERENCES ordenes(id)',
    },
  ],
  indices: [
    {
      clave: 'ordenes.ordenes_pkey',
      tabla: 'ordenes',
      nombre: 'ordenes_pkey',
      definicion: 'CREATE UNIQUE INDEX ordenes_pkey ON public.ordenes USING btree (id)',
    },
  ],
};

const FUENTE =
  process.env['MORPHIQPOS_SCHEMA_CONTRACT_SOURCE_PATH'] ??
  fileURLToPath(new URL('./contrato-esquema.ts', import.meta.url));
const MANIFIESTO =
  process.env['MORPHIQPOS_PACKAGE_JSON_PATH'] ??
  fileURLToPath(new URL('../../../../package.json', import.meta.url));

function entradaEn(entradas: ContratoEsquema['columnas'], indice: number) {
  const entrada = entradas[indice];
  if (entrada === undefined) throw new Error(`Falta la entrada ${String(indice)} de la prueba.`);
  return entrada;
}

describe('C-12 · contrato completo entre repositorio y base', () => {
  it('detecta tipo, nulabilidad, default, check, FK e índice distintos', () => {
    const alterado: ContratoEsquema = structuredClone(BASE);
    alterado.columnas[0] = {
      ...entradaEn(alterado.columnas, 0),
      tipo: 'integer',
      noNula: false,
      defaultSql: null,
    };
    alterado.restricciones[0] = {
      ...entradaEn(alterado.restricciones, 0),
      definicion: 'CHECK ((total_centavos > 0))',
    };
    alterado.restricciones.splice(1, 1);
    alterado.indices[0] = {
      ...entradaEn(alterado.indices, 0),
      definicion: 'CREATE INDEX ordenes_pkey ON public.ordenes USING btree (id)',
    };

    const diferencias = diferenciasDeContrato(BASE, alterado);
    expect(diferencias.join('\n')).toContain('ordenes.total_centavos');
    expect(diferencias.join('\n')).toContain('ordenes.orden_total_no_negativo');
    expect(diferencias.join('\n')).toContain('pagos.pagos_orden_fk');
    expect(diferencias.join('\n')).toContain('ordenes.ordenes_pkey');
  });

  it('está conectado a verify y compara las tres categorías', () => {
    expect(readFileSync(FUENTE, 'utf8')).toContain(
      "const CATEGORIAS = ['columnas', 'restricciones', 'indices'] as const",
    );
    const manifiesto: unknown = JSON.parse(readFileSync(MANIFIESTO, 'utf8'));
    if (typeof manifiesto !== 'object' || manifiesto === null || !('scripts' in manifiesto)) {
      throw new Error('package.json no contiene scripts.');
    }
    const scripts = manifiesto.scripts;
    if (typeof scripts !== 'object' || scripts === null) {
      throw new Error('package.json contiene scripts inválidos.');
    }
    expect('verify:esquema' in scripts && scripts['verify:esquema']).toContain(
      'verificar-esquema-aplicado.mjs',
    );
    expect('verify' in scripts && scripts.verify).toContain('pnpm verify:esquema');
  });
});
