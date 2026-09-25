import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { entradaCrearProducto } from '../catalogo/esquemas.ts';
import { valoresProducto } from '../catalogo/productos.ts';
import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * `servicios.guardar` — el servicio del salón con sus TIEMPOS y QUIÉN LO DA (F-415, F-423;
 * C.10 de la 2.4).
 *
 * ── Los tres defectos que esto cierra ────────────────────────────────────
 * 1. El catálogo de servicios publicaba en `catalogo.crear_producto` y
 *    `catalogo.actualizar_producto` un cuerpo que ninguno de los dos acepta —ni
 *    `precioVenta`, ni `tipoVenta`, ni los campos que la edición exige—: dar de alta o
 *    corregir un servicio contestaba 400 siempre.
 * 2. Aunque hubiera entrado, las cuatro duraciones se perdían: esos comandos no escriben
 *    la tabla `servicios`, y un servicio sin su fila no tiene tramos que agendar.
 * 3. Nadie escribía `servicios_profesional` —sólo la semilla—, y `agenda.agendar_cita`
 *    se niega («esa persona no da ese servicio») sin esa fila: un servicio nuevo NO se
 *    podía agendar con nadie.
 *
 * Un comando y una transacción: el producto (nombre y precio), sus tiempos y quién lo da
 * con su factor. Un servicio a medias —con precio y sin tiempos, o con tiempos y sin
 * nadie que lo dé— es justo lo que la agenda no sabe tratar.
 */

const DIRECCION = ['gerente', 'administrador', 'dueno'] as const;
const LECTURA = ['mesero', 'cajero', ...DIRECCION] as const;

const minutos = (minimo: number) => z.number().int().min(minimo).max(600);

export const entradaGuardarServicio = z
  .object({
    /** Nulo es alta. */
    servicioId: z.uuid().nullable().default(null),
    nombre: z.string().trim().min(1).max(160),
    precioCentavos: z.number().int().min(0).max(100_000_000),
    duracionActiva1Min: minutos(1),
    duracionPasivaMin: minutos(0),
    duracionActiva2Min: minutos(0),
    duracionCierreMin: z.number().int().min(0).max(240),
    pasivoIntercalable: z.boolean(),
    /**
     * Quién lo da, con su precio propio (nulo = el del catálogo) y su factor de duración
     * en puntos base: Karla hace el tinte en 80 minutos y Dany en 110. Ausente = no se
     * toca lo que ya había; la lista vacía = nadie (y entonces no se agenda).
     */
    profesionales: z
      .array(
        z.object({
          profesionalId: z.uuid(),
          precioCentavos: z.number().int().min(0).max(100_000_000).nullable().default(null),
          factorDuracionBp: z.number().int().min(2_500).max(40_000).default(10_000),
        }),
      )
      .max(60)
      .optional(),
  })
  .superRefine((valor, ctx) => {
    // El mismo `check` de la 131: un procesado sin terminado no existe, alguien enjuaga.
    if (valor.duracionPasivaMin > 0 && valor.duracionActiva2Min === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['duracionActiva2Min'],
        message: 'Si hay procesado, tiene que haber terminado.',
      });
    }
    const ids = (valor.profesionales ?? []).map((p) => p.profesionalId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['profesionales'], message: 'Una persona repetida.' });
    }
  });

export interface ResultadoServicio {
  readonly servicioId: string;
  readonly creado: boolean;
  readonly profesionales: number | null;
}

/** «350.00» a partir de 35000: la entrada del catálogo habla en pesos de texto. */
function pesosDe(centavos: number): string {
  return `${String(Math.trunc(centavos / 100))}.${String(centavos % 100).padStart(2, '0')}`;
}

export const guardarServicio = definirComando<
  Transaccion,
  typeof entradaGuardarServicio,
  ResultadoServicio
