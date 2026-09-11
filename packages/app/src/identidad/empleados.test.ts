import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { esErrorDominio, type Ambito, type Rol } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { beforeAll, describe, expect, it } from 'vitest';

import { crearComando, type RepositorioComandos } from '../comando.ts';
import { crearFabrica } from '../pruebas/dobles.ts';
import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { entradaGuardarEmpleado, guardarEmpleado } from './empleados.ts';

/**
 * `identidad.guardar_empleado` — dar de alta a la plantilla sin regalar el mando.
 *
 * ── Lo que estas pruebas vigilan ───────────────────────────────────────────
 * La ESCALADA, que es el único fallo de este archivo que no se puede reparar
 * después: si un administrador puede crearse un usuario `dueno`, entra con él y
 * ya no hay nada por encima suyo — y los comandos de dueño son los que borran
 * la contabilidad y vacían el negocio. Que la pantalla no ofrezca ese puesto en
 * el desplegable no cuenta: el botón se salta con la consola, y ése es
 * exactamente el defecto que este proyecto persigue.
 *
 * Y el PIN: que viaje hacia aquí, se hashee, y no vuelva NUNCA — ni en la
 * respuesta ni en la auditoría.
 */

const ORG = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const YO = '55555555-5555-4555-8555-555555555555';
const OTRO_EMPLEO = '66666666-6666-4666-8666-666666666666';
const PERSONA = '77777777-7777-4777-8777-777777777777';
const CLAVE = 'clave-de-alta-de-empleado-1';
const AHORA = new Date('2026-03-01T10:00:00.000Z');
const FUENTE =
  process.env['MORPHIQPOS_EMPLEADOS_SOURCE_PATH'] ??
  fileURLToPath(new URL('./empleados.ts', import.meta.url));

function ambitoDe(rol: Rol, empleoId = YO): Ambito {
  return {
    organizacionId: ORG,
    sucursalId: SUCURSAL,
    terminalId: null,
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId,
    rol,
  };
}

function empleo(rol: string, cambios: Fila = {}): Fila {
  return {
    id: OTRO_EMPLEO,
    persona_id: PERSONA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    rol,
    activo: true,
    color: null,
    estacion_preparacion_id: null,
    ve_todas_las_estaciones: false,
    ...cambios,
  };
}

const PERSONA_FILA: Fila = {
  id: PERSONA,
  organizacion_id: ORG,
  nombre: 'Rosa Miranda',
  apellidos: null,
  telefono: null,
  correo: null,
  notas: null,
};

function baseDe(datos: Record<string, readonly Fila[]> = {}) {
  return crearBaseFalsa({
    empleos: [],
    personas: [],
    identidades: [],
    credenciales_pin: [],
    sesiones: [],
    ...datos,
  });
}

function ejecutorSobre(tx: Transaccion) {
  const fabrica = crearFabrica('restaurante');
  const ejecutar = crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: <T>(fn: (t: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(tx)),
    ahora: () => AHORA,
  });
  return { ejecutar, fabrica };
}

