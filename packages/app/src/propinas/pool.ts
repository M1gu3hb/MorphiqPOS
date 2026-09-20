import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repartirPoolPorPuntos, type BeneficiarioDePool } from '@morphiqpos/domain/sala';

import { aCentesimas } from './esquema.ts';

/**
 * F-242 · El reparto por puntos de una liquidación.
 *
 * ── Quién estuvo lo dice una persona; cuánto le toca, el servidor ──────────
 * La plantilla del turno —quién trabajó y en qué puesto— es un hecho que el
 * sistema no puede saber: cocina no captura ventas, lavaloza tampoco, y no hay
 * tabla de asistencia todavía. Lo dice quien cierra el turno. Lo que NO se
 * acepta del cliente es un solo importe ni un solo punto: los puntos salen del
 * esquema vigente y el reparto lo calcula el dominio.
 *
 * ── La fórmula se congela ──────────────────────────────────────────────────
 * `formula_snapshot` guarda el esquema tal como estaba esa noche. El esquema se
 * puede cerrar, renombrar o quedar obsoleto; el papel que se le enseña al
 * mesero no cambia. Sin eso, el pleito sigue — sólo que ahora contra el sistema.
 */

export interface BeneficiarioPedido {
  readonly empleoId: string;
  readonly puesto: string;
}

export interface RepartoEscrito {
  readonly esquemaId: string;
  readonly esquemaNombre: string;
  readonly beneficiarios: readonly {
    readonly empleoId: string;
    readonly puesto: string;
    readonly montoCentavos: string;
  }[];
}

export interface DatosDeReparto {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly liquidacionId: string;
  readonly esquemaId: string;
  readonly totalCentavos: bigint;
  readonly pedidos: readonly BeneficiarioPedido[];
  readonly liquidadaEn: Date;
}

export async function repartirLiquidacion(
  tx: Transaccion,
  datos: DatosDeReparto,
): Promise<RepartoEscrito> {
  const esquema = await tx
    .selectFrom('esquemas_propina')
    .select(['id', 'nombre', 'vigente_desde', 'vigente_hasta'])
    .where('organizacion_id', '=', datos.organizacionId)
    .where('sucursal_id', '=', datos.sucursalId)
    .where('id', '=', datos.esquemaId)
    .executeTakeFirst();

  if (esquema === undefined) {
    throw new ErrorDominio(
      'LIQUIDACION_INVALIDA',
      'Ese esquema de reparto no existe en esta sucursal.',
    );
  }

  // El esquema tiene que estar vigente EL DÍA QUE SE LIQUIDA. Liquidar el turno
  // de febrero con el esquema de marzo es exactamente lo que la vigencia existe
  // para impedir.
  const dia = datos.liquidadaEn.toISOString().slice(0, 10);
  if (esquema.vigente_desde > dia || (esquema.vigente_hasta ?? '9999-12-31') < dia) {
    throw new ErrorDominio(
      'LIQUIDACION_INVALIDA',
      `Ese esquema no estaba vigente el ${dia}: rigió del ${esquema.vigente_desde} al ${esquema.vigente_hasta ?? 'presente'}.`,
      { vigenteDesde: esquema.vigente_desde, vigenteHasta: esquema.vigente_hasta },
    );
  }

  const puntos = await tx
    .selectFrom('esquema_propina_puntos')
    .select(['puesto', 'puntos'])
    .where('esquema_id', '=', esquema.id)
    .execute();

  const porPuesto = new Map(puntos.map((p) => [p.puesto, aCentesimas(p.puntos)]));

  const beneficiarios: BeneficiarioDePool[] = [];
  for (const pedido of datos.pedidos) {
    const centesimas = porPuesto.get(pedido.puesto);
    if (centesimas === undefined) {
      throw new ErrorDominio(
        'LIQUIDACION_INVALIDA',
        `El esquema «${esquema.nombre}» no reparte nada al puesto «${pedido.puesto}».`,
        { puesto: pedido.puesto },
      );
    }
    beneficiarios.push({
      empleadoId: pedido.empleoId,
      puesto: pedido.puesto,
      // DEL ESQUEMA, nunca del cuerpo de la petición: aceptar los puntos de
      // quien llama dejaría que el que cierra el turno se subiera los suyos.
      puntosCentesimas: centesimas,
    });
  }

  const partes = repartirPoolPorPuntos(datos.totalCentavos, beneficiarios);

  await tx
    .insertInto('liquidacion_propina_beneficiarios')
    .values(
      partes.map((parte) => ({
        liquidacion_id: datos.liquidacionId,
        empleado_id: parte.empleadoId,
        puesto: parte.puesto,
        puntos: (parte.puntosCentesimas / 100).toFixed(2),
        monto_centavos: parte.montoCentavos,
      })),
    )
    .execute();

  await tx
    .updateTable('liquidaciones_propina')
    .set({
      esquema_id: esquema.id,
      formula_snapshot: JSON.stringify({
        esquema: esquema.nombre,
        vigente_desde: esquema.vigente_desde,
        puntos: puntos.map((p) => ({ puesto: p.puesto, puntos: p.puntos })),
      }),
    })
    .where('organizacion_id', '=', datos.organizacionId)
    .where('id', '=', datos.liquidacionId)
    .execute();

  return {
    esquemaId: esquema.id,
    esquemaNombre: esquema.nombre,
    beneficiarios: partes.map((parte) => ({
      empleoId: parte.empleadoId,
      puesto: parte.puesto,
      montoCentavos: parte.montoCentavos.toString(),
    })),
  };
}
