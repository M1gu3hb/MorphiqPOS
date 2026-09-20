import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-147 · La herramienta que sale y TIENE que volver.
 *
 * ── Es el envase retornable de abarrotes con otro nombre ─────────────────
 * Sale una pieza que no se vendió y entra un depósito que hay que devolver. El
 * depósito NO es ingreso: es dinero del cliente que pasa por el cajón. Contarlo
 * como venta infla el día de la renta y descuadra el día de la devolución, y
 * los dos errores son del mismo tamaño y de signo contrario — que es
 * exactamente por qué nadie los detecta.
 *
 * ── El cobro se calcula del TIEMPO FUERA, no de lo que diga el mostrador ─
 * Tarifa por hora, día o semana, contra el tiempo real. Aceptar el monto de la
 * pantalla vuelve negociable por teclado un cobro que está en la tarifa, y con
 * una rotativa de $400 al día la diferencia entre dos días y tres la pone
 * alguien de memoria.
 *
 * ── Y el que no vuelve se declara, no se olvida ──────────────────────────
 * `perdida` y `dañada` son estados, no un silencio: la pieza deja de estar en
 * el inventario de renta y el depósito se retiene con su razón escrita. Un
 * sistema que sólo sabe «fuera» y «devuelta» acaba con cinco rotomartillos
 * eternamente fuera y nadie sabe de quién.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

const MS_POR_HORA = 3_600_000;
const HORAS_POR_DIA = 24;
const HORAS_POR_SEMANA = 168;

export const entradaSacarRenta = z.object({
  productoId: z.uuid(),
  piezas: z.number().int().min(1).max(50),
  clienteId: z.uuid().nullable().default(null),
  nombreLibre: z.string().trim().max(120).nullable().default(null),
  telefonoLibre: z.string().trim().max(30).nullable().default(null),
  tarifaCentavos: z.number().int().min(0).max(100_000_000),
  unidadTarifa: z.enum(['hora', 'dia', 'semana']),
  depositoCentavos: z.number().int().min(0).max(100_000_000).default(0),
  /** Cuándo se comprometió a traerla. Sin esto no hay vencido que revisar. */
  compromisoRetorno: z.iso.datetime(),
});

export const entradaDevolverRenta = z.object({
  rentaId: z.uuid(),
  estado: z.enum(['devuelta', 'perdida', 'dañada']),
  /** Lo que se retiene del depósito por daños. Nunca más de lo que se dejó. */
  retenerDelDepositoCentavos: z.number().int().min(0).max(100_000_000).default(0),
  danos: z.string().trim().max(300).nullable().default(null),
});

export interface ResultadoSalida {
  readonly rentaId: string;
  readonly compromisoRetorno: string;
  readonly depositoCentavos: string;
  readonly tarifaCentavos: string;
  readonly unidadTarifa: string;
}

export interface ResultadoDevolucion {
  readonly rentaId: string;
  readonly estado: string;
  readonly unidadesCobradas: number;
  readonly cobroCentavos: string;
  readonly depositoDevueltoCentavos: string;
  /** Lo que se quedó el negocio del depósito. Con su razón, o cero. */
  readonly retenidoCentavos: string;
}

export const sacarEnRenta = definirComando<Transaccion, typeof entradaSacarRenta, ResultadoSalida>({
  nombre: 'renta.sacar',
  entidad: 'renta_herramienta',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaSacarRenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId, terminalId } = ctx.ambito;

    // Sin cliente registrado hace falta AL MENOS un nombre. Una rotativa que
    // salió «a nombre de nadie» no se puede ir a buscar, y ése es todo el
    // valor de este registro.
    if (entrada.clienteId === null && (entrada.nombreLibre ?? '').trim() === '') {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Una herramienta no sale a nombre de nadie: hace falta el cliente o su nombre.',
      );
    }

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }

    const compromiso = new Date(entrada.compromisoRetorno);
    if (compromiso.getTime() <= ctx.ahora.getTime()) {
      // Un compromiso que nace vencido mete la pieza en la lista de la mañana
      // siguiente sin que nadie la haya tenido ni un día.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Ese compromiso de retorno ya pasó: revisa la fecha.',
      );
    }

    const renta = await ctx.paso('sacar', () =>
      ctx.tx
        .insertInto('rentas_herramienta')
        .values({
          organizacion_id: organizacionId,
          sucursal_id: sucursalId,
          producto_id: entrada.productoId,
          cliente_id: entrada.clienteId,
          nombre_libre: entrada.nombreLibre,
          telefono_libre: entrada.telefonoLibre,
          piezas: entrada.piezas,
          tarifa_centavos: BigInt(entrada.tarifaCentavos),
          unidad_tarifa: entrada.unidadTarifa,
          deposito_centavos: BigInt(entrada.depositoCentavos),
          estado: 'fuera',
          salio_en: ctx.ahora,
          compromiso_retorno: compromiso,
          empleado_id: empleoId,
          created_at: ctx.ahora,
          updated_at: ctx.ahora,
        })
        .returning('id')
        .executeTakeFirstOrThrow(),
    );

    // El depósito entra como DEPÓSITO y nunca como venta: es dinero del cliente
    // que va a volver a salir. Contarlo como ingreso infla el día de la renta y
    // descuadra el de la devolución, con dos errores iguales y de signo
    // contrario que nadie detecta.
    if (entrada.depositoCentavos > 0 && terminalId !== null) {
      const sesion = await ctx.paso('cargar_caja', () =>
        repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
      );
      if (sesion === null) {
        throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de recibir el depósito.');
      }
      await ctx.paso('anotar_deposito', () =>
        repoCaja.registrarMovimiento(ctx.tx, {
          organizacionId,
          sesionCajaId: sesion.id,
          tipo: 'deposito',
          montoCentavos: BigInt(entrada.depositoCentavos),
          motivo: `depósito de renta · ${producto.nombre}`,
          empleadoId: empleoId,
          referenciaTipo: 'renta_herramienta',
          referenciaId: renta.id,
        }),
      );
    }

    ctx.auditar({
      entidadId: renta.id,
      payload: { productoId: entrada.productoId, depositoCentavos: entrada.depositoCentavos },
    });
    return {
      rentaId: renta.id,
      compromisoRetorno: compromiso.toISOString(),
      depositoCentavos: entrada.depositoCentavos.toString(),
      tarifaCentavos: entrada.tarifaCentavos.toString(),
      unidadTarifa: entrada.unidadTarifa,
    };
  },
});

