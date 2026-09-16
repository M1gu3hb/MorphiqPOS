import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-040 · La ficha del cliente.
 *
 * ── «La deuda transversal más cara del proyecto» ─────────────────────────
 * Lo dicen tres carpetas con esas palabras. La tabla `clientes` existe desde la
 * migración 002 y hasta hoy NO HAY COMANDOS: no hay forma de dar de alta a una
 * persona ni de corregirle el teléfono. Sin cliente no hay fiado en abarrotes,
 * no hay crédito en ferretería, y en estética no hay cita, ni expediente, ni
 * cartera, ni recordatorio.
 *
 * ── Por qué UN módulo para los tres giros ────────────────────────────────
 * Porque es la misma persona con distintos campos alrededor. Escribir un alta
 * por modelo daría tres sitios donde se crea un cliente, tres validaciones de
 * teléfono y tres formas de decir que ya existe. Lo que cambia entre giros
 * —la fórmula del pelo, el límite de crédito, la libreta del fiado— cuelga de
 * la ficha y vive en su propio bloque.
 *
 * ── El teléfono es la llave real, y por eso se normaliza ─────────────────
 * Nadie busca a un cliente por su identificador: lo busca por el teléfono, o
 * por el nombre a medias. `55 1234 5678`, `5512345678` y `+52 55 1234 5678` son
 * la misma persona, y guardarlos tal cual crea tres fichas de la señora de la
 * esquina — que es exactamente cómo el saldo de fiado se parte en tres y deja
 * de cuadrar.
 *
 * ── Los campos fiscales se aceptan y NO se usan ──────────────────────────
 * El CFDI está bloqueado por la decisión P-02. El RFC, el régimen y el código
 * postal se capturan porque la migración 162 ya les hizo sitio: meterlos
 * después obligaría a migrar una tabla con datos vivos dentro, y eso es el
 * doble de trabajo por la mitad de valor.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Diez dígitos mexicanos, o los doce con lada de país. Nada más. */
const TELEFONO = /^\d{10}$|^52\d{10}$/;
const RFC = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

/**
 * Deja el teléfono en sus dígitos, sin lada de país.
 *
 * `55 1234 5678`, `(55) 1234-5678` y `+52 55 1234 5678` acaban iguales. Sin
 * esto, la misma señora entra tres veces al catálogo de clientes y su saldo de
 * fiado se parte en tres.
 */
export function normalizarTelefono(bruto: string): string {
  const digitos = bruto.replace(/\D/g, '');
  return digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos;
}

export const entradaAltaCliente = z.object({
  nombre: z.string().trim().min(2).max(120),
  telefono: z.string().trim().max(30).nullable().default(null),
  correo: z.email().nullable().default(null),
  /** Cómo se le dice en voz alta. No es un apodo: evita gritar el nombre completo. */
  comoSeLlama: z.string().trim().max(60).nullable().default(null),
  direccion: z.string().trim().max(200).nullable().default(null),
  notas: z.string().trim().max(500).nullable().default(null),
  /** Fiscales. Se guardan y no se usan: el CFDI está bloqueado por P-02. */
  rfc: z.string().trim().toUpperCase().max(13).nullable().default(null),
  regimenFiscal: z.string().trim().max(10).nullable().default(null),
  codigoPostal: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'El código postal son cinco dígitos.')
    .nullable()
    .default(null),
});

export const entradaEditarCliente = z.object({
  clienteId: z.uuid(),
  nombre: z.string().trim().min(2).max(120).optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  correo: z.email().nullable().optional(),
  comoSeLlama: z.string().trim().max(60).nullable().optional(),
  direccion: z.string().trim().max(200).nullable().optional(),
  notas: z.string().trim().max(500).nullable().optional(),
  notasCobranza: z.string().trim().max(500).nullable().optional(),
  /** Qué día del mes paga. De 1 a 28: el 31 no existe en febrero. */
  diaPago: z.number().int().min(1).max(28).nullable().optional(),
  /** Y qué día de la semana pasa, para el fiado de la tiendita. 0 = domingo. */
  diaPagoSemana: z.number().int().min(0).max(6).nullable().optional(),
});

export interface ResultadoCliente {
  readonly clienteId: string;
  readonly nombre: string;
}

function exigirRfc(rfc: string | null): void {
  if (rfc !== null && rfc.length > 0 && !RFC.test(rfc)) {
    // No se valida el dígito verificador —eso lo hace el PAC— pero sí la forma:
    // un RFC de nueve caracteres es un tecleo, y se descubre al facturar.
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Ese RFC no tiene forma de RFC: 12 posiciones para moral, 13 para física.',
    );
  }
}

