import { esErrorDominio } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { moverEspera, registrarEspera, sentarEspera } from './espera.ts';
import {
  contextoFalso,
  crearBaseFalsa,
  type Fila,
  type TablasFalsas,
} from './pruebas/base-falsa.ts';
import { ambitoDe, mesa, MESA_5, ORG, PREDETERMINADOS, SUCURSAL } from './pruebas/sala.ts';

/**
 * F-306 · La lista de espera del viernes por la noche.
 *
 * Lo que vigilan estas pruebas es lo que separa esta función del papelito del
 * atril: que la espera se CALCULE y no se acepte del cliente, que sentar a una
 * familia abra la mesa en la MISMA transacción —o queda tachada de la lista y
 * sin sitio—, y que la cola sólo cuente a quien de verdad va delante.
 */

const ESPERA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeef';
const MESA_GRANDE = '66666666-6666-4666-8666-666666666669';
const LLEGARON = new Date('2026-09-14T21:00:00.000Z');
const AHORA = new Date('2026-09-14T21:35:00.000Z');

function espera(cambios: Fila = {}): Fila {
  return {
    id: ESPERA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    nombre: 'Familia Pérez',
    telefono: null,
    personas: 4,
    estado: 'esperando',
    mesa_id: null,
    orden_id: null,
    espera_estimada_minutos: 50,
    creada_en: LLEGARON,
    avisada_en: null,
    sentada_en: null,
    notas: null,
    empleado_id: null,
    ...cambios,
  };
}

/** Un ciclo cerrado de F-305, que es de donde sale la estimación. */
function ciclo(minutos: number): Fila {
  return {
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    mesa_id: MESA_5,
    fin: AHORA,
    minutos_ocupada: minutos,
  };
}

function salon(extra: Partial<TablasFalsas> = {}): TablasFalsas {
  return {
    lista_espera: [],
    mesas: [
      mesa('ocupada', { capacidad: 4 }),
      mesa('libre', {
        id: MESA_GRANDE,
        numero: 12,
        capacidad: 8,
        orden_activa_id: null,
        personas_actuales: 0,
        ocupada_desde: null,
        empleado_atiende_id: null,
      }),
    ],
    ocupacion_mesas: [ciclo(40), ciclo(50), ciclo(60)],
    ordenes: [],
    eventos_mesa: [],
    ...extra,
  };
}

const baseDe = (extra: Partial<TablasFalsas> = {}) =>
  crearBaseFalsa(salon(extra), { predeterminados: PREDETERMINADOS });

const CUATRO = { nombre: 'Familia Pérez', personas: 4 };

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

