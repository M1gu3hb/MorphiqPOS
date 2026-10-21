import { randomUUID } from 'node:crypto';

import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ambitoDe,
  clave,
  exigirOk,
  sembrarNegocio,
  sembrarSucursal,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { comando } from '../produccion.ts';
import { rotarQr } from '../restaurante/qr.ts';
import { servirPortal } from './http.ts';

/**
 * EL QR EN EL DOMINIO PROPIO DEL SISTEMA MAESTRO, contra Postgres (cierre del 21-10).
 *
 * Producción sirve seis negocios en `www.pos-mh-astral-systems.com`, un host sin slug. El
 * portal pedía «el» negocio del despliegue antes de mirar el token y contestaba 422 a
 * cualquier QR escaneado. Una prueba con un solo negocio configurado no lo veía: aquí
 * `ORGANIZACION` lleva varios, como en producción, y el host es el público.
 */

const HOST = 'www.pos-mh-astral-systems.com';

// El entorno de producción en lo que el portal lee: la lista de negocios y la pimienta. La
// lista se lee en cada llamada para que la prueba la ponga como la tiene producción.
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({
    PIN_PEPPER: 'pimienta_de_integracion_del_portal_en_el_dominio',
    APP_URL: `https://${HOST}`,
    ORGANIZACION: process.env['ORGANIZACION'],
  }),
}));

interface Mesa {
  readonly negocio: NegocioReal;
  readonly slug: string;
  readonly token: string;
}

let restaurante: Mesa;
let tienda: Mesa;
let ajeno: Mesa;
let espejo: Mesa;
const organizacionAntes = process.env['ORGANIZACION'];

async function slugDe(organizacionId: string): Promise<string> {
  const fila = await obtenerDb()
    .selectFrom('organizaciones')
    .select('slug')
    .where('id', '=', organizacionId)
    .executeTakeFirstOrThrow();
  return fila.slug;
}

/** Un negocio con su portal abierto y una mesa con QR. */
async function negocioConMesa(nombre: string, extra: Record<string, unknown> = {}): Promise<Mesa> {
  const negocio = await sembrarNegocio({
    nombre,
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  const sucursal = await sembrarSucursal(negocio, { terminales: ['Caja'] });
  const ambito = ambitoDe(negocio, sucursal.sucursalId, sucursal.terminales[0] ?? null);
  const mesaId = randomUUID();
  await conTransaccion(async (tx) => {
    await tx
      .insertInto('mesas')
      .values({
        id: mesaId,
        organizacion_id: negocio.organizacionId,
        sucursal_id: sucursal.sucursalId,
        numero: 4,
        nombre: 'Mesa 4',
      })
      .execute();
    const banderas = { portal_qr_activo: true, ...extra };
    await sql`
      insert into configuracion (organizacion_id, valores)
      values (${negocio.organizacionId}, ${JSON.stringify(banderas)}::jsonb)
      on conflict (organizacion_id)
      do update set valores = configuracion.valores || excluded.valores
    `.execute(tx);
  });
  const { qrToken } = exigirOk(
    await comando(rotarQr, { entrada: { mesaId }, ambito, idempotencyKey: clave() }),
    'restaurante.rotar_qr',
  );
  return { negocio, slug: await slugDe(negocio.organizacionId), token: qrToken };
}

beforeAll(async () => {
  restaurante = await negocioConMesa('Restaurante del dominio');
  tienda = await negocioConMesa('Tienda del dominio');
  ajeno = await negocioConMesa('Negocio que este despliegue no sirve');
  espejo = await negocioConMesa('Restaurante del dominio', {
    presentacion_espejo_de: restaurante.negocio.organizacionId,
  });
  process.env['ORGANIZACION'] = `${tienda.slug},${restaurante.slug}`;
});

afterAll(() => {
  if (organizacionAntes === undefined) delete process.env['ORGANIZACION'];
  else process.env['ORGANIZACION'] = organizacionAntes;
});

describe('el portal del comensal con varios negocios en el dominio público', () => {
  it('el QR de una mesa del restaurante abre su portal (antes: 422)', async () => {
    const salida = await servirPortal(restaurante.token, HOST);
    expect(salida.estado).toBe(200);
    expect(JSON.stringify(salida.cuerpo)).toContain('Restaurante del dominio');
  });

  it('el de otro negocio servido abre el suyo, no el del restaurante', async () => {
    const salida = await servirPortal(tienda.token, HOST);
    expect(salida.estado).toBe(200);
    expect(JSON.stringify(salida.cuerpo)).toContain('Tienda del dominio');
  });

  it('el QR de un negocio que el despliegue no sirve no existe aquí', async () => {
    const salida = await servirPortal(ajeno.token, HOST);
    expect(salida.estado).toBe(404);
    expect(JSON.stringify(salida.cuerpo)).not.toContain('no sirve');
  });

  it('el contexto de presentación del restaurante se atiende como espejo suyo', async () => {
    const salida = await servirPortal(espejo.token, HOST);
    expect(salida.estado).toBe(200);
  });

  it('un token inventado contesta lo mismo que uno ajeno', async () => {
    const salida = await servirPortal('token-que-no-existe-123', HOST);
    expect(salida.estado).toBe(404);
  });
});
