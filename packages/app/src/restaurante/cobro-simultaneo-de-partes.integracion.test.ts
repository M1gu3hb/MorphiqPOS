import type { Transaccion } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { enCarrera } from '../pruebas/carrera.ts';
import { exigirOk } from '../pruebas/negocio-real.ts';
import {
  abrirLasCajas,
  diagnosticoDeLaMesaCobrada,
  lasDosUltimas,
  mesaDivididaEnTresConLaPrimeraCobrada,
  mesaPersistida,
  sembrarSalon,
  type MesaDividida,
  type Salon,
} from './pruebas/salon-real.ts';

/**
 * C02 · LAS DOS ÚLTIMAS PARTES DE UNA CUENTA SE COBRAN A LA VEZ, contra Postgres (cierre del
 * restaurante, 21-10).
 *
 * ── La sospecha ──────────────────────────────────────────────────────────────
 * La mesa de una cuenta dividida se recoge con la ÚLTIMA parte que se cobra:
 * `pasarMesaCobradaALimpieza` → `mesaDeLaCuenta` cuenta con `partesSinSaldar` las partes
 * hermanas que siguen vivas y sólo recoge la mesa si no queda ninguna. Esa lectura NO toma
 * candado. Con dos terminales cobrando las dos últimas partes a la vez, cada transacción
 * podría ver a la otra parte como viva —la otra todavía no confirma— y NINGUNA recogería la
 * mesa: todo cobrado y la mesa atascada en `cuenta_solicitada`, sin que nadie sepa por qué
 * (`liberar_mesa` sí la dejaría ir a mano, pero nada avisa de que hace falta).
 *
 * ── Lo que se mide aquí: el camino de PRODUCCIÓN ─────────────────────────────
 * Cada cobro entra por `comando(cobrarOrden, …)` —el envoltorio real, con su transacción— y la
 * mesa, las partes, los pagos y el ledger se LEEN de la base al terminar. La base falsa no puede
 * ver nada de esto: no tiene transacciones concurrentes.
 *
 * ── La barrera ───────────────────────────────────────────────────────────────
 * `enCarrera` retiene (`for update`) las filas de las dos sesiones de caja desde la prueba. Las
 * dos corredoras leen la orden, la cotizan, descuentan el almacén y se forman al ir a escribir el
 * pago, que referencia la sesión. Cuando `pg_stat_activity` las enseña esperando las dos, la
 * prueba confirma y las suelta juntas: lo que pasa a partir de ahí es la carrera que el código
 * tiene que resolver, con todas las lecturas anteriores ya hechas. La barrera NO es la guarda que
 * se prueba: quita la fila de la sesión y el cobro no cambia.
 *
 * ── Por qué sale verde, y de qué depende ─────────────────────────────────────
 * Medido en esta base, en 16 corridas de este archivo: 0 de 160 mesas atascadas con barrera y 0
 * de 160 sin ella (Postgres 17.6, dos cajas, dos conexiones del pool). El motivo NO es
 * `partesSinSaldar`, que no se protege de nada: es `tomarFolio`. El folio se toma con un
 * `update folios … returning` sobre UNA fila por (negocio, sucursal, serie), antes de que el
 * cobro marque su parte pagada, y esa fila queda bloqueada hasta confirmar. Dos cobros de la
 * misma sucursal se serializan ahí —lo dice la migración 001 y lo enseña `pg_stat_activity`: una
 * corredora espera en el `insert into pagos` de la barrera y la otra en el `update folios` de la
 * primera—. El segundo no llega a `mesa_a_limpieza` hasta que el primero confirmó, y entonces SÍ
 * ve la otra parte como saldada. La guarda funciona por una propiedad que está en otro archivo y
 * que nadie declaró como suya.
 * `cobro-simultaneo-sin-folio-serializado.integracion.test.ts` mide qué pasa el día que esa
 * propiedad deje de valer.
 */

const ITERACIONES = 10;

let salon: Salon;
let sesiones: readonly string[] = [];

beforeAll(async () => {
  // Una mesa por iteración y por variante.
  salon = await sembrarSalon({
    nombre: 'Restaurante de las dos cajas',
    mesas: ITERACIONES * 2,
    terminales: 2,
  });
  sesiones = await abrirLasCajas(salon);
});

/** Retiene las filas de las dos sesiones de caja: lo que el pago referencia al escribirse. */
const retenerLasCajas = (tx: Transaccion) =>
  tx
    .selectFrom('sesiones_caja')
    .select('id')
    .where('id', 'in', [...sesiones])
    .forUpdate()
    .execute();

/** Una mesa con sus dos últimas partes por cobrar; la primera NO recogió la mesa. */
async function mesaConDosPartesPorCobrar(indiceDeMesa: number): Promise<MesaDividida> {
  const mesa = await mesaDivididaEnTresConLaPrimeraCobrada(salon, indiceDeMesa);
  // Quedan dos sentadas esperando su cuenta: la mesa sigue en servicio.
  expect(
    (await mesaPersistida(mesa.mesaId)).estado,
    'cobrar la primera de tres partes recogió la mesa',
  ).toBe('cuenta_solicitada');
  return mesa;
}

describe('C02 · las dos últimas partes de una cuenta se cobran a la vez', () => {
  it(
    `CON BARRERA: ${String(ITERACIONES)} mesas, las dos últimas partes formadas y soltadas juntas, ` +
      'y ninguna se queda atascada',
    async () => {
      const atascadas: string[] = [];
      for (let i = 0; i < ITERACIONES; i += 1) {
        const mesa = await mesaConDosPartesPorCobrar(i);
        const { arrachera, guacamole } = lasDosUltimas(salon, mesa, i % 2 === 1);

        const [conArrachera, conGuacamole] = await enCarrera(retenerLasCajas, [
          arrachera,
          guacamole,
        ]);
        if (conArrachera === undefined || conGuacamole === undefined) {
          throw new Error('La barrera debía devolver los dos cobros.');
        }
        exigirOk(conArrachera, 'venta.cobrar (la arrachera)');
        exigirOk(conGuacamole, 'venta.cobrar (el guacamole)');

        const falla = await diagnosticoDeLaMesaCobrada(mesa);
        if (falla !== null) atascadas.push(`mesa de la iteración ${String(i + 1)}: ${falla}`);
      }

      expect(
        atascadas,
        `${String(atascadas.length)} de ${String(ITERACIONES)} mesas se atascaron:\n${atascadas.join('\n')}`,
      ).toEqual([]);
    },
    120_000,
  );

  it(
    `SIN BARRERA: ${String(ITERACIONES)} mesas con las dos últimas partes lanzadas a la vez ` +
      '(`Promise.all` pelado, como en una sala llena)',
    async () => {
      const atascadas: string[] = [];
      for (let i = ITERACIONES; i < ITERACIONES * 2; i += 1) {
        const mesa = await mesaConDosPartesPorCobrar(i);
        const { arrachera, guacamole } = lasDosUltimas(salon, mesa, i % 2 === 1);

        const [conArrachera, conGuacamole] = await Promise.all([arrachera(), guacamole()]);
        exigirOk(conArrachera, 'venta.cobrar (la arrachera)');
        exigirOk(conGuacamole, 'venta.cobrar (el guacamole)');

        const falla = await diagnosticoDeLaMesaCobrada(mesa);
        if (falla !== null) atascadas.push(`mesa de la iteración ${String(i + 1)}: ${falla}`);
      }

      expect(
        atascadas,
        `${String(atascadas.length)} de ${String(ITERACIONES)} mesas se atascaron:\n${atascadas.join('\n')}`,
      ).toEqual([]);
    },
    120_000,
  );
});
