import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { beforeAll, describe, expect, it } from 'vitest';

import {
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
import { rotarQr } from '../restaurante/qr.ts';
import { asignarMesero, atenderSolicitud } from '../restaurante/solicitudes.ts';
import { ejecutarComandoPublico, type PeticionPublica } from './comando-publico.ts';
import { payloadDelPortal } from './consulta.ts';
import { abrirMesaDesdeQR } from './mesa.ts';
import { enviarPedidoDesdeQR } from './pedido.ts';
import { crearSolicitudQR } from './solicitudes.ts';

/**
 * DP-9.2 · EL PORTAL SIN ASIGNACIÓN DE MESAS, contra Postgres real.
 *
 * Con `asignacion_mesas_activa = false` el portal no dejaba abrir ni pedir: exigía un mesero
 * asignado que en ese modo no existe. Ahora el comensal abre, pide y llama; la cuenta nace sin
 * responsable y queda a nombre del mesero que la atiende. Con la asignación ENCENDIDA una mesa
 * sin mesero asignado sigue cerrada: ése es el proceso que el negocio eligió.
 */

const PIMIENTA = 'pimienta-de-la-prueba-sin-asignacion-0123456789';

async function negocioCon(asignacion: boolean) {
  const negocio = await sembrarNegocio({
    nombre: asignacion ? 'Fonda con asignación' : 'Fonda sin asignación',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  const { productoId } = await sembrarProducto(negocio, sucursal.almacenId, {
    nombre: 'Taco de barbacoa',
    precioCentavos: 3_500n,
    existencia: '100',
  });
  const mesaId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .updateTable('productos')
      .set({ visible_en_menu_digital: true, area_preparacion: 'cocina' })
      .where('organizacion_id', '=', negocio.organizacionId)
      .execute();
    const banderas = {
      portal_qr_activo: true,
      portal_qr_permitir_pedidos_cliente: true,
      portal_qr_permitir_ayuda: true,
      asignacion_mesas_activa: asignacion,
    };
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify(banderas)}::jsonb)
      on conflict (organizacion_id) do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
    await tx
      .insertInto('mesas')
      .values({
        id: mesaId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursal.sucursalId,
        numero: 7,
        nombre: 'Mesa 7',
      })
      .execute();
  });
  const { qrToken } = exigirOk(
    await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
    'restaurante.rotar_qr',
  );
  return { negocio, ambito, mesaId, token: qrToken, productoId };
}

/** La petición del comensal, como la arma la ruta pública. */
function peticion(negocio: NegocioReal, token: string, entrada: unknown): PeticionPublica {
  return {
    token,
    organizacionId: negocio.organizacionId,
    entrada,
    idempotencyKey: clave(),
    pimienta: PIMIENTA,
  };
}

async function ordenDe(mesaId: string) {
  const mesa = await obtenerDb()
    .selectFrom('mesas')
    .select(['orden_activa_id', 'empleado_atiende_id'])
    .where('id', '=', mesaId)
    .executeTakeFirstOrThrow();
  const orden =
    mesa.orden_activa_id === null
      ? undefined
      : await obtenerDb()
          .selectFrom('ordenes')
          .select(['id', 'empleado_atiende_id'])
          .where('id', '=', mesa.orden_activa_id)
          .executeTakeFirst();
  return { mesa, orden };
}

/** El comensal llama al mesero; devuelve el aviso pendiente de la mesa. */
async function pedirAyuda(caso: Awaited<ReturnType<typeof negocioCon>>): Promise<string> {
  exigirOk(
    await ejecutarComandoPublico(
      crearSolicitudQR,
      peticion(caso.negocio, caso.token, { tipo: 'ayuda' }),
    ),
    'portal.crear_solicitud',
  );
  const { id } = await obtenerDb()
    .selectFrom('solicitudes_qr')
    .select('id')
    .where('mesa_id', '=', caso.mesaId)
    .where('estado', '=', 'pendiente')
    .executeTakeFirstOrThrow();
  return id;
}

