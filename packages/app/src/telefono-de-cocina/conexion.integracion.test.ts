import type { Ambito } from '@morphiqpos/contracts';
import { conTransaccion, obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import { ambitoDe, clave, exigirOk, sembrarCompanero } from '../pruebas/negocio-real.ts';
import { guardarConfiguracionParcial, leerConfiguracion } from '../puente/configuracion.ts';
import { pantallaDelTelefono } from './consulta.ts';
import { conectarTelefonoDeCocina, type TelefonoConectado } from './conectar.ts';
import { cocinaDePrueba, PIMIENTA, type CocinaDePrueba } from './pruebas.ts';
import { firmarTokenDeEstacion } from './token-de-estacion.ts';

/**
 * DP-9.4 · CONECTAR EL TELÉFONO DE UNA ESTACIÓN, contra Postgres real.
 *
 * El código vale el día de operación en que se emitió y hasta que se emite otro para la misma
 * estación. Un cocinero con estación fija sólo conecta la suya. La versión vive en la
 * configuración del negocio: un guardado de Configuración no la pisa y nunca sale al navegador.
 */

let cocina: CocinaDePrueba;

beforeAll(async () => {
  cocina = await cocinaDePrueba('Fonda de los códigos');
});

const comoGerente = (): Ambito => ({
  ...ambitoDe(cocina.negocio, cocina.sucursalId, null),
  rol: 'gerente',
});

async function conectar(estacionId: string, ambito = comoGerente()) {
  return comando(conectarTelefonoDeCocina, {
    entrada: { estacionId },
    ambito,
    idempotencyKey: clave(),
  });
}

const firmar = (c: TelefonoConectado, cambios: Partial<{ dia: string }> = {}) =>
  firmarTokenDeEstacion(
    {
      organizacionId: c.organizacionId,
      estacionId: c.estacionId,
      dia: cambios.dia ?? c.dia,
      version: c.version,
    },
    PIMIENTA,
  );

const abre = async (token: string): Promise<boolean> => {
  try {
    await pantallaDelTelefono({
      token,
      organizacionId: cocina.negocio.organizacionId,
      pimienta: PIMIENTA,
    });
    return true;
  } catch (error) {
    expect(error).toMatchObject({ codigo: 'TELEFONO_DE_COCINA_INVALIDO' });
    return false;
  }
};

describe('el código de una estación', () => {
  it('generar uno nuevo revoca el anterior', async () => {
    const primero = exigirOk(await conectar(cocina.estacionCocina), 'conectar');
    expect(await abre(firmar(primero))).toBe(true);
    const segundo = exigirOk(await conectar(cocina.estacionCocina), 'conectar');
    expect(segundo.version).toBe(primero.version + 1);
    expect(await abre(firmar(primero)), 'El código revocado sigue abriendo.').toBe(false);
    expect(await abre(firmar(segundo))).toBe(true);
  });

  it('vale sólo el día de operación en que se emitió', async () => {
    const hoy = exigirOk(await conectar(cocina.estacionBebidas), 'conectar');
    expect(await abre(firmar(hoy, { dia: '2026-01-01' })), 'Un código de otro día abre.').toBe(
      false,
    );
  });

  it('una estación apagada ya no abre su teléfono', async () => {
    const vivo = exigirOk(await conectar(cocina.estacionBebidas), 'conectar');
    await obtenerDb()
      .updateTable('estaciones_preparacion')
      .set({ activa: false })
      .where('id', '=', cocina.estacionBebidas)
      .execute();
    try {
      expect(await abre(firmar(vivo))).toBe(false);
    } finally {
      await obtenerDb()
        .updateTable('estaciones_preparacion')
        .set({ activa: true })
        .where('id', '=', cocina.estacionBebidas)
        .execute();
    }
  });
});

describe('quién conecta', () => {
  it('un cocinero con estación fija sólo conecta la suya', async () => {
    const empleoId = await sembrarCompanero(cocina.negocio, { nombre: 'Toño', rol: 'cocina' });
    await obtenerDb()
      .updateTable('empleos')
      .set({ estacion_preparacion_id: cocina.estacionBebidas })
      .where('id', '=', empleoId)
      .execute();
    const tono: Ambito = { ...comoGerente(), rol: 'cocina', empleoId };
    const ajena = await conectar(cocina.estacionCocina, tono);
    expect(ajena.ok).toBe(false);
    if (!ajena.ok) expect(ajena.error.datos?.['regla']).toBe('ESTACION_AJENA');
    expect((await conectar(cocina.estacionBebidas, tono)).ok).toBe(true);
  });

  it('un mesero no conecta teléfonos de cocina', async () => {
    const r = await conectar(cocina.estacionCocina, { ...comoGerente(), rol: 'mesero' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('la versión en la configuración', () => {
  it('un guardado de Configuración no la pisa, y nunca sale al leer', async () => {
    const vigente = exigirOk(await conectar(cocina.estacionCocina), 'conectar');
    await conTransaccion((tx) =>
      guardarConfiguracionParcial(tx, cocina.negocio.organizacionId, { portal_qr_activo: true }),
    );
    expect(await abre(firmar(vigente)), 'Guardar la configuración revocó el teléfono.').toBe(true);
    const leida = await leerConfiguracion(cocina.negocio.organizacionId);
    expect(Object.keys(leida)).not.toContain('telefonos_de_cocina');
    await expect(
      conTransaccion((tx) =>
        guardarConfiguracionParcial(tx, cocina.negocio.organizacionId, {
          telefonos_de_cocina: { [cocina.estacionCocina]: 1 },
        }),
      ),
    ).rejects.toMatchObject({ codigo: 'PUENTE_CAMPO_INVALIDO' });
  });
});
