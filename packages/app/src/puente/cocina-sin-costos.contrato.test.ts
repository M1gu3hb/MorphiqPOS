import { describe, expect, it } from 'vitest';

import { MAPA } from './mapa.ts';

/**
 * C.9 de la 2.4 · COCINA NUNCA VE COSTOS.
 *
 * La pantalla de cocina lee platillos, comandas y recetas, y cada vez que el puente gana un
 * campo nuevo —la existencia, los minutos de procesado, las faltas— cabe que se cuele uno
 * de dinero sin su `rolesLectura`. La propiedad se mira sobre el MAPA entero, no sobre una
 * lista: cualquier campo cuyo nombre diga costo, utilidad, margen o valor, y que el rol
 * `cocina` pudiera leer —por su `rolesLectura` o, sin él, por el de su entidad—, es un
 * costo que llega a la cocina.
 */

const ES_COSTO = /costo|utilidad|margen|valor_perdido|valor_centavos|dormido/i;

interface Hallazgo {
  readonly entidad: string;
  readonly campo: string;
}

function costosQueVeCocina(): readonly Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const [entidad, mapa] of Object.entries(MAPA)) {
    const deLaEntidad = mapa.rolesLectura;
    const grupos: readonly Readonly<
      Record<string, { readonly rolesLectura?: readonly string[] }>
    >[] = [mapa.campos, mapa.derivados ?? {}, mapa.calculados ?? {}];
    for (const grupo of grupos) {
      for (const [campo, definicion] of Object.entries(grupo)) {
        if (!ES_COSTO.test(campo)) continue;
        const roles = definicion.rolesLectura ?? deLaEntidad;
        // Sin roles en ninguno de los dos niveles lo lee cualquiera, cocina incluida.
        if (roles === undefined || roles.includes('cocina')) hallazgos.push({ entidad, campo });
      }
    }
  }
  return hallazgos;
}

describe('el puente · cocina nunca ve costos', () => {
  it('ningún campo de costo, utilidad, margen o valor le llega al rol cocina', () => {
    expect(costosQueVeCocina()).toEqual([]);
  });

  it('la búsqueda encuentra campos de costo (si no, no mira nada)', () => {
    const conCosto = Object.values(MAPA).flatMap((m) =>
      [...Object.keys(m.campos), ...Object.keys(m.calculados ?? {})].filter((c) =>
        ES_COSTO.test(c),
      ),
    );
    expect(conCosto.length).toBeGreaterThan(10);
  });
});
