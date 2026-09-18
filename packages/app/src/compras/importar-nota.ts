import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-631 · La nota del proveedor, capturada sin teclear cien renglones.
 *
 * ── Por qué esto existe ──────────────────────────────────────────────────
 * Una entrada de ferretería trae entre cuarenta y doscientos renglones, y lo
 * que llega es una hoja impresa con las claves DEL PROVEEDOR, que no son las
 * del negocio. Capturarla a mano cuesta dos horas, así que no se captura: el
 * material entra al anaquel y el inventario se entera tres meses después, en la
 * toma anual. Ésa es la razón real por la que el inventario de una ferretería
 * no sirve.
 *
 * ── Y por qué NO aplica nada ─────────────────────────────────────────────
 * Esto PROPONE. Devuelve qué renglón casó con qué clave, con qué confianza y
 * cuáles no casaron, y alguien confirma. Aplicar automáticamente una entrada de
 * doscientos renglones con emparejamiento aproximado es meter material en
 * claves equivocadas a una escala que después nadie desenreda: el error se
 * reparte por todo el catálogo y el conteo siguiente no lo puede aislar.
 *
 * ── El emparejamiento va por tres caminos, en orden ──────────────────────
 * 1 · La clave del proveedor, si ya se vio antes. Es exacta y es la única que
 *     no se equivoca nunca.
 * 2 · El código de barras del renglón, cuando la nota lo trae.
 * 3 · El nombre, normalizado. Éste es el que se equivoca, y por eso es el único
 *     que sale marcado como dudoso.
 *
 * Sin el orden, el nombre gana a la clave y «TORNILLO 1/4» acaba emparejado con
 * el de 1/4 de OTRA línea.
 */

const COMPRAS = ['gerente', 'administrador', 'dueno'] as const;

/** Menos que esto son dos palabras sueltas coincidiendo: no es un empate. */
const MINIMO_DE_PARECIDO = 0.6;

/**
 * Cuántas compras atrás se mira para recordar las claves.
 *
 * Doscientas son más de un año de entradas del mismo proveedor. Mirar el
 * histórico entero haría que la importación tardara más cuanto más viejo fuera
 * el negocio, que es justo al revés de como tiene que envejecer esto.
 */
const MEMORIA_DE_COMPRAS = 200;

