import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import type { Resultado } from '@morphiqpos/contracts';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import { enCarrera } from '../pruebas/carrera.ts';
import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarProducto,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { abrirMesa } from '../restaurante/mesas.ts';
import { rotarQr } from '../restaurante/qr.ts';
import { ejecutarComandoPublico } from './comando-publico.ts';
import { pedirCuentaQR } from './cuenta.ts';
import { enviarPedidoDesdeQR } from './pedido.ts';

/**
 * DOS TELÉFONOS EN LA MISMA MESA, contra Postgres y en paralelo de verdad.
 *
 * El portal leía la orden de la mesa sin candado. Dos comensales que piden a la vez insertan
 * cada uno sus renglones y recalculan el total sin ver los del otro —cada transacción ve sólo
 * lo suyo—, y el último en confirmar dejaba en la orden un total al que le faltaba lo del otro.
 * Y el que pedía mientras otro pedía la cuenta podía agregar renglones DESPUÉS de la cuenta y
 * devolver la orden de «cuenta solicitada» a «confirmada». Ahora la orden se lee con `FOR
 * UPDATE`, como la lee el cobro de la caja: el segundo espera al primero y ve lo que dejó.
 *
 * La barrera (`enCarrera`) toma el candado de la orden antes de soltar a los dos: sin el
 * arreglo los dos LEEN y se forman al insertar (la llave foránea pide la fila); con él, se
 * forman al leer.
 */

const PIMIENTA = 'pimienta-de-la-prueba-del-portal-0123456789';

let negocio: NegocioReal;
let ambito: ReturnType<typeof ambitoDe>;
let sucursalId: string;
let taco: string;
let cerveza: string;

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Fonda de las dos mesas',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  sucursalId = sucursal.sucursalId;
  ambito = ambitoDe(negocio, sucursalId, sucursal.terminales[0] ?? null);
  ({ productoId: taco } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Taco de pastor',
    precioCentavos: 3_500n,
    existencia: '100',
  }));
  ({ productoId: cerveza } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Cerveza clara',
    precioCentavos: 4_500n,
    existencia: '100',
  }));
  await conTransaccion(async (tx) => {
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: true })
      .where('organizacion_id', '=', negocio.organizacionId)
      .execute();
    // El portal abierto, con pedidos desde el teléfono y la cuenta que pide el comensal.
    const banderas = {
      portal_qr_activo: true,
      portal_qr_permitir_pedidos_cliente: true,
      asignacion_mesas_activa: true,
      portal_qr_cuenta_modo: 'ambos',
    };
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify(banderas)}::jsonb)
      on conflict (organizacion_id)
      do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
  });
});

/** Una mesa nueva, abierta por el mesero y con su QR: cada prueba la suya. */
async function mesaConQR(numero: number): Promise<{ token: string; ordenId: string }> {
  const mesaId = randomUUID();
  await conTransaccion((tx) =>
    tx
      .insertInto('mesas')
      .values({
        id: mesaId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursalId,
        numero,
        nombre: `Mesa ${String(numero)}`,
      })
      .execute(),
  );
  exigirOk(
    await comando(abrirMesa, {
      entrada: { mesaId, personas: 4 },
      ambito,
      idempotencyKey: clave(),
    }),
    'restaurante.abrir_mesa',
  );
  const { qrToken } = exigirOk(
    await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
    'restaurante.rotar_qr',
  );
  const mesa = await obtenerDb()
    .selectFrom('mesas')
    .select('orden_activa_id')
    .where('id', '=', mesaId)
    .executeTakeFirstOrThrow();
  if (mesa.orden_activa_id === null) throw new Error('La mesa abierta no tiene orden.');
  return { token: qrToken, ordenId: mesa.orden_activa_id };
}

function pedir(token: string, productoId: string): Promise<Resultado<unknown>> {
  return ejecutarComandoPublico(enviarPedidoDesdeQR, {
    token,
    organizacionId: negocio.organizacionId,
    entrada: { items: [{ productoId, cantidad: '1' }] },
    idempotencyKey: clave(),
    pimienta: PIMIENTA,
  });
}

function pedirLaCuenta(token: string): Promise<Resultado<unknown>> {
  return ejecutarComandoPublico(pedirCuentaQR, {
    token,
    organizacionId: negocio.organizacionId,
    entrada: { propinaTipo: 'sin_propina' },
    idempotencyKey: clave(),
    pimienta: PIMIENTA,
  });
}

/** El candado de la barrera: la fila de la orden, la misma que pide el portal. */
function laOrden(ordenId: string) {
  return (tx: Parameters<Parameters<typeof conTransaccion>[0]>[0]) =>
    tx.selectFrom('ordenes').select('id').where('id', '=', ordenId).forUpdate().execute();
}

async function estadoDe(ordenId: string) {
  const orden = await obtenerDb()
    .selectFrom('ordenes')
    .select(['estado', 'total_centavos', 'version'])
    .where('id', '=', ordenId)
    .executeTakeFirstOrThrow();
  const lineas = await obtenerDb()
    .selectFrom('orden_lineas')
    .select(['total_centavos'])
    .where('orden_id', '=', ordenId)
    .execute();
  const sumaDeLineas = lineas.reduce((suma, l) => suma + l.total_centavos, 0n);
  return { ...orden, renglones: lineas.length, sumaDeLineas };
}

describe('el portal con dos teléfonos en la misma mesa', () => {
  it('dos pedidos a la vez: los dos quedan, y el total de la orden es el de los dos', async () => {
    const { token, ordenId } = await mesaConQR(31);
    const antes = await estadoDe(ordenId);

    const [uno, otro] = await enCarrera(laOrden(ordenId), [
      () => pedir(token, taco),
      () => pedir(token, cerveza),
    ]);

    expect(uno?.ok).toBe(true);
    expect(otro?.ok).toBe(true);
    const despues = await estadoDe(ordenId);
    expect(despues.renglones).toBe(antes.renglones + 2);
    // El total de la ORDEN, no el de los renglones: es el que lee la caja y la precuenta.
    expect(despues.total_centavos).toBe(despues.sumaDeLineas);
    expect(despues.version).toBe(antes.version + 2);
  });

  it('pedir mientras otro pide la cuenta: o entra en la cuenta, o se le dice que ya se pidió', async () => {
    const { token, ordenId } = await mesaConQR(32);
    exigirOk(await pedir(token, taco), 'el primer pedido');

    const [pedido, cuenta] = await enCarrera(laOrden(ordenId), [
      () => pedir(token, cerveza),
      () => pedirLaCuenta(token),
    ]);

    const final = await estadoDe(ordenId);
    // La cuenta pedida no se deshace: la orden NUNCA vuelve a «confirmada».
    expect(cuenta?.ok).toBe(true);
    expect(final.estado).toBe('cuenta_solicitada');
    if (pedido?.ok === true) {
      // Entró antes que la cuenta: la cuenta lo trae.
      expect(final.renglones).toBe(2);
    } else {
      // Llegó después: se contesta, no se cuela.
      expect((pedido?.error.datos as { regla?: string } | undefined)?.regla).toBe(
        'ORDEN_NO_EDITABLE',
      );
      expect(final.renglones).toBe(1);
    }
    expect(final.total_centavos).toBe(final.sumaDeLineas);
  });
});
