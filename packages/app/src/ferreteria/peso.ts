import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoTomas, type Transaccion } from '@morphiqpos/data';
import { contarPorPeso, piezasDesdePeso } from '@morphiqpos/domain/inventario';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-151 · Contar pesando, y por qué no es contar.
 *
 * ── El caso ──────────────────────────────────────────────────────────────
 * Nadie cuenta seis mil tornillos. Se pesa la caja, se divide entre el peso de
 * la pieza y sale un número. Ese número es UNA ESTIMACIÓN, y el sistema tiene
 * que decirlo: un conteo por báscula presentado como exacto entra al kardex
 * como si alguien hubiera contado pieza por pieza, y a partir de ahí nadie
 * puede distinguir un faltante real de la tolerancia de la balanza.
 *
 * ── Por eso hay dos comandos y no uno ────────────────────────────────────
 * Calibrar es declarar cuánto pesa UNA pieza, y se hace una vez con una muestra
 * grande. Contar es usar ese dato. Juntarlos dejaría que cada conteo
 * recalibrara, y entonces la existencia se ajustaría sola a lo que diga la
 * báscula ese día — que es exactamente cómo un inventario deja de significar
 * nada.
 *
 * ── Todo en MILIGRAMOS enteros ───────────────────────────────────────────
 * Misma decisión que los centavos. El tornillo de 5 g es 5000. En gramos con
 * decimales vuelven los flotantes, y dividir 12 345,6 entre 5,04 da un número
 * distinto según en qué orden se hagan las operaciones.
 */

const CATALOGO = ['gerente', 'administrador', 'dueno'] as const;
const CONTEO = ['cajero', ...CATALOGO] as const;

/** Con menos piezas la muestra no vale: una sola pieza atípica mueve el promedio. */
const MINIMO_DE_MUESTRA = 10;

export const entradaCalibrarPeso = z.object({
  productoId: z.uuid(),
  /** Lo que pesó la MUESTRA, en miligramos. */
  pesoMuestraMg: z.number().int().min(1).max(100_000_000),
  /** Cuántas piezas había en la muestra. Contadas de verdad, ésta sí. */
  piezasMuestra: z.number().int().min(MINIMO_DE_MUESTRA).max(10_000),
  /** Cuánto se tolera antes de dudar del conteo. El 8 % es el del giro. */
  toleranciaPct: z.number().min(0).max(50).default(8),
});

export const entradaConteoPorPeso = z.object({
  tomaId: z.uuid(),
  productoId: z.uuid(),
  /** Lo que marcó la báscula, en miligramos. */
  pesoTotalMg: z.number().int().min(0).max(10_000_000_000),
  /** El peso del recipiente, que la báscula no descuenta sola. */
  taraMg: z.number().int().min(0).max(1_000_000_000).default(0),
});

export interface ResultadoCalibracion {
  readonly productoId: string;
  readonly pesoPorPiezaMg: string;
  readonly toleranciaPct: string;
  /** Si ya estaba calibrado, cuánto cambió. Un salto grande es un error de captura. */
  readonly variacionPct: string | null;
}

export interface ResultadoConteoPeso {
  readonly productoId: string;
  readonly piezasEstimadas: number;
  readonly minimo: number;
  readonly maximo: number;
  /**
   * `false` cuando el rango es tan ancho que el número no sirve para decidir.
   *
   * Se devuelve igual: negarlo obligaría a contar seis mil tornillos a mano, y
   * entonces no se cuentan. Lo que no se puede es presentarlo como exacto.
   */
  readonly confiable: boolean;
}

export const calibrarPeso = definirComando<
  Transaccion,
  typeof entradaCalibrarPeso,
  ResultadoCalibracion
>({
  nombre: 'catalogo.calibrar_peso',
  entidad: 'producto',
  escribe: true,
  roles: [...CATALOGO],
  paquetes: PAQUETES_TODOS,
  entrada: entradaCalibrarPeso,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'peso_por_pieza_mg'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }

    // Se trunca a entero: el medio miligramo por pieza no lo mide ninguna
    // báscula de mostrador, y arrastrarlo daría una precisión falsa.
    const pesoPorPieza = BigInt(Math.trunc(entrada.pesoMuestraMg / entrada.piezasMuestra));
    if (pesoPorPieza <= 0n) {
      throw new ErrorDominio(
        'CANTIDAD_INVALIDA',
        'Esa muestra da menos de un miligramo por pieza: revisa el peso o las piezas.',
      );
    }

    // Recalibrar de 5 g a 50 g casi siempre es un cero de más al teclear, y a
    // partir de ahí el conteo de esa clave da la décima parte de lo que hay
    // durante meses. Se avisa con el número; no se bloquea, porque cambiar de
    // proveedor sí cambia el peso de verdad.
    const anterior = producto.peso_por_pieza_mg;
    const variacion =
      anterior === null || anterior === 0n
        ? null
        : (((pesoPorPieza - anterior) * 10_000n) / anterior).toString();

    await ctx.paso('calibrar', () =>
      ctx.tx
        .updateTable('productos')
        .set({
          peso_por_pieza_mg: pesoPorPieza,
          tolerancia_peso_pct: entrada.toleranciaPct.toFixed(2),
          peso_calibrado_en: ctx.ahora,
          // Quién calibró: un peso mal puesto descuadra el conteo entero de esa
          // clave, y la pregunta cuando sale mal es quién lo puso.
          peso_calibrado_por: empleoId,
          updated_at: ctx.ahora,
        })
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .execute(),
    );

    ctx.auditar({
      entidadId: entrada.productoId,
      payload: {
        pesoPorPiezaMg: pesoPorPieza.toString(),
        piezasMuestra: entrada.piezasMuestra,
        variacionBp: variacion,
      },
    });
    return {
      productoId: entrada.productoId,
      pesoPorPiezaMg: pesoPorPieza.toString(),
      toleranciaPct: entrada.toleranciaPct.toFixed(2),
      variacionPct: variacion === null ? null : (Number(variacion) / 100).toFixed(2),
    };
  },
});

