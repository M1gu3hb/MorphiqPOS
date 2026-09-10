import { esErrorDominio, type Ambito, type Rol } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { crearComando, type RepositorioComandos } from '../comando.ts';
import type { ContextoComando } from '../definicion.ts';
import { crearFabrica } from '../pruebas/dobles.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type BaseFalsa,
  type Fila,
} from '../restaurante/pruebas/base-falsa.ts';
import { eliminarCorte, enumerarReferencias } from './eliminacion.ts';

/**
 * `caja.eliminar_corte` — el borrado de contabilidad que hoy autoriza el
 * NAVEGADOR (`Registros.jsx:89`, `if (!isAdmin) return`).
 *
 * Estas pruebas ejecutan el CUERPO del comando contra una base en memoria y
 * afirman sobre las filas que quedaron. Una suite que sólo mirara la forma del
 * esquema saldría verde con el comando borrando cortes con ventas dentro: la
 * única manera de cazar eso es correrlo y mirar la tabla después.
 *
 * Cuatro cosas, y ninguna de adorno:
 *   1. el camino feliz — un corte cerrado y vacío sí se borra;
 *   2. el rechazo por rol — administrador, gerente y cajero NO borran;
 *   3. la idempotencia — dos llamadas con la misma clave, un solo borrado;
 *   4. lo que la base impediría con un `23503` en crudo, dicho con números.
 */

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const TERMINAL = '33333333-3333-4333-8333-333333333333';
const CORTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRO_CORTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLAVE = 'clave-de-idempotencia-corte-1';

/** Los seis conteos, como los devuelve `referenciasDelCorte` ya en camelCase. */
const SIN_REFERENCIAS = {
  ventas: 0,
  pagos: 0,
  movimientos: 0,
  gastos: 0,
  cortesTurno: 0,
  liquidaciones: 0,
} as const;

/** Los mismos seis con los alias de la consulta SQL, que van en snake_case. */
const FILA_SIN_REFERENCIAS = {
  ventas: 0,
  pagos: 0,
  movimientos: 0,
  gastos: 0,
  cortes_turno: 0,
  liquidaciones: 0,
};

function ambitoDe(rol: Rol): Ambito {
  return {
    organizacionId: ORGANIZACION,
    sucursalId: SUCURSAL,
    // `terminalId` nulo a propósito: el dueño entra por correo desde su
    // teléfono y no tiene terminal. Si el comando la exigiera —como sí hacen
    // abrir, cerrar y mover caja— sería inalcanzable justo para quien puede
    // usarlo, y estas pruebas se pondrían rojas el día que alguien la añada.
    terminalId: null,
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: '55555555-5555-4555-8555-555555555555',
    rol,
  };
}

/** Un corte tal como lo deja `caja.cerrar`. */
function corteCerrado(cambios: Fila = {}): Fila {
  return {
    id: CORTE,
    organizacion_id: ORGANIZACION,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    estado: 'cerrada',
    serie: 'CC',
    folio: 12n,
    abierta_en: new Date('2026-03-01T14:00:00.000Z'),
    cerrada_en: new Date('2026-03-01T23:30:00.000Z'),
    fondo_inicial_centavos: 50_000n,
    efectivo_contado_centavos: 50_000n,
    efectivo_retirado_centavos: null,
    ...cambios,
  };
}

/** El renglón que `caja.abrir` escribe con el fondo inicial. */
function movimientoDeApertura(cambios: Fila = {}): Fila {
  return {
    id: 'mov-apertura',
    organizacion_id: ORGANIZACION,
    sesion_caja_id: CORTE,
    tipo: 'apertura',
    monto_centavos: 50_000n,
    referencia_tipo: 'manual',
    referencia_id: null,
    empleado_id: null,
    motivo: 'Fondo inicial',
    ...cambios,
  };
}

/**
 * La base falsa modela `select`, `insert`, `update` y `delete`, pero no los
 * agregados: `referenciasDelCorte` cuenta con seis subconsultas escalares en
 * SQL crudo, y aquí esa fila se declara. Reimplementar `count(*)` sería probar
 * contra una reimplementación de Postgres, que no prueba nada; la otra mitad
 * —que las llaves foráneas existen— vive en las pruebas de integración.
 */
