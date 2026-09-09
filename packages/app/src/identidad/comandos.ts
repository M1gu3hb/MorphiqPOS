import 'server-only';

import { ErrorDominio, validarEntorno } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { VIGENCIA_CODIGO_MINUTOS } from './enrolar.ts';
import { FORMA_PIN, hashearCodigo, hashearPin, nuevoCodigoDeEnrolamiento } from './pin.ts';

/**
 * Administrar accesos desde la aplicación (F1.1-C-05 y C-06).
 *
 * `db:bootstrap` crea el primer dueño y no vuelve a usarse. A partir de ahí,
 * dar de alta a un cajero o mover una terminal a otra tableta tiene que poder
 * hacerse desde la pantalla — si no, cada cambio de plantilla exige una consola.
 *
 * Todo pasa por el envoltorio: rol comprobado en el servidor, transacción,
 * idempotencia y auditoría. Ocultar el botón no es autorización.
 *
 * **Ninguna respuesta contiene el PIN.** El código de enrolamiento sí se
 * devuelve, porque hay que leerlo en voz alta; en la base queda su hash y
 * caduca en quince minutos.
 */

const SOLO_MANDOS = ['dueno', 'administrador'] as const;

/**
 * La pimienta se lee por invocación, no al cargar el módulo.
 *
 * Importar este archivo durante el build no debe exigir que el secreto exista;
 * ejecutarlo, sí. Es la misma razón por la que las rutas validan el entorno
 * dentro del manejador.
 */
function pimienta(): string {
  return validarEntorno(process.env).PIN_PEPPER;
}
const TODOS = ['tienda', 'ferreteria', 'farmacia', 'cafeteria', 'restaurante'] as const;

export const entradaEstablecerPin = z.object({
  /** A quién. `empleoId` y no `identidadId`: es lo que ve quien administra. */
  empleado: z.uuid(),
  pin: z.string().regex(FORMA_PIN, 'El PIN son de 4 a 8 dígitos.'),
});

export const establecerPin = definirComando<
  Transaccion,
  typeof entradaEstablecerPin,
  { readonly establecido: true; readonly rotado: boolean }
>({
  nombre: 'identidad.establecer_pin',
  entidad: 'credencial_pin',
  escribe: true,
  roles: [...SOLO_MANDOS],
  paquetes: [...TODOS],
  entrada: entradaEstablecerPin,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // La identidad se busca DENTRO de la organización de quien manda. Sin este
    // filtro, conocer un uuid ajeno bastaría para ponerle PIN al cajero de otro
    // negocio: es BOLA de manual (gate PRS §11).
    const objetivo = await ctx.paso('localizar_empleado', () =>
      ctx.tx
        .selectFrom('empleos')
        .innerJoin('personas', 'personas.id', 'empleos.persona_id')
        .innerJoin('identidades', 'identidades.persona_id', 'personas.id')
        .select(['identidades.id as identidadId', 'personas.nombre as nombre'])
        .where('empleos.id', '=', entrada.empleado)
        .where('empleos.organizacion_id', '=', organizacionId)
        .where('empleos.activo', '=', true)
        .where('identidades.activa', '=', true)
        .executeTakeFirst(),
    );

    if (objetivo === undefined) {
      throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Ese empleado no existe o está dado de baja.');
    }

    const hash = await hashearPin(entrada.pin, pimienta());

    const previa = await ctx.tx
      .selectFrom('credenciales_pin')
      .select('id')
      .where('identidad_id', '=', objetivo.identidadId)
      .executeTakeFirst();

    if (previa === undefined) {
      await ctx.paso('crear_credencial', () =>
        ctx.tx
          .insertInto('credenciales_pin')
          .values({
            identidad_id: objetivo.identidadId,
            pin_hash: hash,
            algoritmo: 'argon2id',
          })
          .execute(),
      );
    } else {
      await ctx.paso('rotar_credencial', () =>
        ctx.tx
          .updateTable('credenciales_pin')
          .set({
            pin_hash: hash,
            algoritmo: 'argon2id',
            // Poner un PIN nuevo levanta el bloqueo: si no, quien se pasó de
            // intentos seguiría fuera con la credencial recién cambiada.
            intentos_fallidos: 0,
            bloqueada_hasta: null,
            rotada_en: ctx.ahora,
          })
          .where('id', '=', previa.id)
          .execute(),
      );
    }

    // El payload lleva a quién y cuándo. NUNCA el PIN ni su hash: la auditoría
    // se consulta desde la aplicación y sería una segunda copia de la credencial.
    ctx.auditar({
      entidadId: objetivo.identidadId,
      payload: {
        empleoId: entrada.empleado,
        nombre: objetivo.nombre,
        rotado: previa !== undefined,
      },
    });

    return { establecido: true as const, rotado: previa !== undefined };
  },
});

export const entradaGenerarCodigo = z.object({
  terminal: z.uuid(),
});

export interface CodigoGenerado {
  readonly codigo: string;
  readonly expiraEn: string;
  readonly terminal: string;
  readonly reemplazaDispositivo: boolean;
}

export const generarCodigoDeTerminal = definirComando<
  Transaccion,
  typeof entradaGenerarCodigo,
  CodigoGenerado
>({
  nombre: 'identidad.generar_codigo',
  entidad: 'terminal',
  escribe: true,
  roles: [...SOLO_MANDOS],
  paquetes: [...TODOS],
  entrada: entradaGenerarCodigo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const terminal = await ctx.paso('localizar_terminal', () =>
      ctx.tx
        .selectFrom('terminales')
        .select(['id', 'nombre', 'device_token_hash as dispositivo'])
        .where('id', '=', entrada.terminal)
        .where('organizacion_id', '=', organizacionId)
        .where('activa', '=', true)
        .executeTakeFirst(),
    );

    if (terminal === undefined) {
      throw new ErrorDominio('ACCESO_NO_ENCONTRADO', 'Esa terminal no existe o está desactivada.');
    }

    const codigo = nuevoCodigoDeEnrolamiento();
    const expiraEn = new Date(ctx.ahora.getTime() + VIGENCIA_CODIGO_MINUTOS * 60_000);

    // Generar un código SUELTA el dispositivo actual. Es lo que hace que
    // «se me perdió la tableta» tenga solución sin entrar a la base: el
    // aparato viejo deja de valer en el momento en que se pide el código nuevo.
    await ctx.paso('guardar_codigo', () =>
      ctx.tx
        .updateTable('terminales')
        .set({
          codigo_enrolamiento_hash: hashearCodigo(codigo, pimienta()),
          codigo_expira_en: expiraEn,
          device_token_hash: null,
          enrolada_en: null,
        })
        .where('id', '=', terminal.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: terminal.id,
      payload: {
        terminal: terminal.nombre,
        expiraEn: expiraEn.toISOString(),
        reemplazaDispositivo: terminal.dispositivo !== null,
      },
    });

    return {
      codigo,
      expiraEn: expiraEn.toISOString(),
      terminal: terminal.nombre,
      reemplazaDispositivo: terminal.dispositivo !== null,
    };
  },
});
