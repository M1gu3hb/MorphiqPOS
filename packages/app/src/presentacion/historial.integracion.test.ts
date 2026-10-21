import { randomUUID } from 'node:crypto';

import { DEMOS } from '@morphiqpos/contracts/negocios';
import { conTransaccion, obtenerDb, obtenerPool, repoCaja } from '@morphiqpos/data';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { cerrarCaja } from '../caja/sesion.ts';
import { hojaDelCorte } from '../caja/corte/documento.ts';
import { resetearDemo } from '../demostracion/resetear.ts';
import { comando } from '../produccion.ts';
import { consultar } from '../puente/consultar.ts';
import {
  abrirCajaReal,
  ambitoDe,
  armarVenta,
  clave,
  cobrarEnEfectivo,
  exigirOk,
  sembrarNegocio,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { diaDeInstante, sumarDias, ventanaDeDias } from './historial-fechas.ts';
import { sembrarHistorialDePresentacion } from './historial.ts';

/**
 * EL HISTORIAL DE LA PRESENTACIÓN contra Postgres de verdad.
 *
 * Se siembra el restaurante de demostración —el mismo `configuracion.resetear_demo` que usa
 * `sembrar-demos.mjs`—, se le pone a mano la llave de espejo y se le escriben catorce días. Después
 * se mira la base: que lo vendido sea lo pagado, que las propinas cuadren por método, que cada
 * caja cierre con lo que se cobró, que el inventario sea el ledger, que no quede una comanda viva,
 * que cada hora caiga en el día de México que le toca y que el historial salga en las MISMAS
 * consultas con que Dashboard, Ventas y Registros leen. Y que sembrar dos veces, o a la vez, no
 * duplique nada.
 */

const PIMIENTA = 'pimienta_de_integracion_del_historial_2026';
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ PIN_PEPPER: PIMIENTA }),
}));

const DEMO = DEMOS.find((d) => d.slug === 'demo-acople-restaurante');
const SEMILLA = 20_261_020;
const ZONA = 'America/Mexico_City';
const LATENCIA_DE_SUPABASE_MS = 8;
const LATENCIA_PEOR_CASO_MS = 10;
const LIMITE_DE_DIEZ_DIAS_MS = 20_000;
const MAXIMO_DE_VIAJES_POR_DIA = 40;

const AYER = sumarDias(diaDeInstante(new Date(), ZONA), -1);
/** Catorce días terminando ayer; se siembran en dos llamadas, y tres más se agregan a la vez. */
const VENTANA = ventanaDeDias(AYER, 14);
const VENTANA_AMPLIADA = ventanaDeDias(AYER, 17);

let dueno: NegocioReal;
let sucursalId = '';
let terminalId = '';

interface Tiempos {
  readonly dias: number;
  readonly ms: number;
  readonly viajes: number;
}
let tiemposDeLaPrimeraLlamada: Tiempos | null = null;
let latenciaMs = 0;
let viajes = 0;

/** Cada consulta a la base espera lo que esperaría contra Supabase: aquí se mide el rendimiento. */
function simularLatencia(): void {
  const marca = Symbol.for('morphiq.prueba.latencia');
  obtenerPool().on('acquire', (cliente) => {
    const sello = cliente as unknown as Record<symbol, boolean>;
    if (sello[marca] === true) return;
    sello[marca] = true;
    const original = cliente.query.bind(cliente) as (...args: unknown[]) => Promise<unknown>;
    (cliente as unknown as { query: unknown }).query = (...args: unknown[]) => {
      viajes += 1;
      if (latenciaMs === 0) return original(...args);
      return new Promise((resolver, rechazar) => {
        setTimeout(() => {
          original(...args).then(resolver, rechazar);
        }, latenciaMs);
      });
    };
  });
}

async function filas<T extends object>(consulta: ReturnType<typeof sql<T>>): Promise<T[]> {
  const { rows } = await consulta.execute(obtenerDb());
  return rows;
}

async function contar(tabla: string): Promise<number> {
  const [fila] = await filas<{ n: string }>(
    sql<{
      n: string;
    }>`select count(*)::text as n from ${sql.table(tabla)} where organizacion_id = ${DEMO?.id ?? ''}`,
  );
  return Number(fila?.n ?? 0);
}

beforeAll(async () => {
  if (DEMO === undefined) throw new Error('La demo del restaurante no está en DEMOS.');
  const db = obtenerDb();
  const existe = await db
    .selectFrom('organizaciones')
    .select('id')
    .where('id', '=', DEMO.id)
    .executeTakeFirst();
  if (existe === undefined) {
    await db
      .insertInto('organizaciones')
      .values({
        id: DEMO.id,
        nombre: DEMO.nombre,
        slug: DEMO.slug,
        giro: 'restaurante',
        paquete: 'restaurante',
      })
      .execute();
  }
  const sucursal = await db
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', DEMO.id)
    .executeTakeFirst();
  sucursalId =
    sucursal?.id ??
    (
      await db
        .insertInto('sucursales')
        .values({ organizacion_id: DEMO.id, nombre: 'Centro' })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id;

  // Quien resetea: un dueño del negocio, con su identidad. Es el actor de todo lo que sigue.
  const ids = { persona: randomUUID(), identidad: randomUUID(), empleo: randomUUID() };
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('personas')
      .values({ id: ids.persona, organizacion_id: DEMO.id, nombre: 'Dueño del historial' })
      .execute();
    await tx
      .insertInto('identidades')
      .values({ id: ids.identidad, persona_id: ids.persona })
      .execute();
    await tx
      .insertInto('empleos')
      .values({ id: ids.empleo, persona_id: ids.persona, organizacion_id: DEMO.id, rol: 'dueno' })
      .execute();
  });
  dueno = {
    organizacionId: DEMO.id,
    identidadId: ids.identidad,
    empleoId: ids.empleo,
    rol: 'dueno',
  };

  exigirOk(
    await comando(resetearDemo, {
      entrada: { confirmacion: 'RESETEAR' },
      ambito: ambitoDe(dueno, sucursalId, null),
      idempotencyKey: clave(),
    }),
    'El reseteo de la demo del restaurante',
  );
  simularLatencia();
}, 180_000);

