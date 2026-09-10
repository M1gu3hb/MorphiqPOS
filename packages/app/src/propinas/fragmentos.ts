import 'server-only';

import { sql } from 'kysely';

import { etiquetaDeMesero, type PropinaDeMesero, type RenglonDePago } from './desglose.ts';

/**
 * Los trozos de SQL que comparten las lecturas de propina.
 *
 * Viven en un solo sitio porque la consulta que le enseña la lista al
 * administrador y el `UPDATE` que la reclama TIENEN que preguntar lo mismo. Dos
 * copias del mismo predicado, separadas por doscientas líneas, es como una
 * pantalla enseña ocho ventas y el botón liquida siete.
 *
 * Todos asumen que la tabla de órdenes se llama `o` en la consulta que los usa.
 */

/** La propina confirmada de una orden, como subconsulta lateral. */
export const PROPINA_DE_LA_ORDEN = sql`
  join lateral (
    select coalesce(sum(p.propina_centavos), 0) as propina
      from pagos p
     where p.orden_id = o.id
       and p.organizacion_id = o.organizacion_id
       and p.estado = 'confirmado'
  ) t on true
`;

/**
 * «Esta orden tiene propina confirmada», en forma de `exists`.
 *
 * Es la misma condición que `t.propina > 0` del `join lateral`, porque
 * `check (propina_centavos >= 0)` impide que una suma positiva salga de sumandos
 * negativos. Se declara aparte porque un `UPDATE` no puede colgar un lateral.
 */
export const TIENE_PROPINA_CONFIRMADA = sql`
  exists (
    select 1
      from pagos p
     where p.orden_id = o.id
       and p.organizacion_id = o.organizacion_id
       and p.estado = 'confirmado'
       and p.propina_centavos > 0
  )
`;

/**
 * El nombre del mesero: dos saltos, `empleos` → `personas`.
 *
 * La vista `empleados_visibles` (`047_empleados_visibles.sql`) haría esto de un
 * salto, pero `pnpm db:tipos` no genera tipos de vistas y `Esquema` no la
 * declara, así que Kysely no la conoce. Se hacen los dos `join` a mano.
 */
export const NOMBRE_DEL_MESERO = sql`
  left join empleos e
    on e.id = o.empleado_atiende_id and e.organizacion_id = o.organizacion_id
  left join personas per
    on per.id = e.persona_id and per.organizacion_id = e.organizacion_id
`;

export interface FilaDeMetodo {
  readonly metodo: string;
  readonly ventas: string;
  readonly propinas: string;
}

export interface FilaDeMesero {
  readonly empleado_id: string | null;
  readonly nombre: string | null;
  readonly ventas: string;
  readonly propina: string;
}

/** `sum(bigint)` vuelve de Postgres como texto: se reconstruye sin pasar por `number`. */
export function aRenglon(fila: FilaDeMetodo): RenglonDePago {
  return {
    metodo: fila.metodo,
    montoCentavos: BigInt(fila.ventas),
    propinaCentavos: BigInt(fila.propinas),
  };
}

export function aMesero(fila: FilaDeMesero): PropinaDeMesero {
  return {
    meseroId: fila.empleado_id,
    meseroNombre: etiquetaDeMesero(fila.nombre),
    propinaCentavos: fila.propina,
    numeroVentas: Number(fila.ventas),
  };
}
