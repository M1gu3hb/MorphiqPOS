import { esErrorDominio } from '@morphiqpos/contracts';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  contextoFalso,
  crearBaseFalsa,
  type TablasFalsas,
} from '../restaurante/pruebas/base-falsa.ts';
import { ambitoDe, EMPLEO, ORG } from '../restaurante/pruebas/sala.ts';
import { abrirExpediente, guardarFotoDeServicio, ultimaFormula } from './expediente.ts';

// La foto que el sistema acepta es la que devolvió `archivos/subir`: del origen de
// `APP_URL` y bajo `privado/<este negocio>/` (auditoría de la 2.4).
beforeAll(() => {
  vi.stubEnv('APP_URL', 'https://pos.example.mx');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

/**
 * F-153, F-154 y F-436 · El expediente de belleza.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que guardar sólo toque LO QUE VIENE. Mandar el formulario entero desde la
 * pantalla que sólo quería corregir el porcentaje de canas borraría las
 * alergias, que es el campo por el que existe todo esto.
 *
 * Que el hueco en blanco se SEÑALE y no se dé por contestado: «se preguntó y no
 * había» y «nadie preguntó» son cosas distintas, y sólo una es una decisión.
 *
 * Y que la segunda foto de un momento reemplace a la primera DICIÉNDOLO. La
 * que tapa a la otra en silencio deja a nadie sabiendo cuál era la buena.
 */

const AHORA = new Date('2026-09-16T12:00:00.000Z');
const CLIENTA = 'e1000000-0000-4000-8000-000000000001';
const CITA_SERVICIO = 'e2000000-0000-4000-8000-000000000002';
const SERVICIO = 'e3000000-0000-4000-8000-000000000003';
/** La estilista de la sesión (`EMPLEO`), que atiende a la clienta en `c0`. */
const ESTILISTA = 'e4000000-0000-4000-8000-000000000004';

const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);

function baseDe(extra: Partial<TablasFalsas> = {}) {
  return crearBaseFalsa(
    {
      clientes: [{ id: CLIENTA, organizacion_id: ORG, nombre: 'Karla', telefono: '5512345678' }],
      expedientes_belleza: [],
      formulas_aplicadas: [],
      consentimientos: [],
      fotos_expediente: [],
      profesionales: [{ id: ESTILISTA, organizacion_id: ORG, empleo_id: EMPLEO }],
      // La base falsa resuelve el join sobre una fila: el cliente va en el servicio.
      cita_servicios: [
        {
          id: 'e5000000-0000-4000-8000-000000000005',
          organizacion_id: ORG,
          cita_id: 'c0',
          cliente_id: CLIENTA,
          profesional_id: ESTILISTA,
        },
      ],
      citas: [{ id: 'c0', organizacion_id: ORG, cliente_id: CLIENTA }],
      ...extra,
    },
    {
      predeterminados: {
        expedientes_belleza: {
          alergias: '',
          antecedentes: '',
          como_llego: '',
          que_busca: '',
          tipo_cabello: null,
          porcentaje_canas: null,
          ultimo_alisado_en: null,
          frecuencia_dias: null,
        },
        fotos_expediente: { consentimiento_id: null, tomada_por: null },
      },
    },
  );
}

const expedienteDe = (cambios: Record<string, unknown> = {}): Record<string, unknown> => ({
  cliente_id: CLIENTA,
  organizacion_id: ORG,
  alergias: 'ninguna conocida',
  antecedentes: 'decoloración en 2025',
  como_llego: 'recomendación',
  que_busca: 'mantener el rubio',
  tipo_cabello: 'ondulado',
  porcentaje_canas: 20,
  ultimo_alisado_en: null,
  frecuencia_dias: 35,
  ...cambios,
});

async function codigoDe(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return 'NO LANZÓ';
  } catch (error) {
    return esErrorDominio(error) ? error.codigo : `INESPERADO: ${String(error)}`;
  }
}