export const conteoPorPeso = definirComando<
  Transaccion,
  typeof entradaConteoPorPeso,
  ResultadoConteoPeso
>({
  nombre: 'inventario.conteo_por_peso',
  entidad: 'toma_inventario',
  escribe: true,
  roles: [...CONTEO],
  paquetes: PAQUETES_TODOS,
  entrada: entradaConteoPorPeso,
  async ejecutar(ctx, entrada) {
    const { organizacionId, empleoId } = ctx.ambito;

    const producto = await ctx.paso('leer_producto', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'peso_por_pieza_mg', 'tolerancia_peso_pct', 'insumo_base_id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.productoId)
        .executeTakeFirst(),
    );
    if (producto === undefined) {
      throw new ErrorDominio('PRODUCTO_NO_ENCONTRADO', 'Ese producto no existe en este negocio.');
    }
    const pesoPorPieza = producto.peso_por_pieza_mg;
    if (pesoPorPieza === null) {
      // Contar por peso sin calibrar es inventarse el número. Y el mensaje dice
      // qué falta: «no se puede» manda a alguien a buscar por qué.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `«${producto.nombre}» no está calibrado: primero se pesa una muestra.`,
      );
    }

    if (producto.insumo_base_id === null) {
      // El conteo vive en `existencias`, que está por insumo. Un producto sin
      // insumo base no tiene dónde caer contado.
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        `«${producto.nombre}» no tiene insumo base: no hay existencia que contar.`,
      );
    }
    const insumoId = producto.insumo_base_id;

    const toma = await ctx.paso('leer_toma', () =>
      ctx.tx
        .selectFrom('tomas_inventario')
        .select(['id', 'almacen_id', 'estado'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.tomaId)
        .executeTakeFirst(),
    );
    if (toma === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Esa toma no existe en este negocio.');
    }
    if (toma.estado !== 'abierta') {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        'Esa toma ya está cerrada: lo que se capture ahora no ajusta nada.',
      );
    }

    const neto = BigInt(entrada.pesoTotalMg - entrada.taraMg);
    if (neto < 0n) {
      // La tara mayor que el peso total es el recipiente equivocado, y sin esta
      // guarda entraría un conteo negativo al kardex.
      throw new ErrorDominio(
        'CANTIDAD_INVALIDA',
        'La tara pesa más que todo: revisa cuál recipiente se puso.',
      );
    }

    const toleranciaPct = Number(producto.tolerancia_peso_pct);
    const estimacion = contarPorPeso(neto, {
      miligramos: pesoPorPieza,
      toleranciaBp: Math.round(toleranciaPct * 100),
    });

    // Se anota con el MISMO repositorio que el conteo a mano. Lo que cambia es
    // cómo se llegó al número, y eso va en `capturas`: cuando alguien reclame
    // «yo conté seis mil», tiene que poder verse que nadie contó — que se pesó
    // 12,3 kg y que el sistema dividió.
    await ctx.paso('anotar_conteo', () =>
      repoTomas.anotarConteo(
        ctx.tx,
        entrada.tomaId,
        toma.almacen_id,
        {
          insumoId,
          contado: estimacion.piezas.toString(),
          unidad: 'pieza',
          capturas: [
            {
              metodo: 'bascula',
              pesoNetoMg: neto.toString(),
              taraMg: entrada.taraMg.toString(),
              pesoPorPiezaMg: pesoPorPieza.toString(),
              toleranciaPct: toleranciaPct.toFixed(2),
              minimo: estimacion.minimo,
              maximo: estimacion.maximo,
              confiable: estimacion.confiable,
            },
          ],
        },
        empleoId,
        ctx.ahora,
      ),
    );

    ctx.auditar({
      entidadId: entrada.tomaId,
      payload: {
        productoId: entrada.productoId,
        piezas: estimacion.piezas,
        confiable: estimacion.confiable,
      },
    });
    return {
      productoId: entrada.productoId,
      piezasEstimadas: estimacion.piezas,
      minimo: estimacion.minimo,
      maximo: estimacion.maximo,
      confiable: estimacion.confiable,
    };
  },
});

/** Reexportado a propósito: la pantalla de corte lo usa sin pasar por la base. */
export { piezasDesdePeso };
