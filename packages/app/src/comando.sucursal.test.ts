import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from './comando.ts';
import { ambitoDeCajero, crearFabrica, type TxFalsa } from './pruebas/dobles.ts';
import { segmentosDe } from './sucursal/frontera.ts';

/**
 * D-36 · La frontera por sucursal, en el envoltorio.
 *
 * Un comando declara qué campos de su entrada son ids de algo de UNA sucursal, y el
 * envoltorio, antes del cuerpo, cambia los que son de otra por uno que no existe. Aquí la
 * base es falsa y dice qué ids son «de fuera» (`ponerFueraDeLaSucursal`); que Postgres lo
 * diga bien lo prueba `frontera-de-comandos.integracion.test.ts`.
 */

const CLAVE = 'clave-de-idempotencia-0001';
const DEL_CENTRO = '66666666-6666-4666-8666-666666666666';
const DEL_NORTE = '77777777-7777-4777-8777-777777777777';
const RENGLON_DEL_NORTE = '88888888-8888-4888-8888-888888888888';
const NUEVO = '99999999-9999-4999-8999-999999999999';

function comandoConFrontera(escribe = true) {
  const vistas: { ordenId: string; lineas: { ordenLineaId: string }[] }[] = [];
  const definicion = definirComando({
    nombre: 'venta.devolver_venta',
    entidad: 'orden',
    escribe,
    roles: ['cajero', 'gerente', 'dueno'],
    paquetes: ['tienda'],
    sucursal: { ordenId: 'ordenes', 'lineas[].ordenLineaId': 'orden_lineas' },
    entrada: z.object({
      ordenId: z.uuid(),
      lineas: z.array(z.object({ ordenLineaId: z.uuid(), cantidad: z.number() })),
    }),
    async ejecutar(ctx, entrada) {
      vistas.push(entrada);
      ctx.auditar({ entidadId: entrada.ordenId, payload: {} });
      return { ordenId: entrada.ordenId };
    },
  });
  return { definicion, vistas };
}

function entrada(ordenId: string, renglon: string) {
  return { ordenId, lineas: [{ ordenLineaId: renglon, cantidad: 1 }] };
}

