import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-146 · La garantía que se mandó al proveedor y no ha vuelto.
 *
 * ── Entre $20,000 y $60,000 al año, y nadie lleva la cuenta ──────────────
 * El cliente trae la pieza fallada, se le repone del anaquel ese mismo día
 * —porque si no, se va a la ferretería de enfrente— y la fallada se manda al
 * proveedor. Lo que pasa después no lo sabe nadie: se apunta en una libreta o
 * no se apunta. Al año el negocio ha regalado material por el equivalente a un
 * sueldo y no puede ni decir cuánto.
 *
 * ── Recibirla NO es una nota de crédito ─────────────────────────────────
 * Es una pieza que sale del inventario vendible y queda en un limbo hasta que
 * el proveedor conteste. Tratarla como devolución de venta devolvería el dinero
 * que el cliente pagó —que nadie le devolvió— y sumaría al anaquel una pieza
 * que no sirve.
 *
 * ── El ticket NO es obligatorio, y eso es una decisión ──────────────────
 * Media ferretería acepta la garantía con la caja y sin ticket. Exigirlo es
 * perder al cliente para ahorrarse una columna nula, y el que se va con una
 * llave rota no vuelve por el cemento.
 *
 * ── Y «se la cambié» no es «se la debo» ─────────────────────────────────
 * `repuesta_al_cliente` separa las dos, porque para el cliente son dos negocios
 * distintos y para el inventario también: en una salió una pieza buena del
 * anaquel, en la otra no.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;
const DIRECCION = ['gerente', 'administrador', 'dueno'] as const;

export const entradaRecibirGarantia = z.object({
  proveedorId: z.uuid(),
  productoId: z.uuid(),
  piezas: z.number().int().min(1).max(1_000),
  falla: z.string().trim().min(3).max(300),
  /** La venta original CUANDO SE ENCUENTRA. Nunca obligatoria. */
  ordenId: z.uuid().nullable().default(null),
  clienteId: z.uuid().nullable().default(null),
  /** `true` cuando se le dio una buena del anaquel ese mismo día. */
  repuestaAlCliente: z.boolean().default(true),
  almacenId: z.uuid(),
});

export const entradaResolverGarantia = z.object({
  garantiaId: z.uuid(),
  /** `enviada` al mandarla · las otras tres la cierran. */
  estado: z.enum(['enviada', 'repuesta', 'rechazada', 'abonada']),
  folioProveedor: z.string().trim().max(40).nullable().default(null),
  resolucion: z.string().trim().max(300).nullable().default(null),
});

export const entradaGarantiasPendientes = z.object({
  proveedorId: z.uuid().nullable().default(null),
});

export interface ResultadoGarantia {
  readonly garantiaId: string;
  readonly estado: string;
  readonly valorEnLimboCentavos: string;
  /** `true` si salió una pieza buena del anaquel para el cliente. */
  readonly repuestaAlCliente: boolean;
}

export interface GarantiaPendiente {
  readonly garantiaId: string;
  readonly proveedorId: string;
  readonly productoId: string;
  readonly piezas: number;
  readonly estado: string;
  readonly valorCentavos: string;
  readonly diasEsperando: number;
}

export interface ResultadoPendientes {
  readonly pendientes: readonly GarantiaPendiente[];
  readonly totalCentavos: string;
  /** Lo más viejo que sigue sin respuesta. Es el número de la conversación. */
  readonly diasDelMasViejo: number;
}

const MS_POR_DIA = 86_400_000;

export const recibirGarantia = definirComando<
  Transaccion,
  typeof entradaRecibirGarantia,
  ResultadoGarantia
