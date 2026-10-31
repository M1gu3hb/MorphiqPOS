import { randomUUID } from 'node:crypto';

import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { sembrarNegocio, type NegocioReal } from '../pruebas/negocio-real.ts';
import { ZONA_HORARIA_POR_OMISION, zonaHorariaDeLaOrganizacion } from './zona-horaria.ts';

/**
 * PAR-1 · LA HORA DE LA PANTALLA DE ESPERA ES LA DEL NEGOCIO, contra Postgres real.
 *
 * En Don Poncho la zona estaba fija (Ciudad de México); en el maestro sale de
 * `organizaciones.zona_horaria`, y el servidor la lee al pintar, como la apariencia.
 */

let tijuana: NegocioReal;
let deSiempre: NegocioReal;

beforeAll(async () => {
  tijuana = await sembrarNegocio({
    nombre: 'Fonda en Tijuana',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  deSiempre = await sembrarNegocio({
    nombre: 'Fonda en la capital',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  await obtenerDb()
    .updateTable('organizaciones')
    .set({ zona_horaria: 'America/Tijuana' })
    .where('id', '=', tijuana.organizacionId)
    .execute();
});

describe('la zona horaria de cada negocio', () => {
  it('es la que el negocio tiene guardada', async () => {
    expect(await zonaHorariaDeLaOrganizacion(tijuana.organizacionId)).toBe('America/Tijuana');
  });

  it('un negocio no ve la del otro', async () => {
    expect(await zonaHorariaDeLaOrganizacion(deSiempre.organizacionId)).toBe(
      ZONA_HORARIA_POR_OMISION,
    );
  });

  it('un negocio que no existe recibe la de omisión, sin lanzar', async () => {
    expect(await zonaHorariaDeLaOrganizacion(randomUUID())).toBe(ZONA_HORARIA_POR_OMISION);
  });
});
