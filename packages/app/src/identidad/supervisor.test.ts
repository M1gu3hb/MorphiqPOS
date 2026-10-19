import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL PIN DEL SUPERVISOR (F-205, D-28 de la 2.4): se comprueba como al entrar.
 *
 * Lo que se defiende: que un PIN malo CUENTA —el intento se confirma en su propia
 * transacción, porque un comando que rechaza revertiría el contador—; que una credencial
 * bloqueada no se compara; que un puesto que no autoriza no llega a compararse; que nadie
 * se autoriza a sí mismo; y que la autorización que sale es legible sólo para la cajera
 * que la pidió.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const CAJERA = 'e1111111-1111-4111-8111-111111111111';
const GERENTE = 'e2222222-2222-4222-8222-222222222222';
const PIMIENTA = 'pimienta_de_prueba_del_supervisor_2026';
const SECRETO = 'secreto_de_prueba_del_supervisor_2026';
const AHORA = new Date('2026-10-09T16:00:00.000Z');

interface CredencialDePrueba {
  credencialId: string;
  identidadId: string;
  empleoId: string;
  organizacionId: string;
  pinHash: string;
  intentosFallidos: number;
  bloqueadaHasta: Date | null;
}

interface EstadoDePrueba {
  rol: string | null;
  credencial: CredencialDePrueba | null;
  fallidos: { credencialId: string; bloqueadaHasta: Date | null }[];
  limpiados: string[];
}

const estado = vi.hoisted((): EstadoDePrueba => ({
  rol: 'gerente',
  credencial: null,
  fallidos: [],
  limpiados: [],
}));

vi.mock('@morphiqpos/data', () => ({
  obtenerDb: () => ({
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          where: () => ({
            where: () => ({
              executeTakeFirst: () =>
                Promise.resolve(estado.rol === null ? undefined : { rol: estado.rol }),
            }),
          }),
        }),
      }),
    }),
  }),
  conTransaccion: (fn: (tx: unknown) => Promise<unknown>) => fn({}),
  repoIdentidad: {
    credencialParaVerificar: () => Promise.resolve(estado.credencial),
    registrarIntentoFallido: (_tx: unknown, credencialId: string, bloqueadaHasta: Date | null) => {
      estado.fallidos.push({ credencialId, bloqueadaHasta });
      return Promise.resolve();
    },
    limpiarIntentos: (_tx: unknown, credencialId: string) => {
      estado.limpiados.push(credencialId);
      return Promise.resolve();
    },
  },
}));

const { hashearPin } = await import('./pin.ts');
const { autorizarConPin, leerAutorizacion } = await import('./supervisor.ts');

async function credencialCon(
  pin: string,
  cambios: Partial<NonNullable<typeof estado.credencial>> = {},
) {
  estado.credencial = {
    credencialId: 'cred-1',
    identidadId: 'iden-1',
    empleoId: GERENTE,
    organizacionId: ORG,
    pinHash: await hashearPin(pin, PIMIENTA),
    intentosFallidos: 0,
    bloqueadaHasta: null,
    ...cambios,
  };
}

const peticion = (pin: string, empleoId = GERENTE) => ({
  organizacionId: ORG,
  solicitaEmpleoId: CAJERA,
  empleoId,
  pin,
  pimienta: PIMIENTA,
  secreto: SECRETO,
});

beforeEach(() => {
  estado.rol = 'gerente';
  estado.credencial = null;
  estado.fallidos = [];
  estado.limpiados = [];
});

describe('el PIN del supervisor en la terminal de la cajera', () => {
  it('bueno: limpia los intentos y firma una autorización que SÓLO lee la cajera que la pidió', async () => {
    await credencialCon('2345', { intentosFallidos: 2 });
    const resultado = await autorizarConPin(peticion('2345'), AHORA);

    expect(resultado.ok).toBe(true);
    expect(estado.limpiados).toEqual(['cred-1']);
    if (!resultado.ok) return;
    const carga = leerAutorizacion(
      resultado.autorizacion,
      { organizacionId: ORG, solicitaEmpleoId: CAJERA },
      SECRETO,
      AHORA,
    );
    expect(carga).toMatchObject({
      org: ORG,
      supervisor: GERENTE,
      rol: 'gerente',
      solicita: CAJERA,
    });
    expect(
      leerAutorizacion(
        resultado.autorizacion,
        { organizacionId: ORG, solicitaEmpleoId: GERENTE },
        SECRETO,
        AHORA,
      ),
    ).toBeNull();
    // Y vence: a los dos minutos ya no sirve.
    expect(
      leerAutorizacion(
        resultado.autorizacion,
        { organizacionId: ORG, solicitaEmpleoId: CAJERA },
        SECRETO,
        new Date(AHORA.getTime() + 121_000),
      ),
    ).toBeNull();
  });

  it('malo: el intento CUENTA, y al quinto la credencial se bloquea', async () => {
    await credencialCon('2345');
    expect(await autorizarConPin(peticion('9999'), AHORA)).toEqual({
      ok: false,
      motivo: 'credenciales',
    });
    expect(estado.fallidos).toEqual([{ credencialId: 'cred-1', bloqueadaHasta: null }]);

    await credencialCon('2345', { intentosFallidos: 4 });
    const quinto = await autorizarConPin(peticion('9999'), AHORA);
    expect(quinto).toMatchObject({ ok: false, motivo: 'bloqueada' });
    expect(estado.fallidos[1]?.bloqueadaHasta).toBeInstanceOf(Date);
  });

  it('bloqueada: ni siquiera se compara el PIN, aunque sea el bueno', async () => {
    await credencialCon('2345', { bloqueadaHasta: new Date(AHORA.getTime() + 60_000) });
    const resultado = await autorizarConPin(peticion('2345'), AHORA);
    expect(resultado).toEqual({ ok: false, motivo: 'bloqueada', esperaSegundos: 60 });
    expect(estado.limpiados).toEqual([]);
  });

  it('un puesto que no autoriza no llega a compararse, y no cuenta como intento', async () => {
    estado.rol = 'cajero';
    await credencialCon('3456');
    expect(await autorizarConPin(peticion('3456'), AHORA)).toEqual({
      ok: false,
      motivo: 'no_autoriza',
    });
    expect(estado.fallidos).toEqual([]);
  });

  it('nadie se autoriza a sí mismo', async () => {
    await credencialCon('2345');
    expect(
      await autorizarConPin({ ...peticion('2345'), solicitaEmpleoId: GERENTE }, AHORA),
    ).toEqual({ ok: false, motivo: 'uno_mismo' });
  });

  it('un empleo que no es del negocio o está inactivo contesta igual que un PIN malo', async () => {
    estado.rol = null;
    expect(await autorizarConPin(peticion('2345'), AHORA)).toEqual({
      ok: false,
      motivo: 'credenciales',
    });
  });
});