describe('comando() · la frontera por sucursal (D-36)', () => {
  it('lo de su sucursal llega intacto, y pregunta UNA vez por tabla', async () => {
    const fabrica = crearFabrica();
    const { definicion, vistas } = comandoConFrontera();
    const salida = await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: entrada(DEL_CENTRO, RENGLON_DEL_NORTE),
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });
    expect(salida.ok).toBe(true);
    expect(vistas).toEqual([entrada(DEL_CENTRO, RENGLON_DEL_NORTE)]);
    expect(fabrica.preguntasDeFrontera).toEqual([
      { sucursalId: ambitoDeCajero().sucursalId, tabla: 'ordenes', ids: [DEL_CENTRO] },
      { sucursalId: ambitoDeCajero().sucursalId, tabla: 'orden_lineas', ids: [RENGLON_DEL_NORTE] },
    ]);
  });

  it('un id de OTRA sucursal llega al cuerpo como uno que no existe; lo auditado, como se pidió', async () => {
    const fabrica = crearFabrica();
    fabrica.ponerFueraDeLaSucursal([DEL_NORTE, RENGLON_DEL_NORTE]);
    const { definicion, vistas } = comandoConFrontera();
    const salida = await crearComando<TxFalsa>({ ...fabrica, nuevoId: () => NUEVO })(definicion, {
      entrada: entrada(DEL_NORTE, RENGLON_DEL_NORTE),
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });
    expect(salida.ok).toBe(true);
    expect(vistas).toEqual([entrada(NUEVO, NUEVO)]);
    expect(fabrica.auditoriaConfirmada()[0]?.payload['entrada']).toEqual(
      entrada(DEL_NORTE, RENGLON_DEL_NORTE),
    );
  });

  it('quien no consolida y llega sin sucursal pregunta con la sucursal nula: falla cerrada', async () => {
    const fabrica = crearFabrica();
    const { definicion } = comandoConFrontera(false);
    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: entrada(DEL_CENTRO, RENGLON_DEL_NORTE),
      ambito: ambitoDeCajero({ rol: 'gerente', sucursalId: null, terminalId: null }),
    });
    expect(fabrica.preguntasDeFrontera.map((p) => p.sucursalId)).toEqual([null, null]);
  });

  it('el dueño LEE el negocio entero, con o sin terminal', async () => {
    const fabrica = crearFabrica();
    fabrica.ponerFueraDeLaSucursal([DEL_NORTE]);
    const { definicion, vistas } = comandoConFrontera(false);
    for (const sucursalId of [null, ambitoDeCajero().sucursalId]) {
      await crearComando<TxFalsa>(fabrica)(definicion, {
        entrada: entrada(DEL_NORTE, RENGLON_DEL_NORTE),
        ambito: ambitoDeCajero({ rol: 'dueno', sucursalId }),
      });
    }
    expect(fabrica.preguntasDeFrontera).toEqual([]);
    expect(vistas.map((v) => v.ordenId)).toEqual([DEL_NORTE, DEL_NORTE]);
  });

  it('pero cuando ESCRIBE desde una terminal, opera la sucursal de esa terminal', async () => {
    const fabrica = crearFabrica();
    fabrica.ponerFueraDeLaSucursal([DEL_NORTE]);
    const { definicion, vistas } = comandoConFrontera();
    await crearComando<TxFalsa>({ ...fabrica, nuevoId: () => NUEVO })(definicion, {
      entrada: entrada(DEL_NORTE, RENGLON_DEL_NORTE),
      ambito: ambitoDeCajero({ rol: 'dueno' }),
      idempotencyKey: CLAVE,
    });
    expect(vistas.map((v) => v.ordenId)).toEqual([NUEVO]);

    // Y desde su teléfono, sin terminal ni caja de por medio, opera cualquiera.
    const otra = crearFabrica();
    otra.ponerFueraDeLaSucursal([DEL_NORTE]);
    const segunda = comandoConFrontera();
    await crearComando<TxFalsa>(otra)(segunda.definicion, {
      entrada: entrada(DEL_NORTE, RENGLON_DEL_NORTE),
      ambito: ambitoDeCajero({ rol: 'dueno', sucursalId: null, terminalId: null }),
      idempotencyKey: CLAVE,
    });
    expect(segunda.vistas.map((v) => v.ordenId)).toEqual([DEL_NORTE]);
  });

  it('un comando sin frontera declarada no le pregunta nada a la base', async () => {
    const fabrica = crearFabrica();
    const definicion = definirComando({
      nombre: 'catalogo.archivar_producto',
      entidad: 'producto',
      escribe: false,
      roles: ['cajero'],
      paquetes: ['tienda'],
      entrada: z.object({ productoId: z.uuid() }),
      async ejecutar() {
        return {};
      },
    });
    await crearComando<TxFalsa>(fabrica)(definicion, {
      entrada: { productoId: DEL_NORTE },
      ambito: ambitoDeCajero(),
    });
    expect(fabrica.preguntasDeFrontera).toEqual([]);
  });
});

describe('definirComando() · la frontera se declara sobre campos que existen', () => {
  it.each([
    ['ordenId', true],
    ['lineas[].ordenLineaId', true],
    ['lineas[].cantidad', true],
    ['ordenID', false],
    ['lineas.ordenLineaId', false],
    ['lineas[].renglonId', false],
  ])('«%s» existe: %s', (camino, existe) => {
    const definir = () =>
      definirComando({
        nombre: 'venta.devolver_venta',
        entidad: 'orden',
        escribe: true,
        roles: ['gerente'],
        paquetes: ['tienda'],
        sucursal: { [camino]: 'ordenes' },
        entrada: z.object({
          ordenId: z.uuid(),
          lineas: z
            .array(z.object({ ordenLineaId: z.uuid(), cantidad: z.number() }))
            .optional()
            .default([]),
        }),
        async ejecutar() {
          return {};
        },
      });
    if (existe) expect(definir).not.toThrow();
    else expect(definir).toThrow(/frontera de/);
  });

  it('los caminos se parten por punto y por arreglo', () => {
    expect(segmentosDe('particiones[].tomas[].lineaId')).toEqual([
      'particiones',
      '[]',
      'tomas',
      '[]',
      'lineaId',
    ]);
    expect(segmentosDe('ordenIds[]')).toEqual(['ordenIds', '[]']);
  });
});
