import type { Resultado } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  armarBanco,
  contextoDe,
  parametrosCrudos,
  parametrosDe,
  sqlDe,
  todoElSql,
  CENTRO,
  NORTE,
  type Banco,
} from './banco-de-pruebas.ts';
import { propinasPendientes } from './consultas.ts';
import { liquidarPropinas } from './liquidar.ts';

/**
 * El CUERPO de `propinas.liquidar` y `propinas.pendientes`, ejecutado.
 *
 * Es el bloqueante 2 del veredicto: las 34 pruebas anteriores morían en las
 * puertas y ninguna llegaba a `ejecutar`, así que sabotear el comando —total
 * fijo en un centavo, guarda de doble liquidación neutralizada, lista de órdenes
 * ignorada— no ponía nada en rojo. Cada prueba de aquí se validó rompiendo a
 * propósito lo que dice cazar; la mutación concreta va escrita en cada `it`.
 */

const ENTRADA = {
  rangoTipo: 'mes',
  desde: '2026-09-01T00:00:00.000Z',
  hasta: '2026-09-30T23:59:59.999Z',
} as const;

const LIQUIDACION = '00000000-0000-4000-8000-00000000d001';
const ORDEN_A = '00000000-0000-4000-8000-00000000e001';
const ORDEN_B = '00000000-0000-4000-8000-00000000e002';

/** 500 de propina en efectivo y 300 en tarjeta: 800 exactos, sin repartir. */
const DESGLOSE = [
  { metodo: 'efectivo', ventas: '70000', propinas: '500' },
  { metodo: 'tarjeta', ventas: '30000', propinas: '300' },
];

const MESEROS = [{ empleado_id: null, nombre: 'Ana', ventas: '2', propina: '800' }];

/**
 * Las siete respuestas de una liquidación que sale bien, en orden:
 * cerrojo · consecutivo · alta de la cabecera · reclamo · desglose · total ·
 * reparto por mesero.
 */
function respuestasFelices(ultimoFolio: string, reclamadas: readonly string[]) {
  return [
    [],
    [{ siguiente: String(BigInt(ultimoFolio) + 1n) }],
    [{ id: LIQUIDACION }],
    reclamadas.map((id) => ({ id })),
    DESGLOSE,
    [],
    MESEROS,
  ];
}

function datosDe<T>(salida: Resultado<T>): T {
  if (!salida.ok) throw new Error(`el comando falló con ${salida.error.codigo}`);
  return salida.datos;
}

function codigoDe(salida: Resultado<unknown>): string {
  return salida.ok ? 'ejecutó' : salida.error.codigo;
}

function reglaDe(salida: Resultado<unknown>): unknown {
  return salida.ok ? 'ejecutó' : salida.error.datos?.['regla'];
}

function liquidar(banco: Banco, peticion: Parameters<Banco['ejecutar']>[1]) {
  return banco.ejecutar(liquidarPropinas, peticion);
}

// ───────────────────────────── bloqueante 1 · el folio es de la ORGANIZACIÓN

