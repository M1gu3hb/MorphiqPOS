import { describe, expect, it } from 'vitest';

import { banderasDe } from './banderas.ts';
import { pedirCuentaQR } from './cuenta.ts';
import { enviarACocina, type ItemParaCocina } from './estaciones.ts';
import { contextoPortalFalso, filasDe, valoresDe, UNA_FILA } from './pruebas.ts';

/**
 * Los comandos del portal de principio a fin, sobre la transacción falsa.
 *
 * Lo que se afirma aquí no es una función suelta: es lo que queda ESCRITO en la
 * base cuando el comensal toca el botón. Es el único sitio donde se puede ver
 * que la propina se calculó sobre el consumo de verdad y no sobre un campo que
 * nadie había refrescado.
 */

const CUENTA_ABIERTA = {
  id: 'orden-1',
  estado: 'confirmada',
  version: 3,
  codigo_caja: null,
  propina_tipo: null,
  propina_origen: null,
  // EL CAMPO OBSOLETO, a propósito distinto del consumo real: es lo que este
  // comando leía antes del hallazgo 3. Si alguien vuelve a leerlo, la propina
  // sale de 43 000 y las afirmaciones de abajo lo dicen con nombre y apellido.
  total_centavos: 43_000n,
};

/** Dos líneas persistidas: 430.00 del QR y 600.00 que añadió el mesero. */
const LINEAS = [
  {
    id: 'linea-1',
    productoId: 'producto-1',
    productoNombre: 'Mole poblano',
    sku: null,
    cantidad: '1.0000',
    unidad: 'pieza',
    precioUnitarioCentavos: 43_000n,
    costoUnitarioCentavos: 0n,
    descuentoCentavos: 0n,
    subtotalCentavos: 43_000n,
    totalCentavos: 43_000n,
    esMayoreo: false,
    tipoVenta: 'precio_fijo',
    ordenVisual: 1,
  },
  {
    id: 'linea-2',
    productoId: 'producto-2',
    productoNombre: 'Botella de mezcal',
    sku: null,
    cantidad: '1.0000',
    unidad: 'pieza',
    precioUnitarioCentavos: 60_000n,
    costoUnitarioCentavos: 0n,
    descuentoCentavos: 0n,
    subtotalCentavos: 60_000n,
    totalCentavos: 60_000n,
    esMayoreo: false,
    tipoVenta: 'precio_fijo',
    ordenVisual: 2,
  },
];

const BANDERAS_CUENTA = banderasDe({
  portal_qr_activo: true,
  portal_qr_cuenta_modo: 'cliente_solicita',
});

