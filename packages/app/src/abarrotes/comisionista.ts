/**
 * EL COMISIONISTA, SU OPERACIÓN Y SU SALDO · las tablas de la 095, conectadas.
 *
 * ── Lo que había, y por qué no servía de nada ─────────────────────────────
 * La migración 095 creó `comisionistas`, `operaciones_comision` y
 * `saldos_comisionista` —con sus checks, su RLS y sus comentarios— y **nadie las
 * tocaba**: ni un comando, ni una pantalla, ni un reporte. `abarrotes/Servicios`
 * tenía escrito, donde debería ir su consulta:
 *
 *     // EL SALDO DEL COMISIONISTA NO SE SIRVE…
 *     Promise.resolve([] as readonly SaldoDeComisionista[]),
 *
 * Era honesto y era el defecto: el panel «Saldo de recargas» y la lista de
 * operaciones del día no se llenaban nunca, en la pantalla cuyo trabajo entero es
 * ése. Tres tablas escritas y cero consumidores es exactamente lo que esta fase
 * vino a cerrar.
 *
 * ── Qué hace esto, y qué NO hace ──────────────────────────────────────────
 * Anota la operación con sus importes SEPARADOS —lo que entró al cajón, lo que es
 * del proveedor y lo que gana el negocio— y mueve el saldo. No toca la caja: de
 * eso se encarga `registrarComision`, que es quien tiene el movimiento gemelo.
 *
 * ── El signo del saldo, que es la única sutileza ──────────────────────────
 * Lo dice la 095: «firmado, y su significado depende del modelo». En PREPAGO —una
 * recarga— el negocio compró saldo por adelantado y cada venta lo GASTA, así que
 * baja. En POSPAGO —el recibo de la luz— el negocio recibe dinero ajeno que
 * entregará después, así que lo que debe SUBE. Un solo número con dos lecturas, y
 * por eso el modelo viaja con él.
 */
import 'server-only';

import { PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/** El tipo de operación, tal como lo declara `entradaRegistrarComision`. */
type TipoDeOperacion = 'recarga' | 'pago_servicio' | 'paqueteria' | 'retiro_efectivo';

export interface OperacionDeComisionEscrita {
  readonly operacionId: string;
  readonly comisionistaId: string;
  /** El saldo DESPUÉS de esta operación. Es lo que la pantalla enseña. */
  readonly saldoCentavos: bigint;
}

export interface DatosDeOperacion {
  readonly pasivoId: string;
  readonly sucursalId: string | null;
  readonly sesionCajaId: string | null;
  readonly tipo: TipoDeOperacion;
  readonly proveedorServicio: string;
  readonly referencia: string;
  readonly montoRecibidoCentavos: number;
  readonly comisionNegocioCentavos: number;
}

/**
 * El TIPO de comisionista que le toca a una operación.
 *
 * `comisionista_tipo_valido` sólo admite cinco, y los de la operación son otros
 * cuatro: la traducción vive aquí y no en una suposición.
 */
function tipoDeComisionista(tipo: TipoDeOperacion): string {
  if (tipo === 'recarga') return 'recarga';
  if (tipo === 'pago_servicio') return 'recibo';
  if (tipo === 'paqueteria') return 'paqueteria';
  return 'otro';
}

/**
 * PREPAGO es el saldo que se compra por adelantado; POSPAGO, el dinero ajeno que
 * se recibe y se entrega después. Una recarga es lo primero; un recibo, lo segundo.
 */
function modeloDe(tipo: TipoDeOperacion): 'prepago' | 'pospago' {
  return tipo === 'recarga' ? 'prepago' : 'pospago';
}

/**
 * El comisionista con ese nombre, y si no existe se da de alta.
 *
 * ── Por qué se crea solo, en vez de exigir que alguien lo dé de alta ──────
 * Porque el alta sería un tercer paso antes de poder cobrar una recarga, y la
 * pantalla se usa con el cliente enfrente: el tendero teclea «Telcel» y cobra. El
 * nombre es único por organización —lo exige la 095— así que la segunda recarga de
 * Telcel cae en la misma fila y el saldo se acumula donde debe.
 *
 * Lo que se guarda al crearlo es lo que la operación dice de él: su tipo, su
 * modelo y el porcentaje que se acaba de aplicar. Se puede corregir después; lo que
 * no se puede es cobrar sin él.
 */
async function comisionistaPorNombre(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeOperacion,
  comisionBp: number,
): Promise<{ readonly id: string; readonly modelo: string }> {
  const { organizacionId } = ctx.ambito;
  const nombre = datos.proveedorServicio.trim();

  const existente = await ctx.paso('buscar_comisionista', () =>
    ctx.tx
      .selectFrom('comisionistas')
      .select(['id', 'modelo'])
      .where('organizacion_id', '=', organizacionId)
      .where('nombre', '=', nombre)
      .executeTakeFirst(),
  );
  if (existente !== undefined) return existente;

  const creado = await ctx.paso('dar_de_alta_comisionista', () =>
    ctx.tx
      .insertInto('comisionistas')
      .values({
        organizacion_id: organizacionId,
        nombre,
        tipo: tipoDeComisionista(datos.tipo),
        modelo: modeloDe(datos.tipo),
        comision_bp: comisionBp,
        activo: true,
      })
      .returning(['id', 'modelo'])
      .executeTakeFirstOrThrow(),
  );
  return creado;
}

/**
 * Anota la operación y mueve el saldo, en la misma transacción que el pasivo.
 *
 * El importe que mueve el saldo es el AJENO —lo recibido menos la comisión—, que
 * es lo que de verdad sale del almacén de dinero: de los $200 de una recarga, $200
 * son del proveedor... menos los $12 que el negocio se queda en el acto. Lo que
 * baja del saldo son $188, y es el número con el que se arquea a las nueve.
 */
export async function anotarOperacionDeComision(
  ctx: ContextoComando<Transaccion>,
  datos: DatosDeOperacion,
): Promise<OperacionDeComisionEscrita> {
  const { organizacionId, empleoId } = ctx.ambito;

  const ajeno = BigInt(datos.montoRecibidoCentavos - datos.comisionNegocioCentavos);
  // El porcentaje CONGELADO, en puntos base: las plataformas lo cambian sin avisar
  // y sin esto la ganancia de marzo cambiaría en abril (095).
  const comisionBp =
    datos.montoRecibidoCentavos === 0
      ? 0
      : Math.round((datos.comisionNegocioCentavos * 10_000) / datos.montoRecibidoCentavos);

  const comisionista = await comisionistaPorNombre(ctx, datos, comisionBp);

  const operacion = await ctx.paso('anotar_operacion_comision', () =>
    ctx.tx
      .insertInto('operaciones_comision')
      .values({
        organizacion_id: organizacionId,
        sucursal_id: datos.sucursalId,
        comisionista_id: comisionista.id,
        tipo: datos.tipo,
        monto_ajeno_centavos: ajeno,
        comision_centavos: BigInt(datos.comisionNegocioCentavos),
        comision_bp_aplicada: comisionBp,
        referencia: datos.referencia,
        sesion_caja_id: datos.sesionCajaId,
        empleado_id: empleoId,
        created_at: ctx.ahora,
      })
      .returning('id')
      .executeTakeFirstOrThrow(),
  );

  // El saldo: baja en prepago —se gastó lo comprado— y sube en pospago —se debe
  // entregar—. El `upsert` crea la fila la primera vez, que es la primera recarga.
  const movimiento = comisionista.modelo === 'prepago' ? -ajeno : ajeno;
  const saldo = await ctx.paso('mover_saldo_comisionista', () =>
    ctx.tx
      .insertInto('saldos_comisionista')
      .values({
        organizacion_id: organizacionId,
        comisionista_id: comisionista.id,
        saldo_centavos: movimiento,
        comision_acumulada_centavos: BigInt(datos.comisionNegocioCentavos),
        actualizado_en: ctx.ahora,
      })
      .onConflict((oc) =>
        oc.columns(['organizacion_id', 'comisionista_id']).doUpdateSet((eb) => ({
          saldo_centavos: eb('saldos_comisionista.saldo_centavos', '+', movimiento),
          comision_acumulada_centavos: eb(
            'saldos_comisionista.comision_acumulada_centavos',
            '+',
            BigInt(datos.comisionNegocioCentavos),
          ),
          actualizado_en: ctx.ahora,
        })),
      )
      .returning('saldo_centavos')
      .executeTakeFirstOrThrow(),
  );

  return {
    operacionId: operacion.id,
    comisionistaId: comisionista.id,
    saldoCentavos: saldo.saldo_centavos,
  };
}

/**
 * CARGAR SALDO · «deposité $1,000 y me dieron $1,065 para vender».
 *
 * Es la otra mitad del almacén de dinero, y sin ella el panel sólo puede bajar:
 * el saldo de una recarga se gasta, y si nadie puede recargarlo la pantalla acaba
 * enseñando un número negativo que no significa nada.
 *
 * Los DOS importes se guardan por separado —lo depositado y lo recibido— porque no
 * son iguales: la diferencia es la bonificación del comisionista, y es lo único que
 * permite arquear este saldo contra el banco.
 */
export interface SaldoCargado {
  readonly comisionistaId: string;
  readonly saldoCentavos: string;
}

export async function cargarSaldoDelComisionista(
  ctx: ContextoComando<Transaccion>,
  datos: {
    readonly proveedorServicio: string;
    readonly depositadoCentavos: number;
    readonly recibidoCentavos: number;
  },
): Promise<SaldoCargado> {
  const { organizacionId } = ctx.ambito;

  const comisionista = await comisionistaPorNombre(
    ctx,
    {
      pasivoId: '',
      sucursalId: ctx.ambito.sucursalId,
      sesionCajaId: null,
      tipo: 'recarga',
      proveedorServicio: datos.proveedorServicio,
      referencia: '',
      montoRecibidoCentavos: 0,
      comisionNegocioCentavos: 0,
    },
    0,
  );

  const recibido = BigInt(datos.recibidoCentavos);
  const saldo = await ctx.paso('cargar_saldo', () =>
    ctx.tx
      .insertInto('saldos_comisionista')
      .values({
        organizacion_id: organizacionId,
        comisionista_id: comisionista.id,
        saldo_centavos: recibido,
        actualizado_en: ctx.ahora,
      })
      .onConflict((oc) =>
        oc.columns(['organizacion_id', 'comisionista_id']).doUpdateSet((eb) => ({
          saldo_centavos: eb('saldos_comisionista.saldo_centavos', '+', recibido),
          actualizado_en: ctx.ahora,
        })),
      )
      .returning('saldo_centavos')
      .executeTakeFirstOrThrow(),
  );

  ctx.auditar({
    entidadId: comisionista.id,
    payload: {
      proveedor: datos.proveedorServicio,
      depositadoCentavos: datos.depositadoCentavos,
      recibidoCentavos: datos.recibidoCentavos,
    },
  });

  return { comisionistaId: comisionista.id, saldoCentavos: saldo.saldo_centavos.toString() };
}

/** Quién puede cargar saldo: es dinero que sale del banco del negocio. */
const CARGA_SALDO = ['gerente', 'administrador', 'dueno'] as const;

export const entradaCargarSaldo = z.object({
  proveedorServicio: z.string().trim().min(2).max(60),
  /** Lo que salió del banco. */
  depositadoCentavos: z.number().int().min(1).max(100_000_000),
  /**
   * Lo que el comisionista dio para vender. Suele ser MÁS que lo depositado.
   *
   * No es un capricho del formulario: Don Chuy deposita $1,000 y recibe $1,065.
   * Esa diferencia es su bonificación, y es el único modo de arquear este saldo
   * contra el banco. Por omisión es lo mismo que se depositó.
   */
  recibidoCentavos: z.number().int().min(1).max(100_000_000).optional(),
});

export const cargarSaldo = definirComando<Transaccion, typeof entradaCargarSaldo, SaldoCargado>({
  nombre: 'comision.cargar_saldo',
  entidad: 'pasivo_tercero',
  escribe: true,
  roles: [...CARGA_SALDO],
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaCargarSaldo,
  async ejecutar(ctx, entrada) {
    return cargarSaldoDelComisionista(ctx, {
      proveedorServicio: entrada.proveedorServicio,
      depositadoCentavos: entrada.depositadoCentavos,
      recibidoCentavos: entrada.recibidoCentavos ?? entrada.depositadoCentavos,
    });
  },
});
