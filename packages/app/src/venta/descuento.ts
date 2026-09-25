import 'server-only';

import { ErrorDominio, PAQUETES_TODOS, ROLES, type Rol } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { evaluarDescuento, puedeAutorizar, type TopeDePuesto } from '@morphiqpos/domain/venta';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-205 · Autorizar un descuento por encima del tope del puesto.
 *
 * ── Lo que este comando hace, y lo que NO ─────────────────────────────────
 * Anota QUIÉN autorizó, sobre qué venta y por qué. **No aplica el descuento**:
 * eso lo hace el comando de la venta, con la autorización ya en la mano. Están
 * separados a propósito, porque el permiso y el efecto son dos hechos con dos
 * responsables distintos y mezclarlos hace imposible auditar el primero.
 *
 * ── El PIN del que autoriza no viaja por aquí ─────────────────────────────
 * Quien autoriza **entra con su PIN** y ejecuta este comando con SU sesión. El
 * ámbito sale de esa sesión, no de un campo del cuerpo: es R16, y aquí importa
 * más que en ningún otro sitio, porque un `autoriza_empleo_id` en la entrada
 * sería literalmente un campo para ponerle el nombre de otro a lo que uno hace.
 *
 * ── Y por qué uno no se puede autorizar a sí mismo ───────────────────────
 * Porque entonces no es una autorización: es un tope que se levanta solo. Lo
 * impide el comando **y** el `check` de la 078, porque es la única defensa que
 * hay contra el fraude interno y un solo cerrojo no basta para eso.
 */

const ROLES_QUE_AUTORIZAN = ['gerente', 'administrador', 'dueno'] as const;

export const entradaAutorizarDescuento = z.object({
  ordenId: z.uuid(),
  /** Quién lo pide. Es el otro, nunca quien ejecuta: por eso sí va en la entrada. */
  solicitaEmpleoId: z.uuid(),
  descuentoCentavos: z.number().int().min(1).max(100_000_000),
  motivo: z.string().trim().min(4).max(200),
});

export interface ResultadoAutorizacion {
  readonly autorizacionId: string;
  readonly descuentoCentavos: string;
  readonly baseCentavos: string;
  /** El tope de quien lo pidió. Es lo que la pantalla enseña al explicar. */
  readonly topeDelSolicitanteCentavos: string;
}

export const autorizarDescuento = definirComando<
  Transaccion,
  typeof entradaAutorizarDescuento,
  ResultadoAutorizacion
>({
  nombre: 'venta.autorizar_descuento',
  entidad: 'autorizacion_descuento',
  escribe: true,
  roles: [...ROLES_QUE_AUTORIZAN],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAutorizarDescuento,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId, sucursalId, rol } = ctx.ambito;

    if (entrada.solicitaEmpleoId === empleoId) {
      throw new ErrorDominio(
        'PUESTO_NO_OTORGABLE',
        'Nadie se autoriza a sí mismo un descuento: eso es un tope que se levanta solo.',
      );
    }

    const orden = await ctx.paso('cargar_orden', () =>
      ctx.tx
        .selectFrom('ordenes')
        .select(['id', 'estado', 'subtotal_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.ordenId)
        .executeTakeFirst(),
    );
    if (orden === undefined) {
      throw new ErrorDominio('ORDEN_NO_ENCONTRADA', 'Esa venta no existe en este negocio.');
    }
    if (orden.estado === 'pagada' || orden.estado === 'cancelada') {
      // Autorizar un descuento sobre una venta ya cobrada no lo aplica a nada:
      // sería una fila de autorización sin efecto, y el día que alguien audite
      // va a buscar un descuento que no existe.
      throw new ErrorDominio(
        'ORDEN_NO_EDITABLE',
        'Esa venta ya se cerró: el descuento se autoriza antes de cobrar.',
      );
    }

    const solicitante = await ctx.paso('cargar_solicitante', () =>
      ctx.tx
        .selectFrom('empleos')
        .select(['id', 'rol'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.solicitaEmpleoId)
        .executeTakeFirst(),
    );
    if (solicitante === undefined) {
      throw new ErrorDominio(
        'ACCESO_NO_ENCONTRADO',
        'Quien pide el descuento no es empleado de este negocio.',
      );
    }

    const base = orden.subtotal_centavos;
    const descuento = BigInt(entrada.descuentoCentavos);

    const topeSolicitante = await topeDe(ctx, solicitante.rol);
    const veredicto = evaluarDescuento({
      baseCentavos: base,
      descuentoCentavos: descuento,
      tope: topeSolicitante,
    });
    if (veredicto.veredicto === 'libre') {
      // Autorizar por debajo del tope propio es ruido en la bitácora: si cabía,
      // no hacía falta permiso. El `check` de la 078 lo rechaza igual.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Ese descuento cabe en el tope de quien lo pide: no hace falta autorizarlo.',
      );
    }

    const topePropio = await topeDe(ctx, rol);
    if (!puedeAutorizar(descuento, base, topePropio)) {
      // Quien autoriza tiene que poder cubrir el descuento ENTERO con su propio
      // tope. Si no, lo que hay no es una autorización: es la misma falta de
      // tope, con una firma encima.
      throw new ErrorDominio(
        'PUESTO_NO_OTORGABLE',
        'Ese descuento pasa también de tu tope: lo tiene que autorizar alguien por encima.',
        { topeCentavos: topePropio.topeCentavos.toString() },
      );
    }

    const fila = await ctx.paso('anotar_autorizacion', () =>
      ctx.tx
        .insertInto('autorizaciones_descuento')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          orden_id: entrada.ordenId,
          solicita_empleo_id: entrada.solicitaEmpleoId,
          autoriza_empleo_id: empleoId,
          autoriza_rol: rol,
          descuento_centavos: descuento,
          tope_centavos: topeSolicitante.topeCentavos,
          motivo: entrada.motivo,
          created_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    ctx.auditar({
      entidadId: fila.id,
      payload: {
        ordenId: entrada.ordenId,
        solicita: entrada.solicitaEmpleoId,
        descuentoCentavos: entrada.descuentoCentavos,
        porque: veredicto.porque,
        motivo: entrada.motivo,
      },
    });

    return {
      autorizacionId: fila.id,
      descuentoCentavos: descuento.toString(),
      baseCentavos: base.toString(),
      topeDelSolicitanteCentavos: topeSolicitante.topeCentavos.toString(),
    };
  },
});

/**
 * El tope de un puesto. **Cero cuando no hay fila**, y eso es a propósito.
 *
 * Una organización sin topes configurados no es una sin límite: es una de la que
 * no sabemos qué límite tiene. Fallar cerrado aquí significa que todo descuento
 * pasa por autorización hasta que alguien configure los topes, que es molesto un
 * día y es lo correcto siempre.
 */
export async function topeDe(
  ctx: ContextoComando<Transaccion>,
  rol: string,
): Promise<TopeDePuesto> {
  if (!(ROLES as readonly string[]).includes(rol)) {
    throw new ErrorDominio('PUESTO_INVALIDO', `«${rol}» no es uno de los puestos del sistema.`);
  }
  const fila = await ctx.paso('cargar_tope', () =>
    ctx.tx
      .selectFrom('topes_descuento')
      .select(['tope_centavos', 'tope_bp'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('rol', '=', rol as Rol)
      .executeTakeFirst(),
  );
  return {
    topeCentavos: fila?.tope_centavos ?? 0n,
    topeBp: fila?.tope_bp ?? 0,
  };
}
