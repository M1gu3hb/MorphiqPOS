import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, ORG } from '../restaurante/pruebas/sala.ts';
import { autorizacionesDeCredito, autorizarVentaACredito } from './autorizacion-credito.ts';

/**
 * La llave del dueño sobre el muro de crédito.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que la llave QUEDE REGISTRADA con su motivo. «El dueño dijo que sí» no se
 * puede verificar tres meses después; una fila sí, y entonces las excepciones
 * se pueden contar.
 *
 * Que el motivo DIGA ALGO. Un campo que admite dos letras se llena con dos
 * letras, y lo que hace útil este registro es poder leerlo en seis meses.
 *
 * Y que se vea la REINCIDENCIA. Uno que pide excepción todos los meses no es
 * una excepción: es el límite mal puesto, y eso se arregla subiéndolo o
 * cortando.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const CLIENTE = 'f8000000-0000-4000-8000-000000000001';
const OTRO = 'f8000000-0000-4000-8000-000000000002';

const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      clientes: [
        {
          id: CLIENTE,
          organizacion_id: ORG,
          nombre: 'Constructora Ríos',
          bloqueado_por_mora: true,
        },
      ],
      autorizaciones_descuento: [],
      ...extra,
    },
    { predeterminados: { autorizaciones_descuento: { orden_id: null, sucursal_id: null } } },
  );
}

const autorizacion = (cambios: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'a1',
  organizacion_id: ORG,
  solicita_empleo_id: 'e1',
  autoriza_empleo_id: 'e1',
  autoriza_rol: 'dueno',
  descuento_centavos: 4_000_000n,
  tope_centavos: 0n,
  motivo: 'obra grande, paga el viernes',
  cliente_id: CLIENTE,
  vence_en: dias(1),
  created_at: dias(-3),
  ...cambios,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('la llave del dueño', () => {
  it('QUEDA REGISTRADA con quién, cuánto y por qué', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await autorizarVentaACredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 4_000_000,
      ordenId: null,
      motivo: 'obra grande, paga el viernes sin falta',
      vigenciaHoras: 8,
    });

    expect(salida.importeCentavos).toBe('4000000');
    expect(base.filas('autorizaciones_descuento')).toHaveLength(1);
    expect(base.campo('autorizaciones_descuento', 'cliente_id')).toBe(CLIENTE);
    expect(base.campo('autorizaciones_descuento', 'motivo')).toBe(
      'obra grande, paga el viernes sin falta',
    );
  });

  it('CADUCA: no es un permiso abierto', async () => {
    // Una llave que deja al cliente desbloqueado «hasta nuevo aviso» es una que
    // nadie vuelve a girar: el bloqueo nunca regresa.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await autorizarVentaACredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 100_000,
      ordenId: null,
      motivo: 'cliente de siempre, tres días de retraso',
      vigenciaHoras: 8,
    });

    expect(salida.venceEn).toBe(new Date(AHORA.getTime() + 8 * 3_600_000).toISOString());
  });

  it('UN MOTIVO QUE NO EXPLICA NADA SE RECHAZA', async () => {
    // «ok ok ok» pasa el mínimo de longitud y no dice nada.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      autorizarVentaACredito.ejecutar(ctx, {
        clienteId: CLIENTE,
        importeCentavos: 100_000,
        ordenId: null,
        motivo: 'autorizado autorizado',
        vigenciaHoras: 8,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_INVALIDA');
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('dice si el cliente ESTABA BLOQUEADO por mora', async () => {
    // No es lo mismo pasar por encima del límite que pasar por encima del muro.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await autorizarVentaACredito.ejecutar(ctx, {
      clienteId: CLIENTE,
      importeCentavos: 100_000,
      ordenId: null,
      motivo: 'obra grande, paga el viernes',
      vigenciaHoras: 8,
    });

    expect(salida.estabaBloqueado).toBe(true);
  });

  it('un cliente de otro negocio no existe', async () => {
    const base = baseDe({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const codigo = await codigoDe(() =>
      autorizarVentaACredito.ejecutar(ctx, {
        clienteId: CLIENTE,
        importeCentavos: 100_000,
        ordenId: null,
        motivo: 'obra grande, paga el viernes',
        vigenciaHoras: 8,
      }),
    );

    expect(codigo).toBe('PUENTE_NO_ENCONTRADO');
  });
});

describe('las autorizaciones que se dieron', () => {
  it('SEÑALA A LOS REINCIDENTES', async () => {
    // Uno que pide excepción todos los meses no es una excepción: es el límite
    // mal puesto.
    const base = baseDe({
      autorizaciones_descuento: [
        autorizacion({ id: 'a1' }),
        autorizacion({ id: 'a2', created_at: dias(-20) }),
        autorizacion({ id: 'a3', cliente_id: OTRO, motivo: 'una vez y ya' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await autorizacionesDeCredito.ejecutar(ctx, { clienteId: null, dias: 60 });

    expect(salida.autorizaciones).toHaveLength(3);
    expect(salida.reincidentes).toBe(1);
  });

  it('NO MEZCLA las excepciones de descuento con las de crédito', async () => {
    // Un «lleva nueve excepciones» que suma nueve descuentos autorizados en
    // caja es un número que no significa nada.
    const base = baseDe({
      autorizaciones_descuento: [
        autorizacion({ id: 'a1' }),
        autorizacion({ id: 'a2', cliente_id: null, motivo: 'descuento de mostrador' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await autorizacionesDeCredito.ejecutar(ctx, { clienteId: null, dias: 60 });

    expect(salida.autorizaciones.map((a) => a.autorizacionId)).toEqual(['a1']);
  });

  it('el cliente y el motivo salen tal cual se guardaron', async () => {
    const base = baseDe({ autorizaciones_descuento: [autorizacion()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await autorizacionesDeCredito.ejecutar(ctx, { clienteId: null, dias: 60 });

    expect(salida.autorizaciones[0]?.clienteId).toBe(CLIENTE);
    expect(salida.autorizaciones[0]?.motivo).toBe('obra grande, paga el viernes');
  });

  it('suma lo que se dejó pasar', async () => {
    const base = baseDe({
      autorizaciones_descuento: [autorizacion({ id: 'a1' }), autorizacion({ id: 'a2' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await autorizacionesDeCredito.ejecutar(ctx, { clienteId: null, dias: 60 });

    expect(salida.totalCentavos).toBe('8000000');
  });

  it('sin autorizaciones el total es cero, no un hueco', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);

    const salida = await autorizacionesDeCredito.ejecutar(ctx, { clienteId: null, dias: 60 });

    expect(salida.totalCentavos).toBe('0');
    expect(salida.reincidentes).toBe(0);
  });
});
