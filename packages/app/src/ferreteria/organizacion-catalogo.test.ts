import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { asignarUbicacion, declararEquivalencia, declararLinea } from './organizacion-catalogo.ts';

/**
 * F-021, F-152 y F-060 · Cómo se ordena un catálogo de 6,000 claves.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que un atributo de LISTA sin opciones se rechace. Es un campo de texto con
 * otro nombre: quien da de alta teclea lo que quiera y la búsqueda por acabado
 * muere al tercer mes, que es exactamente el problema que la línea vino a
 * resolver.
 *
 * Que la gaveta se REUTILICE. Crear una fila por producto llenaría la tabla de
 * «pasillo 3 gaveta 12» repetido cuarenta veces, y cambiar el orden de recorrido
 * habría que hacerlo cuarenta veces también.
 *
 * Y que el sustituto sea bidireccional y el complemento no. Si la de 13 mm
 * sirve por la de 1/2, la de 1/2 sirve por la de 13. El teflón va con la llave,
 * pero ofrecer una llave a quien pide teflón es ruido en el mostrador.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const TORNILLO = 'f1000000-0000-4000-8000-000000000001';
const TUERCA = 'f1000000-0000-4000-8000-000000000002';
const ALMACEN = 'f2000000-0000-4000-8000-000000000001';

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      lineas: [],
      ubicaciones: [],
      equivalencias: [],
      productos: [
        { id: TORNILLO, organizacion_id: ORG, nombre: 'Tornillo 1/4', ubicacion_id: null },
        { id: TUERCA, organizacion_id: ORG, nombre: 'Tuerca 1/4', ubicacion_id: null },
      ],
      ...extra,
    },
    {
      predeterminados: {
        lineas: { padre_id: null, esquema_atributos: [], orden: 0, activa: true },
        ubicaciones: { descripcion: null, zona_id: null, orden_recorrido: 0, activa: true },
        equivalencias: { nota: null, declarado_por: null },
      },
    },
  );
}

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-021 · la línea con su esquema', () => {
  it('guarda las claves que después filtran los 6,000 tornillos', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await declararLinea.ejecutar(ctx, {
      nombre: 'Tornillería',
      padreId: null,
      esquemaAtributos: [
        { clave: 'diametro', etiqueta: 'Diámetro', tipo: 'medida' },
        {
          clave: 'acabado',
          etiqueta: 'Acabado',
          tipo: 'lista',
          opciones: ['galvanizado', 'negro'],
        },
      ],
      orden: 1,
    });

    expect(salida.claves).toEqual(['diametro', 'acabado']);
    expect(base.filas('lineas')).toHaveLength(1);
  });

  it('UN ATRIBUTO DE LISTA SIN OPCIONES SE RECHAZA', async () => {
    // Es un campo libre con otro nombre, y la búsqueda por acabado muere igual.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      declararLinea.ejecutar(ctx, {
        nombre: 'Tornillería',
        padreId: null,
        esquemaAtributos: [{ clave: 'acabado', etiqueta: 'Acabado', tipo: 'lista' }],
        orden: 0,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('lineas')).toHaveLength(0);
  });

  it('dos claves iguales se rechazan', async () => {
    // La pantalla de alta preguntaría lo mismo dos veces y el segundo valor
    // taparía al primero.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      declararLinea.ejecutar(ctx, {
        nombre: 'Tornillería',
        padreId: null,
        esquemaAtributos: [
          { clave: 'diametro', etiqueta: 'Diámetro', tipo: 'medida' },
          { clave: 'diametro', etiqueta: 'Ø', tipo: 'texto' },
        ],
        orden: 0,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('dos líneas con el mismo nombre bajo el mismo padre se rechazan', async () => {
    const base = baseDe({
      lineas: [{ id: 'l1', organizacion_id: ORG, padre_id: null, nombre: 'Tornillería' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      declararLinea.ejecutar(ctx, {
        nombre: 'Tornillería',
        padreId: null,
        esquemaAtributos: [],
        orden: 0,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
  });

  it('cuenta las claves que hereda del padre', async () => {
    const base = baseDe({
      lineas: [
        {
          id: 'l1',
          organizacion_id: ORG,
          padre_id: null,
          nombre: 'Tornillería',
          esquema_atributos: [
            { clave: 'diametro', etiqueta: 'Diámetro', tipo: 'medida' },
            { clave: 'largo', etiqueta: 'Largo', tipo: 'medida' },
          ],
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await declararLinea.ejecutar(ctx, {
      nombre: 'Pijas',
      padreId: 'l1',
      esquemaAtributos: [{ clave: 'punta', etiqueta: 'Punta', tipo: 'texto' }],
      orden: 0,
    });

    expect(salida.clavesHeredadas).toBe(2);
  });
});

describe('F-152 · la ubicación', () => {
  it('LA GAVETA SE REUTILIZA, no se duplica', async () => {
    // Cuarenta claves en la misma gaveta son cuarenta productos apuntando a UNA
    // fila, no cuarenta filas iguales.
    const base = baseDe({
      ubicaciones: [{ id: 'u1', organizacion_id: ORG, almacen_id: ALMACEN, codigo: 'P3-G12' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await asignarUbicacion.ejecutar(ctx, {
      productoId: TORNILLO,
      almacenId: ALMACEN,
      codigo: 'P3-G12',
      descripcion: null,
      zonaId: null,
      ordenRecorrido: 0,
    });

    expect(salida.yaExistia).toBe(true);
    expect(salida.ubicacionId).toBe('u1');
    expect(base.filas('ubicaciones')).toHaveLength(1);
  });

  it('una gaveta nueva se crea y se ata al producto', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await asignarUbicacion.ejecutar(ctx, {
      productoId: TORNILLO,
      almacenId: ALMACEN,
      codigo: 'P1-G01',
      descripcion: 'primera del pasillo',
      zonaId: null,
      ordenRecorrido: 10,
    });

    expect(salida.yaExistia).toBe(false);
    expect(base.campo('productos', 'ubicacion_id')).toBe(salida.ubicacionId);
  });

  it('un producto de otro negocio no existe', async () => {
    const base = baseDe({ productos: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      asignarUbicacion.ejecutar(ctx, {
        productoId: TORNILLO,
        almacenId: ALMACEN,
        codigo: 'P1-G01',
        descripcion: null,
        zonaId: null,
        ordenRecorrido: 0,
      }),
    );

    expect(codigo).toBe('PRODUCTO_NO_ENCONTRADO');
  });
});

describe('F-060 · la equivalencia', () => {
  it('EL SUSTITUTO VA Y VIENE por omisión', async () => {
    // Si la de 13 mm sirve por la de 1/2, la de 1/2 sirve por la de 13.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await declararEquivalencia.ejecutar(ctx, {
      productoId: TORNILLO,
      equivalenteId: TUERCA,
      tipo: 'sustituto',
      nota: null,
      bidireccional: null,
    });

    expect(salida.bidireccional).toBe(true);
  });

  it('EL COMPLEMENTO NO VA Y VIENE', async () => {
    // El teflón va con la llave; ofrecer una llave a quien pide teflón es ruido.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await declararEquivalencia.ejecutar(ctx, {
      productoId: TORNILLO,
      equivalenteId: TUERCA,
      tipo: 'complemento',
      nota: null,
      bidireccional: null,
    });

    expect(salida.bidireccional).toBe(false);
  });

  it('QUEDA QUIÉN LO DIJO: no es auditoría, es producto', async () => {
    // Cuando el mostradorista experto se vaya, lo que declaró se queda.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await declararEquivalencia.ejecutar(ctx, {
      productoId: TORNILLO,
      equivalenteId: TUERCA,
      tipo: 'sustituto',
      nota: 'misma medida en métrico',
      bidireccional: null,
    });

    expect(base.campo('equivalencias', 'declarado_por')).not.toBeNull();
  });

  it('una pieza NO es equivalente de sí misma', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      declararEquivalencia.ejecutar(ctx, {
        productoId: TORNILLO,
        equivalenteId: TORNILLO,
        tipo: 'sustituto',
        nota: null,
        bidireccional: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('la misma equivalencia no se declara dos veces', async () => {
    const base = baseDe({
      equivalencias: [
        {
          id: 'e1',
          organizacion_id: ORG,
          producto_id: TORNILLO,
          equivalente_id: TUERCA,
          tipo: 'sustituto',
          bidireccional: true,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      declararEquivalencia.ejecutar(ctx, {
        productoId: TORNILLO,
        equivalenteId: TUERCA,
        tipo: 'sustituto',
        nota: null,
        bidireccional: null,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('equivalencias')).toHaveLength(1);
  });

  it('una pieza que no existe no se puede emparejar', async () => {
    const base = baseDe({
      productos: [{ id: TORNILLO, organizacion_id: ORG, nombre: 'Tornillo 1/4' }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      declararEquivalencia.ejecutar(ctx, {
        productoId: TORNILLO,
        equivalenteId: TUERCA,
        tipo: 'sustituto',
        nota: null,
        bidireccional: null,
      }),
    );

    expect(codigo).toBe('PRODUCTO_NO_ENCONTRADO');
  });
});
