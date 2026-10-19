import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { comandosRegistrados } from '../pruebas/comandos-registrados.ts';

/**
 * LA ENTRADA MAL ESCRITA ES UN 400, NUNCA UN 500 (cierre de la 2.4).
 *
 * zod 4 corre los `refine` aunque la comprobación de antes no haya pasado. Una cantidad que
 * se valida con un `regex` y después con `BigInt(texto) > 0n` LANZA ante «abc»: el `refine`
 * revienta dentro de `safeParse`, el envoltorio lo toma por un fallo de infraestructura y
 * la compra con un dígito mal tecleado contestaba «Algo falló de nuestro lado» (500) en vez
 * de decir qué campo estaba mal. Lo encontró la prueba de aislamiento en el registro del
 * servidor: `compras.registrar fallo. causa=SyntaxError`.
 *
 * Aquí se le da a la entrada de CADA comando registrado basura con su forma —cada texto
 * vale «abc», «», «1.2.3», «-», «-0», «0x10»…— y se exige que `safeParse` conteste, sin
 * lanzar. Se arregla con `abort: true` en la comprobación que el `refine` necesita
 * cumplida, o con un `refine` que no lance.
 */
const BASURA = ['abc', '', ' ', '1.2.3', '-', '-0', '0x10', '1e3', '٣', '9'.repeat(40)];

/** Una entrada con la forma del esquema JSON y `texto` en cada hoja de texto. */
function conBasura(esquema: unknown, texto: string): unknown {
  if (typeof esquema !== 'object' || esquema === null) return texto;
  const nodo = esquema as {
    type?: string | string[];
    properties?: Record<string, unknown>;
    items?: unknown;
    anyOf?: unknown[];
    oneOf?: unknown[];
    allOf?: unknown[];
  };
  const opcion = nodo.anyOf?.[0] ?? nodo.oneOf?.[0] ?? nodo.allOf?.[0];
  if (opcion !== undefined) return conBasura(opcion, texto);
  if (nodo.type === 'object') {
    return Object.fromEntries(
      Object.entries(nodo.properties ?? {}).map(([clave, valor]) => [
        clave,
        conBasura(valor, texto),
      ]),
    );
  }
  if (nodo.type === 'array') return [conBasura(nodo.items, texto)];
  return texto;
}

const COMANDOS = await comandosRegistrados();

describe('la entrada de cada comando contesta, no lanza', () => {
  it('se cargan los comandos de verdad', () => {
    expect(COMANDOS.size).toBeGreaterThan(250);
  });

  it('con basura en cada texto, `safeParse` dice qué está mal y no revienta', () => {
    const revientan: string[] = [];
    for (const [nombre, definicion] of COMANDOS) {
      const esquema = z.toJSONSchema(definicion.entrada, { io: 'input', unrepresentable: 'any' });
      for (const texto of BASURA) {
        try {
          definicion.entrada.safeParse(conBasura(esquema, texto));
        } catch (fallo) {
          revientan.push(`${nombre} con «${texto.slice(0, 8)}»: ${String(fallo).slice(0, 80)}`);
          break;
        }
      }
    }
    expect(revientan).toEqual([]);
  });
});
