import { PAQUETES, PAQUETES_HEREDADOS } from '@morphiqpos/contracts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { contextoCatalogo } from '../catalogo/pruebas.ts';
import { cambiarPaquete } from './presentacion.ts';

const FUENTE_PRESENTACION =
  process.env['MORPHIQPOS_PRESENTACION_SOURCE_PATH'] ??
  fileURLToPath(new URL('./presentacion.ts', import.meta.url));
const FUENTE_CONFIGURACION_PUENTE =
  process.env['MORPHIQPOS_PUENTE_CONFIGURACION_SOURCE_PATH'] ??
  fileURLToPath(new URL('./configuracion.ts', import.meta.url));

describe('B-2 · paquete efectivo de la organización', () => {
  /**
   * Antes esto decía «sólo admite los paquetes que usa el gate», y su
   * contraejemplo era `'restaurante'`, que entonces no existía y hoy es una de
   * las tres plantillas. Lo que hay que afirmar ahora es más preciso:
   *
   *   · entran las tres plantillas nuevas,
   *   · entran TAMBIÉN los tres nombres viejos, a propósito, porque la pantalla
   *     que llama a esto vive en el frontend heredado y un navegador puede
   *     tenerla cacheada,
   *   · y no entra nada más.
   */
  it('admite las tres plantillas y los tres nombres viejos, y nada más', () => {
    for (const paquete of [...PAQUETES, ...PAQUETES_HEREDADOS]) {
      expect(cambiarPaquete.entrada.safeParse({ paquete }).success, paquete).toBe(true);
    }
    for (const invento of ['pro', 'restaurante_completo', 'TIENDA', '', 'salon']) {
      expect(cambiarPaquete.entrada.safeParse({ paquete: invento }).success, invento).toBe(false);
    }
  });

  it('sólo lo puede ejecutar el dueño', () => {
    expect(cambiarPaquete.roles).toEqual(['dueno']);
  });

  it('escribe organizaciones.paquete, que es la fuente leída por comando()', async () => {
    const { ctx, operaciones, auditorias } = contextoCatalogo([
      { giro: 'restaurante' },
      { id: ctxId() },
    ]);

    const salida = await cambiarPaquete.ejecutar(
      ctx,
      cambiarPaquete.entrada.parse({ paquete: 'restaurante' }),
    );

    expect(salida).toEqual({ paquete: 'restaurante' });
    expect(operaciones).toHaveLength(2);
    expect(operaciones[1]).toMatchObject({
      tipo: 'update',
      tabla: 'organizaciones',
      valores: { paquete: 'restaurante' },
      filtros: [{ columna: 'id', operador: '=', valor: ctx.ambito.organizacionId }],
    });
    expect(auditorias).toHaveLength(1);
  });

  it('rechaza Restaurante Pro para una tienda', async () => {
    const { ctx, operaciones } = contextoCatalogo([{ giro: 'tienda' }]);

    await expect(cambiarPaquete.ejecutar(ctx, { paquete: 'restaurante' })).rejects.toMatchObject({
      codigo: 'CONFIGURACION_INVALIDA',
    });
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]?.tipo).toBe('select');
  });

  it('no vuelve a escribir paquete_modo en el documento JSON', () => {
    const codigo = readFileSync(FUENTE_PRESENTACION, 'utf8');
    expect(codigo).toContain(".updateTable('organizaciones')");
    expect(codigo).not.toMatch(/\{\s*paquete_modo:\s*entrada\.paquete\s*\}/);

    const configuracion = readFileSync(FUENTE_CONFIGURACION_PUENTE, 'utf8');
    expect(configuracion).toContain('paquete_modo: fila.paquete');
  });
});

function ctxId(): string {
  return '11111111-1111-4111-8111-111111111111';
}