>({
  nombre: 'inventario.recibir_garantia',
  entidad: 'garantia',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRecibirGarantia,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'costo_unitario_centavos', 'insumo_base_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }

    const proveedor = await ctx.paso('leer_proveedor', () =>
      ctx.tx
        .selectFrom('proveedores')
        .select(['id', 'nombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.proveedorId)
        .executeTakeFirst(),
    );
    if (proveedor === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese proveedor no existe en este negocio.');
    }

    // El costo se CONGELA al recibirla. El proveedor puede subir el precio
    // mañana y lo que está en limbo vale lo que valía el día que salió.
    const costo = producto.costo_unitario_centavos;

    const garantia = await ctx.paso('recibir', () =>
      ctx.tx
        .insertInto('garantias_proveedor')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          proveedor_id: entrada.proveedorId,
          producto_id: entrada.productoId,
          orden_id: entrada.ordenId,
          cliente_id: entrada.clienteId,
          piezas: entrada.piezas,
          costo_unitario_centavos: costo,
          falla: entrada.falla,
          estado: 'recibida',
          recibida_en: ctx.ahora,
          repuesta_al_cliente: entrada.repuestaAlCliente,
          empleado_id: empleoId,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // La pieza buena SALE del anaquel cuando se le repuso al cliente. Si sólo
    // se le recibió la fallada y se le prometió llamar, no salió nada y sumar
    // una salida aquí dejaría el inventario corto para siempre.
    const insumoId = producto.insumo_base_id;
    if (entrada.repuestaAlCliente && insumoId !== null) {
      await ctx.paso('salida_por_garantia', () =>
        ctx.tx
          .insertInto('movimientos_stock')
          .values({
            organizacion_id: organizacionId,
            almacen_id: entrada.almacenId,
            insumo_id: insumoId,
            tipo: 'garantia_proveedor',
            cantidad: `-${entrada.piezas}`,
            unidad: 'pieza',
            costo_unitario_centavos: costo,
            referencia_tipo: 'garantia',
            referencia_id: garantia.id,
            empleado_id: empleoId,
            // La clave va en `motivo` —imputable al PROVEEDOR, que es de donde
            // sale la reclamación— y el nombre del material en `nota`: la frase
            // completa en `motivo` reventaba la foránea y con ella la reposición.
            motivo: 'reposicion_garantia',
            nota: `reposición al cliente · ${producto.nombre}`,
            created_at: ctx.ahora,
          })
          .execute(),
      );
    }

    const valor = costo * BigInt(entrada.piezas);
    ctx.auditar({
      entidadId: garantia.id,
      payload: {
        proveedorId: entrada.proveedorId,
        piezas: entrada.piezas,
        valorCentavos: valor.toString(),
      },
    });
    return {
      garantiaId: garantia.id,
      estado: 'recibida',
      valorEnLimboCentavos: valor.toString(),
      repuestaAlCliente: entrada.repuestaAlCliente,
    };
  },
});

export const resolverGarantia = definirComando<
  Transaccion,
  typeof entradaResolverGarantia,
  ResultadoGarantia
>({
  nombre: 'inventario.resolver_garantia',
  entidad: 'garantia',
  escribe: true,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaResolverGarantia,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const garantia = await ctx.paso('leer_garantia', () =>
      ctx.tx
        .selectFrom('garantias_proveedor')
        .select(['id', 'estado', 'piezas', 'costo_unitario_centavos', 'repuesta_al_cliente'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.garantiaId)
        .executeTakeFirst(),
    );
    if (garantia === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa garantía no existe en este negocio.');
    }
    if (garantia.estado !== 'recibida' && garantia.estado !== 'enviada') {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Esa garantía ya está «${garantia.estado}»: no se vuelve a resolver.`,
      );
    }

    const cierra = entrada.estado !== 'enviada';
    // Cerrar una garantía sin decir CÓMO acabó la deja contando como pendiente
    // para siempre, que es justo el número que esta tabla viene a arreglar.
    if (cierra && entrada.resolucion === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Cerrar una garantía sin decir cómo acabó la deja pendiente para siempre.',
      );
    }

    // Se escribe LITERAL en dos ramas y no con `estado: entrada.estado`. La
    // forma larga es deliberada: el contrato de «estado ⇒ columna» necesita ver
    // el valor escrito para saber que existe código que lo produce.
    if (cierra) {
      await ctx.paso('cerrar', () =>
        ctx.tx
          .updateTable('garantias_proveedor')
          .set({
            estado: entrada.estado,
            folio_proveedor: entrada.folioProveedor,
            resuelta_en: ctx.ahora,
            resolucion: entrada.resolucion,
            updated_at: ctx.ahora,
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.garantiaId)
          .execute(),
      );
    } else {
      await ctx.paso('enviar', () =>
        ctx.tx
          .updateTable('garantias_proveedor')
          .set({
            estado: 'enviada',
            folio_proveedor: entrada.folioProveedor,
            enviada_en: ctx.ahora,
            updated_at: ctx.ahora,
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.garantiaId)
          .execute(),
      );
    }

    const valor = garantia.costo_unitario_centavos * BigInt(garantia.piezas);
    ctx.auditar({ entidadId: entrada.garantiaId, payload: { estado: entrada.estado } });
    return {
      garantiaId: entrada.garantiaId,
      estado: entrada.estado,
      // Ya resuelta, lo que estaba en limbo deja de estarlo: el cero es el dato.
      valorEnLimboCentavos: cierra ? '0' : valor.toString(),
      repuestaAlCliente: garantia.repuesta_al_cliente,
    };
  },
});

export const garantiasPendientes = definirComando<
  Transaccion,
  typeof entradaGarantiasPendientes,
  ResultadoPendientes
>({
  nombre: 'inventario.garantias_pendientes',
  entidad: 'garantia',
  escribe: false,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaGarantiasPendientes,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    let consulta = ctx.tx
      .selectFrom('garantias_proveedor')
      .select([
        'id',
        'proveedor_id',
        'producto_id',
        'piezas',
        'estado',
        'costo_unitario_centavos',
        'recibida_en',
      ])
      .where('organizacion_id', '=', organizacionId)
      .where('estado', 'in', ['recibida', 'enviada'])
      .orderBy('recibida_en', 'asc');
    if (entrada.proveedorId !== null) {
      consulta = consulta.where('proveedor_id', '=', entrada.proveedorId);
    }

    const filas = await ctx.paso('leer_pendientes', () => consulta.execute());

    let total = 0n;
    let diasDelMasViejo = 0;
    const pendientes = filas.map((f) => {
      const valor = f.costo_unitario_centavos * BigInt(f.piezas);
      total += valor;
      const dias = Math.floor((ctx.ahora.getTime() - f.recibida_en.getTime()) / MS_POR_DIA);
      if (dias > diasDelMasViejo) diasDelMasViejo = dias;
      return {
        garantiaId: f.id,
        proveedorId: f.proveedor_id,
        productoId: f.producto_id,
        piezas: f.piezas,
        estado: f.estado,
        valorCentavos: valor.toString(),
        diasEsperando: dias,
      };
    });

    return { pendientes, totalCentavos: total.toString(), diasDelMasViejo };
  },
});
