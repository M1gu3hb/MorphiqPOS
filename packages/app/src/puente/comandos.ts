import 'server-only';

import { PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { guardarConfiguracionParcial } from './configuracion.ts';
import { escribir } from './escribir.ts';

/**
 * Las escrituras del puente, como COMANDO (E3-4).
 *
 * Aunque sea una escritura simple de catálogo, pasa por el envoltorio: rol
 * comprobado en el servidor, transacción, clave de idempotencia y auditoría.
 * «Ocultar un botón no es autorización» — la comprobación vive aquí, no en la
 * pantalla que decide si dibuja el botón.
 *
 * Su frontend hace 359 llamadas y la mayoría son lecturas; las escrituras
 * simples que pasan por aquí son las de catálogo. Las catorce operaciones
 * transaccionales de `F1-01` §6 tienen cada una su comando dedicado y el
 * puente las rechaza explícitamente.
 */

const entradaEscribir = z.object({
  entidad: z.string().min(1).max(60),
  operacion: z.enum(['create', 'update', 'delete']),
  id: z.string().min(1).max(64).optional(),
  /**
   * El cuerpo llega sin tipar a propósito: cada entidad valida contra su mapa,
   * que es la única lista blanca. Un `z.record` aquí sólo repetiría eso peor.
   */
  datos: z.record(z.string(), z.unknown()).optional(),
});

export type EntradaEscribir = z.infer<typeof entradaEscribir>;

/** Quién puede escribir catálogo. Cocina y mesero, no. */
const ROLES_CATALOGO = ['dueno', 'administrador', 'gerente'] as const;

export const escribirDatos = definirComando<
  Transaccion,
  typeof entradaEscribir,
  Record<string, unknown>
>({
  nombre: 'puente.escribir',
  entidad: 'puente',
  escribe: true,
  roles: [...ROLES_CATALOGO],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEscribir,
  async ejecutar(ctx, entrada) {
    const ambito = {
      organizacionId: ctx.ambito.organizacionId,
      sucursalId: ctx.ambito.sucursalId,
      rol: ctx.ambito.rol,
    };

    // `ConfiguracionNegocio` no es una tabla con columnas: es un documento
    // JSON con versión más el nombre del negocio. Tiene su propio camino.
    if (entrada.entidad === 'ConfiguracionNegocio') {
      if (entrada.operacion !== 'update') {
        throw new Error('La configuración del negocio sólo se actualiza; no se crea ni se borra.');
      }
      const guardada = await ctx.paso('guardar_configuracion', () =>
        guardarConfiguracionParcial(ctx.tx, ambito.organizacionId, entrada.datos ?? {}),
      );
      ctx.auditar({
        entidadId: typeof guardada['id'] === 'string' ? guardada['id'] : null,
        // Los NOMBRES de los campos tocados, nunca sus valores: la auditoría se
        // consulta desde la aplicación y no puede volverse una segunda copia
        // de lo que se guardó.
        payload: { entidad: entrada.entidad, campos: Object.keys(entrada.datos ?? {}) },
      });
      return guardada;
    }

    const fila = await ctx.paso('escribir', () =>
      escribir(ctx.tx, ambito, {
        entidad: entrada.entidad,
        operacion: entrada.operacion,
        ...(entrada.id === undefined ? {} : { id: entrada.id }),
        ...(entrada.datos === undefined ? {} : { datos: entrada.datos }),
      }),
    );
    ctx.auditar({
      entidadId: typeof fila['id'] === 'string' ? fila['id'] : null,
      payload: {
        entidad: entrada.entidad,
        operacion: entrada.operacion,
        campos: Object.keys(entrada.datos ?? {}),
      },
    });
    return fila;
  },
});
