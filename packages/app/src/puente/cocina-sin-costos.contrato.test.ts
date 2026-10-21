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
      Record<string, { readonly rolesLectura?: readonly string[]; readonly columna?: string }>
    >[] = [mapa.campos, mapa.derivados ?? {}, mapa.calculados ?? {}];
    for (const grupo of grupos) {
      for (const [campo, definicion] of Object.entries(grupo)) {
        // El NOMBRE o la COLUMNA (auditoría de la 2.4): un campo que se llame `importe` y
        // lea `costo_unitario_centavos` también es un costo, y mirando sólo el nombre se
        // colaba.
        const columna = typeof definicion.columna === 'string' ? definicion.columna : '';
        if (!ES_COSTO.test(campo) && !ES_COSTO.test(columna)) continue;
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

  it('ni el gramaje de la receta: la cocina ve los ingredientes, no la cantidad (F1-04 §36.4)', () => {
    // Se colaba porque su nombre no dice «costo»: `recetas.cantidad` con su unidad es la
    // receta entera a la vista (cierre del 21-10).
    const receta = MAPA['RecetaEscandallo'];
    if (receta === undefined) throw new Error('RecetaEscandallo ya no está en el mapa.');
    const queVeCocina = Object.entries(receta.campos)
      .filter(([, campo]) => (campo.rolesLectura ?? receta.rolesLectura).includes('cocina'))
      .map(([nombre]) => nombre);
    expect(receta.rolesLectura).toContain('cocina');
    expect(queVeCocina).toContain('ingrediente_id');
    for (const gramaje of [
      'cantidad_usada',
      'cantidad_convertida_unidad_base',
      'unidad_usada',
      'unidad',
      'merma_porcentaje',
    ]) {
      expect(queVeCocina, `la cocina lee «${gramaje}» de la receta`).not.toContain(gramaje);
    }
  });

  it('ni los importes de las cuentas: ningún precio, ningún total (F1-04 §36.4)', () => {
    // La suma de las líneas por cuenta reconstruía el total que `Venta` le cierra.
    const importes: Readonly<Record<string, readonly string[]>> = {
      DetalleVenta: [
        'precio_unitario_snapshot',
        'descuento',
        'subtotal',
        'total',
        'precio_por_unidad_snapshot',
      ],
      SolicitudQR: ['subtotal_consumo', 'propina_monto_sugerida', 'propina_porcentaje_sugerido'],
    };
    for (const [entidad, campos] of Object.entries(importes)) {
      const mapa = MAPA[entidad];
      if (mapa === undefined) throw new Error(`${entidad} ya no está en el mapa.`);
      for (const nombre of campos) {
        const campo = mapa.campos[nombre];
        expect(campo, `${entidad}.${nombre} ya no existe`).toBeDefined();
        const roles = campo?.rolesLectura ?? mapa.rolesLectura;
        expect(roles, `la cocina lee ${entidad}.${nombre}`).not.toContain('cocina');
        expect(roles, `la sala dejó de leer ${entidad}.${nombre}`).toContain('mesero');
      }
    }
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