describe('la estilista sólo ve a SUS clientas (auditoría de la 2.4)', () => {
  // La clienta la atiende OTRA estilista; la de la sesión nunca le ha dado un servicio.
  const ajena = {
    cita_servicios: [
      {
        id: 'e6000000-0000-4000-8000-000000000006',
        organizacion_id: ORG,
        cita_id: 'c9',
        cliente_id: CLIENTA,
        profesional_id: 'e9000000-0000-4000-8000-000000000009',
      },
    ],
    citas: [{ id: 'c9', organizacion_id: ORG, cliente_id: CLIENTA }],
  };

  it('no abre el expediente de una clienta que no atiende', async () => {
    const base = baseDe(ajena);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    expect(await codigoDe(() => abrirExpediente.ejecutar(ctx, { clienteId: CLIENTA }))).toBe(
      'PUENTE_SIN_PERMISO',
    );
    expect(base.filas('expedientes_belleza')).toHaveLength(0);
  });

  it('no lee su última fórmula', async () => {
    const base = baseDe(ajena);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    expect(
      await codigoDe(() => ultimaFormula.ejecutar(ctx, { clienteId: CLIENTA, servicioId: null })),
    ).toBe('PUENTE_SIN_PERMISO');
  });

  it('no le toma ni le reemplaza la foto en la cita de otra', async () => {
    const base = baseDe({
      cita_servicios: [
        {
          id: CITA_SERVICIO,
          organizacion_id: ORG,
          cita_id: 'c1',
          cliente_id: CLIENTA,
          profesional_id: 'e9000000-0000-4000-8000-000000000009',
        },
      ],
      citas: [{ id: 'c1', organizacion_id: ORG, cliente_id: CLIENTA }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);
    expect(
      await codigoDe(() =>
        guardarFotoDeServicio.ejecutar(ctx, {
          citaServicioId: CITA_SERVICIO,
          momento: 'antes',
          url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000001-0000-4000-8000-000000000001.jpg`,
        }),
      ),
    ).toBe('PUENTE_SIN_PERMISO');
    expect(base.filas('fotos_expediente')).toHaveLength(0);
  });

  it('recepción y la dueña sí ven el de cualquiera', async () => {
    const base = baseDe(ajena);
    const { ctx } = contextoFalso(base.tx, ambitoDe('gerente'), AHORA);
    await abrirExpediente.ejecutar(ctx, { clienteId: CLIENTA });
    expect(base.filas('expedientes_belleza')).toHaveLength(1);
  });
});

describe('F-153 · abrir el expediente', () => {
  it('la PRIMERA visita lo crea y lo dice', async () => {
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await abrirExpediente.ejecutar(ctx, {
      clienteId: CLIENTA,
      alergias: 'ninguna conocida',
    });

    expect(salida.esPrimeraVisita).toBe(true);
    expect(base.filas('expedientes_belleza')).toHaveLength(1);
    expect(base.campo('expedientes_belleza', 'alergias')).toBe('ninguna conocida');
  });

  it('SÓLO TOCA LO QUE VIENE', async () => {
    // Mandar el formulario entero desde la pantalla que sólo quería corregir
    // las canas borraría las alergias.
    const base = baseDe({ expedientes_belleza: [expedienteDe()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    await abrirExpediente.ejecutar(ctx, { clienteId: CLIENTA, porcentajeCanas: 45 });

    expect(base.campo('expedientes_belleza', 'porcentaje_canas')).toBe(45);
    expect(base.campo('expedientes_belleza', 'alergias')).toBe('ninguna conocida');
    expect(base.campo('expedientes_belleza', 'antecedentes')).toBe('decoloración en 2025');
  });

  it('SEÑALA lo que falta por contestar, uno por uno', async () => {
    // «Falta algo» manda a la recepcionista a buscar qué, y la clienta espera.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirExpediente.ejecutar(ctx, {
      clienteId: CLIENTA,
      alergias: 'ninguna conocida',
    });

    expect(salida.sinContestar).toEqual(['antecedentes', 'como_llego', 'que_busca']);
  });

  it('un expediente completo no tiene huecos', async () => {
    const base = baseDe({ expedientes_belleza: [expedienteDe()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await abrirExpediente.ejecutar(ctx, { clienteId: CLIENTA });

    expect(salida.sinContestar).toEqual([]);
    expect(salida.esPrimeraVisita).toBe(false);
  });

  it('una clienta de otro negocio no existe', async () => {
    const base = baseDe({ clientes: [] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    expect(await codigoDe(() => abrirExpediente.ejecutar(ctx, { clienteId: CLIENTA }))).toBe(
      'PUENTE_NO_ENCONTRADO',
    );
  });
});

describe('F-154 · la última fórmula', () => {
  const formula = (cambios: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'f1',
    organizacion_id: ORG,
    cliente_id: CLIENTA,
    cita_servicio_id: CITA_SERVICIO,
    servicio_id: SERVICIO,
    profesional_id: null,
    formula: { marca: 'Igora', tono: '9-1', volumen: 20, gramos: 60 },
    minutos_procesado: 35,
    resultado: 'quedó parejo',
    aplicada_en: dias(-35),
    ...cambios,
  });

  it('trae la fórmula CONGELADA con los días que han pasado', async () => {
    // «Este tono hace cinco semanas» y «hace ocho meses» no se repiten igual, y
    // quien está mezclando no tiene tiempo de restar fechas.
    const base = baseDe({ formulas_aplicadas: [formula()] });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await ultimaFormula.ejecutar(ctx, {
      clienteId: CLIENTA,
      servicioId: SERVICIO,
    });

    expect(salida.ultima?.diasDesde).toBe(35);
    expect(salida.ultima?.formula).toEqual({
      marca: 'Igora',
      tono: '9-1',
      volumen: 20,
      gramos: 60,
    });
  });

  it('sin fórmula devuelve NULL, no un error', async () => {
    // La pantalla enseña captura en blanco. Un error dejaría a la estilista
    // mirando un mensaje rojo con la clienta ya sentada.
    const base = baseDe();
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await ultimaFormula.ejecutar(ctx, { clienteId: CLIENTA, servicioId: null });

    expect(salida.ultima).toBeNull();
  });

  it('la ÚLTIMA es la última, no la primera', async () => {
    const base = baseDe({
      formulas_aplicadas: [
        formula({ id: 'vieja', aplicada_en: dias(-200), resultado: 'muy naranja' }),
        formula({ id: 'nueva', aplicada_en: dias(-10), resultado: 'quedó parejo' }),
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await ultimaFormula.ejecutar(ctx, { clienteId: CLIENTA, servicioId: null });

    expect(salida.ultima?.formulaId).toBe('nueva');
  });
});

describe('F-436 · la foto de antes y después', () => {
  // La base falsa resuelve sobre UNA tabla: las columnas que el `innerJoin`
  // traería se siembran en la misma fila, como ya hace el resto de la suite.
  const servicioSembrado = {
    cita_servicios: [
      {
        id: CITA_SERVICIO,
        organizacion_id: ORG,
        cita_id: 'c1',
        cliente_id: CLIENTA,
        profesional_id: ESTILISTA,
      },
    ],
    citas: [{ id: 'c1', organizacion_id: ORG, cliente_id: CLIENTA }],
  };

  it('se guarda atada a la clienta y al servicio', async () => {
    const base = baseDe(servicioSembrado);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await guardarFotoDeServicio.ejecutar(ctx, {
      citaServicioId: CITA_SERVICIO,
      momento: 'antes',
      url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000002-0000-4000-8000-000000000002.jpg`,
    });

    expect(salida.reemplazo).toBe(false);
    expect(base.campo('fotos_expediente', 'cliente_id')).toBe(CLIENTA);
  });

  it('la SEGUNDA del mismo momento reemplaza, Y LO DICE', async () => {
    // Tapar a la primera en silencio deja a nadie sabiendo cuál era la buena.
    const base = baseDe({
      ...servicioSembrado,
      fotos_expediente: [
        {
          id: 'vieja',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          cita_servicio_id: CITA_SERVICIO,
          momento: 'antes',
          archivo_url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000003-0000-4000-8000-000000000003.jpg`,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await guardarFotoDeServicio.ejecutar(ctx, {
      citaServicioId: CITA_SERVICIO,
      momento: 'antes',
      url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000004-0000-4000-8000-000000000004.jpg`,
    });

    expect(salida.reemplazo).toBe(true);
    expect(base.filas('fotos_expediente')).toHaveLength(1);
    expect(base.campo('fotos_expediente', 'archivo_url')).toBe(
      `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000004-0000-4000-8000-000000000004.jpg`,
    );
  });

  it('SIN consentimiento se guarda igual, pero marcada', async () => {
    // Negarla haría que el salón dejara de documentar. Marcarla hace que el
    // reporte de publicables la excluya sola.
    const base = baseDe(servicioSembrado);
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await guardarFotoDeServicio.ejecutar(ctx, {
      citaServicioId: CITA_SERVICIO,
      momento: 'despues',
      url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000005-0000-4000-8000-000000000005.jpg`,
    });

    expect(salida.conConsentimiento).toBe(false);
    expect(base.campo('fotos_expediente', 'consentimiento_id')).toBeNull();
  });

  it('un consentimiento REVOCADO no cuenta', async () => {
    // «Dijo que sí hace tres años» no autoriza publicarla hoy.
    const base = baseDe({
      ...servicioSembrado,
      consentimientos: [
        {
          id: 'k1',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          alcance: 'foto_publicable',
          texto: 'autoriza',
          otorgado_en: dias(-1000),
          revocado_en: dias(-5),
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await guardarFotoDeServicio.ejecutar(ctx, {
      citaServicioId: CITA_SERVICIO,
      momento: 'antes',
      url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000006-0000-4000-8000-000000000006.jpg`,
    });

    expect(salida.conConsentimiento).toBe(false);
  });

  it('un consentimiento VIVO se ata a la foto', async () => {
    const base = baseDe({
      ...servicioSembrado,
      consentimientos: [
        {
          id: 'k1',
          organizacion_id: ORG,
          cliente_id: CLIENTA,
          alcance: 'foto_interna',
          texto: 'autoriza uso interno',
          otorgado_en: dias(-30),
          revocado_en: null,
        },
      ],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const salida = await guardarFotoDeServicio.ejecutar(ctx, {
      citaServicioId: CITA_SERVICIO,
      momento: 'antes',
      url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000007-0000-4000-8000-000000000007.jpg`,
    });

    expect(salida.conConsentimiento).toBe(true);
    expect(base.campo('fotos_expediente', 'consentimiento_id')).toBe('k1');
  });

  it('una cita SIN clienta no puede tener foto', async () => {
    // La foto vive en el expediente de alguien; suelta quedaría fuera de
    // cualquier consentimiento.
    const base = baseDe({
      cita_servicios: [
        {
          id: CITA_SERVICIO,
          organizacion_id: ORG,
          cita_id: 'c1',
          cliente_id: null,
          profesional_id: ESTILISTA,
        },
      ],
      citas: [{ id: 'c1', organizacion_id: ORG, cliente_id: null }],
    });
    const { ctx } = contextoFalso(base.tx, ambitoDe('mesero'), AHORA);

    const codigo = await codigoDe(() =>
      guardarFotoDeServicio.ejecutar(ctx, {
        citaServicioId: CITA_SERVICIO,
        momento: 'antes',
        url: `https://pos.example.mx/api/archivos/privado/${ORG}/2026/09/00000001-0000-4000-8000-000000000001.jpg`,
      }),
    );

    expect(codigo).toBe('CONFIGURACION_CONFLICTO');
    expect(base.filas('fotos_expediente')).toHaveLength(0);
  });
});
