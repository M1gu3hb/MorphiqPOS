import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { recibirNota } from '../abarrotes/recibir-nota.ts';
import { lineaDeCompra } from '../compras/esquemas.ts';
import { registrarPorPagar } from '../compras/por-pagar.ts';
import { definirComando } from '../definicion.ts';

/**
 * `compras.recibir_entrada` — guardar la entrada del proveedor (F-631, F-107).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `ferreteria/Entradas.tsx` cierra la captura con GUARDAR ENTRADA y publicaba en
 * `/api/entradas/recibir`, **una ruta que no existía**. La pantalla que resuelve el
 * dolor de capturar doscientos renglones acababa en el error genérico, así que la
 * entrada se seguía capturando «el fin de semana» —o nunca—, y las que se capturan
 * el fin de semana dejan existencias en negativo toda la semana siguiente.
 *
 * ── Lo que NO reimplementa ───────────────────────────────────────────────
 * El asiento entero es `compras.recibir_nota`, que a su vez es `compras.registrar`
 * más las caducidades: el costo promedio ponderado, los insumos nuevos, la unidad
 * base del giro, el movimiento de caja si fue de contado y la lista de la mañana.
 * Aquí se añaden las tres cosas que esa pantalla sabe y ese comando no:
 *
 * 1. EL ALMACÉN, que sale de la sesión y nunca de la petición. Con el almacén en
 *    la entrada, quien llama elegiría en qué existencias entra el material.
 * 2. EL CRÉDITO. «A crédito, 30 días» es la mitad de lo que se decide en esa
 *    pantalla, y sin registrar el documento por pagar la deuda con el proveedor
 *    no existe en ninguna parte: el lunes nadie sabe cuánto se debe.
 * 3. EL CAMINO por el que se capturó —archivo, contra pedido, o manual—, que
 *    queda en las notas de la compra. Seis meses después, «esta entrada se
 *    capturó a mano» es lo que explica por qué tres renglones están raros.
 *
 * ── Por qué una entrada SIN RENGLONES se rechaza ─────────────────────────
 * Porque no es una entrada: es un botón apretado antes de capturar. Guardar una
 * compra de cero pesos ensucia el histórico del proveedor —y el costo promedio
 * mira ese histórico— y además le haría creer al encargado que la nota ya entró.
 * El error dice qué falta, que es lo único útil en ese momento.
 *
 * ── Y por qué el folio es obligatorio a crédito ──────────────────────────
 * Porque un documento por pagar sin folio no se puede conciliar con el estado de
 * cuenta del proveedor: cuando el proveedor reclame, no hay forma de saber si esa
 * factura es una de las capturadas. De contado no hace falta: el dinero salió y
 * está en el corte.
 */

const RECIBE = ['almacen', 'gerente', 'administrador', 'dueno'] as const;

/** Los tres caminos de la pantalla, y ninguno más. */
export const CAMINOS_DE_ENTRADA = ['archivo', 'pedido', 'manual'] as const;

export const entradaRecibirEntrada = z.object({
  proveedorId: z.uuid(),
  /** El folio de SU hoja. Obligatorio a crédito: es lo que se concilia. */
  folio: z.string().trim().max(40).nullable().default(null),
  aCredito: z.boolean().default(false),
  /** Días de crédito. Los del proveedor si no se dice otra cosa. */
  dias: z.number().int().min(1).max(180).nullable().default(null),
  camino: z.enum(CAMINOS_DE_ENTRADA),
  lineas: z.array(lineaDeCompra).max(400).default([]),
  /**
   * La foto de la nota en papel, ya subida (`/api/archivos/subir`). Queda en las notas
   * de la compra: es con lo que se concilia cuando el proveedor reclame. Sólo https.
   */
  fotoDeLaNota: z
    .url({ protocol: /^https$/ })
    .max(500)
    .nullable()
    .default(null),
});

export interface ResultadoEntrada {
  readonly compraId: string;
  readonly totalCentavos: string;
  readonly lineas: number;
  readonly caducidadesRegistradas: number;
  /** El documento por pagar, si fue a crédito. `null` de contado. */
  readonly porPagarId: string | null;
  /** Cuándo vence, en ISO. `null` de contado. */
  readonly vence: string | null;
}

export const recibirEntrada = definirComando<
  Transaccion,
  typeof entradaRecibirEntrada,
  ResultadoEntrada