export const entradaImportarNota = z.object({
  proveedorId: z.uuid(),
  folioProveedor: z.string().trim().min(1).max(40),
  renglones: z
    .array(
      z.object({
        /** La clave DEL PROVEEDOR, tal cual viene en su hoja. */
        claveProveedor: z.string().trim().max(60).nullable().default(null),
        codigoBarras: z.string().trim().max(40).nullable().default(null),
        descripcion: z.string().trim().min(1).max(200),
        cantidad: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/, 'Cantidad con 4 decimales.'),
        costoUnitarioCentavos: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(400),
});

export interface RenglonEmparejado {
  readonly indice: number;
  readonly descripcion: string;
  readonly cantidad: string;
  readonly costoUnitarioCentavos: string;
  /** `null` cuando no casó con nada: hay que darlo de alta o elegirlo a mano. */
  readonly productoId: string | null;
  /** `clave` · `codigo` · `nombre` · `ninguno`. Dice POR QUÉ casó. */
  readonly porQue: string;
  /** `true` sólo cuando casó por nombre: es el único camino que se equivoca. */
  readonly dudoso: boolean;
  /** Cuánto se movió el costo contra el último conocido, en puntos base. */
  readonly variacionCostoBp: number | null;
}

export interface ResultadoImportacion {
  readonly proveedorId: string;
  readonly folioProveedor: string;
  readonly renglones: readonly RenglonEmparejado[];
  readonly emparejados: number;
  readonly dudosos: number;
  readonly sinEmparejar: number;
  readonly totalCentavos: string;
  /** Lo que sube de costo más de la cuenta. Es lo que hay que mirar primero. */
  readonly subidasFuertes: number;
}

/** Una subida de más del 20 % casi nunca es el mercado: es un renglón mal casado. */
const SUBIDA_FUERTE_BP = 2_000;

export const importarNotaDeProveedor = definirComando<
  Transaccion,
  typeof entradaImportarNota,
  ResultadoImportacion
>({
  nombre: 'compras.importar_nota',
  entidad: 'compra',
  escribe: false,
  roles: [...COMPRAS],
  paquetes: PAQUETES_TODOS,
  entrada: entradaImportarNota,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const proveedor = await ctx.paso('leer_proveedor', () =>
      ctx.tx
        .selectFrom('proveedores')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.proveedorId)
        .executeTakeFirst(),
    );
    if (proveedor === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese proveedor no existe en este negocio.');
    }

    // El catálogo entero de una vez. Doscientos renglones contra una consulta
    // cada uno son doscientos viajes a la base dentro de la misma transacción,
    // y ahí es donde una importación deja de caber en el tiempo de espera.
    const catalogo = await ctx.paso('leer_catalogo', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre', 'sku', 'codigo_barras', 'costo_unitario_centavos'])
        .where('organizacion_id', '=', organizacionId)
        .where('activo', '=', true)
        .execute(),
    );

    const porCodigo = new Map<string, (typeof catalogo)[number]>();
    for (const producto of catalogo) {
      if (producto.codigo_barras !== null) porCodigo.set(producto.codigo_barras, producto);
      // El SKU interno entra al mismo mapa: media ferretería se escanea por el
      // código que imprimió el negocio, y la hoja del proveedor a veces lo trae
      // copiado del pedido que se le mandó.
      if (producto.sku !== null) porCodigo.set(producto.sku, producto);
    }

    // Lo que ya se emparejó antes con este proveedor. Es el camino exacto, y el
    // único que mejora con el uso: la segunda nota del mismo proveedor casa
    // sola.
    const compras = await ctx.paso('leer_compras', () =>
      ctx.tx
        .selectFrom('compras')
        .select(['id'])
        .where('organizacion_id', '=', organizacionId)
        .where('proveedor_id', '=', entrada.proveedorId)
        .orderBy('created_at', 'desc')
        .limit(MEMORIA_DE_COMPRAS)
        .execute(),
    );
    const historico =
      compras.length === 0
        ? []
        : await ctx.paso('leer_historico', () =>
            ctx.tx
              .selectFrom('compra_lineas')
              .select(['insumo_id', 'clave_proveedor'])
              .where('organizacion_id', '=', organizacionId)
              .where(
                'compra_id',
                'in',
                compras.map((c) => c.id),
              )
              .where('clave_proveedor', 'is not', null)
              .execute(),
          );
    const porClave = new Map<string, string>();
    for (const linea of historico) {
      const clave = linea.clave_proveedor;
      if (clave !== null && clave !== undefined) porClave.set(clave, linea.insumo_id);
    }

    const normalizados = catalogo.map((p) => ({ producto: p, tokens: aTokens(p.nombre) }));

    let emparejados = 0;
    let dudosos = 0;
    let subidasFuertes = 0;
    let total = 0n;

    const renglones: RenglonEmparejado[] = entrada.renglones.map((renglon, indice) => {
      total += BigInt(renglon.costoUnitarioCentavos) * BigInt(Math.round(Number(renglon.cantidad)));

      // 1 · La clave del proveedor. Exacta, y la única que no se equivoca.
      const porHistorico =
        renglon.claveProveedor === null ? undefined : porClave.get(renglon.claveProveedor);
      if (porHistorico !== undefined) {
        emparejados += 1;
        return renglonDe(indice, renglon, porHistorico, 'clave', false, null);
      }

      // 2 · El código de barras, cuando la nota lo trae.
      const porBarras =
        renglon.codigoBarras === null ? undefined : porCodigo.get(renglon.codigoBarras);
      if (porBarras !== undefined) {
        emparejados += 1;
        const variacion = variacionBp(
          porBarras.costo_unitario_centavos,
          renglon.costoUnitarioCentavos,
        );
        if (variacion !== null && variacion > SUBIDA_FUERTE_BP) subidasFuertes += 1;
        return renglonDe(indice, renglon, porBarras.id, 'codigo', false, variacion);
      }

      // 3 · El nombre. Éste SÍ se equivoca, y por eso sale marcado.
      const tokens = aTokens(renglon.descripcion);
      let mejor: { id: string; costo: bigint; parecido: number } | null = null;
      for (const candidato of normalizados) {
        const parecido = seParecen(tokens, candidato.tokens);
        if (parecido >= MINIMO_DE_PARECIDO && (mejor === null || parecido > mejor.parecido)) {
          mejor = {
            id: candidato.producto.id,
            costo: candidato.producto.costo_unitario_centavos,
            parecido,
          };
        }
      }
      if (mejor !== null) {
        emparejados += 1;
        dudosos += 1;
        const variacion = variacionBp(mejor.costo, renglon.costoUnitarioCentavos);
        if (variacion !== null && variacion > SUBIDA_FUERTE_BP) subidasFuertes += 1;
        return renglonDe(indice, renglon, mejor.id, 'nombre', true, variacion);
      }

      return renglonDe(indice, renglon, null, 'ninguno', false, null);
    });

    return {
      proveedorId: entrada.proveedorId,
      folioProveedor: entrada.folioProveedor,
      renglones,
      emparejados,
      dudosos,
      // Los que no casaron se cuentan y se devuelven: una importación que
      // silencia los quince renglones que no reconoció es peor que no importar,
      // porque nadie va a volver a mirarlos.
      sinEmparejar: entrada.renglones.length - emparejados,
      totalCentavos: total.toString(),
      subidasFuertes,
    };
  },
});

function renglonDe(
  indice: number,
  renglon: {
    readonly descripcion: string;
    readonly cantidad: string;
    readonly costoUnitarioCentavos: number;
  },
  productoId: string | null,
  porQue: string,
  dudoso: boolean,
  variacionCostoBp: number | null,
): RenglonEmparejado {
  return {
    indice,
    descripcion: renglon.descripcion,
    cantidad: renglon.cantidad,
    costoUnitarioCentavos: renglon.costoUnitarioCentavos.toString(),
    productoId,
    porQue,
    dudoso,
    variacionCostoBp,
  };
}

function variacionBp(costoAnterior: bigint, costoNuevo: number): number | null {
  if (costoAnterior <= 0n) return null;
  return Number(((BigInt(costoNuevo) - costoAnterior) * 10_000n) / costoAnterior);
}

/**
 * El nombre, partido en palabras comparables.
 *
 * Sin acentos y sin las palabras de una letra: «TORNILLO 1/4 X 2 GALV» y
 * «Tornillo 1/4x2 galvanizado» son el mismo tornillo y tienen que parecerlo.
 */
function aTokens(texto: string): ReadonlySet<string> {
  return new Set(
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9/]+/)
      .filter((t) => t.length > 1),
  );
}

/**
 * Cuánto se parecen dos nombres, entre 0 y 1.
 *
 * Es Jaccard y no una distancia de edición: lo que cambia entre la hoja del
 * proveedor y el catálogo es el ORDEN y las abreviaturas, no las letras. Con
 * distancia de edición, «galv» y «galvanizado» quedarían lejísimos.
 */
function seParecen(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const token of a) if (b.has(token)) comunes += 1;
  return comunes / (a.size + b.size - comunes);
}
