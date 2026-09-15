import { describe, expect, it } from 'vitest';

import { armarBanco, parametrosDe, sqlDe, type Banco } from './banco-de-pruebas.ts';
import { marcarPropinaDeOrden } from './cobro.ts';
import {
  entradaCobrarOrdenConPropina,
  entradaPagoConPropina,
  MAXIMO_PROPINA_CENTAVOS,
} from './esquemas.ts';

/**
 * Lo que el cobro escribe de propina, y lo que el cobro NO acepta.
 *
 * Dos graves del veredicto: `marcarPropinaDeOrden` sobrescribía las tres
 * columnas de propina de la orden aunque el cobro sólo mandara una —destruyendo
 * lo que había elegido el comensal en el portal QR—, y `propinaCentavos` era el
 * único importe del cobro sin cota superior, con vía directa a
 * `movimientos_caja` y por tanto al efectivo esperado del corte.
 */

const ORGANIZACION = '00000000-0000-4000-8000-0000000000a1';
const ORDEN = '00000000-0000-4000-8000-00000000e001';

function banco(): Banco {
  return armarBanco('restaurante_pro', []);
}

// ───────────────────────── no se destruye lo que escribió otro (grave 5)

describe('marcarPropinaDeOrden · escribe sólo lo que vino', () => {
  it('un cobro que sólo manda el origen no borra el porcentaje del portal QR', async () => {
    // El caso real: el comensal tocó «15 %» en el QR y la orden quedó con
    // `puntos_base=1500, tipo='porcentaje', origen='portal_qr'`. El cajero cobra
    // y su pantalla manda sólo `propinaOrigen: 'caja'`, porque la propina se
    // dejó en efectivo en el mostrador.
    //
    // Mutación que la hace fallar: volver al `set` de tres columnas con
    // `?? 0` / `?? null`, que dejaba `puntos_base=0` y `tipo=NULL`.
    const b = banco();

    await marcarPropinaDeOrden(b.tx, {
      organizacionId: ORGANIZACION,
      ordenId: ORDEN,
      puntosBase: undefined,
      tipo: undefined,
      origen: 'caja',
    });

    expect(b.conexion.consultas).toHaveLength(1);
    expect(sqlDe(b, 0)).toContain('"propina_origen" =');
    expect(sqlDe(b, 0)).not.toContain('"propina_puntos_base"');
    expect(sqlDe(b, 0)).not.toContain('"propina_tipo"');
    expect(parametrosDe(b, 0)).toContain('caja');
  });

  it('un cero explícito SÍ se escribe: «sin propina» es una decisión', async () => {
    // Mutación que la hace fallar: distinguir los campos por verdad
    // (`if (datos.puntosBase)`) en vez de por `undefined`. Con eso, «el comensal
    // eligió 0 %» se volvería indistinguible de «la pantalla no mandó nada».
    const b = banco();

    await marcarPropinaDeOrden(b.tx, {
      organizacionId: ORGANIZACION,
      ordenId: ORDEN,
      puntosBase: 0,
      tipo: 'sin_propina',
      origen: undefined,
    });

    expect(sqlDe(b, 0)).toContain('"propina_puntos_base" =');
    expect(sqlDe(b, 0)).toContain('"propina_tipo" =');
    expect(sqlDe(b, 0)).not.toContain('"propina_origen"');
    expect(parametrosDe(b, 0)).toContain('0');
    expect(parametrosDe(b, 0)).toContain('sin_propina');
  });

  it('si la pantalla no mandó nada, la fila no se toca', async () => {
    const b = banco();

    await marcarPropinaDeOrden(b.tx, {
      organizacionId: ORGANIZACION,
      ordenId: ORDEN,
      puntosBase: undefined,
      tipo: undefined,
      origen: undefined,
    });

    expect(b.conexion.consultas).toHaveLength(0);
  });

  it('el UPDATE va acotado a la organización, nunca sólo por id', async () => {
    const b = banco();

    await marcarPropinaDeOrden(b.tx, {
      organizacionId: ORGANIZACION,
      ordenId: ORDEN,
      puntosBase: undefined,
      tipo: undefined,
      origen: 'mesero',
    });

    expect(sqlDe(b, 0)).toContain('"organizacion_id" =');
    expect(parametrosDe(b, 0)).toContain(ORGANIZACION);
  });
});

// ─────────────────────────────── la propina del cliente tiene tope (grave 6)

describe('el importe de propina que llega del cliente', () => {
  const PAGO = { metodo: 'efectivo', montoCentavos: 15_000 } as const;

  it('rechaza la propina que revienta el arqueo del turno', async () => {
    // El escenario del veredicto: cobrar el total exacto y colar
    // `propinaCentavos: 9007199254740991` sin `recibidoCentavos`. Se confirmaba
    // el cobro y el corte pedía noventa billones de pesos en el cajón.
    //
    // Mutación que la hace fallar: quitar `.max(MAXIMO_PROPINA_CENTAVOS)` de
    // `propinaCentavos` en `esquemas.ts`.
    const salida = entradaPagoConPropina.safeParse({
      ...PAGO,
      propinaCentavos: Number.MAX_SAFE_INTEGER,
    });

    expect(salida.success).toBe(false);
  });

  it('rechaza una propina desproporcionada aunque quepa bajo el tope absoluto', async () => {
    // $99 999 de propina sobre una cuenta de $150. Cabe en el tope absoluto y
    // sigue siendo imposible.
    //
    // Mutación que la hace fallar: quitar el `superRefine` que compara la
    // propina con el renglón de venta.
    const salida = entradaPagoConPropina.safeParse({ ...PAGO, propinaCentavos: 9_999_900 });

    expect(salida.success).toBe(false);
  });

  it('una propina generosa de verdad sigue pasando', async () => {
    // $50 sobre un café de $20 es normal, y el tope relativo no puede
    // prohibirlo: por eso la cota tiene un piso además de un factor.
    const salida = entradaPagoConPropina.safeParse({
      metodo: 'efectivo',
      montoCentavos: 2_000,
      propinaCentavos: 5_000,
    });

    expect(salida.success).toBe(true);
  });

  it('el tope absoluto es el declarado, ni uno más', async () => {
    const grande = { metodo: 'tarjeta', montoCentavos: 5_000_000 } as const;

    expect(
      entradaPagoConPropina.safeParse({ ...grande, propinaCentavos: MAXIMO_PROPINA_CENTAVOS })
        .success,
    ).toBe(true);
    expect(
      entradaPagoConPropina.safeParse({ ...grande, propinaCentavos: MAXIMO_PROPINA_CENTAVOS + 1 })
        .success,
    ).toBe(false);
  });

  it('el cobro completo hereda el tope: no hay puerta trasera por `pagos`', async () => {
    // Mutación que la hace fallar: aplicar el tope sólo al esquema suelto y no
    // al que usa el comando de cobro.
    const salida = entradaCobrarOrdenConPropina.safeParse({
      ordenId: ORDEN,
      pagos: [{ ...PAGO, propinaCentavos: Number.MAX_SAFE_INTEGER }],
    });

    expect(salida.success).toBe(false);
  });

  it('sigue sin aceptar un total de propina suelto, sin método', async () => {
    // Un total de propina sin método obligaría a repartirlo, y repartir es
    // exactamente lo que la regla 3 de `F1-01` §3 prohíbe.
    expect(Object.keys(entradaCobrarOrdenConPropina.shape)).not.toContain('propinaCentavos');
  });
});
