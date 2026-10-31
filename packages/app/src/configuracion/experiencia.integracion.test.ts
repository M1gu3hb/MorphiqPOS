import { obtenerDb } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { comando } from '../produccion.ts';
import {
  ambitoDe,
  clave,
  sembrarCompanero,
  sembrarNegocio,
  type NegocioReal,
} from '../pruebas/negocio-real.ts';
import { escribirDatos } from '../puente/comandos.ts';
import { experienciaDeLaOrganizacion } from './experiencia.ts';

/**
 * DP-11.1 · «MASCOTA MORFI», contra Postgres real.
 *
 * Se guarda por el camino de siempre —la configuración del negocio por `puente.escribir`—, con
 * los roles de siempre y validado: sólo el interruptor, sí o no. La pantalla la lee del servidor
 * (`experienciaDeLaOrganizacion`), que nunca lanza: es un adorno y no puede tumbar una página.
 */

let negocio: NegocioReal;
let vecino: NegocioReal;
let meseroEmpleoId = '';

function guardar(datos: Record<string, unknown>, rol: 'dueno' | 'mesero' = 'dueno') {
  const base = ambitoDe(negocio, null, null);
  return comando(escribirDatos, {
    entrada: { entidad: 'ConfiguracionNegocio', operacion: 'update', datos },
    ambito: rol === 'dueno' ? base : { ...base, empleoId: meseroEmpleoId, rol: 'mesero' },
    idempotencyKey: clave(),
  });
}

async function guardada(organizacionId: string): Promise<unknown> {
  const fila = await obtenerDb()
    .selectFrom('configuracion')
    .select('valores')
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();
  return (fila?.valores as Record<string, unknown> | undefined)?.['experiencia'];
}

beforeAll(async () => {
  negocio = await sembrarNegocio({
    nombre: 'Fonda de Morfi',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  vecino = await sembrarNegocio({
    nombre: 'Fonda sin cambios',
    rol: 'dueno',
    giro: 'restaurante',
    paquete: 'restaurante',
  });
  meseroEmpleoId = await sembrarCompanero(negocio, { nombre: 'Mesero', rol: 'mesero' });
});

describe('«Mascota Morfi» en la configuración del negocio', () => {
  it('sin guardar nada, el servidor la da encendida', async () => {
    expect(await experienciaDeLaOrganizacion(negocio.organizacionId)).toEqual({
      mascota: true,
      pin_al_despertar: false,
      sonidos_en_el_portal: false,
      tecla: 'nib',
    });
  });

  it('el dueño la apaga y el servidor la lee apagada', async () => {
    const r = await guardar({ experiencia: { mascota: false } });
    expect(r.ok).toBe(true);
    expect(await guardada(negocio.organizacionId)).toMatchObject({ mascota: false });
    expect(await experienciaDeLaOrganizacion(negocio.organizacionId)).toMatchObject({
      mascota: false,
    });
  });

  it('un valor que no es sí o no, o un campo de más, no se guarda y lo de antes se queda', async () => {
    const malo = await guardar({ experiencia: { mascota: 'quizá' } });
    expect(malo.ok ? null : malo.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(JSON.stringify(malo)).toMatch(/PUENTE_CAMPO_INVALIDO/);
    const deMas = await guardar({ experiencia: { mascota: true, volumen: 11 } });
    expect(deMas.ok).toBe(false);
    expect(await guardada(negocio.organizacionId)).toMatchObject({ mascota: false });
  });

  it('se guarda interruptor por interruptor: uno no borra al otro (DP-11.2)', async () => {
    // Otra pestaña enciende el PIN; ésta, que cargó antes, sólo manda la mascota.
    expect((await guardar({ experiencia: { pin_al_despertar: true } })).ok).toBe(true);
    expect((await guardar({ experiencia: { mascota: false } })).ok).toBe(true);
    expect(await guardada(negocio.organizacionId)).toEqual({
      mascota: false,
      pin_al_despertar: true,
    });
    expect((await guardar({ experiencia: { pin_al_despertar: false } })).ok).toBe(true);
    expect(await experienciaDeLaOrganizacion(negocio.organizacionId)).toMatchObject({
      mascota: false,
      pin_al_despertar: false,
    });
  });

  it('los sonidos del negocio (DP-11.3): el teclado y el portal, validados', async () => {
    expect(
      (await guardar({ experiencia: { tecla: 'thock', sonidos_en_el_portal: true } })).ok,
    ).toBe(true);
    expect(await experienciaDeLaOrganizacion(negocio.organizacionId)).toMatchObject({
      mascota: false,
      tecla: 'thock',
      sonidos_en_el_portal: true,
    });
    expect((await guardar({ experiencia: { tecla: 'block' } })).ok).toBe(false);
    expect(await guardada(negocio.organizacionId)).toMatchObject({ tecla: 'thock' });
    expect((await guardar({ experiencia: { tecla: 'nib', sonidos_en_el_portal: false } })).ok).toBe(
      true,
    );
  });

  it('el mesero no la cambia', async () => {
    const r = await guardar({ experiencia: { mascota: true } }, 'mesero');
    expect(r.ok ? null : r.error.codigo).toBe('SIN_PERMISO');
    expect(await guardada(negocio.organizacionId)).toMatchObject({ mascota: false });
  });

  it('lo de un negocio no toca al otro', async () => {
    expect(await guardada(vecino.organizacionId)).toBeUndefined();
    expect(await experienciaDeLaOrganizacion(vecino.organizacionId)).toEqual({
      mascota: true,
      pin_al_despertar: false,
      sonidos_en_el_portal: false,
      tecla: 'nib',
    });
  });

  it('un negocio que no existe no tumba nada: sale la de omisión', async () => {
    expect(await experienciaDeLaOrganizacion('00000000-0000-4000-8000-000000000000')).toEqual({
      mascota: true,
      pin_al_despertar: false,
      sonidos_en_el_portal: false,
      tecla: 'nib',
    });
  });
});
