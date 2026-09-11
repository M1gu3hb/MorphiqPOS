import { ESTADO_HTTP } from '@morphiqpos/contracts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { crearComando, definirComando } from '../comando.ts';
import { crearFabrica } from '../pruebas/dobles.ts';
import { contextoCatalogo } from '../catalogo/pruebas.ts';
import {
  guardarConfiguracion,
  leerConfiguracion,
  type ConfiguracionOrganizacion,
} from './configuracion.ts';

const entrada = {
  version: 3,
  nombreNegocio: 'Ferretería La Broca',
  telefono: '55 1234 5678',
  direccion: 'Av. Hidalgo 214, Col. Centro',
  logoUrl: 'https://imagenes.morphiq.test/la-broca.webp',
  colorPrimario: '#0f766e',
  colorAcento: '#f59e0b',
  estilo: 'editorial',
  paquete: 'ferreteria',
  // 800 puntos base = 8 %, el IVA de frontera. Se usa a propósito en vez del
  // 16 % general: si el comando ignorara la entrada y guardara su valor por
  // omisión, con 1600 la prueba pasaría igual (C-12).
  impuestoPuntosBase: 800,
  impuestoIncluidoEnPrecio: true,
} as const;

const FUENTE_CONFIGURACION =
  process.env['MORPHIQPOS_CONFIGURACION_SOURCE_PATH'] ??
  fileURLToPath(new URL('./configuracion.ts', import.meta.url));

describe('B-05 · configuración por organización', () => {
  it('cambia sólo sus secciones y conserva el resto del documento', async () => {
    const valoresActuales = {
      presentacion_password_hash: 'hash-que-no-debe-perderse',
      portal_qr_activo: true,
      propina_porcentajes_sugeridos: '10,15,20',
      asignacion_mesas_activa: true,
    };
    const { ctx, operaciones, auditorias } = contextoCatalogo([
      { version: 3, valores: valoresActuales },
      { id: ctxId() },
      { version: 4 },
    ]);

    const salida = await guardarConfiguracion.ejecutar(
      ctx,
      guardarConfiguracion.entrada.parse(entrada),
    );

    expect(salida).toEqual({ version: 4 });
    expect(operaciones[1]).toMatchObject({
      tipo: 'update',
      tabla: 'organizaciones',
      valores: { nombre: entrada.nombreNegocio },
      filtros: [{ columna: 'id', operador: '=', valor: ctx.ambito.organizacionId }],
    });
    expect(operaciones[1]?.valores).not.toHaveProperty('paquete');
    expect(operaciones[2]).toMatchObject({
      tipo: 'update',
      tabla: 'configuracion',
      valores: {
        version: 4,
        valores: {
          ...valoresActuales,
          contacto: { telefono: entrada.telefono, direccion: entrada.direccion },
          apariencia: {
            logoUrl: entrada.logoUrl,
            colorPrimario: entrada.colorPrimario,
            colorAcento: entrada.colorAcento,
            estilo: entrada.estilo,
          },
          impuesto: { puntosBase: 800, incluidoEnPrecio: true },
        },
      },
      filtros: [
        { columna: 'organizacion_id', operador: '=', valor: ctx.ambito.organizacionId },
        { columna: 'version', operador: '=', valor: 3 },
      ],
    });
    expect(auditorias).toHaveLength(1);
  });

  it('crea la configuración inicial si la organización aún usa defaults', async () => {
    const { ctx, operaciones } = contextoCatalogo([undefined, { id: ctxId() }, { version: 1 }]);
    await guardarConfiguracion.ejecutar(
      ctx,
      guardarConfiguracion.entrada.parse({ ...entrada, version: 0 }),
    );
    expect(operaciones[2]).toMatchObject({
      tipo: 'insert',
      tabla: 'configuracion',
      valores: { organizacion_id: ctx.ambito.organizacionId, version: 1 },
    });
  });

  it('falla ante edición concurrente antes de cambiar el nombre', async () => {
    const { ctx, auditorias } = contextoCatalogo([
      { version: 3, valores: {} },
      { id: ctxId() },
      undefined,
    ]);
    await expect(
      guardarConfiguracion.ejecutar(ctx, guardarConfiguracion.entrada.parse(entrada)),
    ).rejects.toMatchObject({ codigo: 'CONFIGURACION_CONFLICTO' });
    expect(auditorias).toHaveLength(0);
  });

  it('lee una sola fila y completa valores ausentes con defaults versionados', async () => {
    const { ctx, operaciones } = contextoCatalogo([
      {
        nombre: 'Cafetería Jacaranda',
        paquete: 'cafeteria',
        version: 7,
        valores: { contacto: { telefono: '33 2000 1000' } },
      },
    ]);

    const salida: ConfiguracionOrganizacion = await leerConfiguracion(
      ctx.tx,
      ctx.ambito.organizacionId,
    );

    expect(salida).toMatchObject({
      nombreNegocio: 'Cafetería Jacaranda',
      paquete: 'cafeteria',
      version: 7,
      telefono: '33 2000 1000',
      direccion: null,
      estilo: 'base',
    });
    expect(operaciones).toHaveLength(1);
    expect(operaciones[0]?.tabla).toBe('organizaciones as o');
  });

  it('el paquete se niega en el servidor con 403 antes del caso de uso', async () => {
    const fabrica = crearFabrica('tienda');
    const ejecutar = crearComando(fabrica);
    let ejecutado = false;
    const soloRestaurante = definirComando({
      nombre: 'configuracion.demo_restaurante',
      entidad: 'configuracion',
      escribe: false,
      roles: ['dueno'],
      paquetes: ['restaurante'],
      entrada: z.object({}),
      async ejecutar() {
        ejecutado = true;
        return { ok: true };
      },
    });

    const resultado = await ejecutar(soloRestaurante, {
      entrada: {},
      ambito: { ...contextoCatalogo().ctx.ambito, rol: 'dueno' },
    });

    expect(resultado).toMatchObject({ ok: false, error: { codigo: 'PAQUETE_NO_INCLUYE' } });
    expect(resultado.ok ? 200 : ESTADO_HTTP[resultado.error.codigo]).toBe(403);
    expect(ejecutado).toBe(false);
  });

  it('no acepta ámbito ni paquete fuera del catálogo en el cuerpo', () => {
    expect(Object.hasOwn(guardarConfiguracion.entrada.shape, 'organizacionId')).toBe(false);
    expect(Object.hasOwn(guardarConfiguracion.entrada.shape, 'paquete')).toBe(false);
    const analisis = guardarConfiguracion.entrada.safeParse({ ...entrada, paquete: 'spa' });
    expect(analisis.success).toBe(true);
    if (analisis.success) expect(analisis.data).not.toHaveProperty('paquete');
  });

  it('mantiene en código los dos límites que evitan mass assignment y reemplazo', () => {
    const codigo = readFileSync(FUENTE_CONFIGURACION, 'utf8');
    expect(codigo).not.toMatch(/\bpaquete:\s*z\.enum\(PAQUETES\)/);
    expect(codigo).toContain('...(esDocumento(actual?.valores) ? actual.valores : {})');
  });
});

function ctxId(): string {
  return '11111111-1111-4111-8111-111111111111';
}
