import 'server-only';

import { randomBytes } from 'node:crypto';

import { PAQUETES_PREPARACION } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { mesaOperable } from './datos.ts';

const ROLES_DIRECCION = ['dueno', 'administrador', 'gerente'] as const;

export const entradaRotarQr = z.object({
  mesaId: z.uuid(),
});

export interface ResultadoRotarQr {
  readonly mesaId: string;
  readonly qrToken: string;
}

/**
 * Sustituye la credencial pública de una mesa.
 *
 * El cliente sólo elige qué mesa quiere rotar. El servidor comprueba que
 * pertenece al negocio de la sesión y genera la credencial con entropía
 * criptográfica. El token no entra en auditoría porque concede acceso al
 * portal público mientras esté activo.
 */
export const rotarQr = definirComando<Transaccion, typeof entradaRotarQr, ResultadoRotarQr>({
  nombre: 'restaurante.rotar_qr',
  entidad: 'mesa',
  escribe: true,
  roles: [...ROLES_DIRECCION],
  paquetes: PAQUETES_PREPARACION,
  entrada: entradaRotarQr,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const mesa = await ctx.paso('cargar_mesa', () =>
      mesaOperable(ctx.tx, organizacionId, entrada.mesaId),
    );
    const qrToken = randomBytes(24).toString('base64url');

    await ctx.paso('guardar_token_qr', () =>
      ctx.tx
        .updateTable('mesas')
        .set({ qr_token: qrToken, updated_at: ctx.ahora })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', mesa.id)
        .execute(),
    );

    ctx.auditar({ entidadId: mesa.id, payload: { rotado: true } });
    return { mesaId: mesa.id, qrToken };
  },
});