>({
  nombre: 'servicios.guardar',
  entidad: 'producto',
  escribe: true,
  roles: [...DIRECCION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaGuardarServicio,
  async ejecutar(ctx, entrada) {
    const organizacionId = ctx.ambito.organizacionId;
    const creado = entrada.servicioId === null;
    const servicioId =
      entrada.servicioId === null
        ? await darDeAlta(ctx, entrada.nombre, entrada.precioCentavos)
        : await corregir(ctx, entrada.servicioId, entrada.nombre, entrada.precioCentavos);

    const tiempos = {
      duracion_activa_1_min: entrada.duracionActiva1Min,
      duracion_pasiva_min: entrada.duracionPasivaMin,
      duracion_activa_2_min: entrada.duracionActiva2Min,
      duracion_cierre_min: entrada.duracionCierreMin,
      pasivo_intercalable: entrada.pasivoIntercalable,
    };
    await ctx.paso('guardar_tiempos', () =>
      ctx.tx
        .insertInto('servicios')
        .values({ producto_id: servicioId, organizacion_id: organizacionId, ...tiempos })
        .onConflict((oc) =>
          oc.column('producto_id').doUpdateSet({ ...tiempos, updated_at: ctx.ahora }),
        )
        .execute(),
    );

    if (entrada.profesionales !== undefined) {
      await asignar(ctx, servicioId, entrada.profesionales);
    }

    ctx.auditar({
      entidadId: servicioId,
      payload: {
        creado,
        nombre: entrada.nombre,
        profesionales: entrada.profesionales?.length ?? null,
      },
    });
    return { servicioId, creado, profesionales: entrada.profesionales?.length ?? null };
  },
});

type Contexto = ContextoComando<Transaccion>;

/** El producto del servicio, por la MISMA fila que arma el alta del catálogo. */
async function darDeAlta(ctx: Contexto, nombre: string, precioCentavos: number): Promise<string> {
  const producto = entradaCrearProducto.parse({
    nombre,
    precioVenta: pesosDe(precioCentavos),
    costoUnitario: '0',
    tipoVenta: 'servicio',
    unidadVenta: 'pieza',
    // Un servicio no descuenta inventario al venderse: su material sale de la cabina al
    // CERRARLO (`agenda.cerrar_servicio`), por su receta.
    estrategiaConsumo: 'ninguno',
    permiteVentaSinStock: true,
    stockMinimo: '0',
    visibleEnPos: true,
  });
  const fila = await ctx.paso('insertar_producto', () =>
    ctx.tx
      .insertInto('productos')
      .values(valoresProducto(ctx.ambito.organizacionId, producto))
      .returning('id')
      .executeTakeFirstOrThrow(),
  );
  return fila.id;
}

async function corregir(
  ctx: Contexto,
  servicioId: string,
  nombre: string,
  precioCentavos: number,
): Promise<string> {
  const fila = await ctx.paso('corregir_producto', () =>
    ctx.tx
      .updateTable('productos')
      .set({ nombre, precio_venta_centavos: BigInt(precioCentavos), updated_at: ctx.ahora })
      .where('id', '=', servicioId)
      .where('organizacion_id', '=', ctx.ambito.organizacionId)
      // Sólo un SERVICIO: este comando no es la puerta trasera para renombrar un tinte
      // de anaquel.
      .where('tipo_venta', '=', 'servicio')
      .returning('id')
      .executeTakeFirst(),
  );
  if (fila === undefined) {
    throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese servicio no está en el catálogo.');
  }
  return fila.id;
}

/**
 * Quién lo da: se REEMPLAZA la lista entera, como la ve quien la edita. Cada persona tiene
 * que ser de este negocio y estar activa; una ajena o dada de baja no entra en la agenda.
 */
async function asignar(
  ctx: Contexto,
  servicioId: string,
  profesionales: NonNullable<z.output<typeof entradaGuardarServicio>['profesionales']>,
): Promise<void> {
  const organizacionId = ctx.ambito.organizacionId;
  const ids = profesionales.map((p) => p.profesionalId);
  if (ids.length > 0) {
    const propias = await ctx.paso('leer_profesionales', () =>
      ctx.tx
        .selectFrom('profesionales')
        .select('id')
        .where('organizacion_id', '=', organizacionId)
        .where('activo', '=', true)
        .where('id', 'in', ids)
        .execute(),
    );
    if (propias.length !== ids.length) {
      throw new ErrorDominio(
        'CATALOGO_INVALIDO',
        'Alguna de esas personas no es de este salón o ya no está activa.',
      );
    }
  }
  await ctx.paso('quitar_asignaciones', () =>
    ctx.tx
      .deleteFrom('servicios_profesional')
      .where('organizacion_id', '=', organizacionId)
      .where('servicio_id', '=', servicioId)
      .execute(),
  );
  if (profesionales.length === 0) return;
  await ctx.paso('asignar', () =>
    ctx.tx
      .insertInto('servicios_profesional')
      .values(
        profesionales.map((p) => ({
          servicio_id: servicioId,
          profesional_id: p.profesionalId,
          organizacion_id: organizacionId,
          precio_centavos: p.precioCentavos === null ? null : BigInt(p.precioCentavos),
          factor_duracion_bp: p.factorDuracionBp,
        })),
      )
      .execute(),
  );
}

export const entradaAsignaciones = z.object({ servicioId: z.uuid().nullable().default(null) });

export interface AsignacionDeServicio {
  readonly servicioId: string;
  readonly profesionalId: string;
  /** Nulo: cobra el precio del catálogo. */
  readonly precioCentavos: string | null;
  readonly factorDuracionBp: number;
}

/**
 * `servicios.asignaciones` — quién da cada servicio, con su precio propio y su factor.
 * El puente no la sirve: la tabla no tiene `id` propio, su llave es la pareja.
 */
export const asignacionesDeServicios = definirComando<
  Transaccion,
  typeof entradaAsignaciones,
  { readonly asignaciones: readonly AsignacionDeServicio[] }
>({
  nombre: 'servicios.asignaciones',
  entidad: 'producto',
  escribe: false,
  roles: [...LECTURA],
  paquetes: PAQUETES_TODOS,
  entrada: entradaAsignaciones,
  async ejecutar(ctx, entrada) {
    let consulta = ctx.tx
      .selectFrom('servicios_profesional')
      .select(['servicio_id', 'profesional_id', 'precio_centavos', 'factor_duracion_bp'])
      .where('organizacion_id', '=', ctx.ambito.organizacionId);
    if (entrada.servicioId !== null)
      consulta = consulta.where('servicio_id', '=', entrada.servicioId);
    const filas = await ctx.paso('leer_asignaciones', () => consulta.execute());
    return {
      asignaciones: filas.map((f) => ({
        servicioId: f.servicio_id,
        profesionalId: f.profesional_id,
        precioCentavos: f.precio_centavos === null ? null : f.precio_centavos.toString(),
        factorDuracionBp: f.factor_duracion_bp,
      })),
    };
  },
});
