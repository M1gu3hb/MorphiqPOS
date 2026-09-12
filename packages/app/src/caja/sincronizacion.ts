import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import { repoCaja, repoSincronizacion, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../comando.ts';

const ROLES_DE_CAJA = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaEncolarSincronizacionCorte = z.object({ corteId: z.uuid() });

export const encolarSincronizacionCorte = definirComando<
  Transaccion,
  typeof entradaEncolarSincronizacionCorte,
  { encolados: 2 }
>({
  nombre: 'caja.encolar_sincronizacion_corte',
  entidad: 'bitacora_sincronizacion',
  escribe: true,
  roles: [...ROLES_DE_CAJA],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEncolarSincronizacionCorte,
  async ejecutar(ctx, entrada) {
    const corte = await ctx.paso('comprobar_corte', () =>
      repoCaja.corteDeOrganizacion(ctx.tx, ctx.ambito.organizacionId, entrada.corteId),
    );
    if (corte?.estado !== 'cerrada') {
      throw new ErrorDominio('CORTE_NO_ENCONTRADO', 'Ese corte cerrado no existe en este negocio.');
    }

    await ctx.paso('encolar_sincronizacion', () =>
      repoSincronizacion.encolarCorte(ctx.tx, ctx.ambito.organizacionId, corte.id),
    );
    ctx.auditar({ entidadId: corte.id, payload: { encolados: 2 } });
    return { encolados: 2 as const };
  },
});