describe('hallazgo 3 · la propina se calcula sobre lo que se consumió, no sobre la fila', () => {
  const montar = (): ReturnType<typeof contextoPortalFalso> =>
    contextoPortalFalso(
      {
        ordenes: [CUENTA_ABIERTA, UNA_FILA],
        orden_lineas: [LINEAS],
        // Ya había una solicitud de cuenta pendiente: se actualiza su
        // instantánea en vez de duplicar el aviso.
        solicitudes_qr: [{ id: 'solicitud-1' }],
      },
      BANDERAS_CUENTA,
    );

  it('el 15 % sale de 1030.00, que es lo cotizado, y no de los 430.00 guardados', async () => {
    const { ctx } = montar();

    const salida = await pedirCuentaQR.ejecutar(ctx, {
      propinaTipo: 'porcentaje',
      propinaPorcentaje: 15,
    });

    expect(salida.subtotalCentavos).toBe('103000');
    expect(salida.propinaCentavos).toBe('15450');
    // El número que salía antes. Verlo aquí es ver el defecto de vuelta.
    expect(salida.propinaCentavos).not.toBe('6450');
  });

  it('congela en la orden los totales frescos y su código de caja', async () => {
    const { ctx, base } = montar();

    const salida = await pedirCuentaQR.ejecutar(ctx, {
      propinaTipo: 'porcentaje',
      propinaPorcentaje: 15,
    });

    const escrito = valoresDe(base.escrituraEn('ordenes'));
    expect(escrito['total_centavos']).toBe(103_000n);
    expect(escrito['subtotal_centavos']).toBe(103_000n);
    expect(escrito['estado']).toBe('cuenta_solicitada');
    expect(escrito['codigo_caja']).toBe(salida.codigoCaja);
    expect(salida.codigoCaja).toMatch(/^M05-\d{4}$/);
    // La propina va en puntos base, aparte del total (regla 1).
    expect(escrito['propina_puntos_base']).toBe(1500);
  });

  it('la instantánea que lee el mesero dice el consumo real', async () => {
    const { ctx, base } = montar();

    await pedirCuentaQR.ejecutar(ctx, { propinaTipo: 'porcentaje', propinaPorcentaje: 15 });

    const solicitud = valoresDe(base.escrituraEn('solicitudes_qr'));
    expect(solicitud['subtotal_consumo_centavos']).toBe(103_000n);
    expect(solicitud['propina_sugerida_centavos']).toBe(15_450n);
    expect(solicitud['propina_sugerida_bp']).toBe(1500);
  });

  it('la propina escrita a mano se guarda EXACTA, no reconstruida', async () => {
    // El campo de importe manual estuvo fuera del esquema y la pantalla acababa
    // siempre en un error rojo: el comensal escribía 50 y no podía pedir la
    // cuenta. Lo que se guarda es lo que escribió, al centavo.
    const { ctx, base } = montar();

    const salida = await pedirCuentaQR.ejecutar(
      ctx,
      pedirCuentaQR.entrada.parse({ propinaTipo: 'monto_manual', propinaSugeridaCentavos: 5_000 }),
    );

    expect(salida.propinaCentavos).toBe('5000');
    expect(salida.propinaTipo).toBe('monto_manual');
    const solicitud = valoresDe(base.escrituraEn('solicitudes_qr'));
    expect(solicitud['propina_sugerida_centavos']).toBe(5_000n);
    // 5000 sobre 103000 son 485 puntos base, redondeados hacia abajo.
    expect(solicitud['propina_sugerida_bp']).toBe(485);
  });

  it('una propina MAYOR que la cuenta no revienta: los puntos se recortan al 100 %', async () => {
    // `ordenes.propina_puntos_base` y `solicitudes_qr.propina_sugerida_bp`
    // llevan `check (… between 0 and 10000)`. Sin el recorte, $2000 sobre una
    // cuenta de $1030 dan 19417 puntos y el `insert` aborta con 23514: la
    // petición entera se cae y el comensal no puede pedir la cuenta. Un
    // porcentaje inexacto es preferible a una pantalla que no funciona.
    const { ctx, base } = montar();

    const salida = await pedirCuentaQR.ejecutar(
      ctx,
      pedirCuentaQR.entrada.parse({
        propinaTipo: 'monto_manual',
        propinaSugeridaCentavos: 200_000,
      }),
    );

    // El IMPORTE se conserva entero: es lo que la caja lee.
    expect(salida.propinaCentavos).toBe('200000');
    const solicitud = valoresDe(base.escrituraEn('solicitudes_qr'));
    expect(solicitud['propina_sugerida_centavos']).toBe(200_000n);
    // Y los puntos, recortados al tope que la base admite.
    expect(solicitud['propina_sugerida_bp']).toBe(10_000);
    expect(valoresDe(base.escrituraEn('ordenes'))['propina_puntos_base']).toBe(10_000);
  });

  it('el importe manual SÓLO viaja con `monto_manual`', () => {
    // Pedir una cosa y mandar otra no se ignora en silencio: si llega un
    // importe con un tipo que no lo usa, la petición se rechaza.
    expect(
      pedirCuentaQR.entrada.safeParse({ propinaTipo: 'monto_manual' }).success,
      'monto_manual sin importe',
    ).toBe(false);
    expect(
      pedirCuentaQR.entrada.safeParse({
        propinaTipo: 'porcentaje',
        propinaPorcentaje: 10,
        propinaSugeridaCentavos: 5000,
      }).success,
      'importe con porcentaje',
    ).toBe(false);
  });

  it('sin propina no se calcula ninguna, y el total sigue siendo el cotizado', async () => {
    const { ctx, base } = montar();

    const salida = await pedirCuentaQR.ejecutar(ctx, {
      propinaTipo: 'sin_propina',
      propinaPorcentaje: 0,
    });

    expect(salida.propinaCentavos).toBe('0');
    expect(salida.propinaTipo).toBe('sin_propina');
    expect(valoresDe(base.escrituraEn('ordenes'))['total_centavos']).toBe(103_000n);
  });
});

describe('hallazgo 9 · los items de la comanda entran en UN viaje, no en cuarenta', () => {
  const item = (indice: number): ItemParaCocina => ({
    ordenLineaId: `linea-${indice.toString()}`,
    productoId: `producto-${indice.toString()}`,
    productoNombre: 'Taco de suadero',
    cantidad: '1.0000',
    notas: '',
    tipoVenta: 'precio_fijo',
    categoriaId: null,
    areaPreparacion: 'cocina',
  });

  it('tres líneas son un solo `insert` de tres filas', async () => {
    const { ctx, base } = contextoPortalFalso({ comandas: [{ id: 'comanda-1' }] });

    const comandas = await enviarACocina(
      ctx,
      {
        ordenId: 'orden-1',
        notasAlergias: 'Alergia al cacahuate',
        celebracionEspecial: false,
        tipoCelebracion: null,
        notas: '',
      },
      [item(1), item(2), item(3)],
    );

    expect(comandas).toBe(1);
    // Con el bucle anterior esto valía 3: un viaje por línea, con la
    // transacción abierta y las filas de `ordenes` y `mesas` por bloquearse.
    const inserciones = base.operaciones.filter((o) => o.tabla === 'comanda_items');
    expect(inserciones.length).toBe(1);

    const filas = filasDe(inserciones[0]);
    expect(filas.length).toBe(3);
  });
});