describe('el folio de liquidación · la segunda sucursal también liquida', () => {
  it('el consecutivo sale de liquidaciones_propina y nunca de la tabla folios', async () => {
    // Mutación que la hace fallar: devolver `tomarFolio(tx, org, sucursal,'LIQ')`
    // de `repoFolios` al paso `tomar_folio` — el contador POR SUCURSAL que hacía
    // chocar a la segunda sucursal contra `liquidaciones_folio_unico`.
    const banco = armarBanco('restaurante_pro', respuestasFelices('6', [ORDEN_A]));

    const salida = await liquidar(banco, {
      entrada: ENTRADA,
      ambito: CENTRO,
      idempotencyKey: 'liq-folio-org',
    });

    expect(datosDe(salida).folio).toBe('LIQ-000007');
    expect(sqlDe(banco, 1)).toContain('from liquidaciones_propina');
    expect(sqlDe(banco, 1)).not.toContain('sucursal');
    expect(parametrosDe(banco, 1)).not.toContain(CENTRO.sucursalId);
    expect(parametrosDe(banco, 1)).toContain(CENTRO.organizacionId);
    expect(todoElSql(banco)).not.toMatch(/\bfolios\b/);
    // El consecutivo derivado es el que se graba, no otro.
    expect(parametrosDe(banco, 2)).toContain('7');
  });

  it('Centro y Norte, misma organización, salen con folios distintos', async () => {
    // Mutación que la hace fallar: la misma de arriba. Con el contador por
    // sucursal las dos leen su propio 1 y Norte choca con 23505 para siempre.
    const centro = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));
    const norte = armarBanco('restaurante_pro', respuestasFelices('1', [ORDEN_B]));

    const enCentro = await liquidar(centro, {
      entrada: ENTRADA,
      ambito: CENTRO,
      idempotencyKey: 'liq-centro-01',
    });
    const enNorte = await liquidar(norte, {
      entrada: ENTRADA,
      ambito: NORTE,
      idempotencyKey: 'liq-norte-01',
    });

    expect(datosDe(enCentro).folio).toBe('LIQ-000001');
    expect(datosDe(enNorte).folio).toBe('LIQ-000002');
    expect(datosDe(enNorte).folio).not.toBe(datosDe(enCentro).folio);
    // Las dos preguntan por la MISMA organización, ninguna por su sucursal.
    expect(parametrosDe(norte, 1)).toContain(NORTE.organizacionId);
    expect(parametrosDe(norte, 1)).not.toContain(NORTE.sucursalId);
  });

  it('el cerrojo de transacción se pide ANTES de leer el consecutivo', async () => {
    // Mutación que la hace fallar: borrar el `pg_advisory_xact_lock` de
    // `folio.ts`. Sin él, dos sucursales leen el mismo `max` y las dos insertan
    // el mismo folio.
    const banco = armarBanco('restaurante_pro', respuestasFelices('3', [ORDEN_A]));

    await liquidar(banco, { entrada: ENTRADA, ambito: CENTRO, idempotencyKey: 'liq-cerrojo-1' });

    expect(sqlDe(banco, 0)).toContain('pg_advisory_xact_lock');
    expect(sqlDe(banco, 1)).toContain('max(l.folio)');
  });
});

// ─────────────────────── el total lo suma el servidor, y es exacto por método

describe('el importe lo pone el servidor', () => {
  it('el total grabado es la suma de los pagos reclamados, no un número del cliente', async () => {
    // Mutación que la hace fallar: fijar `total_centavos: 1n` en el paso
    // `fijar_total`, que es uno de los tres sabotajes del verificador.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A, ORDEN_B]));

    const datos = datosDe(
      await liquidar(banco, { entrada: ENTRADA, ambito: CENTRO, idempotencyKey: 'liq-total-srv' }),
    );

    expect(datos.totalCentavos).toBe('800');
    expect(datos.numeroVentas).toBe(2);
    expect(sqlDe(banco, 5)).toContain('update "liquidaciones_propina"');
    expect(parametrosDe(banco, 5)).toContain('800');
    expect(parametrosDe(banco, 5)).not.toContain('1');
  });

  it('un total colado en el cuerpo no se ignora: se rechaza la petición entera', async () => {
    // `validar` pone el esquema en modo estricto (`errores.ts:75-78`), así que
    // `total_liquidado` —lo que hoy manda `LiquidarPropinasDialog.jsx:103`
    // calculado en el navegador— ni siquiera llega a la base.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    const salida = await liquidar(banco, {
      entrada: { ...ENTRADA, totalCentavos: 999_999 },
      ambito: CENTRO,
      idempotencyKey: 'liq-total-col',
    });

    expect(codigoDe(salida)).toBe('ENTRADA_INVALIDA');
    expect(todoElSql(banco)).not.toContain('999999');
    expect(banco.conexion.consultas).toHaveLength(0);
  });

  it('el desglose por método es exacto: 500 y 300, nunca un reparto', async () => {
    // Mutación que la hace fallar: repartir el total en proporción a las ventas
    // (70 % / 30 % de 800 daría 560 y 240).
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    const datos = datosDe(
      await liquidar(banco, { entrada: ENTRADA, ambito: CENTRO, idempotencyKey: 'liq-desglose1' }),
    );

    expect(datos.desglose.efectivo.propinasCentavos).toBe('500');
    expect(datos.desglose.tarjeta.propinasCentavos).toBe('300');
    // Regla 1: la venta del desglose nunca lleva la propina dentro.
    expect(datos.desglose.ventasCentavos).toBe('100000');
  });
});

