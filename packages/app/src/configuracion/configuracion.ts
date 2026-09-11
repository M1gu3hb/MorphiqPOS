import {
  COLOR_ACENTO_DEFAULT,
  COLOR_PRIMARIO_DEFAULT,
  ErrorDominio,
  PAQUETES,
  esPaquete,
  type Paquete,
} from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const urlONull = z.url().nullable();

export const entradaGuardarConfiguracion = z.object({
  version: z.number().int().min(0),
  nombreNegocio: z.string().trim().min(2).max(160),
  telefono: z.string().trim().min(7).max(40).nullable(),
  direccion: z.string().trim().min(5).max(300).nullable(),
  logoUrl: urlONull,
  colorPrimario: color,
  colorAcento: color,
  estilo: z.enum(['base', 'editorial', 'premium']),
  /**
   * IVA en puntos base: 1600 = 16 %. Entero para que no exista un 16.000000001.
   *
   * El tope de 3500 no es arbitrario: no hay impuesto al consumo del 100 %, y
   * un dedo de más en el formulario no puede triplicar el precio de la próxima
   * venta sin que nadie lo pare.
   */
  impuestoPuntosBase: z.number().int().min(0).max(3500),
  /** En México el precio de mostrador YA lleva IVA: se extrae, no se suma. */
  impuestoIncluidoEnPrecio: z.boolean(),
});

const valoresGuardados = z.object({
  contacto: z
    .object({
      telefono: z.string().nullable().optional(),
      direccion: z.string().nullable().optional(),
    })
    .optional(),
  apariencia: z
    .object({
      logoUrl: z.string().nullable().optional(),
      colorPrimario: color.optional(),
      colorAcento: color.optional(),
      estilo: z.enum(['base', 'editorial', 'premium']).optional(),
    })
    .optional(),
  impuesto: z
    .object({
      puntosBase: z.number().int().min(0).max(3500).optional(),
      incluidoEnPrecio: z.boolean().optional(),
    })
    .optional(),
});

export interface ConfiguracionOrganizacion {
  readonly version: number;
  readonly nombreNegocio: string;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly logoUrl: string | null;
  readonly colorPrimario: string;
  readonly colorAcento: string;
  readonly estilo: 'base' | 'editorial' | 'premium';
  readonly paquete: Paquete;
  readonly impuestoPuntosBase: number;
  readonly impuestoIncluidoEnPrecio: boolean;
}

const DEFAULTS = {
  telefono: null,
  direccion: null,
  logoUrl: null,
  colorPrimario: COLOR_PRIMARIO_DEFAULT,
  colorAcento: COLOR_ACENTO_DEFAULT,
  estilo: 'base',
  /** IVA general de México. Es el punto de partida, no una constante. */
  impuestoPuntosBase: 1600,
  impuestoIncluidoEnPrecio: true,
} as const;

function esDocumento(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export async function leerConfiguracion(
  tx: Transaccion,
  organizacionId: string,
): Promise<ConfiguracionOrganizacion> {
  const fila = await tx
    .selectFrom('organizaciones as o')
    .leftJoin('configuracion as c', 'c.organizacion_id', 'o.id')
    .select(['o.nombre', 'o.paquete', 'c.version', 'c.valores'])
    .where('o.id', '=', organizacionId)
    .executeTakeFirst();

  if (fila === undefined || !esPaquete(fila.paquete)) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'La organización no tiene configuración válida.',
    );
  }
  const analisis = valoresGuardados.safeParse(fila.valores ?? {});
  if (!analisis.success) {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'La configuración guardada está dañada.');
  }
  const guardados = analisis.data;
  return {
    version: fila.version ?? 0,
    nombreNegocio: fila.nombre,
    telefono: guardados.contacto?.telefono ?? DEFAULTS.telefono,
    direccion: guardados.contacto?.direccion ?? DEFAULTS.direccion,
    logoUrl: guardados.apariencia?.logoUrl ?? DEFAULTS.logoUrl,
    colorPrimario: guardados.apariencia?.colorPrimario ?? DEFAULTS.colorPrimario,
    colorAcento: guardados.apariencia?.colorAcento ?? DEFAULTS.colorAcento,
    estilo: guardados.apariencia?.estilo ?? DEFAULTS.estilo,
    paquete: fila.paquete,
    impuestoPuntosBase: guardados.impuesto?.puntosBase ?? DEFAULTS.impuestoPuntosBase,
    impuestoIncluidoEnPrecio:
      guardados.impuesto?.incluidoEnPrecio ?? DEFAULTS.impuestoIncluidoEnPrecio,
  };
}

