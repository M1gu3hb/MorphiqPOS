import 'server-only';

import { z } from 'zod';

import { ErrorDominio, PAQUETES } from '@morphiqpos/contracts';
import { obtenerDb, type Transaccion } from '@morphiqpos/data';

import { definirComando } from '../comando.ts';

/**
 * LA APARIENCIA DEL NEGOCIO · su estilo y sus cuatro perillas.
 *
 * ── Por qué es un comando propio y no un campo del `guardar` general ──────
 * `configuracion.guardar` escribe la configuración ENTERA —nombre, contacto,
 * impuesto, colores— y exige la versión para detectar conflictos. Cambiar el estilo
 * delante de un prospecto es lo contrario de eso: un toque, sin formulario y sin
 * miedo a pisar lo que otro guardó en otra pantalla. Meter la apariencia ahí
 * obligaría a rellenar y reenviar el resto sólo para cambiar de color.
 *
 * Es el mismo criterio por el que `configuracion.cambiar_paquete` y
 * `configuracion.fijar_modulo` viven aparte: lo que se toca solo, se escribe solo.
 *
 * ── Por qué DUEÑO ─────────────────────────────────────────────────────────
 * La apariencia es la MARCA del negocio, no una preferencia de quien está en la
 * caja. Si la cambiara un cajero, el siguiente turno encontraría otro sistema. Por
 * eso se guarda por ORGANIZACIÓN y la cambia quien responde por la marca.
 */

/** Los ocho estilos. Es la misma lista que `ESTILOS_CONSTRUIDOS` de `@morphiqpos/ui`. */
export const ESTILOS_DISPONIBLES = [
  'morphiq',
  'cristal',
  'relieve',
  'taller',
  'bloque',
  'terminal',
  'papel',
  'noche',
] as const;

export const DENSIDADES = ['guantes', 'comoda', 'normal', 'compacta'] as const;
export const REDONDEOS = ['nula', 'sutil', 'media', 'amplia', 'pastilla'] as const;
export const ELEVACIONES = ['plana', 'sombra', 'doble-bisel', 'linea-dura'] as const;
export const MOVIMIENTOS = ['nula', 'sutil', 'normal', 'expresiva'] as const;

export const entradaFijarApariencia = z.object({
  estilo: z.enum(ESTILOS_DISPONIBLES),
  densidad: z.enum(DENSIDADES),
  redondeo: z.enum(REDONDEOS),
  elevacion: z.enum(ELEVACIONES),
  movimiento: z.enum(MOVIMIENTOS),
});

export interface AparienciaGuardada {
  readonly estilo: string;
  readonly densidad: string;
  readonly redondeo: string;
  readonly elevacion: string;
  readonly movimiento: string;
}

/**
 * Los nombres viejos, traducidos.
 *
 * La Fase 1 guardaba `base`, `premium` o `editorial`. `premium` ocupaba el mismo
 * territorio que el estilo base y `editorial` es hoy `papel`. Un negocio que tenga
 * uno de los tres guardado no puede quedarse sin estilo: se traduce al leer, en vez
 * de migrar la base para tres filas.
 */
const HEREDADOS: Readonly<Record<string, string>> = {
  base: 'morphiq',
  premium: 'morphiq',
  editorial: 'papel',
};

export function normalizarEstilo(guardado: string | null | undefined): string {
  if (guardado === null || guardado === undefined || guardado === '') return 'morphiq';
  const traducido = HEREDADOS[guardado] ?? guardado;
  return (ESTILOS_DISPONIBLES as readonly string[]).includes(traducido) ? traducido : 'morphiq';
}