afterAll(async () => {
  // Deja la demo como la encontró cualquier otra suite: recién reseteada, sin historial.
  if (DEMO === undefined || process.env['HISTORIAL_CONSERVAR'] === '1') return;
  exigirOk(
    await comando(resetearDemo, {
      entrada: { confirmacion: 'RESETEAR' },
      ambito: ambitoDe(dueno, sucursalId, null),
      idempotencyKey: clave(),
    }),
    'El reseteo final de la demo del restaurante',
  );
}, 180_000);

const opciones = (extra: Partial<Parameters<typeof sembrarHistorialDePresentacion>[0]> = {}) => ({
  organizacionId: DEMO?.id ?? '',
  hastaDia: AYER,
  dias: 14,
  semilla: SEMILLA,
  ...extra,
});

async function ponerLaLlaveDeEspejo(): Promise<void> {
  await sql`
    update configuracion
       set valores = valores || ${JSON.stringify({ presentacion_espejo_de: randomUUID() })}::jsonb
     where organizacion_id = ${DEMO?.id ?? ''}
  `.execute(obtenerDb());
}

describe('sembrarHistorialDePresentacion · la guarda', () => {
  it('se niega en una organización sin la llave de espejo, y no escribe nada', async () => {
    await expect(sembrarHistorialDePresentacion(opciones())).rejects.toMatchObject({
      codigo: 'CONFIGURACION_INVALIDA',
      detalles: { motivo: 'no_es_espejo' },
    });
    expect(await contar('ordenes')).toBe(0);
    expect(await contar('sesiones_caja')).toBe(0);
    expect(await contar('compras')).toBe(0);
    expect(await contar('gastos')).toBe(0);
  });

  it('se niega en otro negocio cualquiera aunque exista y tenga catálogo', async () => {
    const otro = await sembrarNegocio({ nombre: 'Un negocio normal', rol: 'dueno' });
    await expect(
      sembrarHistorialDePresentacion(opciones({ organizacionId: otro.organizacionId })),
    ).rejects.toMatchObject({ detalles: { motivo: 'no_es_espejo' } });
  });

  it('se niega si la llave no es un uuid, o es la de la propia organización', async () => {
    const id = DEMO?.id ?? '';
    for (const llave of ['no-es-un-uuid', id]) {
      await sql`
        update configuracion set valores = valores || ${JSON.stringify({ presentacion_espejo_de: llave })}::jsonb
         where organizacion_id = ${id}
      `.execute(obtenerDb());
      await expect(sembrarHistorialDePresentacion(opciones())).rejects.toMatchObject({
        detalles: { motivo: 'no_es_espejo' },
      });
    }
    await ponerLaLlaveDeEspejo();
  });

  it('nunca siembra hoy, ni un día que no existe, ni una ventana absurda', async () => {
    const hoy = diaDeInstante(new Date(), ZONA);
    await expect(sembrarHistorialDePresentacion(opciones({ hastaDia: hoy }))).rejects.toMatchObject(
      {
        detalles: { motivo: 'dia_no_pasado' },
      },
    );
    await expect(
      sembrarHistorialDePresentacion(opciones({ hastaDia: '2026-02-30' })),
    ).rejects.toMatchObject({ detalles: { motivo: 'dia_invalido' } });
    await expect(sembrarHistorialDePresentacion(opciones({ dias: 0 }))).rejects.toMatchObject({
      detalles: { motivo: 'dias_invalidos' },
    });
    expect(await contar('ordenes')).toBe(0);
  });
});

describe('sembrarHistorialDePresentacion · el rendimiento y el troceo', () => {
  it('diez días con 8 ms por viaje caben en 20 s (≤ 40 viajes por día), y los que faltan quedan pendientes', async () => {
    latenciaMs = LATENCIA_DE_SUPABASE_MS;
    viajes = 0;
    const inicio = performance.now();
    const resultado = await sembrarHistorialDePresentacion(opciones({ maxDiasPorLlamada: 10 }));
    const ms = performance.now() - inicio;
    latenciaMs = 0;

    tiemposDeLaPrimeraLlamada = { dias: resultado.sembrados.length, ms, viajes };
    console.warn(
      `[historial] ${String(resultado.sembrados.length)} días con ${String(LATENCIA_DE_SUPABASE_MS)} ms por viaje: ` +
        `${(ms / 1000).toFixed(2)} s en total, ${(ms / resultado.sembrados.length).toFixed(0)} ms por día, ` +
        `${String(Math.round(viajes / resultado.sembrados.length))} viajes por día`,
    );

    // Del más viejo al más reciente: los diez primeros de la ventana.
    expect(resultado.sembrados).toEqual(VENTANA.slice(0, 10));
    expect(resultado.pendientes).toEqual(VENTANA.slice(10));
    expect(resultado.yaExistian).toEqual([]);

    // El presupuesto de verdad son los VIAJES: es lo que no depende de cuán cargada esté esta
    // máquina. A 10 ms por viaje contra Supabase, los de diez días son una fracción del límite;
    // escribir fila por fila serían cientos por día y reventaría este tope.
    const porDia = viajes / resultado.sembrados.length;
    expect(porDia).toBeLessThanOrEqual(MAXIMO_DE_VIAJES_POR_DIA);
    expect(viajes * LATENCIA_PEOR_CASO_MS).toBeLessThan(LIMITE_DE_DIEZ_DIAS_MS / 2);
    // Y el reloj, con holgura: en una máquina compartida y cargada la medición sube sin que el
    // historial tenga la culpa; el reporte trae la medida en una máquina tranquila.
    expect(ms).toBeLessThan(LIMITE_DE_DIEZ_DIAS_MS * 3);
  }, 180_000);

  it('la siguiente llamada termina los que faltaban y reconoce los que ya estaban', async () => {
    const inicio = performance.now();
    const resultado = await sembrarHistorialDePresentacion(opciones());
    console.warn(
      `[historial] ${String(resultado.sembrados.length)} días sin latencia: ` +
        `${((performance.now() - inicio) / resultado.sembrados.length).toFixed(0)} ms por día`,
    );
    expect(resultado.sembrados).toEqual(VENTANA.slice(10));
    expect(resultado.yaExistian).toEqual(VENTANA.slice(0, 10));
    expect(resultado.pendientes).toEqual([]);
    expect(await contar('sesiones_caja')).toBe(14);
  }, 120_000);

  it('el registro de días vive en la configuración y es el que dice la ventana', async () => {
    const [fila] = await filas<{ dias: string[] }>(
      sql<{
        dias: string[];
      }>`select valores #> '{presentacion_historial,dias}' as dias from configuracion where organizacion_id = ${DEMO?.id ?? ''}`,
    );
    expect([...(fila?.dias ?? [])].sort()).toEqual(VENTANA);
    expect(tiemposDeLaPrimeraLlamada?.dias).toBe(10);
  });
});