export const guardarConfiguracion = definirComando<
  Transaccion,
  typeof entradaGuardarConfiguracion,
  { readonly version: number }
>({
  nombre: 'configuracion.guardar',
  entidad: 'configuracion',
  escribe: true,
  roles: ['dueno', 'administrador'],
  paquetes: PAQUETES,
  entrada: entradaGuardarConfiguracion,
  async ejecutar(ctx, entrada) {
    const actual = await ctx.paso('leer_configuracion_actual', () =>
      ctx.tx
        .selectFrom('configuracion')
        .select(['valores', 'version'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .executeTakeFirst(),
    );
    if (
      (entrada.version === 0 && actual !== undefined) ||
      (entrada.version !== 0 && actual?.version !== entrada.version)
    ) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'La configuración cambió en otra pantalla. Recarga antes de guardar.',
      );
    }

    const organizacion = await ctx.paso('actualizar_organizacion', () =>
      ctx.tx
        .updateTable('organizaciones')
        .set({ nombre: entrada.nombreNegocio, updated_at: ctx.ahora })
        .where('id', '=', ctx.ambito.organizacionId)
        .returning('id')
        .executeTakeFirst(),
    );
    if (organizacion === undefined) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'La organización no existe.');
    }

    const nuevaVersion = entrada.version + 1;
    const valores = {
      ...(esDocumento(actual?.valores) ? actual.valores : {}),
      contacto: { telefono: entrada.telefono, direccion: entrada.direccion },
      apariencia: {
        logoUrl: entrada.logoUrl,
        colorPrimario: entrada.colorPrimario,
        colorAcento: entrada.colorAcento,
        estilo: entrada.estilo,
      },
      impuesto: {
        puntosBase: entrada.impuestoPuntosBase,
        incluidoEnPrecio: entrada.impuestoIncluidoEnPrecio,
      },
    };
    const configuracion = await ctx.paso('guardar_configuracion', () =>
      entrada.version === 0
        ? ctx.tx
            .insertInto('configuracion')
            .values({
              organizacion_id: ctx.ambito.organizacionId,
              valores,
              version: nuevaVersion,
            })
            .onConflict((conflicto) => conflicto.column('organizacion_id').doNothing())
            .returning('version')
            .executeTakeFirst()
        : ctx.tx
            .updateTable('configuracion')
            .set({ valores, version: nuevaVersion, updated_at: ctx.ahora })
            .where('organizacion_id', '=', ctx.ambito.organizacionId)
            .where('version', '=', entrada.version)
            .returning('version')
            .executeTakeFirst(),
    );
    if (configuracion === undefined) {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        'La configuración cambió en otra pantalla. Recarga antes de guardar.',
      );
    }

    ctx.auditar({
      entidadId: organizacion.id,
      // El impuesto va al rastro: cambia el total de toda venta posterior, y
      // «¿desde cuándo cobramos 8 %?» tiene que tener respuesta.
      payload: {
        version: configuracion.version,
        impuestoPuntosBase: entrada.impuestoPuntosBase,
        impuestoIncluidoEnPrecio: entrada.impuestoIncluidoEnPrecio,
      },
    });
    return { version: configuracion.version };
  },
});