function telefonoValido(bruto: string | null): string | null {
  if (bruto === null || bruto.trim().length === 0) return null;
  const limpio = normalizarTelefono(bruto);
  if (!TELEFONO.test(limpio) && limpio.length !== 10) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'El teléfono son diez dígitos, con o sin lada de país.',
    );
  }
  return limpio;
}

export const altaCliente = definirComando<Transaccion, typeof entradaAltaCliente, ResultadoCliente>(
  {
    nombre: 'cliente.alta',
    entidad: 'cliente',
    escribe: true,
    roles: [...MOSTRADOR],
    paquetes: PAQUETES_TODOS,
    entrada: entradaAltaCliente,
    async ejecutar(ctx, entrada) {
      const { organizacionId } = ctx.ambito;
      exigirRfc(entrada.rfc);
      const telefono = telefonoValido(entrada.telefono);

      // Con teléfono se comprueba el duplicado ANTES de insertar, y se devuelve
      // el que ya existe en vez de fallar: en el mostrador, «ese cliente ya
      // existe» es un callejón sin salida —hay alguien esperando—, y lo que hace
      // falta es seguir con la ficha que ya hay.
      if (telefono !== null) {
        const existente = await ctx.paso('buscar_por_telefono', () =>
          ctx.tx
            .selectFrom('clientes')
            .select(['id', 'nombre'])
            .where('organizacion_id', '=', organizacionId)
            .where('telefono', '=', telefono)
            .executeTakeFirst(),
        );
        if (existente !== undefined) {
          ctx.auditar({ entidadId: existente.id, payload: { reutilizado: true } });
          return { clienteId: existente.id, nombre: existente.nombre };
        }
      }

      const cliente = await ctx.paso('crear_cliente', () =>
        ctx.tx
          .insertInto('clientes')
          .values({
            organizacion_id: organizacionId,
            nombre: entrada.nombre,
            telefono,
            correo: entrada.correo,
            notas: entrada.notas,
            como_se_llama: entrada.comoSeLlama,
            direccion: entrada.direccion,
            rfc: entrada.rfc,
            regimen_fiscal: entrada.regimenFiscal,
            codigo_postal: entrada.codigoPostal,
            created_at: ctx.ahora,
            updated_at: ctx.ahora,
          })
          .returning('id')
          .executeTakeFirstOrThrow(),
      );

      ctx.auditar({ entidadId: cliente.id, payload: { nombre: entrada.nombre } });
      return { clienteId: cliente.id, nombre: entrada.nombre };
    },
  },
);

async function exigirCliente(
  ctx: ContextoComando<Transaccion>,
  clienteId: string,
): Promise<{ readonly nombre: string }> {
  const fila = await ctx.paso('leer_cliente', () =>
    ctx.tx
      .selectFrom('clientes')
      .select(['id', 'nombre'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      .where('id', '=', clienteId)
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese cliente no existe en este negocio.');
  }
  return fila;
}

export const editarCliente = definirComando<
  Transaccion,
  typeof entradaEditarCliente,
  ResultadoCliente
>({
  nombre: 'cliente.editar',
  entidad: 'cliente',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEditarCliente,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const actual = await exigirCliente(ctx, entrada.clienteId);

    // Sólo lo que VIENE se toca. Un objeto con todos los campos convertiría
    // cada edición de teléfono en un borrado de las notas de cobranza, que es
    // el defecto clásico de una pantalla que manda el formulario entero.
    const cambios: Record<string, unknown> = { updated_at: ctx.ahora };
    if (entrada.nombre !== undefined) cambios['nombre'] = entrada.nombre;
    if (entrada.telefono !== undefined) cambios['telefono'] = telefonoValido(entrada.telefono);
    if (entrada.correo !== undefined) cambios['correo'] = entrada.correo;
    if (entrada.comoSeLlama !== undefined) cambios['como_se_llama'] = entrada.comoSeLlama;
    if (entrada.direccion !== undefined) cambios['direccion'] = entrada.direccion;
    if (entrada.notas !== undefined) cambios['notas'] = entrada.notas;
    if (entrada.notasCobranza !== undefined) cambios['notas_cobranza'] = entrada.notasCobranza;
    if (entrada.diaPago !== undefined) cambios['dia_pago'] = entrada.diaPago;
    if (entrada.diaPagoSemana !== undefined) cambios['dia_pago_semana'] = entrada.diaPagoSemana;

    if (Object.keys(cambios).length === 1) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'No se mandó ningún campo que cambiar.');
    }

    await ctx.paso('editar_cliente', () =>
      ctx.tx
        .updateTable('clientes')
        .set(cambios)
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.clienteId)
        .execute(),
    );

    const nombre = entrada.nombre ?? actual.nombre;
    ctx.auditar({ entidadId: entrada.clienteId, payload: { campos: Object.keys(cambios) } });
    return { clienteId: entrada.clienteId, nombre };
  },
});
