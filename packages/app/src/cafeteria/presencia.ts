import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * `cafeteria.abrir_presencia` — la hora a la que alguien ENTRÓ al turno (F-248).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `cafeteria/AccesoPorPin.tsx` abre la presencia al teclear el PIN y publicaba en
 * `/api/turno/presencia/abrir`, **una ruta que no existe**. La pantalla se traga
 * ese fallo a propósito —«lo que decide si se entra o no es el PIN, no este
 * registro»— y por eso nadie lo notó: se entraba al turno y la hora no quedaba en
 * ninguna parte. La pantalla lo dice en la línea que enseña: «la hora no quedó
 * registrada; se ajusta en el corte».
 *
 * Y sin esas horas, el REPARTO DEL BOTE no tiene base: `cafeteria.repartir_bote`
 * reparte por minutos de presencia, así que un turno sin presencias reparte cero
 * entre cuatro personas que trabajaron ocho horas. La corrección manual existe
 * —`cafeteria.ajustar_presencia`— pero corregir lo que nunca se registró es
 * teclear a mano el turno entero de un local con cinco baristas.
 *
 * ── Por qué es idempotente por SESIÓN y no por clave de petición ─────────
 * Porque el barista teclea su PIN varias veces por turno: para cobrar, para volver
 * a la barra después del descanso, y porque la tablet se bloquea. Cada tecleo no es
 * una entrada nueva. Si ya hay una presencia abierta suya en este turno, se
 * devuelve ésa; si no, se abre. Sin esta regla, un turno de ocho horas con seis
 * tecleos reparte el bote entre seis presencias de la misma persona.
 *
 * ── Y por qué exige la sesión de caja ────────────────────────────────────
 * Porque la presencia es DEL TURNO, no del día: `presencias_turno.sesion_caja_id`
 * es `not null`, y es lo que ata las horas al bote que se va a repartir. Sin caja
 * abierta no hay turno al que pertenecer, y decirlo es mejor que colgar la hora de
 * una sesión ajena.
 */

const ROLES = ['cajero', 'mesero', 'cocina', 'gerente', 'administrador', 'dueno'] as const;

export const entradaAbrirPresencia = z.object({
  /**
   * De quién es la presencia, y por qué NO se llama `empleoId`.
   *
   * `definirComando` prohíbe ese nombre en la entrada de un comando, y con razón:
   * el ámbito —organización, sucursal, terminal, empleo— viene de la sesión del
   * servidor y jamás de un parámetro del cliente (R16). Aceptar un campo llamado
   * como uno del ámbito es cómo alguien acaba eligiendo en qué negocio escribe.
   *
   * Aquí el dato es otra cosa: QUIÉN ENTRA, que no es necesariamente quien teclea.
   * En un local de cinco baristas con una sola tablet, el encargado da de entrada a
   * la que acaba de llegar con las manos llenas, y ese caso es normal. El ámbito
   * sigue decidiendo el negocio y el turno; esto sólo dice de quién son las horas.
   */
  quienEntraId: z.uuid(),
});

export interface ResultadoPresencia {
  readonly presenciaId: string;
  readonly entroEn: string;
  /** `true` cuando ya estaba abierta: el segundo PIN del turno no es otra entrada. */
  readonly yaEstaba: boolean;
}

export const abrirPresencia = definirComando<
  Transaccion,
  typeof entradaAbrirPresencia,
  ResultadoPresencia
>({
  nombre: 'cafeteria.abrir_presencia',
  entidad: 'presencia_turno',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaAbrirPresencia,
  async ejecutar(ctx, entrada) {
    const { organizacionId, terminalId } = ctx.ambito;
    if (terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'La presencia es de un turno, y el turno es de una terminal dada de alta.',
      );
    }

    const sesion = await ctx.paso('cargar_turno', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) {
      throw new ErrorDominio(
        'CAJA_CERRADA',
        'No hay turno abierto en esta terminal: abre la caja antes de marcar entrada.',
      );
    }

    // El empleo tiene que ser de ESTE negocio. Sin la comprobación, un
    // identificador ajeno colgaría horas de un turno que no es suyo — y el bote se
    // repartiría con alguien que no estuvo.
    const empleo = await ctx.paso('cargar_empleo', () =>
      ctx.tx
        .selectFrom('empleos')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.quienEntraId)
        .where('activo', '=', true)
        .executeTakeFirst(),
    );
    if (empleo === undefined) {
      throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Esa persona no trabaja en este negocio.');
    }

    // Idempotencia por TURNO: el segundo PIN del día no es una entrada nueva.
    const abierta = await ctx.paso('mirar_presencia', () =>
      ctx.tx
        .selectFrom('presencias_turno')
        .select(['id', 'entro_en as entroEn'])
        .where('organizacion_id', '=', organizacionId)
        .where('sesion_caja_id', '=', sesion.id)
        .where('empleado_id', '=', entrada.quienEntraId)
        .where('salio_en', 'is', null)
        .executeTakeFirst(),
    );
    if (abierta !== undefined) {
      ctx.auditar({
        entidadId: abierta.id,
        payload: { quienEntraId: entrada.quienEntraId, sesionCajaId: sesion.id, yaEstaba: true },
      });
      return {
        presenciaId: abierta.id,
        entroEn: abierta.entroEn.toISOString(),
        yaEstaba: true,
      };
    }

    const fila = await ctx.paso('abrir_presencia', () =>
      ctx.tx
        .insertInto('presencias_turno')
        .values({
          organizacion_id: organizacionId,
          sesion_caja_id: sesion.id,
          empleado_id: entrada.quienEntraId,
          entro_en: ctx.ahora,
          // `pin` y no `manual`: lo registró el tecleo, no una corrección. La
          // diferencia es la que permite auditar quién se infló las horas.
          origen: 'pin',
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: {
        quienEntraId: entrada.quienEntraId,
        sesionCajaId: sesion.id,
        entroEn: ctx.ahora.toISOString(),
        yaEstaba: false,
      },
    });

    return { presenciaId: fila.id, entroEn: ctx.ahora.toISOString(), yaEstaba: false };
  },
});