describe('sembrarHistorialDePresentacion · idempotencia y concurrencia', () => {
  it('volver a llamar no crea nada', async () => {
    const antes = {
      ordenes: await contar('ordenes'),
      pagos: await contar('pagos'),
      movimientos: await contar('movimientos_stock'),
      caja: await contar('movimientos_caja'),
    };
    const resultado = await sembrarHistorialDePresentacion(opciones());
    expect(resultado).toEqual({ sembrados: [], yaExistian: VENTANA, pendientes: [] });
    expect({
      ordenes: await contar('ordenes'),
      pagos: await contar('pagos'),
      movimientos: await contar('movimientos_stock'),
      caja: await contar('movimientos_caja'),
    }).toEqual(antes);
  });

  it('dos llamadas simultáneas siembran cada día UNA vez', async () => {
    const nuevos = VENTANA_AMPLIADA.slice(0, 3);
    const llamar = () => sembrarHistorialDePresentacion(opciones({ dias: 17 }));
    const [a, b] = await Promise.all([llamar(), llamar()]);

    expect([...a.sembrados, ...b.sembrados].sort()).toEqual(nuevos);
    expect(a.sembrados.filter((d) => b.sembrados.includes(d))).toEqual([]);
    expect([...a.pendientes, ...b.pendientes]).toEqual([]);
    for (const resultado of [a, b]) {
      expect([...resultado.sembrados, ...resultado.yaExistian].sort()).toEqual(VENTANA_AMPLIADA);
    }

    const duplicados = await filas<{ dia: string; n: string }>(
      sql<{ dia: string; n: string }>`
        select (abierta_en at time zone ${ZONA})::date::text as dia, count(*)::text as n
          from sesiones_caja where organizacion_id = ${DEMO?.id ?? ''}
         group by 1 having count(*) > 1`,
    );
    expect(duplicados).toEqual([]);
    expect(await contar('sesiones_caja')).toBe(17);
  }, 120_000);
});

interface FilaDeCaja {
  sesion: string;
  dia: string;
  fondo: string;
  esperado: string | null;
  contado: string | null;
  retirado: string | null;
  diferencia: string | null;
  movimientos: string;
  pagos_efectivo: string;
  propina_efectivo: string;
  gastos_efectivo: string;
  ventas: string;
  pagos_venta: string;
  tickets: string;
  folio: string;
}