describe('sin asignación de mesas', () => {
  let caso: Awaited<ReturnType<typeof negocioCon>>;
  let lupitaId = '';
  beforeAll(async () => {
    caso = await negocioCon(false);
  });

  it('el portal dice que la mesa se puede abrir aunque nadie la tenga', async () => {
    const payload = await payloadDelPortal(caso.negocio.organizacionId, caso.token, PIMIENTA);
    expect(payload.negocio.puede_ordenar).toBe(true);
    expect(payload.mesa.puede_abrir).toBe(true);
  });

  it('el comensal abre la mesa: la cuenta nace sin responsable', async () => {
    const r = await ejecutarComandoPublico(
      abrirMesaDesdeQR,
      peticion(caso.negocio, caso.token, { personas: 2 }),
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const { orden } = await ordenDe(caso.mesaId);
    expect(orden?.empleado_atiende_id).toBeNull();
  });

  it('pide, y su pedido sale a cocina', async () => {
    const r = await ejecutarComandoPublico(
      enviarPedidoDesdeQR,
      peticion(caso.negocio, caso.token, {
        items: [{ productoId: caso.productoId, cantidad: '1' }],
      }),
    );
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const { orden } = await ordenDe(caso.mesaId);
    const comandas = await obtenerDb()
      .selectFrom('comandas')
      .select('id')
      .where('orden_id', '=', orden?.id ?? '')
      .execute();
    expect(comandas.length).toBeGreaterThan(0);
  });

  it('llama al mesero, y el mesero que lo atiende se queda con la mesa y su cuenta', async () => {
    const solicitudId = await pedirAyuda(caso);
    const lupita = await sembrarCompanero(caso.negocio, { nombre: 'Lupita', rol: 'mesero' });
    const atendida = await comando(atenderSolicitud, {
      entrada: { solicitudId, estado: 'atendida' },
      ambito: { ...caso.ambito, empleoId: lupita, rol: 'mesero' },
      idempotencyKey: clave(),
    });
    expect(atendida.ok, JSON.stringify(atendida)).toBe(true);

    const { mesa, orden } = await ordenDe(caso.mesaId);
    expect(orden?.empleado_atiende_id, 'La cuenta siguió sin responsable.').toBe(lupita);
    expect(mesa.empleado_atiende_id).toBe(lupita);
    lupitaId = lupita;
  });

  it('otro mesero que atiende un aviso después no le quita la mesa ni la cuenta', async () => {
    const tono = await sembrarCompanero(caso.negocio, { nombre: 'Toño', rol: 'mesero' });
    const atendida = await comando(atenderSolicitud, {
      entrada: { solicitudId: await pedirAyuda(caso), estado: 'atendida' },
      ambito: { ...caso.ambito, empleoId: tono, rol: 'mesero' },
      idempotencyKey: clave(),
    });
    expect(atendida.ok, JSON.stringify(atendida)).toBe(true);
    const { mesa, orden } = await ordenDe(caso.mesaId);
    expect(orden?.empleado_atiende_id, 'Toño le quitó la cuenta a Lupita.').toBe(lupitaId);
    expect(mesa.empleado_atiende_id).toBe(lupitaId);
  });
});

describe('la mesera toma la mesa desde su pantalla', () => {
  it('después de que el comensal la abrió: se queda también con la cuenta', async () => {
    const caso = await negocioCon(false);
    exigirOk(
      await ejecutarComandoPublico(
        abrirMesaDesdeQR,
        peticion(caso.negocio, caso.token, { personas: 2 }),
      ),
      'portal.abrir_mesa',
    );
    const lupita = await sembrarCompanero(caso.negocio, { nombre: 'Lupita', rol: 'mesero' });
    exigirOk(
      await comando(asignarMesero, {
        entrada: { mesaId: caso.mesaId },
        ambito: { ...caso.ambito, empleoId: lupita, rol: 'mesero' },
        idempotencyKey: clave(),
      }),
      'restaurante.asignar_mesero',
    );
    const { mesa, orden } = await ordenDe(caso.mesaId);
    expect(mesa.empleado_atiende_id).toBe(lupita);
    expect(orden?.empleado_atiende_id, 'Tomó la mesa pero no su cuenta.').toBe(lupita);
  });

  it('antes de que el comensal la abra: la cuenta nace a su nombre', async () => {
    const caso = await negocioCon(false);
    const lupita = await sembrarCompanero(caso.negocio, { nombre: 'Lupita', rol: 'mesero' });
    exigirOk(
      await comando(asignarMesero, {
        entrada: { mesaId: caso.mesaId },
        ambito: { ...caso.ambito, empleoId: lupita, rol: 'mesero' },
        idempotencyKey: clave(),
      }),
      'restaurante.asignar_mesero',
    );
    exigirOk(
      await ejecutarComandoPublico(
        abrirMesaDesdeQR,
        peticion(caso.negocio, caso.token, { personas: 2 }),
      ),
      'portal.abrir_mesa',
    );
    const { orden } = await ordenDe(caso.mesaId);
    expect(orden?.empleado_atiende_id, 'La cuenta no nació a nombre de quien tomó la mesa.').toBe(
      lupita,
    );
  });
});

describe('quien atiende el aviso sin ser mesero', () => {
  it('un gerente atiende la ayuda de una mesa sin responsable y la mesa sigue sin responsable', async () => {
    const caso = await negocioCon(false);
    exigirOk(
      await ejecutarComandoPublico(
        abrirMesaDesdeQR,
        peticion(caso.negocio, caso.token, { personas: 2 }),
      ),
      'portal.abrir_mesa',
    );
    const gerente = await sembrarCompanero(caso.negocio, { nombre: 'Marta', rol: 'gerente' });
    const atendida = await comando(atenderSolicitud, {
      entrada: { solicitudId: await pedirAyuda(caso), estado: 'atendida' },
      ambito: { ...caso.ambito, empleoId: gerente, rol: 'gerente' },
      idempotencyKey: clave(),
    });
    expect(atendida.ok, JSON.stringify(atendida)).toBe(true);
    const { mesa, orden } = await ordenDe(caso.mesaId);
    expect(orden?.empleado_atiende_id, 'La gerente se quedó con la propina de la mesa.').toBeNull();
    expect(mesa.empleado_atiende_id).toBeNull();
  });
});

describe('con la asignación encendida', () => {
  it('una mesa sin mesero asignado sigue sin abrirse desde el QR', async () => {
    const caso = await negocioCon(true);
    const payload = await payloadDelPortal(caso.negocio.organizacionId, caso.token, PIMIENTA);
    expect(payload.negocio.puede_ordenar).toBe(true);
    expect(payload.mesa.puede_abrir, 'El portal ofrece abrir una mesa sin su mesero.').toBe(false);
    const r = await ejecutarComandoPublico(
      abrirMesaDesdeQR,
      peticion(caso.negocio, caso.token, { personas: 2 }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.datos?.['regla']).toBe('QR_PORTAL_CERRADO');
  });
});
