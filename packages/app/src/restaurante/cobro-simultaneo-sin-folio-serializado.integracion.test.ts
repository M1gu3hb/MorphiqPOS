import type * as Datos from '@morphiqpos/data';
import type { Transaccion } from '@morphiqpos/data';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { enCarrera } from '../pruebas/carrera.ts';
import { exigirOk } from '../pruebas/negocio-real.ts';
import {
  abrirLasCajas,
  diagnosticoDeLaMesaCobrada,
  lasDosUltimas,
  mesaDivididaEnTresConLaPrimeraCobrada,
  sembrarSalon,
  type Salon,
} from './pruebas/salon-real.ts';

/**
 * C02 · LATENTE · LA MESA DE UNA CUENTA DIVIDIDA, el día que los cobros ya no se serialicen en el
 * folio, contra Postgres (cierre del restaurante, 21-10).
 *
 * ── Qué es y qué NO es ───────────────────────────────────────────────────────
 * `cobro-simultaneo-de-partes.integracion.test.ts` demuestra que HOY, por `venta.cobrar`, las dos
 * últimas partes no dejan la mesa atascada. Y explica por qué: no es `partesSinSaldar`, que lee
 * sin candado, sino que `tomarFolio` bloquea UNA fila por sucursal y serie hasta confirmar, y eso
 * obliga a los cobros a entrar de uno en uno al paso que recoge la mesa.
 *
 * Este archivo quita sólo esa propiedad —no la lógica de la mesa— y mide qué queda: el cobro
 * REAL (`comando(cobrarOrden, …)`, con su transacción, su barrera de dos corredoras y la misma
 * lectura de `partesSinSaldar`), pero con cada folio sacado de una SERIE PROPIA, que es lo que
 * pasaría con folios por terminal —el cupo de varias cajas por sucursal ya existe desde la 179— o
 * con cualquier reorden que ponga `mesa_a_limpieza` antes del folio.
 *
 * Medido en esta base, en 18 corridas de este archivo: se atascaron 136 de 180 mesas (76 %), entre
 * 4 y 10 de cada 10 según la carga de la máquina. Con la fila de la madre tomada `for update`, 0.
 *
 * Era un caso HIPOTÉTICO, no un defecto alcanzable por producción, y estuvo en rojo hasta el
 * cierre del 21-10: desde entonces `mesaDeLaCuenta` toma la fila de la cuenta madre `for update`
 * antes de contar las partes vivas, y la guarda tiene su propio candado. Esta prueba vigila ese
 * candado: sin él, vuelven a atascarse unas tres de cada cuatro mesas.
 *
 * ── Lo único que se sustituye ────────────────────────────────────────────────
 * `repoFolios.tomarFolio`: llama al de verdad, pero con una serie distinta en cada cobro
 * (`^[A-Z]{1,6}$`, como exige la tabla). Todo lo demás —`cobrar.ts`, `mesas-escrituras.ts`, la
 * base— es el código de producción.
 */

vi.mock('@morphiqpos/data', async (importOriginal) => {
  const real = await importOriginal<typeof Datos>();
  let cobros = 0;
  /** `1 → 'XB'`, `2 → 'XC'`…: letras mayúsculas, una serie por cobro, sin fila compartida. */
  const serieDe = (numero: number): string => {
    let resto = numero;
    let letras = '';
    do {
      letras = String.fromCharCode(65 + (resto % 26)) + letras;
      resto = Math.floor(resto / 26);
    } while (resto > 0);
    return `X${letras}`;
  };
  return {
    ...real,
    repoFolios: {
      ...real.repoFolios,
      tomarFolio: (tx: Transaccion, organizacionId: string, sucursalId: string) => {
        cobros += 1;
        return real.repoFolios.tomarFolio(tx, organizacionId, sucursalId, serieDe(cobros));
      },
    },
  };
});

const ITERACIONES = 10;

let salon: Salon;
let sesiones: readonly string[] = [];

beforeAll(async () => {
  salon = await sembrarSalon({
    nombre: 'Restaurante de los folios por caja',
    mesas: ITERACIONES,
    terminales: 2,
  });
  sesiones = await abrirLasCajas(salon);
});

/** La misma barrera de `cobro-simultaneo-de-partes`: las filas de las dos sesiones de caja. */
const retenerLasCajas = (tx: Transaccion) =>
  tx
    .selectFrom('sesiones_caja')
    .select('id')
    .where('id', 'in', [...sesiones])
    .forUpdate()
    .execute();

describe('C02 · LATENTE · sin la serialización del folio', () => {
  it(`${String(ITERACIONES)} mesas con las dos últimas partes soltadas juntas: ninguna se queda atascada`, async () => {
    const atascadas: string[] = [];
    for (let i = 0; i < ITERACIONES; i += 1) {
      const mesa = await mesaDivididaEnTresConLaPrimeraCobrada(salon, i);
      const { arrachera, guacamole } = lasDosUltimas(salon, mesa, i % 2 === 1);

      const [conArrachera, conGuacamole] = await enCarrera(retenerLasCajas, [arrachera, guacamole]);
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
  }, 120_000);
});