async function falla(promesa: Promise<unknown>): Promise<{ codigo: string; mensaje: string }> {
  try {
    await promesa;
    return { codigo: 'NO_LANZO', mensaje: '' };
  } catch (error) {
    return {
      codigo: esErrorDominio(error) ? error.codigo : `INESPERADO:${String(error)}`,
      mensaje: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * El entorno mínimo para que `pimienta()` pueda leer `PIN_PEPPER`.
 *
 * El comando lee el secreto POR INVOCACIÓN y no al cargar el módulo —importar
 * el archivo durante el build no debe exigir que exista— así que aquí basta con
 * ponerlo antes de la primera llamada. `validarEntorno` los pide todos, y se
 * dan todos: comprobar el entorno a medias sería otra puerta que no mira.
 */
beforeAll(() => {
  const minimo: Readonly<Record<string, string>> = {
    DATABASE_URL: 'postgres://pruebas@localhost:5432/pruebas',
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_BUCKET: 'pruebas',
    STORAGE_ACCESS_KEY: 'pruebas',
    STORAGE_SECRET_KEY: 'pruebas',
    // Nada de `'x'.repeat(48)`: `xxx` es uno de los marcadores de «valor de
    // ejemplo» que `validarEntorno` rechaza, y con razón.
    SESSION_SECRET: 'ZmFsc28tcGFyYS1wcnVlYmFzLW5vLWVzLWVsLWRlLXByb2R1Y2Npb24',
    PIN_PEPPER: 'pimienta-de-pruebas-que-no-es-la-de-produccion',
    APP_URL: 'http://localhost:3000',
  };
  for (const [clave, valor] of Object.entries(minimo)) {
    process.env[clave] = process.env[clave] ?? valor;
  }
});

const NUEVO = {
  nombre: 'Lupita Ramírez',
  puesto: 'mesero',
  telefono: null,
  color: '#7c3aed',
  estacionPreparacionId: null,
  veTodasLasEstaciones: false,
  activo: true,
};

describe('guardar_empleado · nadie reparte un puesto por encima del suyo', () => {
  it('el código liga la revocación al cambio de rol o la baja', () => {
    const codigo = readFileSync(FUENTE, 'utf8');

    expect(codigo).toContain('rolPedido !== actual.rol || (actual.activo && !entrada.activo)');
    expect(codigo).toContain('repoSesion.revocarSesionesDeEmpleo');
  });

  it('un administrador NO puede crear un dueño', async () => {
    // ES LA PRUEBA QUE MÁS IMPORTA DE ESTE ARCHIVO. Sin esta guarda, un
    // administrador se fabrica un dueño, entra con él y se queda con los
    // comandos que vacían el negocio.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'), AHORA);

    const fallo = await falla(guardarEmpleado.ejecutar(ctx, { ...NUEVO, puesto: 'dueno' }));

    expect(fallo.codigo).toBe('PUESTO_NO_OTORGABLE');
    expect(fallo.mensaje).toMatch(/no puede dar de alta a un dueno/i);
    expect(base.filas('empleos')).toHaveLength(0);
    expect(base.filas('personas')).toHaveLength(0);
  });

  it('un administrador tampoco puede MODIFICAR a un dueño', async () => {
    // El otro lado de la misma puerta: si sólo se mirara el puesto PEDIDO,
    // bastaría con degradar al dueño a mesero para quedarse solo arriba.
    const base = baseDe({ empleos: [empleo('dueno')], personas: [PERSONA_FILA] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('administrador'), AHORA);

    const fallo = await falla(
      guardarEmpleado.ejecutar(ctx, { ...NUEVO, empleado: OTRO_EMPLEO, puesto: 'mesero' }),
    );

    expect(fallo.codigo).toBe('PUESTO_NO_OTORGABLE');
    expect(fallo.mensaje).toMatch(/no puede modificar a un dueno/i);
    expect(base.campo('empleos', 'rol')).toBe('dueno');
  });

  it('el dueño SÍ puede crear un administrador', async () => {
    // El contraste. Una guarda que rechazara a todo el mundo también pasaría
    // las dos pruebas de arriba.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await guardarEmpleado.ejecutar(ctx, { ...NUEVO, puesto: 'administrador' });

    expect(salida.creado).toBe(true);
    expect(salida.rol).toBe('administrador');
    expect(base.filas('empleos')[0]?.['rol']).toBe('administrador');
  });

  it('nadie se cambia el puesto ni se da de baja a sí mismo', async () => {
    // Quitarse el mando deja el negocio sin quien administre si era el único, y
    // el siguiente inicio de sesión no lleva a ninguna parte.
    const base = baseDe({ empleos: [empleo('dueno', { id: YO })], personas: [PERSONA_FILA] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const bajarse = await falla(
      guardarEmpleado.ejecutar(ctx, { ...NUEVO, empleado: YO, puesto: 'dueno', activo: false }),
    );
    expect(bajarse.codigo).toBe('PUESTO_NO_OTORGABLE');
    expect(bajarse.mensaje).toMatch(/a ti mismo/i);

    const degradarse = await falla(
      guardarEmpleado.ejecutar(ctx, { ...NUEVO, empleado: YO, puesto: 'mesero' }),
    );
    expect(degradarse.codigo).toBe('PUESTO_NO_OTORGABLE');
    expect(base.campo('empleos', 'rol')).toBe('dueno');
    expect(base.campo('empleos', 'activo')).toBe(true);
  });

  it('el puesto llega en SU vocabulario y se guarda en el de la base', async () => {
    // El diálogo guarda `caja`; la columna espera `cajero`. Sin la traducción,
    // el rol se guardaba tal cual y `comando()` no lo reconocía en ninguna lista.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await guardarEmpleado.ejecutar(ctx, { ...NUEVO, puesto: 'caja' });

    expect(salida.rol).toBe('cajero');
    expect(base.filas('empleos')[0]?.['rol']).toBe('cajero');
  });

  it('revoca todas las sesiones al cambiar el puesto', async () => {
    const base = baseDe({
      empleos: [empleo('mesero')],
      personas: [PERSONA_FILA],
      sesiones: [
        {
          sid: '0123456789abcdef0123456789abcdef',
          organizacion_id: ORG,
          empleo_id: OTRO_EMPLEO,
          creada_en: new Date('2026-03-01T08:00:00.000Z'),
          expira_en: new Date('2026-03-01T16:00:00.000Z'),
          revocada_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await guardarEmpleado.ejecutar(ctx, {
      ...NUEVO,
      empleado: OTRO_EMPLEO,
      puesto: 'caja',
    });

    expect(base.campo('sesiones', 'revocada_en')).toEqual(AHORA);
  });

  it('revoca todas las sesiones al dar de baja el empleo', async () => {
    const base = baseDe({
      empleos: [empleo('mesero')],
      personas: [PERSONA_FILA],
      sesiones: [
        {
          sid: 'fedcba9876543210fedcba9876543210',
          organizacion_id: ORG,
          empleo_id: OTRO_EMPLEO,
          creada_en: new Date('2026-03-01T08:00:00.000Z'),
          expira_en: new Date('2026-03-01T16:00:00.000Z'),
          revocada_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await guardarEmpleado.ejecutar(ctx, {
      ...NUEVO,
      empleado: OTRO_EMPLEO,
      puesto: 'mesero',
      activo: false,
    });

    expect(base.campo('sesiones', 'revocada_en')).toEqual(AHORA);
  });

  it('conserva las sesiones si el puesto y el estado no cambian', async () => {
    const base = baseDe({
      empleos: [empleo('mesero')],
      personas: [PERSONA_FILA],
      sesiones: [
        {
          sid: '00112233445566778899aabbccddeeff',
          organizacion_id: ORG,
          empleo_id: OTRO_EMPLEO,
          revocada_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await guardarEmpleado.ejecutar(ctx, {
      ...NUEVO,
      empleado: OTRO_EMPLEO,
      puesto: 'mesero',
    });

    expect(base.campo('sesiones', 'revocada_en')).toBeNull();
  });

  it('la traducción NUNCA sube de rango', async () => {
    // `administrador` de su sistema se guarda como `administrador`, jamás como
    // `dueno`: traducir hacia arriba regalaría el puesto que reparte puestos.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    await guardarEmpleado.ejecutar(ctx, { ...NUEVO, puesto: 'administrador' });

    expect(base.filas('empleos')[0]?.['rol']).not.toBe('dueno');
  });

  it('un puesto inventado se rechaza en vez de guardarse', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await falla(guardarEmpleado.ejecutar(ctx, { ...NUEVO, puesto: 'jefe_supremo' }));

    expect(fallo.codigo).toBe('PUESTO_INVALIDO');
    expect(base.filas('empleos')).toHaveLength(0);
  });
});

describe('guardar_empleado · el PIN entra, se hashea y no vuelve', () => {
  it('el PIN no aparece ni en la respuesta ni en la auditoría', async () => {
    const base = baseDe();
    const { ctx, auditorias } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await guardarEmpleado.ejecutar(ctx, { ...NUEVO, pin: '4821' });

    expect(salida.pinEstablecido).toBe(true);
    expect(JSON.stringify(salida)).not.toContain('4821');
    expect(JSON.stringify(auditorias)).not.toContain('4821');

    // Y lo que se guardó es un hash de Argon2id, no el PIN.
    const credencial = base.filas('credenciales_pin')[0];
    expect(credencial?.['algoritmo']).toBe('argon2id');
    expect(String(credencial?.['pin_hash'])).toMatch(/^\$argon2id\$/);
    expect(String(credencial?.['pin_hash'])).not.toContain('4821');
  });

  it('sin PIN se da de alta igual, con su identidad lista', async () => {
    // Dar de alta a alguien y ponerle el PIN son dos actos distintos; juntarlos
    // a la fuerza hace que el PIN se elija con prisa. Pero la IDENTIDAD sí se
    // crea: sin ella, `identidad.establecer_pin` diría después «ese empleado no
    // existe», que es mentira.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const salida = await guardarEmpleado.ejecutar(ctx, NUEVO);

    expect(salida.pinEstablecido).toBe(false);
    expect(base.filas('credenciales_pin')).toHaveLength(0);
    expect(base.filas('identidades')).toHaveLength(1);
  });

  it('un PIN de tres dígitos no pasa el esquema', () => {
    expect(entradaGuardarEmpleado.safeParse({ ...NUEVO, pin: '123' }).success).toBe(false);
    expect(entradaGuardarEmpleado.safeParse({ ...NUEVO, pin: 'abcd' }).success).toBe(false);
    expect(entradaGuardarEmpleado.safeParse({ ...NUEVO, pin: '4821' }).success).toBe(true);
  });
});

describe('guardar_empleado · el ámbito y el rechazo por rol', () => {
  it('la entrada no declara ni organización ni quién manda', () => {
    const claves = Object.keys(entradaGuardarEmpleado.shape);
    for (const prohibida of [
      'organizacionId',
      'organizacion_id',
      'sucursalId',
      'identidadId',
      'rolDeQuienManda',
      // Y `rol`, que también es del ámbito: por eso el campo se llama `puesto`.
      'rol',
      // Y en particular `empleoId`, que es del ÁMBITO: `definirComando` lo
      // rechaza al cargar el módulo, así que este comando ni siquiera existiría
      // si alguien lo añadiera. Por eso el campo se llama `empleado`.
      'empleoId',
      'empleo_id',
    ]) {
      expect(claves).not.toContain(prohibida);
    }
    expect(claves).toContain('empleado');
    expect(claves).toContain('puesto');
  });

  it('un empleo de OTRO negocio no existe para éste', async () => {
    const base = baseDe({
      empleos: [empleo('mesero', { organizacion_id: '99999999-9999-4999-8999-999999999999' })],
      personas: [PERSONA_FILA],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('dueno'), AHORA);

    const fallo = await falla(
      guardarEmpleado.ejecutar(ctx, { ...NUEVO, empleado: OTRO_EMPLEO, puesto: 'mesero' }),
    );

    expect(fallo.codigo).toBe('ACCESO_NO_ENCONTRADO');
    expect(base.campo('empleos', 'rol')).toBe('mesero');
  });

  it('un gerente no da de alta a nadie, y se le rechaza ANTES de tocar la base', async () => {
    const base = baseDe();
    const { ejecutar, fabrica } = ejecutorSobre(base.tx);

    const salida = await ejecutar(guardarEmpleado, {
      entrada: NUEVO,
      ambito: ambitoDe('gerente'),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
    expect(base.filas('empleos')).toHaveLength(0);
    expect(fabrica.auditoriaConfirmada()[0]?.payload).toMatchObject({ resultado: 'denegado' });
  });

  it('IDEMPOTENCIA: dos altas con la misma clave dejan UN empleado', async () => {
    const base = baseDe();
    const { ejecutar } = ejecutorSobre(base.tx);
    const peticion = { entrada: NUEVO, ambito: ambitoDe('dueno'), idempotencyKey: CLAVE };

    const primera = await ejecutar(guardarEmpleado, peticion);
    const segunda = await ejecutar(guardarEmpleado, peticion);

    expect(primera.ok && segunda.ok).toBe(true);
    if (!primera.ok || !segunda.ok) return;
    expect(segunda.reintento).toBe(true);
    expect(segunda.datos).toEqual(primera.datos);
    expect(base.filas('empleos')).toHaveLength(1);
    expect(base.filas('personas')).toHaveLength(1);
  });
});
