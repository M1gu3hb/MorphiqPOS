import { describe, expect, it } from 'vitest';

import {
  canalDe,
  costoEnCanal,
  lineasParaGuardar,
  type InsumoDisponible,
  type LineaDeReceta,
} from './receta-de-barra.ts';
import {
  gruposDeLaBebida,
  variantesDeLaReceta,
  type OpcionDeLaBebida,
} from './variantes-de-receta.ts';

/**
 * El latte de 12 oz a $65: 18 g de café a $0.40, 180 ml de leche entera a $0.03 —la
 * que sustituye el grupo «Leche»— y el vaso de $3 que sólo sale para llevar. Los
 * importes llegan del puente EN PESOS, como los sirve.
 */
const LINEAS: readonly LineaDeReceta[] = [
  {
    id: 'r-cafe',
    ingrediente_id: 'ins-cafe',
    ingrediente_nombre: 'Café',
    cantidad_convertida_unidad_base: 18,
    unidad: 'g',
    costo_linea_calculado: 7.2,
    costo_unitario_base_snapshot: 0.4,
    merma_porcentaje: 0,
    aplica_canal: null,
  },
  {
    id: 'r-leche',
    ingrediente_id: 'ins-entera',
    ingrediente_nombre: 'Leche entera',
    cantidad_convertida_unidad_base: 180,
    unidad: 'ml',
    costo_linea_calculado: 5.4,
    costo_unitario_base_snapshot: 0.03,
    merma_porcentaje: 0,
    aplica_canal: null,
    sustituible_por_grupo_id: 'g-leche',
  },
  {
    id: 'r-vaso',
    ingrediente_id: 'ins-vaso',
    ingrediente_nombre: 'Vaso 12 oz',
    cantidad_convertida_unidad_base: 1,
    unidad: 'pieza',
    costo_linea_calculado: 3,
    costo_unitario_base_snapshot: 3,
    merma_porcentaje: 0,
    aplica_canal: ['llevar'],
  },
];

const INSUMOS: readonly InsumoDisponible[] = [
  { id: 'ins-avena', nombre: 'Leche de avena', unidad_base: 'ml', costo_por_unidad_base: 0.08 },
];

const opcion = (o: Partial<OpcionDeLaBebida> & { id: string; nombre: string }) =>
  ({
    producto_id: 'latte',
    grupo: null,
    delta_precio_centavos: 0,
    grupo_id: null,
    insumo_sustituto_id: null,
    factor_cantidad: 1,
    ...o,
  }) satisfies OpcionDeLaBebida;

const OPCIONES: readonly OpcionDeLaBebida[] = [
  opcion({ id: 'o-entera', nombre: 'Entera', grupo: 'Leche', grupo_id: 'g-leche' }),
  opcion({
    id: 'o-avena',
    nombre: 'Avena',
    grupo: 'Leche',
    grupo_id: 'g-leche',
    insumo_sustituto_id: 'ins-avena',
    delta_precio_centavos: 1000,
  }),
  opcion({ id: 'o-12', nombre: '12 oz', grupo: 'Tamaño', grupo_id: 'g-tamano' }),
  opcion({
    id: 'o-16',
    nombre: '16 oz',
    grupo: 'Tamaño',
    grupo_id: 'g-tamano',
    factor_cantidad: 1.44,
    delta_precio_centavos: 1500,
  }),
  opcion({ id: 'o-frio', nombre: 'Frío', grupo: 'Temperatura', grupo_id: 'g-temp' }),
];

const PRECIO = 6500;

function variante(id: string) {
  return variantesDeLaReceta(LINEAS, OPCIONES, INSUMOS, PRECIO).find((v) => v.opcionId === id);
}

