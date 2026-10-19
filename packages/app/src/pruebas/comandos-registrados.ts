import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { DefinicionComando } from '../definicion.ts';

/**
 * TODOS LOS COMANDOS DE `packages/app/src`, cargados de sus módulos —sin pruebas ni dobles—.
 *
 * Para los contratos que recorren el registro entero: la frontera por sucursal (D-36) y la
 * entrada que no lanza. Un registro escrito a mano sólo contiene lo que alguien se acordó de
 * registrar; esto lee los archivos que llaman a `definirComando`.
 */
export type ComandoRegistrado = DefinicionComando<unknown, z.ZodType, unknown>;

function esDefinicion(valor: unknown): valor is ComandoRegistrado {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as { nombre?: unknown }).nombre === 'string' &&
    Array.isArray((valor as { roles?: unknown }).roles) &&
    typeof (valor as { ejecutar?: unknown }).ejecutar === 'function' &&
    (valor as { entrada?: unknown }).entrada instanceof z.ZodType
  );
}

function modulosConComandos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'pruebas' ? [] : modulosConComandos(ruta);
    if (!nombre.endsWith('.ts') || nombre.endsWith('.test.ts')) return [];
    return readFileSync(ruta, 'utf8').includes('definirComando') ? [ruta] : [];
  });
}

export async function comandosRegistrados(): Promise<ReadonlyMap<string, ComandoRegistrado>> {
  const comandos = new Map<string, ComandoRegistrado>();
  for (const ruta of modulosConComandos(fileURLToPath(new URL('..', import.meta.url)))) {
    const modulo = (await import(ruta)) as Record<string, unknown>;
    for (const valor of Object.values(modulo)) {
      if (esDefinicion(valor)) comandos.set(valor.nombre, valor);
    }
  }
  return comandos;
}
