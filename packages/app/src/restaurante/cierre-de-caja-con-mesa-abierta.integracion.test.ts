import { obtenerDb, repoCaja } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { cerrarCaja } from '../caja/sesion.ts';
import { comando } from '../produccion.ts';
import { abrirCajaReal, clave, exigirOk } from '../pruebas/negocio-real.ts';
import {
  PRECIO_ARRACHERA,
  PRECIO_CERVEZA,
  ambitoDeCaja,
  cobrarExacto,
  dividirEn,
  mesaPersistida,
  ordenPersistida,
  pagosDe,
  pedirLaCuenta,
  sembrarSalon,
  sentarYPedir,
  type Salon,
} from './pruebas/salon-real.ts';

/**
 * C10 · CERRAR LA CAJA CON LA CUENTA DE UNA MESA ABIERTA, contra Postgres (cierre del restaurante,
 * 21-10). Documenta lo que el servidor hace HOY; no propone ni cambia nada.
 *
 * ── Lo que hace hoy ──────────────────────────────────────────────────────────
 * `caja.cerrar` (`caja/sesion.ts`) rechaza el cierre con tres cosas en el aire —ventas apartadas
 * en ESTA terminal, pedidos de mostrador cobrados y sin entregar, notas de ferretería por
 * cobrar— y con ninguna más. Una MESA abierta no está en la lista: su cuenta no tiene
 * `sesion_caja_id` hasta que se cobra (`marcarPagada` se lo pone), así que para el cierre es
 * invisible. El servidor lo deja cerrar, el corte sale cuadrado —no había venta que contar— y la
 * mesa sigue sentada, con su comanda en la plancha o su cuenta ya pedida.
 *
 * ── El riesgo ────────────────────────────────────────────────────────────────
 *   1. El corte de la noche no incluye una venta que ya se comió: aparece en el corte del DÍA
 *      SIGUIENTE, abierto quizá por otra persona, y el de anoche queda cerrado, con folio y
 *      firmado, sin ella. Si el dueño compara ventas del día contra lo servido, no cuadra.
 *   2. Hasta que alguien abra otra caja no se puede cobrar (`CAJA_CERRADA`), y la mesa sigue
 *      «ocupada» en el mapa toda la noche.
 *   3. Una cuenta dividida a medias queda repartida entre DOS cortes: la parte que ya se cobró en
 *      el de anoche y la que se cobre mañana en el de mañana.
 *   4. La única defensa es la PANTALLA: `CierreDiario.tsx` trata las mesas abiertas como un muro y
 *      lo comprueba dos veces, al abrir el diálogo y justo antes de ejecutar. Es una lectura del
 *      salón seguida de una escritura que no la repite: el propio comentario de la pantalla
 *      reconoce que «en esos minutos alguien sienta una mesa». Y cualquier otro camino al mismo
 *      comando —otra pantalla de corte, la ruta directa— cierra sin preguntar. El servidor es
 *      quien tiene la última palabra, y hoy no tiene ésta.
 *
 * Estas pruebas afirman ese comportamiento tal cual es. Si algún día `caja.cerrar` rechaza el
 * cierre con mesas abiertas, fallarán a propósito: ese día se reescriben para afirmar el rechazo.
 * Cada caso siembra SU salón: ninguno depende de cómo terminó el anterior.
 */

const FONDO = 50_000;

/** Un restaurante nuevo de una sola caja, con la caja ya abierta. */
async function salonConLaCajaAbierta(nombre: string) {
  const salon = await sembrarSalon({ nombre, mesas: 3, terminales: 1 });
  const caja = await abrirCajaReal(ambitoDeCaja(salon), FONDO);
  return { salon, caja };
}

function cerrar(salon: Salon, efectivoContadoCentavos: number) {
  return comando(cerrarCaja, {
    entrada: { efectivoContadoCentavos },
    ambito: ambitoDeCaja(salon),
    idempotencyKey: clave(),
  });
}

function arqueoDe(salon: Salon, sesionCajaId: string) {
  return repoCaja.arqueoDeSesion(obtenerDb(), salon.negocio.organizacionId, sesionCajaId);
}

function sesion(sesionCajaId: string) {
  return obtenerDb()
    .selectFrom('sesiones_caja')
    .select(['estado', 'folio', 'efectivo_contado_centavos'])
    .where('id', '=', sesionCajaId)
    .executeTakeFirstOrThrow();
}