async function mensajeDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('F-306 · anotar a quien llega', () => {
  it('con una mesa compatible libre la espera es CERO', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await registrarEspera.ejecutar(ctx, CUATRO);

    expect(salida.esperaEstimadaMinutos).toBe(0);
    expect(salida.posicion).toBe(1);
  });

  it('con el salón lleno, la espera sale de la MEDIANA real de F-305', async () => {
    const base = baseDe({
      mesas: [
        mesa('ocupada', { capacidad: 4 }),
        mesa('ocupada', { id: MESA_GRANDE, capacidad: 8 }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await registrarEspera.ejecutar(ctx, CUATRO);

    // La mediana de 40, 50 y 60 es 50, y hay una tanda por delante.
    expect(salida.esperaEstimadaMinutos).toBe(50);
  });

  it('SIN DATO DE ROTACIÓN no inventa un número', async () => {
    const base = baseDe({
      ocupacion_mesas: [],
      mesas: [mesa('ocupada', { capacidad: 4 })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await registrarEspera.ejecutar(ctx, CUATRO);

    expect(salida.esperaEstimadaMinutos).toBeNull();
  });

  it('LA COLA SÓLO CUENTA A QUIEN VA DELANTE Y NECESITA MESA DEL MISMO TAMAÑO', async () => {
    // Tres grupos de dos esperando. Una pareja que llega NO espera por ellos
    // si el salón tiene mesas de cuatro libres… pero un grupo de ocho sí tiene
    // que esperar por todos los que necesitan una mesa de ocho o más.
    const base = baseDe({
      lista_espera: [
        espera({ id: 'a', personas: 2 }),
        espera({ id: 'b', personas: 2 }),
        espera({ id: 'c', personas: 8 }),
      ],
      mesas: [
        mesa('ocupada', { capacidad: 4 }),
        mesa('ocupada', { id: MESA_GRANDE, capacidad: 8 }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const grande = await registrarEspera.ejecutar(ctx, { nombre: 'Boda', personas: 8 });

    // Sólo el grupo de 8 va delante: los dos de dos caben en mesas que a él no
    // le sirven, y contarlos le diría que hay tres delante cuando hay uno.
    expect(grande.posicion).toBe(2);
  });

  it('EL CLIENTE NO MANDA LA ESPERA: la entrada no la acepta', () => {
    const analisis = registrarEspera.entrada.safeParse({
      nombre: 'Familia Pérez',
      personas: 4,
      esperaEstimadaMinutos: 5,
      espera_estimada_minutos: 5,
    });
    expect(analisis.success).toBe(true);
    expect(analisis.success ? Object.keys(analisis.data).sort() : []).toEqual([
      'nombre',
      'personas',
    ]);
  });

  it('un teléfono que no tiene forma de teléfono se rechaza', () => {
    expect(registrarEspera.entrada.safeParse({ ...CUATRO, telefono: 'llámame' }).success).toBe(
      false,
    );
    expect(registrarEspera.entrada.safeParse({ ...CUATRO, telefono: '55 1234 5678' }).success).toBe(
      true,
    );
  });

  it('una espera sin nombre no se puede gritar', () => {
    expect(registrarEspera.entrada.safeParse({ nombre: '   ', personas: 2 }).success).toBe(false);
  });
});

describe('F-306 · mover la espera por la cola', () => {
  it('avisar deja la hora del aviso', async () => {
    const base = baseDe({ lista_espera: [espera()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await moverEspera.ejecutar(ctx, { esperaId: ESPERA, estado: 'avisado' });

    expect(base.campo('lista_espera', 'estado')).toBe('avisado');
    expect(base.campo('lista_espera', 'avisada_en')).toEqual(AHORA);
  });

  it('el que se fue sale de la cola', async () => {
    const base = baseDe({ lista_espera: [espera({ estado: 'avisado' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await moverEspera.ejecutar(ctx, { esperaId: ESPERA, estado: 'abandono' });

    expect(base.campo('lista_espera', 'estado')).toBe('abandono');
  });

  it('UNA ESPERA YA SENTADA NO VUELVE A LA COLA', async () => {
    const base = baseDe({ lista_espera: [espera({ estado: 'sentado' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() => moverEspera.ejecutar(ctx, { esperaId: ESPERA, estado: 'avisado' })),
    ).toBe('TRANSICION_INVALIDA');
  });

  it('una espera de otro negocio se ve como inexistente', async () => {
    const base = baseDe({
      lista_espera: [espera({ organizacion_id: '00000000-0000-4000-8000-000000000000' })],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() => moverEspera.ejecutar(ctx, { esperaId: ESPERA, estado: 'avisado' })),
    ).toBe('SOLICITUD_NO_ENCONTRADA');
  });
});

describe('F-306 · sentarlos', () => {
  it('ABRE LA MESA Y CIERRA LA ESPERA EN LA MISMA TRANSACCIÓN', async () => {
    const base = baseDe({ lista_espera: [espera()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE });

    // La mesa quedó abierta con su cuenta…
    const grande = base.filas('mesas').find((m) => m['id'] === MESA_GRANDE);
    expect(grande?.['estado']).toBe('esperando_orden');
    expect(grande?.['orden_activa_id']).toBe(salida.ordenId);
    expect(grande?.['personas_actuales']).toBe(4);
    // …y la espera quedó cerrada apuntando a esa misma mesa.
    expect(base.campo('lista_espera', 'estado')).toBe('sentado');
    expect(base.campo('lista_espera', 'mesa_id')).toBe(MESA_GRANDE);
    expect(base.campo('lista_espera', 'orden_id')).toBe(salida.ordenId);
  });

  it('EL NOMBRE CON EL QUE SE ANOTARON VIAJA A LA MESA', async () => {
    const base = baseDe({ lista_espera: [espera()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE });

    const grande = base.filas('mesas').find((m) => m['id'] === MESA_GRANDE);
    expect(grande?.['cliente_temporal']).toBe('Familia Pérez');
  });

  it('AUDITA LO QUE ESPERARON DE VERDAD frente a lo prometido', async () => {
    const base = baseDe({ lista_espera: [espera()] });
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE });

    // Llegaron a las 21:00 y se sentaron a las 21:35.
    expect(salida.minutosEsperados).toBe(35);
    expect(auditorias[0]?.payload['minutosEsperados']).toBe(35);
    expect(auditorias[0]?.payload['minutosEstimados']).toBe(50);
  });

  it('el ledger de F-305 recibe la apertura', async () => {
    const base = baseDe({ lista_espera: [espera()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE });

    const eventos = base.filas('eventos_mesa');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.['mesa_id']).toBe(MESA_GRANDE);
    expect(eventos[0]?.['estado_nuevo']).toBe('esperando_orden');
  });

  it('UNA MESA YA ABIERTA NO RECIBE A NADIE, y la espera se queda en la cola', async () => {
    const base = baseDe({ lista_espera: [espera()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const codigo = await codigoDe(() =>
      sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_5 }),
    );

    expect(codigo).toBe('MESA_YA_ABIERTA');
    expect(base.campo('lista_espera', 'estado')).toBe('esperando');
    expect(base.filas('ordenes')).toEqual([]);
  });

  it('a una familia ya sentada no se la sienta dos veces, Y SE LE DICE POR QUÉ', async () => {
    // El mensaje importa tanto como el código: «a esa familia ya la sentaron»
    // manda al anfitrión a buscarla en el salón. «Esa espera ya no está en la
    // cola» lo manda a buscar en la lista, que es donde no está.
    const base = baseDe({ lista_espera: [espera({ estado: 'sentado' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() => sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE })),
    ).toBe('TRANSICION_INVALIDA');

    const otro = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    expect(
      await mensajeDe(() =>
        sentarEspera.ejecutar(otro.ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE }),
      ),
    ).toBe('A esa familia ya la sentaron.');
  });

  it('UN GRUPO DE OCHO NO SE SIENTA EN LAS MESAS DE CUATRO que están libres', async () => {
    // Tres mesas de cuatro vacías y la de ocho ocupada. Si la cola contara
    // cualquier mesa libre, al grupo de ocho se le diría «cero minutos» y se
    // quedaría de pie viendo mesas vacías donde no cabe.
    const base = baseDe({
      mesas: [
        mesa('libre', { capacidad: 4, orden_activa_id: null }),
        mesa('libre', { id: 'm2', numero: 2, capacidad: 4, orden_activa_id: null }),
        mesa('libre', { id: 'm3', numero: 3, capacidad: 4, orden_activa_id: null }),
        mesa('ocupada', { id: MESA_GRANDE, numero: 12, capacidad: 8 }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await registrarEspera.ejecutar(ctx, { nombre: 'Boda', personas: 8 });

    expect(salida.esperaEstimadaMinutos).toBe(50);
  });

  it('a una que abandonó tampoco', async () => {
    const base = baseDe({ lista_espera: [espera({ estado: 'abandono' })] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    expect(
      await codigoDe(() => sentarEspera.ejecutar(ctx, { esperaId: ESPERA, mesaId: MESA_GRANDE })),
    ).toBe('TRANSICION_INVALIDA');
  });
});