describe('el historial sembrado cuadra', () => {
  const organizacion = (): string => DEMO?.id ?? '';

  async function cajas(): Promise<FilaDeCaja[]> {
    return filas<FilaDeCaja>(sql<FilaDeCaja>`
      select s.id as sesion,
             (s.abierta_en at time zone ${ZONA})::date::text as dia,
             s.fondo_inicial_centavos::text as fondo,
             s.efectivo_esperado_centavos::text as esperado,
             s.efectivo_contado_centavos::text as contado,
             s.efectivo_retirado_centavos::text as retirado,
             s.diferencia_centavos::text as diferencia,
             coalesce((select sum(m.monto_centavos) from movimientos_caja m where m.sesion_caja_id = s.id), 0)::text as movimientos,
             coalesce((select sum(p.monto_centavos) from pagos p where p.sesion_caja_id = s.id and p.metodo = 'efectivo'), 0)::text as pagos_efectivo,
             coalesce((select sum(p.propina_centavos) from pagos p where p.sesion_caja_id = s.id and p.metodo = 'efectivo'), 0)::text as propina_efectivo,
             coalesce((select sum(g.monto_centavos) from gastos g where g.sesion_caja_id = s.id and g.metodo_pago = 'efectivo'), 0)::text as gastos_efectivo,
             coalesce((select sum(o.total_centavos) from ordenes o where o.sesion_caja_id = s.id and o.estado = 'pagada'), 0)::text as ventas,
             coalesce((select sum(p.monto_centavos) from pagos p where p.sesion_caja_id = s.id and p.estado = 'confirmado'), 0)::text as pagos_venta,
             (select count(*) from ordenes o where o.sesion_caja_id = s.id and o.estado = 'pagada')::text as tickets,
             s.folio::text as folio
        from sesiones_caja s
       where s.organizacion_id = ${organizacion()}
       order by s.abierta_en`);
  }

  it('(a) la venta de cada día es la suma de sus pagos, sin propina', async () => {
    const dias = await cajas();
    expect(dias).toHaveLength(17);
    for (const dia of dias) {
      expect(BigInt(dia.ventas), dia.dia).toBe(BigInt(dia.pagos_venta));
      expect(Number(dia.tickets), dia.dia).toBeGreaterThanOrEqual(12);
      expect(Number(dia.tickets), dia.dia).toBeLessThanOrEqual(35);
    }
    const porDiaLocal = await filas<{ dia: string; ventas: string; pagos: string }>(
      sql<{ dia: string; ventas: string; pagos: string }>`
        with ventas as (
          select (cerrada_en at time zone ${ZONA})::date as dia, sum(total_centavos) as total
            from ordenes where organizacion_id = ${organizacion()} and estado = 'pagada' group by 1
        ), pagos_del_dia as (
          select (created_at at time zone ${ZONA})::date as dia, sum(monto_centavos) as total
            from pagos where organizacion_id = ${organizacion()} group by 1
        )
        select v.dia::text as dia, v.total::text as ventas, coalesce(p.total, 0)::text as pagos
          from ventas v left join pagos_del_dia p on p.dia = v.dia order by v.dia`,
    );
    expect(porDiaLocal.map((d) => d.dia)).toEqual(VENTANA_AMPLIADA);
    for (const d of porDiaLocal) expect(BigInt(d.ventas), d.dia).toBe(BigInt(d.pagos));
  });

  it('cada orden vale lo que suman sus líneas, y su utilidad es total menos costo', async () => {
    const malas = await filas<{ id: string }>(sql<{ id: string }>`
      select o.id from ordenes o
       where o.organizacion_id = ${organizacion()} and o.estado = 'pagada'
         and (o.total_centavos <> (select sum(l.total_centavos) from orden_lineas l where l.orden_id = o.id)
           or o.descuento_centavos <> (select sum(l.descuento_centavos) from orden_lineas l where l.orden_id = o.id)
           or o.utilidad_centavos <> o.total_centavos - o.costo_total_centavos
           or o.total_centavos <> (select sum(p.monto_centavos) from pagos p where p.orden_id = o.id))`);
    expect(malas).toEqual([]);
  });

  it('(b) las propinas por método cuadran con los pagos, la vista de la pantalla y el cajón', async () => {
    const [porMetodo] = await filas<Record<string, string>>(sql<Record<string, string>>`
      select coalesce(sum(p.propina_centavos) filter (where p.metodo = 'efectivo'), 0)::text as efectivo,
             coalesce(sum(p.propina_centavos) filter (where p.metodo = 'tarjeta'), 0)::text as tarjeta,
             coalesce(sum(p.propina_centavos) filter (where p.metodo = 'transferencia'), 0)::text as transferencia,
             coalesce(sum(p.propina_centavos), 0)::text as total
        from pagos p where p.organizacion_id = ${organizacion()}`);
    const [vista] = await filas<Record<string, string>>(sql<Record<string, string>>`
      select coalesce(sum(propina_efectivo_centavos), 0)::text as efectivo,
             coalesce(sum(propina_tarjeta_centavos), 0)::text as tarjeta,
             coalesce(sum(propina_transferencia_centavos), 0)::text as transferencia,
             coalesce(sum(propina_monto_centavos), 0)::text as total
        from ordenes_pagos_resumen where organizacion_id = ${organizacion()}`);
    const [cajon] = await filas<{ propina: string }>(sql<{ propina: string }>`
      select coalesce(sum(monto_centavos), 0)::text as propina
        from movimientos_caja where organizacion_id = ${organizacion()} and tipo = 'propina'`);
    expect(vista).toEqual(porMetodo);
    expect(cajon?.propina).toBe(porMetodo?.['efectivo']);
    expect(BigInt(porMetodo?.['tarjeta'] ?? '0')).toBeGreaterThan(0n);
    expect(BigInt(porMetodo?.['efectivo'] ?? '0')).toBeGreaterThan(0n);
  });

  it('(b) hay cuentas con tarjeta y la propina en billete: el renglón de efectivo SIN venta', async () => {
    const [fila] = await filas<{ n: string }>(sql<{ n: string }>`
      select count(*)::text as n from pagos e
       where e.organizacion_id = ${organizacion()} and e.metodo = 'efectivo'
         and e.monto_centavos = 0 and e.propina_centavos > 0
         and exists (select 1 from pagos t where t.orden_id = e.orden_id and t.metodo = 'tarjeta' and t.monto_centavos > 0)`);
    expect(Number(fila?.n)).toBeGreaterThan(0);
    const [malos] = await filas<{ n: string }>(sql<{ n: string }>`
      select count(*)::text as n from pagos
       where organizacion_id = ${organizacion()}
         and ((metodo <> 'efectivo' and (cambio_centavos <> 0 or recibido_centavos is not null))
           or (metodo = 'efectivo' and recibido_centavos <> monto_centavos + propina_centavos + cambio_centavos))`);
    expect(Number(malos?.n)).toBe(0);
  });

  it('(c) cada caja cierra con lo cobrado: fondo + efectivo + propinas en efectivo − salidas', async () => {
    for (const caja of await cajas()) {
      const calculado =
        BigInt(caja.fondo) +
        BigInt(caja.pagos_efectivo) +
        BigInt(caja.propina_efectivo) -
        BigInt(caja.gastos_efectivo);
      expect(BigInt(caja.movimientos), caja.dia).toBe(calculado);
      expect(BigInt(caja.esperado ?? '-1'), caja.dia).toBe(calculado);
      expect(BigInt(caja.contado ?? '-1'), caja.dia).toBe(calculado);
      expect(BigInt(caja.diferencia ?? '-1'), caja.dia).toBe(0n);
      expect(BigInt(caja.retirado ?? '-1'), caja.dia).toBe(
        BigInt(caja.contado ?? '0') - BigInt(caja.fondo),
      );
    }
  });

  it('(c) el arqueo de producción, el corte de turno y la hoja del corte dicen lo mismo', async () => {
    const dias = await cajas();
    const ambito = ambitoDe(dueno, sucursalId, null);
    for (const caja of dias.filter((_, i) => i % 4 === 0)) {
      const arqueo = await repoCaja.arqueoDeSesion(obtenerDb(), organizacion(), caja.sesion);
      expect(arqueo.efectivoEsperadoCentavos.toString(), caja.dia).toBe(caja.esperado);
      expect(arqueo.numeroVentas, caja.dia).toBe(Number(caja.tickets));

      const [corte] = await filas<{ contado: string; habia: string }>(sql<{
        contado: string;
        habia: string;
      }>`
        select c.efectivo_contado_centavos::text as contado,
               (select coalesce(sum(m.monto_centavos), 0) from movimientos_caja m
                 where m.sesion_caja_id = c.sesion_caja_id and m.created_at <= c.cortado_en)::text as habia
          from cortes_turno c where c.sesion_caja_id = ${caja.sesion}`);
      expect(corte?.contado, caja.dia).toBe(corte?.habia);

      const hoja = exigirOk(
        await comando(hojaDelCorte, {
          entrada: { sesionCajaId: caja.sesion },
          ambito,
          idempotencyKey: clave(),
        }),
        `La hoja del corte del ${caja.dia}`,
      );
      expect(hoja.sesion.esperadoCentavos, caja.dia).toBe(caja.esperado);
      expect(hoja.sesion.contadoCentavos, caja.dia).toBe(caja.contado);
      expect(hoja.sesion.diferenciaCentavos, caja.dia).toBe('0');
      expect(hoja.resumen.totalCentavos, caja.dia).toBe(caja.ventas);
      expect(hoja.resumen.tickets, caja.dia).toBe(Number(caja.tickets));
      const enEfectivo = hoja.metodos.find((m) => m.metodo === 'efectivo');
      expect(enEfectivo?.ventasCentavos, caja.dia).toBe(caja.pagos_efectivo);
      const conteo = hoja.conteo.reduce(
        (suma, c) => suma + BigInt(c.denominacionCentavos) * BigInt(c.piezas),
        0n,
      );
      expect(conteo, caja.dia).toBe(BigInt(caja.contado ?? '0'));
    }
  }, 120_000);

  it('(c) los folios de cada serie son consecutivos, sin huecos ni repetidos', async () => {
    const series = await filas<{
      serie: string;
      minimo: string;
      maximo: string;
      n: string;
      distintos: string;
    }>(
      sql<{ serie: string; minimo: string; maximo: string; n: string; distintos: string }>`
        select 'A' as serie, min(folio)::text as minimo, max(folio)::text as maximo, count(*)::text as n, count(distinct folio)::text as distintos
          from ordenes where organizacion_id = ${organizacion()} and serie = 'A'
        union all
        select 'CC', min(folio)::text, max(folio)::text, count(*)::text, count(distinct folio)::text
          from sesiones_caja where organizacion_id = ${organizacion()}
        union all
        select 'CT', min(folio)::text, max(folio)::text, count(*)::text, count(distinct folio)::text
          from cortes_turno where organizacion_id = ${organizacion()}`,
    );
    for (const s of series) {
      expect(s.minimo, s.serie).toBe('1');
      expect(Number(s.maximo), s.serie).toBe(Number(s.n));
      expect(s.distintos, s.serie).toBe(s.n);
    }
    const [siguientes] = await filas<{ a: string; cc: string; ct: string }>(
      sql<{ a: string; cc: string; ct: string }>`
        select max(siguiente) filter (where serie = 'A')::text as a,
               max(siguiente) filter (where serie = 'CC')::text as cc,
               max(siguiente) filter (where serie = 'CT')::text as ct
          from folios where organizacion_id = ${organizacion()}`,
    );
    expect(Number(siguientes?.cc)).toBe(18);
    expect(Number(siguientes?.ct)).toBe(18);
    expect(Number(siguientes?.a)).toBe(Number(series[0]?.n) + 1);
  });

  it('(d) la existencia de cada insumo es el ledger, nunca baja de cero, y es compras menos recetas por lo vendido', async () => {
    const desviadas = await filas<{ insumo: string; existencia: string; ledger: string }>(
      sql<{ insumo: string; existencia: string; ledger: string }>`
        select i.nombre as insumo, coalesce(e.cantidad, 0)::text as existencia,
               coalesce((select sum(m.cantidad) from movimientos_stock m where m.insumo_id = i.id), 0)::text as ledger
          from insumos i left join existencias e on e.insumo_id = i.id
         where i.organizacion_id = ${organizacion()}
           and coalesce(e.cantidad, 0) <> coalesce((select sum(m.cantidad) from movimientos_stock m where m.insumo_id = i.id), 0)`,
    );
    expect(desviadas).toEqual([]);

    const negativas = await filas<{ insumo: string }>(sql<{ insumo: string }>`
      select i.nombre as insumo from existencias e join insumos i on i.id = e.insumo_id
       where e.organizacion_id = ${organizacion()} and e.cantidad < 0`);
    expect(negativas).toEqual([]);

    // Contra una cuenta hecha desde las recetas y las líneas vendidas, no desde el ledger.
    const cuenta = await filas<{ insumo: string; esperado: string; ledger: string }>(
      sql<{ insumo: string; esperado: string; ledger: string }>`
        with vendido as (
          select r.insumo_id, sum(l.cantidad * r.cantidad) as q
            from orden_lineas l
            join ordenes o on o.id = l.orden_id and o.estado = 'pagada'
            join productos p on p.id = l.producto_id and p.estrategia_consumo = 'receta'
            join recetas r on r.producto_id = p.id and r.activa
           where o.organizacion_id = ${organizacion()} group by 1
          union all
          select i.id, sum(l.cantidad)
            from orden_lineas l
            join ordenes o on o.id = l.orden_id and o.estado = 'pagada'
            join productos p on p.id = l.producto_id and p.estrategia_consumo = 'sku'
            join insumos i on i.producto_id = p.id
           where o.organizacion_id = ${organizacion()} group by 1
        ), comprado as (
          select insumo_id, sum(cantidad) as q from compra_lineas
           where organizacion_id = ${organizacion()} group by 1
        ), inicial as (
          select insumo_id, sum(cantidad) as q from movimientos_stock
           where organizacion_id = ${organizacion()} and tipo = 'inventario_inicial' group by 1
        )
        select i.nombre as insumo,
               (coalesce(ini.q, 0) + coalesce(c.q, 0) - coalesce(v.q, 0))::text as esperado,
               coalesce(e.cantidad, 0)::text as ledger
          from insumos i
          left join inicial ini on ini.insumo_id = i.id
          left join comprado c on c.insumo_id = i.id
          left join vendido v on v.insumo_id = i.id
          left join existencias e on e.insumo_id = i.id
         where i.organizacion_id = ${organizacion()}
           and coalesce(ini.q, 0) + coalesce(c.q, 0) - coalesce(v.q, 0) <> coalesce(e.cantidad, 0)`,
    );
    expect(cuenta).toEqual([]);

    const [compras] = await filas<{ n: string; sin_proveedor: string; descuadradas: string }>(
      sql<{ n: string; sin_proveedor: string; descuadradas: string }>`
        select count(*)::text as n,
               count(*) filter (where proveedor_id is null)::text as sin_proveedor,
               count(*) filter (where total_centavos <> (select sum(l.costo_total_centavos) from compra_lineas l where l.compra_id = c.id))::text as descuadradas
          from compras c where organizacion_id = ${organizacion()}`,
    );
    expect(Number(compras?.n)).toBeGreaterThan(0);
    expect(compras?.sin_proveedor).toBe('0');
    expect(compras?.descuadradas).toBe('0');
  });

  it('(d) el saldo corrido del kardex nunca es negativo en los días sembrados', async () => {
    // El inventario inicial del espejo se anotó HOY y el historial es de días pasados: si el
    // historial contara con él, el saldo corrido de cada insumo nacería negativo en el kardex.
    const [kardex] = await filas<{ negativos: string; filas: string }>(
      sql<{ negativos: string; filas: string }>`
        select count(*) filter (where saldo < 0)::text as negativos, count(*)::text as filas
          from kardex
         where organizacion_id = ${organizacion()}
           and created_at < (date_trunc('day', now() at time zone ${ZONA}) at time zone ${ZONA})`,
    );
    expect(Number(kardex?.filas)).toBeGreaterThan(1000);
    expect(kardex?.negativos).toBe('0');
  });

  it('cada día sembrado deja su renglón en la auditoría, marcado como sintético', async () => {
    const dias = await filas<{ dia: string; sintetico: string; sesion: string }>(
      sql<{ dia: string; sintetico: string; sesion: string }>`
        select payload ->> 'dia' as dia, payload ->> 'sintetico' as sintetico, entidad_id::text as sesion
          from auditoria
         where organizacion_id = ${organizacion()} and accion = 'presentacion.sembrar_historial'
         order by payload ->> 'dia'`,
    );
    expect(dias.map((d) => d.dia)).toEqual(VENTANA_AMPLIADA);
    expect(dias.every((d) => d.sintetico === 'true')).toBe(true);
    const caja = await cajas();
    expect(dias.map((d) => d.sesion).sort()).toEqual(caja.map((c) => c.sesion).sort());
  });

  it('(e) no queda una comanda viva, ni una línea sin entregar, ni una caja abierta', async () => {
    const [vivas] = await filas<{
      comandas: string;
      items: string;
      lineas: string;
      abiertas: string;
      ordenes: string;
    }>(
      sql<{ comandas: string; items: string; lineas: string; abiertas: string; ordenes: string }>`
        select (select count(*) from comandas where organizacion_id = ${organizacion()} and estado in ('nuevo','en_preparacion','listo'))::text as comandas,
               (select count(*) from comanda_items where organizacion_id = ${organizacion()} and estado <> 'entregado')::text as items,
               (select count(*) from orden_lineas where organizacion_id = ${organizacion()} and estado_preparacion <> 'entregado')::text as lineas,
               (select count(*) from sesiones_caja where organizacion_id = ${organizacion()} and estado = 'abierta')::text as abiertas,
               (select count(*) from ordenes where organizacion_id = ${organizacion()} and estado <> 'pagada')::text as ordenes`,
    );
    expect(vivas).toEqual({ comandas: '0', items: '0', lineas: '0', abiertas: '0', ordenes: '0' });
    const [comandas] = await filas<{ n: string }>(sql<{ n: string }>`
      select count(*)::text as n from comandas where organizacion_id = ${organizacion()}`);
    expect(Number(comandas?.n)).toBeGreaterThan(100);
  });

  it('(f) todo cae en su día de México, aunque la noche sea del día siguiente en UTC', async () => {
    const fueraDeDia = await filas<{ tabla: string; id: string }>(sql<{
      tabla: string;
      id: string;
    }>`
      select 'ordenes' as tabla, o.id::text as id from ordenes o
       where o.organizacion_id = ${organizacion()}
         and (o.created_at at time zone ${ZONA})::date <> (o.cerrada_en at time zone ${ZONA})::date
      union all
      select 'pagos', p.id::text from pagos p join ordenes o on o.id = p.orden_id
       where p.organizacion_id = ${organizacion()} and p.created_at <> o.cerrada_en
      union all
      select 'movimientos_caja', m.id::text from movimientos_caja m join sesiones_caja s on s.id = m.sesion_caja_id
       where m.organizacion_id = ${organizacion()}
         and (m.created_at at time zone ${ZONA})::date <> (s.abierta_en at time zone ${ZONA})::date
      union all
      select 'sesiones_caja', s.id::text from sesiones_caja s
       where s.organizacion_id = ${organizacion()}
         and (s.cerrada_en at time zone ${ZONA})::date <> (s.abierta_en at time zone ${ZONA})::date
      union all
      select 'movimientos_stock', m.id::text from movimientos_stock m
       where m.organizacion_id = ${organizacion()} and m.tipo = 'salida_venta'
         and (m.created_at at time zone ${ZONA})::date not in (
           select (o.cerrada_en at time zone ${ZONA})::date from ordenes o where o.id = m.referencia_id)
      union all
      select 'compras', c.id::text from compras c
       where c.organizacion_id = ${organizacion()}
         and c.fecha <> (c.created_at at time zone ${ZONA})::date
      union all
      select 'gastos', g.id::text from gastos g
       where g.organizacion_id = ${organizacion()}
         and g.fecha <> (g.created_at at time zone ${ZONA})::date`);
    expect(fueraDeDia).toEqual([]);

    const [utc] = await filas<{ n: string }>(sql<{ n: string }>`
      select count(*)::text as n from ordenes
       where organizacion_id = ${organizacion()}
         and cerrada_en::date <> (cerrada_en at time zone ${ZONA})::date`);
    expect(Number(utc?.n)).toBeGreaterThan(0);

    const rango = await filas<{ primero: string; ultimo: string }>(sql<{
      primero: string;
      ultimo: string;
    }>`
      select min((created_at at time zone ${ZONA})::date)::text as primero,
             max((cerrada_en at time zone ${ZONA})::date)::text as ultimo
        from ordenes where organizacion_id = ${organizacion()}`);
    expect(rango[0]).toEqual({ primero: VENTANA_AMPLIADA[0], ultimo: AYER });
  });

  it('cada pieza respeta las restricciones de la base: la hora de apertura precede a la de cierre', async () => {
    const [mal] = await filas<{ n: string }>(sql<{ n: string }>`
      select count(*)::text as n from ordenes o
       where o.organizacion_id = ${organizacion()}
         and (o.cerrada_en < o.created_at
           or not exists (select 1 from sesiones_caja s where s.id = o.sesion_caja_id
                           and o.created_at >= s.abierta_en and o.cerrada_en <= s.cerrada_en))`);
    expect(mal?.n).toBe('0');
  });

  it('hay variedad de verdad: mesas y mostrador, descuentos con su bitácora, valoraciones, varios meseros', async () => {
    const [v] = await filas<Record<string, string>>(sql<Record<string, string>>`
      select count(*) filter (where canal = 'aqui')::text as mesa,
             count(*) filter (where canal = 'llevar')::text as llevar,
             count(*) filter (where descuento_centavos > 0)::text as descontadas,
             count(*) filter (where satisfaccion_score is not null)::text as valoradas,
             count(distinct empleado_atiende_id)::text as atendieron,
             count(distinct mesa_id)::text as mesas
        from ordenes where organizacion_id = ${organizacion()}`);
    expect(Number(v?.['mesa'])).toBeGreaterThan(Number(v?.['llevar']));
    expect(Number(v?.['llevar'])).toBeGreaterThan(0);
    expect(Number(v?.['valoradas'])).toBeGreaterThan(0);
    expect(Number(v?.['mesas'])).toBeGreaterThan(3);
    const [autorizadas] = await filas<{ n: string; huerfanas: string }>(sql<{
      n: string;
      huerfanas: string;
    }>`
      select count(*)::text as n,
             count(*) filter (where not exists (select 1 from ordenes o where o.id = a.orden_id and o.descuento_centavos = a.descuento_centavos))::text as huerfanas
        from autorizaciones_descuento a where organizacion_id = ${organizacion()}`);
    expect(autorizadas?.huerfanas).toBe('0');
    expect(Number(v?.['descontadas'])).toBeGreaterThanOrEqual(Number(autorizadas?.n));
  });
});

