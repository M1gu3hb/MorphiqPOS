import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { hojaDelCorte } from '../caja/corte/documento.ts';
import { registrarRemision } from '../ferreteria/credito.ts';
import { crearNotaMostrador } from '../ferreteria/nota-de-mostrador.ts';
import { enCarrera } from '../pruebas/carrera.ts';
import {
  abrirCajaReal,
  ambitoDe,
  clave,
  exigirOk,
  sembrarCompanero,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { devolverVenta, ventaParaDevolver } from '../venta/devolucion-de-venta.ts';
import { registrarPagoCredito } from './cobranza.ts';

/**
 * LA DEVOLUCIÓN DE UNA VENTA A CUENTA, contra Postgres (182, cierre de la 2.4).
 *
 * `ferreteria/02-DINERO-Y-CAJA` §8.3: «Devolución de venta a crédito · Encargado · cero ·
 * Resta de ventas y del saldo». Antes de la 182 una remisión no se podía devolver: el
 * comando exigía devolver por el método con que se pagó y `credito` no estaba entre los
 * tres. Aquí, contra la base de verdad —la 182 y sus `check`, los candados de la cartera—:
 * la remisión devuelta en parte baja su documento, su remisión y la ficha del cliente sin
 * mover el cajón; lo ya abonado no se devuelve a cuenta sino por donde entró; y una
 * devolución y un pago del mismo cliente a la vez no dejan el saldo a medias.
 */

let negocio: NegocioReal;
let cajera: ReturnType<typeof ambitoDe>;
let gerente: ReturnType<typeof ambitoDe>;
let productoId: string;
let insumoId: string;
let almacenId: string;
let sesionCajaId: string;

const PRECIO = 25_000n;

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Ferretería de la Devolución a Cuenta',
    rol: 'cajero',
    giro: 'ferreteria',
    paquete: 'ferreteria',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Mostrador'] });
  almacenId = sucursal.almacenId;
  cajera = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  // La cajera no devuelve (§8.3): la encargada, en la misma terminal.
  const empleoGerente = await sembrarCompanero(negocio, { nombre: 'Elena', rol: 'gerente' });
  gerente = { ...cajera, empleoId: empleoGerente, rol: 'gerente' };
  ({ productoId, insumoId } = await sembrarProducto(negocio, almacenId, {
    nombre: 'Cemento gris 50 kg',
    precioCentavos: PRECIO,
    existencia: '40',
  }));
  sesionCajaId = await abrirCajaReal(cajera, 100_000);
});

async function clienteNuevo(nombre: string): Promise<string> {
  const id = randomUUID();
  await conTransaccion((tx) =>
    tx
      .insertInto('clientes')
      .values({
        id,
        organizacion_id: negocio.organizacionId,
        nombre,
        limite_credito_centavos: 5_000_000n,
        dias_plazo: 30,
      })
      .execute(),
  );
  return id;
}

async function remitir(clienteId: string, cantidad: number) {
  const nota = exigirOk(
    await comando(crearNotaMostrador, {
      entrada: { clienteId, partidas: [{ productoId, cantidad }] },
      ambito: cajera,
      idempotencyKey: clave(),
    }),
    'ferreteria.crear_nota_mostrador',
  );
  exigirOk(
    await comando(registrarRemision, {
      entrada: {
        ordenId: nota.ordenId,
        clienteId,
        importeCentavos: Number(nota.totalCentavos),
        nombreFirmante: 'Martín Pérez',
      },
      ambito: cajera,
      idempotencyKey: clave(),
    }),
    'credito.registrar_remision',
  );
  const linea = await obtenerDb()
    .selectFrom('orden_lineas')
    .select('id')
    .where('orden_id', '=', nota.ordenId)
    .executeTakeFirstOrThrow();
  return { ordenId: nota.ordenId, lineaId: linea.id };
}

function devolver(
  venta: { readonly ordenId: string; readonly lineaId: string },
  cantidad: string,
  metodo: 'credito' | 'efectivo',
) {
  return comando(devolverVenta, {
    entrada: {
      ordenId: venta.ordenId,
      lineas: [{ ordenLineaId: venta.lineaId, cantidad }],
      metodo,
      motivo: 'Le sobraron sacos de la obra',
    },
    ambito: gerente,
    idempotencyKey: clave(),
  });
}