function esDocumento(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export const fijarApariencia = definirComando<
  Transaccion,
  typeof entradaFijarApariencia,
  AparienciaGuardada
>({
  nombre: 'configuracion.fijar_apariencia',
  entidad: 'configuracion',
  escribe: true,
  // La marca del negocio la cambia quien responde por ella.
  roles: ['dueno'],
  paquetes: PAQUETES,
  entrada: entradaFijarApariencia,
  async ejecutar(ctx, entrada) {
    const actual = await ctx.paso('leer_configuracion_actual', () =>
      ctx.tx
        .selectFrom('configuracion')
        .select(['valores', 'version'])
        .where('organizacion_id', '=', ctx.ambito.organizacionId)
        .executeTakeFirst(),
    );

    const valoresPrevios = esDocumento(actual?.valores) ? actual.valores : {};
    const aparienciaPrevia = esDocumento(valoresPrevios['apariencia'])
      ? valoresPrevios['apariencia']
      : {};

    /**
     * Se CONSERVA lo que había en `apariencia` y sólo se pisan las cinco claves.
     *
     * Ahí viven también el logo y los dos colores de marca, que los escribe otra
     * pantalla. Un `set` de la sección entera borraría el logo del negocio cada vez
     * que alguien cambia de estilo — y nadie relacionaría las dos cosas.
     */
    const valores = {
      ...valoresPrevios,
      apariencia: {
        ...aparienciaPrevia,
        estilo: entrada.estilo,
        densidad: entrada.densidad,
        redondeo: entrada.redondeo,
        elevacion: entrada.elevacion,
        movimiento: entrada.movimiento,
      },
    };

    const guardada = await ctx.paso('guardar_apariencia', () =>
      actual === undefined
        ? ctx.tx
            .insertInto('configuracion')
            .values({ organizacion_id: ctx.ambito.organizacionId, valores, version: 1 })
            .onConflict((conflicto) => conflicto.column('organizacion_id').doNothing())
            .returning('version')
            .executeTakeFirst()
        : ctx.tx
            .updateTable('configuracion')
            .set({ valores, updated_at: ctx.ahora })
            .where('organizacion_id', '=', ctx.ambito.organizacionId)
            .returning('version')
            .executeTakeFirst(),
    );

    if (guardada === undefined) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'No se pudo guardar la apariencia del negocio.',
      );
    }

    /**
     * EL RASTRO, que faltaba — y sin el este comando NUNCA pudo guardar nada.
     *
     * `definirComando` exige que todo comando con `escribe: true` llame a
     * `ctx.auditar`: «declarar sensible algo que no deja rastro convierte la auditoria
     * en un adorno». Sin esta llamada lanzaba `SinRastro` DESPUES de escribir, la
     * transaccion se deshacia y el selector devolvia «No se pudo guardar la
     * apariencia» cada vez que alguien lo tocaba.
     *
     * No lo vio ninguna puerta: el comando compila, la ruta responde y el fallo sale
     * dentro de la transaccion, en ejecucion. Aparecio al llamarlo desde la siembra de
     * las demostraciones, que es la primera vez que algo distinto del navegador lo
     * ejecuto. Un comando que solo prueba una pantalla es un comando sin probar.
     *
     * Y el rastro tiene valor propio: la apariencia es la MARCA del negocio y la
     * cambia el dueño. «¿Quien puso el sistema en amarillo?» es una pregunta que se
     * hace, y la contesta esta fila.
     */
    ctx.auditar({
      entidadId: ctx.ambito.organizacionId,
      payload: {
        estilo: entrada.estilo,
        densidad: entrada.densidad,
        redondeo: entrada.redondeo,
        elevacion: entrada.elevacion,
        movimiento: entrada.movimiento,
      },
    });

    return {
      estilo: entrada.estilo,
      densidad: entrada.densidad,
      redondeo: entrada.redondeo,
      elevacion: entrada.elevacion,
      movimiento: entrada.movimiento,
    };
  },
});

/** La apariencia por omision: la del estilo base. */
export const APARIENCIA_POR_OMISION: AparienciaGuardada = {
  estilo: 'morphiq',
  densidad: 'normal',
  redondeo: 'media',
  elevacion: 'sombra',
  movimiento: 'normal',
};

/**
 * LA APARIENCIA DE UN NEGOCIO, para pintarla en el SERVIDOR.
 *
 * ── Por que hace falta leerla en el servidor y no en el cliente ───────────
 * Los tokens de color viven bajo `[data-estilo='...']` y los nombres en ingles que
 * pinta la aplicacion se derivan de ellos. Si el estilo se aplicara despues de
 * hidratar, la primera pintura saldria con el estilo base y saltaria al del negocio
 * en cada carga: una ferreteria con BLOQUE veria medio segundo de azul redondeado
 * antes de su amarillo cuadrado. Un destello asi en cada pantalla es peor que no
 * tener estilos.
 *
 * ── Por que NUNCA lanza ───────────────────────────────────────────────────
 * Es un dato decorativo. Si la base no contesta, si la fila no existe o si lo
 * guardado esta corrupto, se pinta con el estilo base y la aplicacion sigue. Una
 * pantalla de acceso que no abre porque el color no se pudo leer seria un desastre
 * causado por un adorno.
 */
export async function aparienciaDeLaOrganizacion(
  organizacionId: string,
): Promise<AparienciaGuardada> {
  try {
    const fila = await obtenerDb()
      .selectFrom('configuracion')
      .select('valores')
      .where('organizacion_id', '=', organizacionId)
      .executeTakeFirst();

    const valores = esDocumento(fila?.valores) ? fila.valores : {};
    const guardada = esDocumento(valores['apariencia']) ? valores['apariencia'] : {};
    const texto = (clave: string, porOmision: string): string => {
      const valor = guardada[clave];
      return typeof valor === 'string' && valor !== '' ? valor : porOmision;
    };

    return {
      estilo: normalizarEstilo(texto('estilo', APARIENCIA_POR_OMISION.estilo)),
      densidad: texto('densidad', APARIENCIA_POR_OMISION.densidad),
      redondeo: texto('redondeo', APARIENCIA_POR_OMISION.redondeo),
      elevacion: texto('elevacion', APARIENCIA_POR_OMISION.elevacion),
      movimiento: texto('movimiento', APARIENCIA_POR_OMISION.movimiento),
    };
  } catch {
    return APARIENCIA_POR_OMISION;
  }
}
