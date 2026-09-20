import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCaja, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-984-bis · Meter cambio a la caja a media mañana.
 *
 * ── Por qué no es un depósito ni una venta ───────────────────────────────
 * A las once se acaban las monedas de diez y alguien va al banco, o saca $600
 * de su bolsa, o cambia un billete de la caja chica. Entra dinero al cajón y NO
 * es ingreso: es fondo. Registrarlo como depósito de venta infla el día; no
 * registrarlo hace que el arqueo de la noche encuentre $600 de más y que el
 * cajero pase veinte minutos buscando una venta que no existe.
 *
 * ── Y por qué lleva desglose ─────────────────────────────────────────────
 * «Entraron $600» no dice si se puede dar cambio. «Entraron $600 en monedas de
 * diez» sí, y ésa es la pregunta que se hace a las once. Es el mismo criterio
 * que el fondo desglosado de la apertura (F-984): un solo número esconde
 * exactamente el problema que el cambio viene a resolver.
 *
 * ── El fondo esperado SUBE con esto ──────────────────────────────────────
 * Si no subiera, el corte de la noche diría que sobran $600 todos los días que
 * alguien metió cambio. Un corte que sobra por diseño deja de servir para
 * detectar el faltante, que es para lo que existe.
 *
 * ── Y NO se compensa solo al cerrar ──────────────────────────────────────
 * El cambio que entró se queda: es fondo hasta que alguien lo retire. Devolverlo
 * automáticamente al cierre obligaría a adivinar de dónde salió, y casi siempre
 * salió de la bolsa de alguien.
 */

const ROLES = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

export const entradaDeCambio = z.object({
  /** Monedas sueltas: de uno, dos, cinco y diez. */
  monedasCentavos: z.number().int().min(0).max(100_000_000).default(0),
  /** Billetes chicos: veinte, cincuenta, cien. Los que sirven para cambiar. */
  chicosCentavos: z.number().int().min(0).max(100_000_000).default(0),
  /** De dónde salió. No es adorno: casi siempre es la bolsa de alguien. */
  origen: z.enum(['banco', 'caja_chica', 'dueno', 'otra_caja']),
  motivo: z.string().trim().max(200).nullable().default(null),
});

export interface ResultadoEntradaCambio {
  readonly movimientoId: string;
  readonly montoCentavos: string;
  readonly monedasCentavos: string;
  readonly chicosCentavos: string;
  /** El fondo esperado DESPUÉS. Es contra éste que se cuadra en la noche. */
  readonly fondoEsperadoCentavos: string;
}

export const registrarEntradaDeCambio = definirComando<
  Transaccion,
  typeof entradaDeCambio,
  ResultadoEntradaCambio
>({
  nombre: 'caja.entrada_cambio',
  entidad: 'movimiento_caja',
  escribe: true,
  roles: [...ROLES],
  paquetes: PAQUETES_TODOS,
  entrada: entradaDeCambio,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId, terminalId } = ctx.ambito;

    const monto = entrada.monedasCentavos + entrada.chicosCentavos;
    if (monto <= 0) {
      // Un movimiento de cero es una línea en el corte que hay que leer y que no
      // dice nada.
      throw new ErrorDominio('CANTIDAD_INVALIDA', 'No entró nada: revisa el desglose.');
    }

    if (terminalId === null) {
      throw new ErrorDominio(
        'VENTA_SIN_TERMINAL',
        'El cambio entra a un cajón concreto: hace falta la terminal.',
      );
    }
    const sesion = await ctx.paso('cargar_caja', () =>
      repoCaja.sesionAbiertaDeTerminal(ctx.tx, organizacionId, terminalId),
    );
    if (sesion === null) {
      throw new ErrorDominio('CAJA_CERRADA', 'Abre la caja antes de meterle cambio.');
    }

    const actual = await ctx.paso('leer_sesion', () =>
      ctx.tx
        .selectFrom('sesiones_caja')
        .select(['fondo_esperado_centavos', 'fondo_monedas_centavos', 'fondo_chicos_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', sesion.id)
        .executeTakeFirstOrThrow(),
    );

    // Tipo propio, no `deposito`. El corte los suma distinto: el depósito es
    // dinero que entró POR una venta y el cambio es fondo que alguien puso.
    const movimiento = await ctx.paso('anotar_movimiento', () =>
      repoCaja.registrarMovimiento(ctx.tx, {
        organizacionId,
        sesionCajaId: sesion.id,
        tipo: 'entrada_cambio',
        montoCentavos: BigInt(monto),
        motivo:
          entrada.motivo ?? `cambio desde ${entrada.origen}: ${entrada.monedasCentavos} en monedas`,
        empleadoId: empleoId,
        referenciaTipo: 'entrada_cambio',
        referenciaId: null,
      }),
    );

    // El fondo esperado SUBE, y el desglose con él. Si no subiera, el corte
    // diría que sobran $600 todos los días que alguien metió cambio, y un corte
    // que sobra por diseño deja de detectar el faltante.
    const fondoEsperado = actual.fondo_esperado_centavos + BigInt(monto);
    await ctx.paso('subir_fondo', () =>
      ctx.tx
        .updateTable('sesiones_caja')
        .set({
          fondo_esperado_centavos: fondoEsperado,
          fondo_monedas_centavos: actual.fondo_monedas_centavos + BigInt(entrada.monedasCentavos),
          fondo_chicos_centavos: actual.fondo_chicos_centavos + BigInt(entrada.chicosCentavos),
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', sesion.id)
        .execute(),
    );

    ctx.auditar({
      entidadId: sesion.id,
      payload: {
        montoCentavos: monto,
        origen: entrada.origen,
        monedasCentavos: entrada.monedasCentavos,
      },
    });
    return {
      movimientoId: movimiento.id,
      montoCentavos: monto.toString(),
      monedasCentavos: entrada.monedasCentavos.toString(),
      chicosCentavos: entrada.chicosCentavos.toString(),
      fondoEsperadoCentavos: fondoEsperado.toString(),
    };
  },
});