async function saldos(ordenId: string, clienteId: string) {
  const db = obtenerDb();
  const remision = await db
    .selectFrom('remisiones')
    .select(['id', 'saldo_documento_centavos as saldo'])
    .where('orden_id', '=', ordenId)
    .executeTakeFirstOrThrow();
  const documento = await db
    .selectFrom('documentos_credito')
    .select(['id', 'saldo_centavos as saldo'])
    .where('origen_tipo', '=', 'remision')
    .where('origen_id', '=', remision.id)
    .executeTakeFirstOrThrow();
  const ficha = await db
    .selectFrom('clientes')
    .select('saldo_pendiente_centavos as saldo')
    .where('id', '=', clienteId)
    .executeTakeFirstOrThrow();
  return { documento, remision: remision.saldo, ficha: ficha.saldo };
}

async function movimientosDelCajon(): Promise<string[]> {
  const filas = await obtenerDb()
    .selectFrom('movimientos_caja')
    .select('tipo')
    .where('sesion_caja_id', '=', sesionCajaId)
    .orderBy('created_at')
    .execute();
  return filas.map((f) => f.tipo);
}

describe('182 · la devolución de una venta a cuenta, en la base', () => {
  it('la remisión devuelta en parte baja el documento, la remisión y la ficha, sin tocar el cajón', async () => {
    const clienteId = await clienteNuevo('Ing. Loera');
    const venta = await remitir(clienteId, 3);
    const cajonAntes = await movimientosDelCajon();

    const hecha = exigirOk(await devolver(venta, '1', 'credito'), 'venta.devolver_venta');
    expect(hecha).toMatchObject({ metodo: 'credito', montoCentavos: PRECIO.toString() });
    expect(hecha.estado).toBe('parcialmente_reembolsada');

    const despues = await saldos(venta.ordenId, clienteId);
    expect(despues.documento.saldo).toBe(PRECIO * 2n);
    expect(despues.remision).toBe(PRECIO * 2n);
    expect(despues.ficha).toBe(PRECIO * 2n);

    // Cero en el cajón (§8.3): ningún movimiento nuevo de la caja.
    expect(await movimientosDelCajon()).toEqual(cajonAntes);

    const documento = await obtenerDb()
      .selectFrom('devoluciones')
      .select(['metodo', 'documento_credito_id', 'sesion_caja_id', 'monto_centavos'])
      .where('orden_id', '=', venta.ordenId)
      .executeTakeFirstOrThrow();
    // Nombra el documento que bajó y la caja de la terminal: en su corte cuenta.
    expect(documento).toEqual({
      metodo: 'credito',
      documento_credito_id: despues.documento.id,
      sesion_caja_id: sesionCajaId,
      monto_centavos: PRECIO,
    });

    // Y el saco vuelve al almacén, referido a la devolución.
    const regreso = await obtenerDb()
      .selectFrom('movimientos_stock')
      .select(['tipo', 'cantidad'])
      .where('insumo_id', '=', insumoId)
      .where('referencia_tipo', '=', 'devolucion')
      .execute();
    expect(regreso.map((m) => Number(m.cantidad))).toContain(1);
  });

  it('lo ya abonado no se devuelve a cuenta: se devuelve por el método con que se abonó', async () => {
    const clienteId = await clienteNuevo('Arq. Salinas');
    const venta = await remitir(clienteId, 2);
    // Abona en efectivo la mitad: el documento queda debiendo un saco.
    exigirOk(
      await comando(registrarPagoCredito, {
        entrada: { clienteId, montoCentavos: Number(PRECIO), metodo: 'efectivo' },
        ambito: cajera,
        idempotencyKey: clave(),
      }),
      'credito.registrar_pago',
    );

    // Lo que la pantalla ofrece: a cuenta, lo que todavía se debe; en efectivo, lo abonado.
    const vista = exigirOk(
      await comando(ventaParaDevolver, {
        entrada: { ordenId: venta.ordenId },
        ambito: gerente,
        idempotencyKey: clave(),
      }),
      'venta.para_devolver',
    );
    expect(Object.fromEntries(vista.disponible.map((d) => [d.metodo, d.centavos]))).toEqual({
      credito: PRECIO.toString(),
      efectivo: PRECIO.toString(),
    });

    // Los dos sacos a cuenta: sólo se debe uno.
    const demas = await devolver(venta, '2', 'credito');
    expect(demas.ok).toBe(false);
    if (!demas.ok) {
      expect(demas.error.codigo).toBe('REGLA_DE_NEGOCIO');
      expect(demas.error.datos).toMatchObject({ regla: 'PAGO_NO_CUADRA' });
    }

    exigirOk(await devolver(venta, '1', 'credito'), 'venta.devolver_venta (a cuenta)');
    const enEfectivo = exigirOk(
      await devolver(venta, '1', 'efectivo'),
      'venta.devolver_venta (lo abonado)',
    );
    expect(enEfectivo.estado).toBe('reembolsada');

    const final = await saldos(venta.ordenId, clienteId);
    expect(final.documento.saldo).toBe(0n);
    expect(final.remision).toBe(0n);
    expect(final.ficha).toBe(0n);
    // Lo abonado entró al cajón y lo devuelto en efectivo salió de él.
    const cajon = await movimientosDelCajon();
    expect(cajon.filter((t) => t === 'devolucion')).toHaveLength(1);
  });

  it('una devolución a cuenta y un pago del mismo cliente A LA VEZ no dejan el saldo a medias', async () => {
    const clienteId = await clienteNuevo('Constructora del Valle');
    const venta = await remitir(clienteId, 2);

    // La barrera es el cliente: la cartera de un cliente se forma en fila ahí.
    const [devolucion, pago] = await enCarrera(
      (tx) =>
        tx
          .selectFrom('clientes')
          .select('id')
          .where('id', '=', clienteId)
          .forUpdate()
          .executeTakeFirstOrThrow(),
      [
        async () => (await devolver(venta, '1', 'credito')).ok,
        async () =>
          (
            await comando(registrarPagoCredito, {
              entrada: { clienteId, montoCentavos: Number(PRECIO), metodo: 'efectivo' },
              ambito: cajera,
              idempotencyKey: clave(),
            })
          ).ok,
      ],
    );
    expect(devolucion).toBe(true);
    expect(pago).toBe(true);

    // Una de cada: el documento de dos sacos queda en cero, y la ficha con él.
    const final = await saldos(venta.ordenId, clienteId);
    expect(final.documento.saldo).toBe(0n);
    expect(final.remision).toBe(0n);
    expect(final.ficha).toBe(0n);
  });
});