describe('la tabla de variantes de la receta', () => {
  it('la opción que no cambia nada cuesta al centavo lo que la receta base', () => {
    expect(variante('o-entera')).toMatchObject({
      queCambia: null,
      precioCentavos: 6500,
      aqui: { centavos: 1260, margen: 81 },
      llevar: { centavos: 1560, margen: 76 },
    });
    // Y es lo mismo que suma la pantalla arriba, con el costo del puente.
    expect(costoEnCanal(LINEAS, 'aqui').centavos).toBe(1260);
    expect(costoEnCanal(LINEAS, 'llevar').centavos).toBe(1560);
  });

  it('la avena cambia SÓLO la leche, y sube el precio lo que dice su delta', () => {
    expect(variante('o-avena')).toMatchObject({
      queCambia: 'Leche entera → Leche de avena',
      precioCentavos: 7500,
      aqui: { centavos: 720 + 1440, margen: 71 },
      llevar: { centavos: 720 + 1440 + 300, margen: 67 },
    });
  });

  it('el 16 oz escala lo que se mide y deja el vaso en uno', () => {
    // 25.92 g × $0.40 = $10.368 → $10.37 · 259.2 ml × $0.03 = $7.776 → $7.78
    expect(variante('o-16')).toMatchObject({
      queCambia: '×1.44 toda la receta',
      precioCentavos: 8000,
      aqui: { centavos: 1037 + 778, margen: 77 },
      llevar: { centavos: 1037 + 778 + 300, margen: 74 },
    });
  });

  it('un grupo que no toca la receta no entra: la temperatura cuesta lo mismo', () => {
    const grupos = new Set(
      variantesDeLaReceta(LINEAS, OPCIONES, INSUMOS, PRECIO).map((v) => v.grupo),
    );
    expect([...grupos]).toEqual(['Leche', 'Tamaño']);
  });

  it('si ninguna línea declara el grupo, la avena no sustituye nada y el grupo no entra', () => {
    const sinDeclarar = LINEAS.map((l) => ({ ...l, sustituible_por_grupo_id: null }));
    const grupos = variantesDeLaReceta(sinDeclarar, OPCIONES, INSUMOS, PRECIO).map((v) => v.grupo);
    expect(grupos).not.toContain('Leche');
  });

  it('un sustituto que esta pantalla no conoce deja la variante SIN costo, no al de la entera', () => {
    const avena = variantesDeLaReceta(LINEAS, OPCIONES, [], PRECIO).find(
      (v) => v.opcionId === 'o-avena',
    );
    expect(avena?.aqui).toEqual({ centavos: null, margen: null });
    expect(avena?.queCambia).toBe('Leche entera → un insumo que no está en esta lista');
  });

  it('la merma de la línea entra en el costo de la variante', () => {
    const conMerma = LINEAS.map((l) => (l.id === 'r-leche' ? { ...l, merma_porcentaje: 5 } : l));
    const avena = variantesDeLaReceta(conMerma, OPCIONES, INSUMOS, PRECIO).find(
      (v) => v.opcionId === 'o-avena',
    );
    // 180 ml × $0.08 × 1.05 = $15.12
    expect(avena?.aqui.centavos).toBe(720 + 1512);
  });

  it('sin precio de venta hay costo pero no margen', () => {
    const avena = variantesDeLaReceta(LINEAS, OPCIONES, INSUMOS, null).find(
      (v) => v.opcionId === 'o-avena',
    );
    expect(avena?.aqui).toEqual({ centavos: 2160, margen: null });
  });

  it('los grupos de la bebida salen una vez cada uno, en el orden del menú', () => {
    expect(gruposDeLaBebida(OPCIONES)).toEqual([
      { grupoId: 'g-leche', nombre: 'Leche' },
      { grupoId: 'g-tamano', nombre: 'Tamaño' },
      { grupoId: 'g-temp', nombre: 'Temperatura' },
    ]);
  });
});

describe('la receta vuelve a guardarse con TODO lo que tenía', () => {
  it('el canal viaja como arreglo y se entiende', () => {
    expect(canalDe(['llevar'])).toBe('llevar');
    expect(canalDe(['aqui'])).toBe('aqui');
    expect(canalDe(null)).toBe('ambos');
    expect(canalDe([])).toBe('ambos');
  });

  it('el vaso «sólo para llevar» no entra en el costo de lo que se toma aquí', () => {
    expect(costoEnCanal(LINEAS, 'aqui')).toEqual({ centavos: 1260, sinCosto: 0 });
  });

  it('agregar una línea NO borra el canal, la merma ni el grupo de las demás', () => {
    const conMerma = LINEAS.map((l) => (l.id === 'r-leche' ? { ...l, merma_porcentaje: 2.5 } : l));
    expect(lineasParaGuardar(conMerma)).toEqual([
      {
        insumoId: 'ins-cafe',
        cantidad: '18',
        unidad: 'g',
        mermaBp: 0,
        aplicaCanal: 'ambos',
        sustituiblePorGrupoId: null,
      },
      {
        insumoId: 'ins-entera',
        cantidad: '180',
        unidad: 'ml',
        mermaBp: 250,
        aplicaCanal: 'ambos',
        sustituiblePorGrupoId: 'g-leche',
      },
      {
        insumoId: 'ins-vaso',
        cantidad: '1',
        unidad: 'pieza',
        mermaBp: 0,
        aplicaCanal: 'llevar',
        sustituiblePorGrupoId: null,
      },
    ]);
  });

  it('una línea sin cantidad no se reenvía: guardar sin ella la borraría', () => {
    const rota = LINEAS.map((l, i) =>
      i === 0 ? { ...l, cantidad_convertida_unidad_base: null } : l,
    );
    expect(lineasParaGuardar(rota)).toBeNull();
  });
});