export const devolverRenta = definirComando<
  Transaccion,
  typeof entradaDevolverRenta,
  ResultadoDevolucion
>({
  nombre: 'renta.devolver',
  entidad: 'renta_herramienta',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaDevolverRenta,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const renta = await ctx.paso('leer_renta', () =>
      ctx.tx
        .selectFrom('rentas_herramienta')
        .select([
          'id',
          'estado',
          'piezas',
          'tarifa_centavos',
          'unidad_tarifa',
          'deposito_centavos',
          'salio_en',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.rentaId)
        .executeTakeFirst(),
    );
    if (renta === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa renta no existe en este negocio.');
    }
    if (renta.estado !== 'fuera') {
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `Esa herramienta ya está «${renta.estado}»: no se devuelve dos veces.`,
      );
    }
    if (entrada.retenerDelDepositoCentavos > Number(renta.deposito_centavos)) {
      // Retener más de lo que se dejó es dinero que sale del cajón sin
      // respaldo, y es el error de teclado que nadie revisa.
      throw new ErrorDominio(
        'DINERO_PORCENTAJE_INVALIDO',
        'No se puede retener más de lo que el cliente dejó en depósito.',
      );
    }
    if (entrada.estado !== 'devuelta' && entrada.danos === null) {
      // «Perdida» sin razón escrita es un rotomartillo que desapareció y una
      // discusión que en tres meses nadie puede reconstruir.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Una herramienta perdida o dañada lleva escrito qué pasó.',
      );
    }

    // El cobro sale del TIEMPO FUERA y de la tarifa, no de la pantalla. Las
    // unidades empezadas se cobran enteras —es lo que se le dijo al cliente— y
    // el mínimo es una: devolverla a los diez minutos sigue costando.
    const horasFuera = (ctx.ahora.getTime() - renta.salio_en.getTime()) / MS_POR_HORA;
    const horasPorUnidad =
      renta.unidad_tarifa === 'hora'
        ? 1
        : renta.unidad_tarifa === 'dia'
          ? HORAS_POR_DIA
          : HORAS_POR_SEMANA;
    const unidades = Math.max(1, Math.ceil(horasFuera / horasPorUnidad));
    const cobro = renta.tarifa_centavos * BigInt(unidades) * BigInt(renta.piezas);

    const devuelto = renta.deposito_centavos - BigInt(entrada.retenerDelDepositoCentavos);

    // Dos ramas literales: el contrato de «estado ⇒ columna» necesita ver el
    // valor escrito para saber que hay código que lo produce.
    if (entrada.estado === 'devuelta') {
      await ctx.paso('devolver', () =>
        ctx.tx
          .updateTable('rentas_herramienta')
          .set({
            estado: 'devuelta',
            volvio_en: ctx.ahora,
            cobro_centavos: cobro,
            deposito_devuelto_centavos: devuelto,
            danos: entrada.danos,
            updated_at: ctx.ahora,
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.rentaId)
          .execute(),
      );
    } else {
      await ctx.paso('cerrar_sin_pieza', () =>
        ctx.tx
          .updateTable('rentas_herramienta')
          .set({
            estado: entrada.estado,
            volvio_en: ctx.ahora,
            cobro_centavos: cobro,
            deposito_devuelto_centavos: devuelto,
            danos: entrada.danos,
            updated_at: ctx.ahora,
          })
          .where('organizacion_id', '=', organizacionId)
          .where('id', '=', entrada.rentaId)
          .execute(),
      );
    }

    ctx.auditar({
      entidadId: entrada.rentaId,
      payload: {
        estado: entrada.estado,
        unidades,
        cobroCentavos: cobro.toString(),
        empleadoId: empleoId,
      },
    });
    return {
      rentaId: entrada.rentaId,
      estado: entrada.estado,
      unidadesCobradas: unidades,
      cobroCentavos: cobro.toString(),
      depositoDevueltoCentavos: devuelto.toString(),
      retenidoCentavos: entrada.retenerDelDepositoCentavos.toString(),
    };
  },
});