describe('182 · el corte de la caja con devoluciones', () => {
  it('la venta devuelta entera sigue siendo venta de su día, y lo devuelto se lista por método', async () => {
    const hoja = exigirOk(
      await comando(hojaDelCorte, {
        entrada: { sesionCajaId },
        ambito: gerente,
        idempotencyKey: clave(),
      }),
      'caja.hoja_del_corte',
    );
    // Las tres remisiones de este archivo —3, 2 y 2 sacos—, la de 2 devuelta ENTERA
    // incluida: el histórico no se toca (§1).
    expect(hoja.resumen.tickets).toBe(3);
    expect(BigInt(hoja.resumen.totalCentavos)).toBe(PRECIO * 7n);
    // Lo devuelto en ESTA caja: un saco a cuenta en cada venta y uno en efectivo de lo
    // que ya se había abonado.
    const porMetodo = new Map<string, bigint>();
    for (const d of hoja.devoluciones) {
      porMetodo.set(d.metodo, (porMetodo.get(d.metodo) ?? 0n) + BigInt(d.montoCentavos));
    }
    expect(Object.fromEntries(porMetodo)).toEqual({ credito: PRECIO * 3n, efectivo: PRECIO });
    // Volvieron al almacén: su costo deja de ser costo de ventas (lo ve la encargada).
    expect(hoja.devoluciones.every((d) => d.costoDevueltoCentavos !== null)).toBe(true);
  });
});
