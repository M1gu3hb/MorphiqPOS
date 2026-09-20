import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import type { ContextoComando } from '../definicion.ts';

/**
 * EL MOTIVO DE UN MOVIMIENTO DE STOCK, COMPROBADO ANTES DE ESCRIBIRLO.
 *
 * ── Por qué esto existe ──────────────────────────────────────────────────
 * `movimientos_stock.motivo` apunta a `motivos_merma.clave` desde la 062, y eso
 * está bien: los motivos crecen con cada giro y una tabla es lo que permite
 * añadir uno con una fila. Lo que faltaba era comprobarlo en el comando.
 *
 * Sin esta comprobación, un motivo que no existe llega a Postgres, la foránea lo
 * rechaza con `23503` y **la transacción entera se aborta**: el conteo no cierra,
 * la merma no se declara, el ajuste no se guarda. Y el operador ve «Algo falló de
 * nuestro lado», que no le dice qué escribir distinto. Siete comandos estaban así
 * —metían frases donde la base pide claves— y ninguna prueba lo veía, porque la
 * base falsa no tiene foráneas.
 *
 * Comprobarlo aquí convierte un error de base en un error de dominio con el nombre
 * del motivo dentro, que es algo que se puede leer y corregir.
 *
 * ── Y por qué NO se valida con un `z.enum` ───────────────────────────────
 * Porque la lista vive en la base y crece por giro: un `enum` en el esquema de
 * entrada obligaría a tocar el código cada vez que una ferretería añade un motivo
 * suyo, que es exactamente lo que la 062 evitó al hacerlo tabla.
 */
export async function exigirMotivoDeMerma(
  ctx: ContextoComando<Transaccion>,
  clave: string | null,
): Promise<string | null> {
  // Nulo es legítimo y es el caso más común: un traspaso, una apertura de cabina o
  // un consumo de servicio no tienen motivo de MERMA. Su explicación va en `nota`.
  if (clave === null || clave === '') return null;

  const fila = await ctx.paso('validar_motivo', () =>
    ctx.tx
      .selectFrom('motivos_merma')
      .select(['clave'])
      .where('clave', '=', clave)
      .where('activo', '=', true)
      .executeTakeFirst(),
  );

  if (fila === undefined) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      `Ese motivo no está dado de alta: «${clave}». Los motivos de merma se dan de alta una vez ` +
        'y se eligen de la lista.',
      { motivo: clave },
    );
  }
  return clave;
}
