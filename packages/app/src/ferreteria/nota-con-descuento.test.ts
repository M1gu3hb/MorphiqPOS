import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it, vi } from 'vitest';

import { firmarAutorizacion } from '../identidad/supervisor.ts';
import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG } from '../restaurante/pruebas/sala.ts';
import { crearNotaMostrador, entradaCrearNotaMostrador } from './nota-de-mostrador.ts';

/**
 * EL DESCUENTO QUE SE NEGOCIA EN EL PASILLO, en la nota (bloque D de la 2.4).
 *
 * `ferreteria/02-DINERO-Y-CAJA §3`: el «¿cuánto es lo menos?» es parte de la venta de
 * mostrador de este giro; el mostradorista lo da con su tope y, arriba de él, con el PIN
 * del encargado o del dueño. La nota nace `confirmada` y `venta.aplicar_descuento` sólo
 * aceptaba borradores: la ferretería no podía descontar NADA. Ahora el descuento viaja con
 * la nota y lo aplica la MISMA regla del carrito (`descontarLaOrden`).
 */

const SECRETO = 'secreto_de_prueba_para_firmar_autorizaciones_2026';
vi.mock('@morphiqpos/contracts', async (original) => ({
  ...(await original<typeof import('@morphiqpos/contracts')>()),
  validarEntorno: () => ({ SESSION_SECRET: SECRETO }),
}));

const AHORA = new Date('2026-10-08T16:30:00.000Z');
const PINZA = 'b1111111-1111-4111-8111-111111111111';
const ELENA = 'e2222222-2222-4222-8222-222222222222';

function pinza(): Fila {
  return {
    id: PINZA,
    organizacion_id: ORG,
    nombre: 'Pinza de electricista 8 pulgadas',
    sku: 'PIN-08',
    codigo_barras: null,
    tipo_venta: 'precio_fijo',
    unidad_venta: 'pieza',
    precio_venta_centavos: 21_900n,
    costo_unitario_centavos: 14_000n,
    precio_mayoreo_centavos: null,
    cantidad_minima_mayoreo: null,
    unidad_variable: null,
    precio_por_unidad_variable_centavos: null,
    cantidad_minima_variable: null,
    cantidad_maxima_variable: null,
    incremento_variable: null,
    capacidad_contenedor_ml: null,
    ml_por_porcion: null,
    porciones_por_contenedor: null,
    precio_por_porcion_centavos: null,
    estrategia_consumo: 'sku',
    permite_venta_sin_stock: true,
    activo: true,
    unidad_base: 'pieza',
  };
}

function baseDe() {
  return crearBaseFalsa(
    {
      productos: [pinza()],
      ordenes: [],
      notas_mostrador: [],
      orden_lineas: [],
      configuracion: [],
      autorizaciones_descuento: [],
      // Los topes de la demo (`como-nueva.ts`): la mostradorista, $50 o el 10 %.
      topes_descuento: [
        { organizacion_id: ORG, rol: 'cajero', tope_centavos: 5_000n, tope_bp: 1_000 },
        { organizacion_id: ORG, rol: 'gerente', tope_centavos: 200_000n, tope_bp: 3_000 },
      ],
    },
    {
      filasCrudas: [{ siguiente: 12n, serie: 'N' }],
      predeterminados: {
        ordenes: { estado: 'borrador', total_centavos: 0n },
        orden_lineas: {
          descuento_centavos: 0n,
          impuesto_centavos: 0n,
          notas: null,
          opciones: null,
          anulada_en: null,
        },
      },
    },
  );
}

/** Lo que firma `/api/identidad/supervisor` cuando Elena teclea su PIN en esta terminal. */
function autorizacionDeElena(): string {
  return firmarAutorizacion(
    {
      org: ORG,
      supervisor: ELENA,
      rol: 'gerente',
      solicita: EMPLEO,
      exp: Math.floor(AHORA.getTime() / 1000) + 120,
      n: 'abcdef0123456789',
    },
    SECRETO,
  );
}

const nota = (descuento: Record<string, unknown>) =>
  entradaCrearNotaMostrador.parse({
    partidas: [{ productoId: PINZA, cantidad: '2' }],
    descuento,
  });

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  return promesa
    .then(() => 'NO_LANZO')
    .catch((error: unknown) => (esErrorDominio(error) ? error.codigo : String(error)));
}

describe('ferreteria.crear_nota_mostrador · el descuento del pasillo', () => {
  it('dentro del tope de quien arma: la nota llega a la caja con el total ya descontado', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await crearNotaMostrador.ejecutar(
      ctx,
      nota({ centavos: 2_000, motivo: 'el electricista se lleva dos' }),
    );

    // Dos pinzas de $219 son $438; con $20 de descuento, la caja cobra $418.
    expect(salida.totalCentavos).toBe('41800');
    expect(base.campo('ordenes', 'total_centavos')).toBe(41_800n);
    expect(base.campo('orden_lineas', 'descuento_centavos')).toBe(2_000n);
    // Cupo en su tope: nadie tuvo que autorizar.
    expect(base.filas('autorizaciones_descuento')).toHaveLength(0);
  });

  it('SOBRE el tope y sin el PIN del supervisor, la nota no se manda', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(
      await codigoDe(
        crearNotaMostrador.ejecutar(ctx, nota({ centavos: 15_000, motivo: 'paga de contado' })),
      ),
    ).toBe('PUESTO_NO_OTORGABLE');
  });

  it('SOBRE el tope con la autorización de Elena: se aplica y queda en la bitácora con quién', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await crearNotaMostrador.ejecutar(
      ctx,
      nota({ centavos: 6_000, motivo: 'paga de contado', autorizacion: autorizacionDeElena() }),
    );

    // $60 sobre $438: pasa de los $50 y del 10 % de Karla, y cabe en el 30 % de Elena.
    expect(salida.totalCentavos).toBe('37800');
    const autorizaciones = base.filas('autorizaciones_descuento');
    expect(autorizaciones).toHaveLength(1);
    expect(autorizaciones[0]?.['autoriza_empleo_id']).toBe(ELENA);
    expect(autorizaciones[0]?.['solicita_empleo_id']).toBe(EMPLEO);
    expect(autorizaciones[0]?.['descuento_centavos']).toBe(6_000n);
  });

  it('sin descuento, la nota cobra su precio de lista', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await crearNotaMostrador.ejecutar(
      ctx,
      entradaCrearNotaMostrador.parse({ partidas: [{ productoId: PINZA, cantidad: '2' }] }),
    );

    expect(salida.totalCentavos).toBe('43800');
  });
});
