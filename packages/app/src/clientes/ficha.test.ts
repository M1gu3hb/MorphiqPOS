import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { altaCliente, editarCliente, normalizarTelefono } from './ficha.ts';

/**
 * F-040 · La ficha del cliente.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que `55 1234 5678`, `(55) 1234-5678` y `+52 55 1234 5678` sean LA MISMA
 * persona. Sin eso, la señora de la esquina entra tres veces al catálogo y su
 * saldo de fiado se parte en tres — y el día que se le cobra, ninguno de los
 * tres números es el bueno.
 *
 * Y que editar el teléfono no borre las notas de cobranza: una pantalla que
 * manda el formulario entero, contra un comando que escribe el objeto entero,
 * es el defecto clásico que vacía campos que nadie tocó.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const CLIENTE = 'c1000000-0000-4000-8000-000000000001';

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(
    { clientes: [], ...extra },
    {
      predeterminados: {
        clientes: {
          telefono: null,
          correo: null,
          notas: null,
          como_se_llama: null,
          direccion: null,
          rfc: null,
          regimen_fiscal: null,
          codigo_postal: null,
          notas_cobranza: null,
          dia_pago: null,
          dia_pago_semana: null,
        },
      },
    },
  );

function clienteGuardado(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CLIENTE,
    organizacion_id: ORG,
    nombre: 'Doña Mary',
    telefono: '5512345678',
    notas: 'Prefiere el pan de ayer',
    notas_cobranza: 'Pasa los viernes',
    dia_pago: null,
    dia_pago_semana: null,
    como_se_llama: null,
    direccion: null,
    correo: null,
    ...cambios,
  };
}

const ALTA = {
  nombre: 'Doña Mary',
  telefono: '55 1234 5678',
  correo: null,
  comoSeLlama: null,
  direccion: null,
  notas: null,
  rfc: null,
  regimenFiscal: null,
  codigoPostal: null,
};

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('F-040 · el teléfono es la llave real', () => {
  it('las tres formas de escribirlo dan LO MISMO', () => {
    expect(normalizarTelefono('55 1234 5678')).toBe('5512345678');
    expect(normalizarTelefono('(55) 1234-5678')).toBe('5512345678');
    expect(normalizarTelefono('+52 55 1234 5678')).toBe('5512345678');
  });

  it('se guarda ya normalizado', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await altaCliente.ejecutar(ctx, ALTA);

    expect(base.filas('clientes')[0]?.['telefono']).toBe('5512345678');
  });

  it('DAR DE ALTA DOS VECES DEVUELVE LA FICHA QUE YA HAY', async () => {
    // En el mostrador, «ese cliente ya existe» es un callejón sin salida: hay
    // alguien esperando. Lo que hace falta es seguir con la ficha que ya hay.
    const base = baseDe({ clientes: [clienteGuardado()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await altaCliente.ejecutar(ctx, ALTA);

    expect(salida.clienteId).toBe(CLIENTE);
    expect(base.filas('clientes')).toHaveLength(1);
  });

  it('un teléfono de siete dígitos no es un teléfono', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      altaCliente.ejecutar(ctx, { ...ALTA, telefono: '1234567' }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('SIN teléfono se da de alta igual: la mayoría de los clientes no lo dan', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await altaCliente.ejecutar(ctx, { ...ALTA, telefono: null });

    expect(base.filas('clientes')).toHaveLength(1);
    expect(base.filas('clientes')[0]?.['telefono']).toBeNull();
  });
});

describe('F-040 · los campos fiscales, que se guardan y no se usan', () => {
  it('un RFC con forma válida se acepta', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await altaCliente.ejecutar(ctx, { ...ALTA, rfc: 'MAGM850101ABC' });

    expect(base.filas('clientes')[0]?.['rfc']).toBe('MAGM850101ABC');
  });

  it('uno de nueve caracteres es un tecleo, y se corta aquí', async () => {
    // No se valida el dígito verificador —eso lo hace el PAC— pero sí la forma:
    // descubrirlo el día de facturar es descubrirlo tarde.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => altaCliente.ejecutar(ctx, { ...ALTA, rfc: 'MAGM85010' }));

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });
});

describe('F-040 · editar toca SÓLO lo que viene', () => {
  it('cambiar el teléfono NO borra las notas de cobranza', async () => {
    // Es el defecto clásico de una pantalla que manda el formulario entero
    // contra un comando que escribe el objeto entero.
    const base = baseDe({ clientes: [clienteGuardado()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await editarCliente.ejecutar(ctx, { clienteId: CLIENTE, telefono: '5598765432' });

    const fila = base.filas('clientes')[0];
    expect(fila?.['telefono']).toBe('5598765432');
    expect(fila?.['notas_cobranza']).toBe('Pasa los viernes');
    expect(fila?.['notas']).toBe('Prefiere el pan de ayer');
  });

  it('un `null` explícito SÍ borra: es una decisión, no un olvido', async () => {
    const base = baseDe({ clientes: [clienteGuardado()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await editarCliente.ejecutar(ctx, { clienteId: CLIENTE, notasCobranza: null });

    expect(base.filas('clientes')[0]?.['notas_cobranza']).toBeNull();
  });

  it('guarda el día del mes y el día de la semana por separado', async () => {
    // Son dos cosas distintas: «paga el 15» es el crédito de la ferretería y
    // «pasa los viernes» es la libreta de la tiendita.
    const base = baseDe({ clientes: [clienteGuardado()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    await editarCliente.ejecutar(ctx, { clienteId: CLIENTE, diaPago: 15, diaPagoSemana: 5 });

    const fila = base.filas('clientes')[0];
    expect(fila?.['dia_pago']).toBe(15);
    expect(fila?.['dia_pago_semana']).toBe(5);
  });

  it('una edición vacía se rechaza en vez de escribir nada', async () => {
    const base = baseDe({ clientes: [clienteGuardado()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() => editarCliente.ejecutar(ctx, { clienteId: CLIENTE }));

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
  });

  it('un cliente de otro negocio no existe para éste', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const codigo = await codigoDe(() =>
      editarCliente.ejecutar(ctx, { clienteId: CLIENTE, nombre: 'Otra' }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});