describe('el historial sale en las consultas de Dashboard, Ventas y Registros', () => {
  const ambito = (): { organizacionId: string; rol: 'dueno' } => ({
    organizacionId: DEMO?.id ?? '',
    rol: 'dueno',
  });

  it('Dashboard y Ventas: Venta.filter({estado:pagada}) y Venta.list traen las ventas con lo que pintan', async () => {
    const pagadas = await consultar(ambito(), {
      entidad: 'Venta',
      operacion: 'filter',
      filtro: { estado: 'pagada' },
    });
    expect(pagadas).toHaveLength(200);
    for (const v of pagadas) {
      expect(v).toMatchObject({ estado: 'pagada' });
      expect(typeof v['folio']).toBe('string');
      expect(typeof v['total']).toBe('number');
      expect(typeof v['fecha_cierre']).toBe('string');
      expect(typeof v['fecha_apertura']).toBe('string');
      expect(['efectivo', 'tarjeta', 'transferencia', 'mixto']).toContain(v['metodo_pago']);
      expect(typeof v['usuario_cajero_nombre']).toBe('string');
      expect(typeof v['costo_total_snapshot']).toBe('number');
      expect(typeof v['propina_monto']).toBe('number');
      // Dashboard separa efectivo, tarjeta y transferencia con lo FÍSICAMENTE recibido.
      expect(
        Math.round(
          ((v['monto_efectivo'] as number) +
            (v['monto_tarjeta'] as number) +
            (v['monto_transferencia'] as number)) *
            100,
        ),
      ).toBe(Math.round(((v['total'] as number) + (v['propina_monto'] as number)) * 100));
      expect(v['corte_caja_id']).toBeTruthy();
    }
    // La más reciente primero: es lo que Ventas y el Dashboard esperan.
    const fechas = pagadas.map((v) => String(v['fecha_apertura']));
    expect([...fechas].sort().reverse()).toEqual(fechas);
    expect(diaDeInstante(new Date(fechas[0] ?? ''), ZONA) <= AYER).toBe(true);

    const todas = await consultar(ambito(), {
      entidad: 'Venta',
      operacion: 'list',
      orden: '-created_date',
      limite: 1000,
    });
    expect(todas.length).toBeGreaterThan(200);
    expect(todas.some((v) => v['mesa_numero'] !== null && v['mesa_numero'] !== undefined)).toBe(
      true,
    );
    expect(todas.some((v) => typeof v['usuario_mesero_nombre'] === 'string')).toBe(true);
  });

  it('Ventas: el detalle de una venta trae sus líneas con la instantánea del producto', async () => {
    const [venta] = await consultar(ambito(), { entidad: 'Venta', operacion: 'list', limite: 1 });
    const detalles = await consultar(ambito(), {
      entidad: 'DetalleVenta',
      operacion: 'filter',
      filtro: { venta_id: venta?.['id'] },
    });
    expect(detalles.length).toBeGreaterThan(0);
    for (const d of detalles) {
      expect(typeof d['producto_nombre']).toBe('string');
      expect(typeof d['precio_unitario_snapshot']).toBe('number');
      expect(d['estado_preparacion']).toBe('entregado');
    }
  });

  it('Registros: cortes cerrados con folio, quién cobró y fechas; compras, movimientos y gastos', async () => {
    const cortes = await consultar(ambito(), {
      entidad: 'CorteCaja',
      operacion: 'list',
      orden: '-created_date',
      limite: 200,
    });
    expect(cortes).toHaveLength(17);
    for (const c of cortes) {
      expect(c).toMatchObject({ estado: 'cerrado', tipo_corte: 'cierre_diario' });
      expect(typeof c['folio']).toBe('string');
      expect(typeof c['fecha_cierre']).toBe('string');
      expect(typeof c['usuario_cajero_nombre']).toBe('string');
      expect(c['diferencia_al_cerrar']).toBe(0);
      expect(c['esperado_al_cerrar']).toBe(c['efectivo_contado']);
    }

    const compras = await consultar(ambito(), {
      entidad: 'CompraInsumo',
      operacion: 'list',
      orden: '-created_date',
      limite: 300,
    });
    expect(compras.length).toBeGreaterThan(0);
    for (const c of compras) {
      expect(typeof c['proveedor_nombre']).toBe('string');
      expect(typeof c['total_compra']).toBe('number');
      expect(typeof c['fecha']).toBe('string');
      expect(typeof c['usuario_nombre']).toBe('string');
    }

    const movimientos = await consultar(ambito(), {
      entidad: 'MovimientoInventario',
      operacion: 'list',
      orden: '-created_date',
      limite: 500,
    });
    expect(movimientos).toHaveLength(500);
    expect(movimientos.some((m) => m['tipo_movimiento'] === 'salida_venta')).toBe(true);
    for (const m of movimientos) {
      expect(typeof m['ingrediente_nombre']).toBe('string');
      // El inventario inicial de la demo lo anota el reseteo, sin nadie detrás.
      if (m['tipo_movimiento'] !== 'inventario_inicial') {
        expect(typeof m['usuario_nombre']).toBe('string');
      }
    }

    const gastos = await consultar(ambito(), {
      entidad: 'GastoOperativo',
      operacion: 'list',
      orden: '-created_date',
      limite: 300,
    });
    expect(gastos.length).toBeGreaterThan(0);
    for (const g of gastos) {
      expect(typeof g['descripcion']).toBe('string');
      expect(typeof g['monto']).toBe('number');
      expect(typeof g['usuario_nombre']).toBe('string');
    }

    const consumo = await consultar(ambito(), {
      entidad: 'DescuentoInventarioVenta',
      operacion: 'list',
      limite: 50,
    });
    expect(consumo.length).toBeGreaterThan(0);
  });

  it('Propinas: las ventas con propina salen pendientes de liquidar, como las deja un restaurante real', async () => {
    const ventas = await consultar(ambito(), {
      entidad: 'Venta',
      operacion: 'filter',
      filtro: { estado: 'pagada' },
      orden: '-fecha_cierre',
      limite: 1000,
    });
    const conPropina = ventas.filter((v) => (v['propina_monto'] as number) > 0);
    expect(conPropina.length).toBeGreaterThan(100);
    expect(conPropina.every((v) => v['propina_liquidada'] === false)).toBe(true);
    expect(conPropina.every((v) => typeof v['usuario_mesero_id'] === 'string')).toBe(true);
  });

  it('Inventario: el stock actual de cada ingrediente es la existencia derivada del ledger', async () => {
    const ingredientes = await consultar(ambito(), {
      entidad: 'Ingrediente',
      operacion: 'filter',
      filtro: { activo: true },
      limite: 1000,
    });
    expect(ingredientes.length).toBeGreaterThan(10);
    const ledger = new Map(
      (
        await filas<{ id: string; q: string }>(sql<{ id: string; q: string }>`
          select insumo_id::text as id, sum(cantidad)::text as q from movimientos_stock
           where organizacion_id = ${DEMO?.id ?? ''} group by 1`)
      ).map((f) => [f.id, Number(f.q)] as const),
    );
    for (const i of ingredientes) {
      expect(Number(i['stock_actual']), String(i['nombre'])).toBeCloseTo(
        ledger.get(String(i['id'])) ?? 0,
        3,
      );
      expect(Number(i['stock_actual'])).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('el restaurante sigue operando hoy encima del historial', () => {
  it('abre la caja, cobra y cierra con comandos reales: el folio sigue al último sembrado', async () => {
    const [terminal] = await filas<{ id: string }>(sql<{ id: string }>`
      select id::text as id from terminales where organizacion_id = ${DEMO?.id ?? ''} order by created_at limit 1`);
    terminalId = terminal?.id ?? '';
    expect(terminalId).not.toBe('');
    const ambito = ambitoDe(dueno, sucursalId, terminalId);

    const sesionId = await abrirCajaReal(ambito, 150_000);

    // Con la caja de hoy ABIERTA se puede seguir sembrando días pasados: son cajas cerradas y no
    // compiten por el cupo de cajas abiertas de la sucursal. Es lo que pasa si alguien empieza a
    // operar el espejo mientras el historial todavía se está completando.
    const ampliada = ventanaDeDias(AYER, 19);
    const alVuelo = await sembrarHistorialDePresentacion(opciones({ dias: 19 }));
    expect(alVuelo.sembrados).toEqual(ampliada.slice(0, 2));
    expect(alVuelo.pendientes).toEqual([]);
    const [abiertas] = await filas<{ n: string }>(sql<{ n: string }>`
      select count(*)::text as n from sesiones_caja
       where organizacion_id = ${DEMO?.id ?? ''} and estado = 'abierta' and id = ${sesionId}`);
    expect(abiertas?.n).toBe('1');

    const [antes] = await filas<{ folio: string; caja: string }>(sql<{
      folio: string;
      caja: string;
    }>`
      select (select max(folio) from ordenes where organizacion_id = ${DEMO?.id ?? ''})::text as folio,
             (select max(folio) from sesiones_caja where organizacion_id = ${DEMO?.id ?? ''})::text as caja`);

    const [producto] = await filas<{ id: string }>(sql<{ id: string }>`
      select p.id::text as id from productos p
       where p.organizacion_id = ${DEMO?.id ?? ''} and p.estrategia_consumo = 'sku' and p.activo
       order by p.nombre limit 1`);
    const { ordenId, totalCentavos } = await armarVenta(ambito, [
      { productoId: producto?.id ?? '', cantidad: '2' },
    ]);
    const cobro = exigirOk(
      await cobrarEnEfectivo(ambito, ordenId, totalCentavos),
      'El cobro de hoy',
    );
    expect(BigInt(cobro.folio)).toBe(BigInt(antes?.folio ?? '0') + 1n);

    // La barra entrega el pedido que acaba de salir del cobro: la caja no cierra con uno en la fila.
    await sql`
      update comandas
         set estado = 'entregado', iniciada_en = now(), lista_en = now(), entregada_en = now()
       where organizacion_id = ${DEMO?.id ?? ''} and orden_id = ${ordenId}
    `.execute(obtenerDb());

    const cierre = exigirOk(
      await comando(cerrarCaja, {
        entrada: { efectivoContadoCentavos: 150_000 + totalCentavos },
        ambito,
        idempotencyKey: clave(),
      }),
      'El cierre de la caja de hoy',
    );
    expect(cierre.diferenciaCentavos).toBe('0');
    expect(BigInt(cierre.folio)).toBe(BigInt(antes?.caja ?? '0') + 1n);
    expect(sesionId).toBeTruthy();
  }, 120_000);
});