// ─────────────────────────────────── una propina no se liquida dos veces

describe('la guarda de doble liquidación', () => {
  it('si una de las órdenes ya estaba liquidada, aborta TODO y revierte', async () => {
    // Mutación que la hace fallar: sustituir `if (problema !== null) throw
    // problema;` por `void problema;` — el segundo sabotaje del verificador.
    const banco = armarBanco('restaurante_pro', [
      [],
      [{ siguiente: '1' }],
      [{ id: LIQUIDACION }],
      [{ id: ORDEN_A }],
      [{ id: ORDEN_B }],
    ]);

    const salida = await liquidar(banco, {
      entrada: { ...ENTRADA, ordenIds: [ORDEN_A, ORDEN_B] },
      ambito: CENTRO,
      idempotencyKey: 'liq-ya-liquid',
    });

    expect(codigoDe(salida)).toBe('REGLA_DE_NEGOCIO');
    expect(reglaDe(salida)).toBe('PROPINA_YA_LIQUIDADA');
    expect(banco.confirmada()).toBe(false);
    // No llegó a fijar ningún total: la cabecera se va con la reversión.
    expect(todoElSql(banco)).not.toContain('update "liquidaciones_propina"');
  });

  it('las órdenes aprobadas viajan al UPDATE que las reclama', async () => {
    // Mutación que la hace fallar: pasar `ordenIds: null` a `reclamarOrdenes` —
    // el tercer sabotaje del verificador: liquida el periodo entero en vez de la
    // lista que el administrador aprobó.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A, ORDEN_B]));

    await liquidar(banco, {
      entrada: { ...ENTRADA, ordenIds: [ORDEN_A, ORDEN_B] },
      ambito: CENTRO,
      idempotencyKey: 'liq-lista-ids',
    });

    expect(sqlDe(banco, 3)).toContain('update ordenes');
    expect(parametrosDe(banco, 3)).toContain(ORDEN_A);
    expect(parametrosDe(banco, 3)).toContain(ORDEN_B);
  });

  it('un identificador repetido no aborta una liquidación que está bien', async () => {
    // Mutación que la hace fallar: quitar el `new Set` de `solicitadas`. Con la
    // lista duplicada, `solicitadas.length` 2 contra `reclamadas.length` 1 hacía
    // saltar LIQUIDACION_INVALIDA sobre una pantalla correcta.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    const salida = await liquidar(banco, {
      entrada: { ...ENTRADA, ordenIds: [ORDEN_A, ORDEN_A] },
      ambito: CENTRO,
      idempotencyKey: 'liq-repetidos',
    });

    expect(codigoDe(salida)).toBe('ejecutó');
    expect(datosDe(salida).numeroVentas).toBe(1);
  });
});

// ──────────────────────────── una lista vacía no liquida todo el periodo

describe('la lista vacía explícita', () => {
  it('el esquema la rechaza antes de tocar la base', async () => {
    // Mutación que la hace fallar: quitar `.min(1)` de `ordenIds` en
    // `esquemas.ts`. Entonces `[]` valida y el comando liquida el mes entero.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    const salida = await liquidar(banco, {
      entrada: { ...ENTRADA, ordenIds: [] },
      ambito: CENTRO,
      idempotencyKey: 'liq-lista-vac',
    });

    expect(codigoDe(salida)).toBe('ENTRADA_INVALIDA');
    expect(banco.conexion.consultas).toHaveLength(0);
  });

  it('el cuerpo tampoco la colapsa en «todo el periodo»', async () => {
    // La otra mitad de la guarda, llamando por debajo de zod. Mutación que la
    // hace fallar: volver a `solicitadas.length === 0 ? null : [...]` en
    // `liquidar.ts`, que convertía «ninguna orden» en «sin filtro de ids».
    const banco = armarBanco('restaurante_pro', [
      [],
      [{ siguiente: '1' }],
      [{ id: LIQUIDACION }],
      [],
    ]);

    await expect(
      liquidarPropinas.ejecutar(contextoDe(banco, CENTRO), { ...ENTRADA, ordenIds: [] }),
    ).rejects.toThrow(/no hay propinas pendientes/i);

    const [primero] = parametrosCrudos(banco, 3).filter((p) => Array.isArray(p));
    expect(Array.isArray(primero)).toBe(true);
    expect(primero).toHaveLength(0);
  });
});