function baseCon(
  datos: Record<string, readonly Fila[]>,
  conteos: Partial<Record<keyof typeof FILA_SIN_REFERENCIAS, number>> = {},
): BaseFalsa {
  return crearBaseFalsa(datos, { filasCrudas: [{ ...FILA_SIN_REFERENCIAS, ...conteos }] });
}

/**
 * El ejecutor REAL —`comando()`— sobre la base falsa.
 *
 * `ejecutorDeProduccion` de `pruebas/dobles.ts` avisa de que no sirve para
 * ejecutar el cuerpo: su transacción es un `{ id: number }`. Aquí se conserva
 * su fábrica —que es la que sabe de idempotencia, de auditoría y de confirmar—
 * y al cuerpo se le entrega la transacción falsa que sí tiene forma de Kysely.
 * Es el mismo puente de tipos que documenta `base-falsa.ts`, y sólo aquí.
 */
function ejecutorSobre(base: BaseFalsa) {
  const fabrica = crearFabrica('restaurante');
  const ejecutar = crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: <T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(base.tx)),
  });
  return { ejecutar, fabrica };
}

interface Fallo {
  readonly codigo: string;
  readonly mensaje: string;
}

async function fallaCon(promesa: Promise<unknown>): Promise<Fallo> {
  try {
    await promesa;
    return { codigo: 'NO_LANZO', mensaje: '' };
  } catch (error) {
    return {
      codigo: esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`,
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }
}

// ────────────────────────────────────────────────────── 1 · el camino feliz

describe('el camino feliz · un corte cerrado y vacío sí se borra', () => {
  it('se lleva el corte y su renglón de apertura, y nada más', async () => {
    const base = baseCon({
      sesiones_caja: [corteCerrado(), corteCerrado({ id: OTRO_CORTE, folio: 13n })],
      movimientos_caja: [
        movimientoDeApertura(),
        // De OTRO corte: si el `delete` no acotara por sesión, éste se iría
        // también y el arqueo del turno de al lado dejaría de cuadrar.
        movimientoDeApertura({ id: 'mov-ajeno', sesion_caja_id: OTRO_CORTE }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const salida = await eliminarCorte.ejecutar(ctx, { corteId: CORTE });

    expect(salida).toEqual({
      corteId: CORTE,
      serie: 'CC',
      folio: '12',
      movimientosDeAperturaBorrados: 1,
    });
    expect(base.filas('sesiones_caja').map((f) => f['id'])).toEqual([OTRO_CORTE]);
    expect(base.filas('movimientos_caja').map((f) => f['id'])).toEqual(['mov-ajeno']);
  });

  it('la auditoría deja constancia de QUÉ había dentro, no sólo de que se borró', async () => {
    // Es el criterio de `contar()` en `mantenimiento/purgas.ts`: la operación no
    // es reversible, así que lo único honesto que se puede ofrecer es el
    // inventario de lo que se perdió. Sin el folio, un corte borrado deja de
    // poder reclamarse en el histórico.
    const base = baseCon({
      sesiones_caja: [corteCerrado()],
      movimientos_caja: [movimientoDeApertura()],
    });
    const { ctx, auditorias, pasos } = contextoFalso(base.tx, ambitoDe('dueno'));

    await eliminarCorte.ejecutar(ctx, { corteId: CORTE });

    const rastro = auditorias[0];
    expect(rastro?.entidadId).toBe(CORTE);
    expect(rastro?.payload).toMatchObject({
      serie: 'CC',
      folio: '12',
      fondoInicialCentavos: '50000',
      efectivoContadoCentavos: '50000',
      efectivoRetiradoCentavos: null,
      cerradaEn: '2026-03-01T23:30:00.000Z',
      movimientosDeAperturaBorrados: 1,
      referencias: SIN_REFERENCIAS,
    });
    // Los cuatro pasos van con nombre: sin él, el arnés de inyección de fallos
    // no puede interrumpir ninguno y la atomicidad de este comando —que borra
    // dos tablas— se quedaría sin probar.
    expect(pasos).toEqual([
      'cargar_corte',
      'contar_referencias',
      'borrar_apertura',
      'borrar_corte',
    ]);
  });

  it('un corte de OTRO negocio se ve igual que uno que no existe', async () => {
    // Decir «existe, pero no es tuyo» convierte el endpoint en un detector de
    // identificadores ajenos.
    const base = baseCon({
      sesiones_caja: [corteCerrado({ organizacion_id: 'otra-organizacion' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    expect(fallo.codigo).toBe('CORTE_NO_ENCONTRADO');
    expect(fallo.mensaje).toContain('no existe en este negocio');
    expect(base.filas('sesiones_caja')).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────── 2 · el rechazo por rol

describe('el rechazo por rol · sólo el dueño borra contabilidad', () => {
  it('declara `dueno` y nadie más', () => {
    // `puente/roles.ts` traduce dueño, administrador Y gerente al
    // «administrador» de la interfaz heredada. Si este comando aceptara
    // `administrador`, un gerente borraría cortes y su pantalla le enseñaría el
    // botón — que es exactamente lo que hace hoy `isAdmin`.
    expect(eliminarCorte.roles).toEqual(['dueno']);
    expect(eliminarCorte.escribe).toBe(true);
  });

  for (const rol of ['administrador', 'gerente', 'cajero', 'mesero', 'cocina'] as const) {
    it(`un ${rol} recibe SIN_PERMISO y el corte sigue ahí`, async () => {
      const base = baseCon({
        sesiones_caja: [corteCerrado()],
        movimientos_caja: [movimientoDeApertura()],
      });
      const { ejecutar } = ejecutorSobre(base);

      const salida = await ejecutar(eliminarCorte, {
        entrada: { corteId: CORTE },
        ambito: ambitoDe(rol),
        idempotencyKey: CLAVE,
      });

      expect(salida.ok).toBe(false);
      if (salida.ok) return;
      expect(salida.error.codigo).toBe('SIN_PERMISO');
      // Lo que importa no es el 403: es que el cuerpo no llegó a correr.
      expect(base.filas('sesiones_caja')).toHaveLength(1);
      expect(base.filas('movimientos_caja')).toHaveLength(1);
    });
  }

  it('el rol se comprueba ANTES que la entrada: un id basura de un cajero da 403, no 400', async () => {
    // Si el 400 llegara primero, un rol sin permiso podría sondear el esquema
    // del comando campo por campo a base de entradas inválidas.
    const base = baseCon({ sesiones_caja: [corteCerrado()] });
    const { ejecutar } = ejecutorSobre(base);

    const salida = await ejecutar(eliminarCorte, {
      entrada: { corteId: 'no-es-un-uuid' },
      ambito: ambitoDe('cajero'),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
  });

  it('la entrada no acepta rol ni ámbito por el cuerpo (R16)', () => {
    // `definirComando` ya rechaza al CARGAR el módulo un esquema que declarase
    // estas claves. Esta prueba lo dice con el nombre del comando delante, y
    // afirma además que zod descarta las que lleguen de más.
    for (const clave of [
      'rol',
      'posRol',
      'isAdmin',
      'organizacionId',
      'organizacion_id',
      'sucursalId',
      'empleoId',
      'identidadId',
      'terminalId',
    ]) {
      const analisis = eliminarCorte.entrada.safeParse({ corteId: CORTE, [clave]: 'dueno' });
      expect(analisis.success, `${clave} no se pudo analizar`).toBe(true);
      if (!analisis.success) continue;
      expect(Object.keys(analisis.data), `deja pasar «${clave}» del cuerpo`).toEqual(['corteId']);
    }
  });
});

// ───────────────────────────────────────────────────────── 3 · idempotencia

describe('la idempotencia · dos llamadas con la misma clave, un solo borrado', () => {
  it('la segunda devuelve el resultado de la primera y no vuelve a borrar', async () => {
    const base = baseCon({
      sesiones_caja: [corteCerrado(), corteCerrado({ id: OTRO_CORTE, folio: 13n })],
      movimientos_caja: [movimientoDeApertura()],
    });
    const { ejecutar, fabrica } = ejecutorSobre(base);
    const peticion = {
      entrada: { corteId: CORTE },
      ambito: ambitoDe('dueno'),
      idempotencyKey: CLAVE,
    };

    const primera = await ejecutar(eliminarCorte, peticion);
    const segunda = await ejecutar(eliminarCorte, peticion);

    expect(primera.ok).toBe(true);
    expect(segunda.ok).toBe(true);
    if (!primera.ok || !segunda.ok) return;

    expect(primera.reintento).toBe(false);
    expect(segunda.reintento).toBe(true);
    expect(segunda.datos).toEqual(primera.datos);

    // El efecto es UNO. Sin la clave, el segundo intento volvería a entrar al
    // cuerpo, no encontraría el corte y le respondería «ese corte no existe» a
    // un dueño que sí lo borró: un reintento de red se leería como un fallo.
    expect(base.filas('sesiones_caja').map((f) => f['id'])).toEqual([OTRO_CORTE]);
    expect(base.filas('movimientos_caja')).toHaveLength(0);
    // Y una sola fila de auditoría: dos parecerían dos cortes borrados.
    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
  });

  it('sin clave de idempotencia no se ejecuta: es una escritura', async () => {
    const base = baseCon({
      sesiones_caja: [corteCerrado()],
      movimientos_caja: [movimientoDeApertura()],
    });
    const { ejecutar } = ejecutorSobre(base);

    const salida = await ejecutar(eliminarCorte, {
      entrada: { corteId: CORTE },
      ambito: ambitoDe('dueno'),
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('IDEMPOTENCIA_REQUERIDA');
    expect(base.filas('sesiones_caja')).toHaveLength(1);
  });
});

// ─────────────────────────────── 4 · lo que la base impide, con MI mensaje

describe('lo que la base impediría con un 23503, dicho con números', () => {
  it('34 ventas: falla nombrándolas y el corte sigue entero', async () => {
    const base = baseCon(
      { sesiones_caja: [corteCerrado()], movimientos_caja: [movimientoDeApertura()] },
      { ventas: 34, pagos: 34 },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    // Lo que el dueño lee. NO «violates foreign key constraint
    // ordenes_sesion_caja_id_fkey», que es lo que devuelve el `restrict` de
    // `003_venta_caja_inventario.sql:111` cuando nadie cuenta antes.
    expect(fallo.mensaje).toBe(
      'Ese corte tiene 34 ventas registradas y 34 pagos registrados y no se puede eliminar. ' +
        'Es el histórico de la caja: si el turno quedó mal, corrígelo con un movimiento de ajuste.',
    );
    expect(fallo.mensaje).not.toMatch(/foreign key|23503|constraint|sesiones_caja/i);
    // Y, sobre todo: no borró nada. Ni el corte ni su apertura.
    expect(base.filas('sesiones_caja')).toHaveLength(1);
    expect(base.filas('movimientos_caja')).toHaveLength(1);
  });

  it('un solo gasto también basta, y se dice en singular', async () => {
    const base = baseCon(
      { sesiones_caja: [corteCerrado()], movimientos_caja: [movimientoDeApertura()] },
      { gastos: 1 },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    expect(fallo.mensaje).toContain('Ese corte tiene 1 gasto pagado del cajón y no se puede');
    expect(base.filas('sesiones_caja')).toHaveLength(1);
  });

  it('un corte de turno firmado bloquea: alguien ya arqueó contra ese turno', async () => {
    const base = baseCon(
      { sesiones_caja: [corteCerrado()], movimientos_caja: [movimientoDeApertura()] },
      { cortes_turno: 3 },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    expect(fallo.mensaje).toContain('3 cortes de turno firmados');
    expect(base.filas('sesiones_caja')).toHaveLength(1);
  });

  it('una liquidación de propina bloquea, y se cuenta aunque no tenga columna propia', async () => {
    // `liquidaciones_propina` no apunta a la sesión: el vínculo va por
    // `ordenes.propina_liquidacion_id`. Se cuenta igual porque «esto ya se
    // repartió entre los meseros» pesa más que «hay ventas».
    const base = baseCon(
      { sesiones_caja: [corteCerrado()], movimientos_caja: [movimientoDeApertura()] },
      { liquidaciones: 2 },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    expect(fallo.mensaje).toContain('2 liquidaciones de propina');
    expect(base.filas('sesiones_caja')).toHaveLength(1);
  });

  it('un movimiento de caja que NO es la apertura bloquea', async () => {
    // Un retiro, un depósito o un gasto pagado del cajón describen dinero que
    // se movió de verdad. La apertura no: es el propio corte contado otra vez,
    // y si contara este comando no podría borrar nunca nada.
    const base = baseCon(
      {
        sesiones_caja: [corteCerrado()],
        movimientos_caja: [
          movimientoDeApertura(),
          movimientoDeApertura({ id: 'mov-retiro', tipo: 'retiro', monto_centavos: -20_000n }),
        ],
      },
      { movimientos: 1 },
    );
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    expect(fallo.mensaje).toContain('1 movimiento de caja');
    expect(base.filas('movimientos_caja')).toHaveLength(2);
  });

  it('la caja ABIERTA no se elimina: se cierra', async () => {
    // Y se comprueba antes de contar nada: borrar una caja abierta tiraría el
    // fondo y los movimientos del turno sin que nadie llegue a contar el cajón.
    const base = baseCon({
      sesiones_caja: [corteCerrado({ estado: 'abierta', cerrada_en: null, folio: null })],
      movimientos_caja: [movimientoDeApertura()],
    });
    const { ctx, pasos } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(eliminarCorte.ejecutar(ctx, { corteId: CORTE }));

    expect(fallo.codigo).toBe('CAJA_YA_ABIERTA');
    expect(fallo.mensaje).toContain('sigue abierta');
    expect(pasos).toEqual(['cargar_corte']);
    expect(base.filas('sesiones_caja')).toHaveLength(1);
  });

  it('si el corte deja de estar cerrado entre la lectura y el borrado, se dice', async () => {
    // El `delete` lleva `where estado = 'cerrada'` además del id, así que la
    // carrera no borra: devuelve cero filas. Cero filas es un hecho del mundo,
    // no un éxito silencioso — y el mensaje no menciona Postgres.
    const base = baseCon({
      sesiones_caja: [corteCerrado()],
      movimientos_caja: [movimientoDeApertura()],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'));

    const fallo = await fallaCon(
      eliminarCorte.ejecutar(reabriendoAntesDe('borrar_corte', ctx, base), { corteId: CORTE }),
    );

    expect(fallo.codigo).toBe('CORTE_NO_ENCONTRADO');
    expect(fallo.mensaje).toContain('alguien lo eliminó mientras tanto');
  });
});

/**
 * Un contexto que reabre la caja justo antes de un paso, para provocar la
 * carrera entre la lectura y el borrado sin necesitar dos conexiones.
 */
function reabriendoAntesDe(
  paso: string,
  ctx: ContextoComando<Transaccion>,
  base: BaseFalsa,
): ContextoComando<Transaccion> {
  return {
    ambito: ctx.ambito,
    correlationId: ctx.correlationId,
    ahora: ctx.ahora,
    tx: ctx.tx,
    auditar: (datos) => {
      ctx.auditar(datos);
    },
    async paso<T>(nombre: string, fn: () => Promise<T>): Promise<T> {
      if (nombre === paso) {
        await base.tx
          .updateTable('sesiones_caja')
          .set({ estado: 'abierta' })
          .where('id', '=', CORTE)
          .execute();
      }
      return ctx.paso(nombre, fn);
    },
  };
}

// ────────────────────────────────────────────── la frase, pieza por pieza

describe('el inventario en castellano', () => {
  it('devuelve null cuando no hay nada: es lo que autoriza el borrado', () => {
    expect(enumerarReferencias(SIN_REFERENCIAS)).toBeNull();
  });

  it('concuerda el número: uno en singular, dos en plural', () => {
    // «1 ventas registradas» es la clase de detalle que hace que la gente deje
    // de leer los avisos del sistema.
    expect(enumerarReferencias({ ...SIN_REFERENCIAS, ventas: 1 })).toBe('1 venta registrada');
    expect(enumerarReferencias({ ...SIN_REFERENCIAS, ventas: 2 })).toBe('2 ventas registradas');
  });

  it('enumera tres con comas y una «y» al final, como se escribe en español', () => {
    expect(enumerarReferencias({ ...SIN_REFERENCIAS, ventas: 34, gastos: 2, cortesTurno: 1 })).toBe(
      '34 ventas registradas, 2 gastos pagados del cajón y 1 corte de turno firmado',
    );
  });
});