>({
  nombre: 'compras.recibir_entrada',
  entidad: 'compra',
  escribe: true,
  roles: [...RECIBE],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRecibirEntrada,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId } = ctx.ambito;

    if (entrada.lineas.length === 0) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esa entrada no tiene ningún renglón: importa la nota del proveedor o captura las ' +
          'partidas antes de guardar.',
      );
    }

    if (sucursalId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'El material entra a un almacén, y el almacén es de una sucursal: esta sesión no tiene una.',
      );
    }

    const almacenId = await ctx.paso('resolver_almacen', () =>
      repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
    );
    if (almacenId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esta sucursal no tiene almacén dado de alta: el material no tiene dónde entrar.',
      );
    }

    const proveedor = await ctx.paso('cargar_proveedor', () =>
      ctx.tx
        .selectFrom('proveedores')
        .select(['id', 'nombre', 'dias_credito as diasCredito', 'activo'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.proveedorId)
        .executeTakeFirst(),
    );
    if (proveedor === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese proveedor no existe en este negocio.');
    }
    if (!proveedor.activo) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `«${proveedor.nombre}» está dado de baja: reactívalo antes de recibirle material.`,
      );
    }

    const folio = entrada.folio === null || entrada.folio === '' ? null : entrada.folio;
    if (entrada.aCredito && folio === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Una entrada a crédito necesita el folio de la nota: es lo que se concilia cuando el ' +
          'proveedor reclame.',
      );
    }

    // Los días los pone el proveedor si nadie los cambia: son SUYOS, y teclearlos
    // cada vez es cómo una nota queda a 30 cuando el trato era a 15.
    const dias = entrada.dias ?? proveedor.diasCredito;

    // El asiento entero, tal cual: costo promedio, insumos nuevos, movimiento de
    // caja si fue de contado y las caducidades. Copiar aquí la mitad daría dos
    // aritméticas de costo, y la de este comando sería la que nadie revisa.
    //
    // Y por eso este comando NO llama a `ctx.auditar`: el rastro guarda la PRIMERA
    // auditoría, y la primera es la de la compra, con el id de la compra dentro.
    // Auditar aquí antes le robaría ese renglón al asiento, que es el que alguien
    // va a querer mirar.
    const recibida = await recibirNota.ejecutar(ctx, {
      almacenId,
      proveedorId: proveedor.id,
      lineas: entrada.lineas,
      // A crédito NO se manda método de pago: `compras.registrar` escribe el
      // movimiento de caja cuando el método es efectivo, y a crédito no sale
      // ningún billete hoy. Decir «efectivo» aquí le restaría al corte un dinero
      // que sigue en el cajón.
      ...(entrada.aCredito ? {} : { metodoPago: 'efectivo' as const }),
      ...(folio === null ? {} : { facturaFolio: folio }),
      notas:
        `Entrada capturada por ${etiquetaDelCamino(entrada.camino)}` +
        (entrada.fotoDeLaNota === null ? '' : ` · foto de la nota: ${entrada.fotoDeLaNota}`),
    });

    if (!entrada.aCredito || folio === null) {
      return {
        compraId: recibida.compraId,
        totalCentavos: recibida.totalCentavos,
        lineas: recibida.lineas,
        caducidadesRegistradas: recibida.caducidadesRegistradas,
        porPagarId: null,
        vence: null,
      };
    }

    // El importe del documento va como entero: `registrarPorPagar` recibe ya
    // parseada su entrada —el esquema no vuelve a correr— así que el tope se
    // comprueba aquí en vez de dejar que Postgres lo reviente por overflow.
    const importe = Number(recibida.totalCentavos);
    if (!Number.isSafeInteger(importe) || importe < 1 || importe > 1_000_000_000) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `El total de la entrada (${recibida.totalCentavos} centavos) no cabe en un documento por ` +
          'pagar: pártela en dos notas.',
      );
    }

    const vence = new Date(ctx.ahora.getTime() + dias * 24 * 60 * 60 * 1000);
    const documento = await ctx.paso('registrar_por_pagar', () =>
      registrarPorPagar.ejecutar(ctx, {
        proveedorId: proveedor.id,
        folioProveedor: folio,
        compraId: recibida.compraId,
        importeCentavos: importe,
        venceEn: vence.toISOString(),
      }),
    );

    return {
      compraId: recibida.compraId,
      totalCentavos: recibida.totalCentavos,
      lineas: recibida.lineas,
      caducidadesRegistradas: recibida.caducidadesRegistradas,
      porPagarId: documento.documentoId,
      vence: vence.toISOString(),
    };
  },
});

/** Cómo se lee el camino en las notas de la compra, seis meses después. */
function etiquetaDelCamino(camino: (typeof CAMINOS_DE_ENTRADA)[number]): string {
  if (camino === 'archivo') return 'archivo del proveedor';
  if (camino === 'pedido') return 'escaneo contra pedido';
  return 'captura manual';
}