// ─────────────────────────────────────── el ámbito manda: sucursal de la sesión

describe('el ámbito de sucursal', () => {
  it('el reclamo se acota a la sucursal con la que se sella la liquidación', async () => {
    // Mutación que la hace fallar: quitar `and o.sucursal_id = …` de
    // `condicionPendiente`. Con eso, Centro reclama las propinas de Norte y las
    // sella contra su propia caja.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    await liquidar(banco, { entrada: ENTRADA, ambito: NORTE, idempotencyKey: 'liq-sucursal1' });

    expect(sqlDe(banco, 3)).toContain('o.sucursal_id =');
    expect(parametrosDe(banco, 3)).toContain(NORTE.sucursalId);
    expect(parametrosDe(banco, 3)).not.toContain(CENTRO.sucursalId);
    // Y la cabecera se graba con esa misma sucursal.
    expect(parametrosDe(banco, 2)).toContain(NORTE.sucursalId);
  });

  it('sin sucursal en la sesión no se liquida nada', async () => {
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    const salida = await liquidar(banco, {
      entrada: ENTRADA,
      ambito: { ...CENTRO, sucursalId: null },
      idempotencyKey: 'liq-sin-sucur',
    });

    expect(reglaDe(salida)).toBe('LIQUIDACION_INVALIDA');
    expect(banco.conexion.consultas).toHaveLength(0);
  });

  it('las tres lecturas de pendientes también se acotan a la sucursal', async () => {
    // Mutación que la hace fallar: la misma. Sin ella, un cajero de Norte lee el
    // nombre y el importe de propina de cada mesero de Centro.
    const banco = armarBanco('restaurante_pro', [[], [], []]);

    const salida = await banco.ejecutar(propinasPendientes, {
      entrada: { desde: ENTRADA.desde, hasta: ENTRADA.hasta },
      ambito: { ...NORTE, rol: 'cajero' },
    });

    expect(codigoDe(salida)).toBe('ejecutó');
    expect(banco.conexion.consultas).toHaveLength(3);
    expect(todoElSql(banco).split('o.sucursal_id =')).toHaveLength(4);
    expect(parametrosDe(banco, 0)).toContain(NORTE.sucursalId);
  });

  it('sin sucursal, pendientes falla en voz alta en vez de leer toda la organización', async () => {
    // Mutación que la hace fallar: quitar la guarda de `consultas.ts` y dejar
    // que el filtro se arme sin sucursal.
    const banco = armarBanco('restaurante_pro', [[], [], []]);

    const salida = await banco.ejecutar(propinasPendientes, {
      entrada: { desde: ENTRADA.desde, hasta: ENTRADA.hasta },
      ambito: { ...CENTRO, sucursalId: null, rol: 'cajero' },
    });

    expect(reglaDe(salida)).toBe('LIQUIDACION_INVALIDA');
    expect(banco.conexion.consultas).toHaveLength(0);
  });
});

// ───────────────────────────────────────────── atomicidad e interrupción

describe('atomicidad', () => {
  it('el reparto por mesero es un paso con nombre, y por tanto interrumpible', async () => {
    // Mutación que la hace fallar: sacar `propinasPorMeseroDeOrdenes` de
    // `ctx.paso`. Entonces el comando llega hasta el final —siete consultas— y
    // no hay forma de probar la reversión en ese punto.
    const banco = armarBanco('restaurante_pro', respuestasFelices('0', [ORDEN_A]));

    const salida = await liquidar(banco, {
      entrada: ENTRADA,
      ambito: CENTRO,
      idempotencyKey: 'liq-interrump',
      interrumpirEn: 'desglose_meseros',
    });

    expect(codigoDe(salida)).toBe('ERROR_INTERNO');
    expect(banco.confirmada()).toBe(false);
    expect(banco.conexion.consultas).toHaveLength(6);
  });
});
