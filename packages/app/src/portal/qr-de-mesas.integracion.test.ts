import { randomUUID } from 'node:crypto';

import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  sembrarCompanero,
  sembrarNegocio,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { escribirDatos } from '../puente/comandos.ts';
import { DISENO_POR_OMISION, type DisenoDeQr, type QrDeMesas } from './qr-de-mesas.ts';

/**
 * DP-9.8 · EL DISEÑO DE LOS QR DE LAS MESAS, contra Postgres real.
 *
 * Se guarda por el camino de siempre —la configuración del negocio por `puente.escribir`—, con
 * los roles de siempre (dueño, administrador, gerente) y validado: un QR que no se leería no se
 * guarda, ni un campo de más. «Restablecer al diseño general» es guardar sin esa mesa. Y lo de un
 * negocio no toca al otro.
 */

let negocio: NegocioReal;
let vecino: NegocioReal;
let meseroEmpleoId = '';
const mesa = randomUUID();

const marron: DisenoDeQr = {
  ...DISENO_POR_OMISION,
  modulo: 'dots',
  ojo: 'circle',
  centro: 'circle',
  primerPlano: '#5b2a0e',
  ojos: '#3a1a08',
  conLogo: true,
  marco: {
    tipo: 'band',
    texto: 'Mesa {mesa}',
    textoSecundario: 'Escanea y pide',
    color: '#5b2a0e',
    colorTexto: '#ffffff',
  },
  tamanoMm: 70,
};

function guardar(datos: Record<string, unknown>, rol: 'dueno' | 'mesero' = 'dueno') {
  const base = ambitoDe(negocio, null, null);
  return comando(escribirDatos, {
    entrada: { entidad: 'ConfiguracionNegocio', operacion: 'update', datos },
    ambito: rol === 'dueno' ? base : { ...base, empleoId: meseroEmpleoId, rol: 'mesero' },
    idempotencyKey: clave(),
  });
}

async function guardado(organizacionId: string): Promise<unknown> {
  const fila = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  return (fila?.valores as Record<string, unknown> | undefined)?.['qr_de_mesas'];
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Fonda de los QR',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  vecino = await sembrarNegocio({
    nombre: 'Fonda vecina',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  meseroEmpleoId = await sembrarCompanero(negocio, { nombre: 'Mesero', rol: 'mesero' });
});

describe('el diseño de los QR de las mesas en la configuración', () => {
  it('el dueño guarda un diseño general y uno propio de una mesa', async () => {
    const qr: QrDeMesas = { general: marron, porMesa: { [mesa]: DISENO_POR_OMISION } };
    const r = await guardar({ qr_de_mesas: qr });
    expect(r.ok).toBe(true);
    expect(await guardado(negocio.organizacionId)).toEqual(qr);
  });

  it('un QR que no se leería no se guarda, y lo de antes se queda', async () => {
    const r = await guardar({
      qr_de_mesas: { general: { ...marron, primerPlano: '#f4f4f4' }, porMesa: {} },
    });
    // Los errores de dominio salen como regla de negocio, con la regla que falló.
    expect(r.ok ? null : r.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(JSON.stringify(r)).toMatch(/PUENTE_CAMPO_INVALIDO/);
    expect(JSON.stringify(r)).toMatch(/no se leería/);
    expect(await guardado(negocio.organizacionId)).toMatchObject({ general: marron });
  });

  it('el contenido del QR no viaja en el diseño: un campo de más se rechaza', async () => {
    const r = await guardar({
      qr_de_mesas: { general: { ...marron, contenido: 'https://otro.mx/qr/x' }, porMesa: {} },
    });
    expect(r.ok).toBe(false);
    expect(await guardado(negocio.organizacionId)).toMatchObject({ general: marron });
  });

  it('el mesero no cambia el diseño de los QR', async () => {
    const r = await guardar(
      { qr_de_mesas: { general: DISENO_POR_OMISION, porMesa: {} } },
      'mesero',
    );
    expect(r.ok ? null : r.error.codigo).toBe('SIN_PERMISO');
    expect(await guardado(negocio.organizacionId)).toMatchObject({ general: marron });
  });

  it('«Restablecer al diseño general»: la mesa sale de los propios', async () => {
    const r = await guardar({ qr_de_mesas: { general: marron, porMesa: {} } });
    expect(r.ok).toBe(true);
    expect(await guardado(negocio.organizacionId)).toEqual({ general: marron, porMesa: {} });
  });

  it('lo de un negocio no toca al otro', async () => {
    expect(await guardado(vecino.organizacionId)).toBeUndefined();
  });
});