describe('C10 · cerrar la caja con la cuenta de una mesa abierta', () => {
  it('HOY el servidor deja cerrar: el corte cuadra sin la mesa, y la mesa y su comanda siguen abiertas', async () => {
    const { salon, caja } = await salonConLaCajaAbierta('Restaurante del cierre con mesas');
    // La mesa 1 ya pidió la cuenta; la mesa 2 está comiendo y su comanda sigue en la plancha.
    const pidioLaCuenta = await sentarYPedir(salon, 0, [{ platillo: 'arrachera', cantidad: '1' }]);
    await pedirLaCuenta(salon, pidioLaCuenta.ordenId);
    const comiendo = await sentarYPedir(salon, 1, [{ platillo: 'cerveza', cantidad: '2' }]);

    const corte = exigirOk(await cerrar(salon, FONDO), 'caja.cerrar con dos mesas abiertas');

    // El corte no ve las mesas: cuadra al centavo y dice cero ventas.
    expect(corte).toMatchObject({
      sesionCajaId: caja,
      efectivoEsperadoCentavos: String(FONDO),
      diferenciaCentavos: '0',
      ventasCentavos: '0',
      numeroVentas: 0,
    });
    expect(await sesion(caja)).toMatchObject({
      estado: 'cerrada',
      efectivo_contado_centavos: BigInt(FONDO),
    });

    // Y las dos mesas siguen como estaban, con su cuenta viva y sin caja que las cobre.
    expect(await mesaPersistida(pidioLaCuenta.mesaId)).toMatchObject({
      estado: 'cuenta_solicitada',
      orden_activa_id: pidioLaCuenta.ordenId,
    });
    expect(await ordenPersistida(pidioLaCuenta.ordenId)).toMatchObject({
      estado: 'cuenta_solicitada',
    });
    expect(await mesaPersistida(comiendo.mesaId)).toMatchObject({
      estado: 'pedido_enviado',
      orden_activa_id: comiendo.ordenId,
    });
    const cuentas = await obtenerDb()
      .selectFrom('ordenes')
      .select(['id', 'sesion_caja_id'])
      .where('id', 'in', [pidioLaCuenta.ordenId, comiendo.ordenId])
      .execute();
    expect(
      cuentas.every((c) => c.sesion_caja_id === null),
      'una cuenta abierta ya tiene caja',
    ).toBe(true);
    const comandas = await obtenerDb()
      .selectFrom('comandas')
      .select('estado')
      .where('orden_id', '=', comiendo.ordenId)
      .execute();
    expect(comandas).toEqual([{ estado: 'nuevo' }]);
  });

  it('esa cuenta no se puede cobrar con la caja cerrada, y al cobrarla en la caja NUEVA el dinero cae en el corte nuevo y no en el de anoche', async () => {
    const { salon, caja: primera } = await salonConLaCajaAbierta('Restaurante del corte de anoche');
    const mesa = await sentarYPedir(salon, 0, [{ platillo: 'arrachera', cantidad: '1' }]);
    await pedirLaCuenta(salon, mesa.ordenId);
    exigirOk(await cerrar(salon, FONDO), 'caja.cerrar con la mesa abierta');
    const total = Number(PRECIO_ARRACHERA);

    // Con la caja cerrada: nadie cobra.
    const sinCaja = await cobrarExacto(ambitoDeCaja(salon), mesa.ordenId, total);
    expect(sinCaja.ok).toBe(false);
    if (!sinCaja.ok) expect(sinCaja.error.datos?.['regla']).toBe('CAJA_CERRADA');
    expect(await pagosDe([mesa.ordenId])).toEqual([]);

    // Mañana alguien abre otra caja y cobra: la venta es del corte de MAÑANA.
    const segunda = await abrirCajaReal(ambitoDeCaja(salon), FONDO);
    expect(segunda).not.toBe(primera);
    exigirOk(await cobrarExacto(ambitoDeCaja(salon), mesa.ordenId, total), 'venta.cobrar');

    const [pago] = await pagosDe([mesa.ordenId]);
    expect(pago?.sesion_caja_id, 'el pago se fue a la caja ya cerrada').toBe(segunda);
    // El corte de anoche sigue siendo el que se firmó: sin esta venta.
    expect(await arqueoDe(salon, primera)).toMatchObject({ ventasCentavos: 0n, numeroVentas: 0 });
    expect(await arqueoDe(salon, segunda)).toMatchObject({
      ventasCentavos: BigInt(total),
      numeroVentas: 1,
    });
    expect(await mesaPersistida(mesa.mesaId)).toMatchObject({ estado: 'limpieza' });
  });

  it('una cuenta dividida a medias queda REPARTIDA entre dos cortes: la parte cobrada en el de anoche y la otra en el de mañana', async () => {
    const { salon, caja: primera } = await salonConLaCajaAbierta(
      'Restaurante de la cuenta partida',
    );
    const mesa = await sentarYPedir(salon, 0, [
      { platillo: 'arrachera', cantidad: '1' },
      { platillo: 'cerveza', cantidad: '1' },
    ]);
    await pedirLaCuenta(salon, mesa.ordenId);
    const division = await dividirEn(salon, mesa.ordenId, [
      [{ platillo: 'arrachera', cantidad: 1 }],
      [{ platillo: 'cerveza', cantidad: 1 }],
    ]);
    const [parteA, parteB] = division.hijas;
    if (parteA === undefined || parteB === undefined) throw new Error('Debían salir dos partes.');
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon), parteA.ordenId, Number(PRECIO_ARRACHERA)),
      'venta.cobrar (la parte que sí paga hoy)',
    );

    // La otra parte sigue sentada: el servidor igual deja cerrar, con la mesa en servicio.
    exigirOk(
      await cerrar(salon, FONDO + Number(PRECIO_ARRACHERA)),
      'caja.cerrar con una parte sin cobrar',
    );
    expect(await mesaPersistida(mesa.mesaId)).toMatchObject({ estado: 'cuenta_solicitada' });

    const segunda = await abrirCajaReal(ambitoDeCaja(salon), FONDO);
    exigirOk(
      await cobrarExacto(ambitoDeCaja(salon), parteB.ordenId, Number(PRECIO_CERVEZA)),
      'venta.cobrar (la parte que paga mañana)',
    );

    // Una sola cuenta de mesa, dos cortes: cada uno con SU parte y ninguno con la cuenta entera.
    expect(await arqueoDe(salon, primera)).toMatchObject({
      ventasCentavos: PRECIO_ARRACHERA,
      numeroVentas: 1,
    });
    expect(await arqueoDe(salon, segunda)).toMatchObject({
      ventasCentavos: PRECIO_CERVEZA,
      numeroVentas: 1,
    });
    // La mesa se recoge con la última parte, en el corte nuevo.
    expect(await mesaPersistida(mesa.mesaId)).toMatchObject({ estado: 'limpieza' });
  });
});
