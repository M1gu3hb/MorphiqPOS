import 'server-only';

import { PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { pasivoDeLealtad } from '@morphiqpos/domain/venta';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { sellosPorPremio } from './lealtad.ts';

/**
 * EL PROGRAMA DE SELLOS, en sus tres cifras que disparan algo (C.10 de la 2.4).
 *
 * `04-INTERFAZ` de cafetería, PANTALLA · Clientes y sellos: «1 el pasivo · 2 los que están
 * por canjear · 3 los inactivos». La pantalla leía doce clientes y no podía decir ninguna de
 * las tres: las tres piden mirar a TODOS los del programa, y eso es trabajo del servidor.
 *
 *   · El PASIVO: los sellos vivos y lo que costaría canjearlos, con el costo del último canje
 *     —la misma aritmética que `lealtad.pasivo` (`pasivoDeLealtad`)—.
 *   · A UN SELLO del premio: a quién vale la pena decirle «te falta uno» cuando pase.
 *   · Los que no vienen hace VEINTIÚN días: «el cliente de café viene dos o tres veces por
 *     semana o no viene». A quién mandarle un mensaje —el sistema no lo manda: la dueña lo
 *     manda desde su teléfono—.
 */

const MS_POR_DIA = 86_400_000;
const LISTA_MAXIMA = 50;

export const entradaPrograma = z.object({
  diasInactivo: z.number().int().min(7).max(120).default(21),
});

export interface ClienteDelPrograma {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
  /** Días desde el último sello otorgado; nulo si nunca se le otorgó uno. */
  readonly diasSinVenir: number | null;
}

export interface ResultadoPrograma {
  readonly sellosPorPremio: number;
  readonly sellosVivos: number;
  readonly clientesConSaldo: number;
  readonly pasivoCentavos: string;
  readonly aUnSello: readonly ClienteDelPrograma[];
  readonly inactivos: readonly ClienteDelPrograma[];
}

interface FilaDelPrograma {
  readonly clienteId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
  readonly ultimaVisita: Date | null;
}

/** Los saldos del programa, cada uno con su última visita: un solo viaje, del ledger. */
export async function filasDelPrograma(
  tx: Transaccion,
  organizacionId: string,
): Promise<readonly FilaDelPrograma[]> {
  const { rows } = await sql<FilaDelPrograma>`
    with saldos as (
      select m.cliente_id,
             sum(m.sellos)::int                             as sellos,
             max(m.created_at) filter (where m.sellos > 0)  as ultima_visita
        from lealtad_movimientos m
       where m.organizacion_id = ${organizacionId}
       group by m.cliente_id
    )
    select s.cliente_id    as "clienteId",
           c.nombre        as "nombre",
           c.telefono      as "telefono",
           s.sellos        as "sellos",
           s.ultima_visita as "ultimaVisita"
      from saldos s
      join clientes c on c.id = s.cliente_id and c.organizacion_id = ${organizacionId}
  `.execute(tx);
  return rows;
}

/** Las tres cifras, de las filas: pura, para probarla sin base. */
export function resumirPrograma(
  filas: readonly FilaDelPrograma[],
  opciones: {
    readonly ahora: Date;
    readonly sellosPorPremio: number;
    readonly costoPremioCentavos: bigint;
    readonly diasInactivo: number;
  },
): ResultadoPrograma {
  const conDias = filas.map((f) => ({
    clienteId: f.clienteId,
    nombre: f.nombre,
    telefono: f.telefono,
    sellos: f.sellos,
    diasSinVenir:
      f.ultimaVisita === null
        ? null
        : Math.floor((opciones.ahora.getTime() - new Date(f.ultimaVisita).getTime()) / MS_POR_DIA),
  }));
  const vivos = conDias.filter((c) => c.sellos > 0);
  const sellosVivos = vivos.reduce((suma, c) => suma + c.sellos, 0);
  const porPremio = opciones.sellosPorPremio;
  return {
    sellosPorPremio: porPremio,
    sellosVivos,
    clientesConSaldo: vivos.length,
    pasivoCentavos: pasivoDeLealtad({
      sellosVivos,
      sellosPorPremio: porPremio,
      costoPremioCentavos: opciones.costoPremioCentavos,
    }).toString(),
    // Le falta UNO para el siguiente premio, no para el primero: con 9 de 5 también.
    aUnSello: vivos
      .filter((c) => c.sellos % porPremio === porPremio - 1)
      .toSorted((a, b) => (a.diasSinVenir ?? 0) - (b.diasSinVenir ?? 0))
      .slice(0, LISTA_MAXIMA),
    // Los que se están yendo, con saldo o sin él: primero los que se fueron hace menos,
    // que son los que todavía vuelven con un mensaje.
    inactivos: conDias
      .filter((c) => c.diasSinVenir !== null && c.diasSinVenir >= opciones.diasInactivo)
      .toSorted((a, b) => (a.diasSinVenir ?? 0) - (b.diasSinVenir ?? 0))
      .slice(0, LISTA_MAXIMA),
  };
}

export const programaDeSellos = definirComando<
  Transaccion,
  typeof entradaPrograma,
  ResultadoPrograma
>({
  nombre: 'lealtad.programa',
  entidad: 'lealtad_saldo',
  escribe: false,
  roles: ['cajero', 'gerente', 'administrador', 'dueno'],
  paquetes: PAQUETES_OPERATIVOS,
  entrada: entradaPrograma,
  async ejecutar(ctx, entrada) {
    const organizacionId = ctx.ambito.organizacionId;
    const filas = await ctx.paso('leer_programa', () => filasDelPrograma(ctx.tx, organizacionId));
    // El costo del premio es el del ÚLTIMO canje: lo que cuesta hoy, como la vista del pasivo.
    const canje = await ctx.paso('leer_ultimo_canje', () =>
      ctx.tx
        .selectFrom('lealtad_movimientos')
        .select(['costo_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('tipo', '=', 'canje')
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst(),
    );
    return resumirPrograma(filas, {
      ahora: ctx.ahora,
      sellosPorPremio: await sellosPorPremio(ctx),
      costoPremioCentavos: canje?.costo_centavos ?? 0n,
      diasInactivo: entrada.diasInactivo,
    });
  },
});
