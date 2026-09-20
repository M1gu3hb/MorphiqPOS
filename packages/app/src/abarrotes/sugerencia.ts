import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import {
  alertasDeMinimo,
  diasHastaLaVisita,
  sugerirPedido,
  type MotivoSugerencia,
  type NivelDeAlerta,
} from '@morphiqpos/domain/inventario';
import { z } from 'zod';

import { definirComando, type ContextoComando } from '../definicion.ts';

/**
 * F-107 · «¿Qué le pido a Bimbo?», contestado con el repartidor delante.
 *
 * ── Por qué es una LECTURA y no un pedido ─────────────────────────────────
 * Porque quien decide es el tendero. El sistema propone; convertir esto en una
 * orden de compra automática pondría a pedir lo que la aritmética diga sin que
 * nadie mire, y el día que una venta se capture mal se pediría el triple. Lo
 * que la máquina sabe es cuánto se vendió; lo que el tendero sabe es que la
 * próxima semana es quincena.
 *
 * ── Por qué la ventana de venta es de catorce días ────────────────────────
 * Es la más corta que cubre dos fines de semana. Siete días hace que un puente
 * o un día de lluvia desvíen el pedido entero; treinta suaviza tanto que un
 * producto que se disparó hace dos semanas se sigue pidiendo como antes.
 * Se puede cambiar por llamada, y por omisión son catorce.
 */

const ROLES = ['almacen', 'gerente', 'administrador', 'dueno'] as const;

/** Un día de colchón: el repartidor puede no llegar, y llegar sin producto es peor. */
const DIAS_DE_COLCHON = 1;

export const entradaSugerirPedido = z.object({
  proveedorId: z.uuid(),
  /**
   * De qué almacén se mira la existencia. OPCIONAL: sin él, el principal de la
   * sucursal de la sesión.
   *
   * La pantalla de entradas no sabe en qué almacén está —ni tiene por qué
   * preguntarlo para enseñar qué pedir— y obligarla a mandarlo la hacía cargar
   * primero la lista de almacenes para contestar algo que el servidor ya sabe.
   * Se sigue aceptando porque el reporte de compras sí elige almacén.
   */
  almacenId: z.uuid().optional(),
  /** Cuántos días de venta se miran para estimar el ritmo. */
  diasDeVenta: z.number().int().min(1).max(90).default(14),
});

export interface RenglonSugerido {
  readonly insumoId: string;
  readonly nombre: string;
  /** Lo que cuesta UNA unidad base. De aquí salen los dos importes. */
  readonly costoUnitarioCentavos: string;
  /** Lo que costaría pedir lo sugerido. Es lo que decide si se pide hoy o no. */
  readonly importeCentavos: string;
  /**
   * El dinero que ya está parado en el anaquel de ese material.
   *
   * Es el único momento en que el dinero dormido puede cambiar la decisión: ver
   * «$18,400 en brocas ya paradas» justo cuando el vendedor trae promoción de
   * brocas es lo que detiene la compra. En un reporte de fin de mes ese mismo
   * dato no cambia nada.
   */
  readonly dormidoCentavos: string;
  readonly existenciaBase: string;
  readonly ventaDelPeriodoBase: string;
  readonly faltanBase: string;
  readonly presentacionesSugeridas: number;
  readonly unidadCompra: string;
  readonly motivo: MotivoSugerencia;
  readonly alerta: NivelDeAlerta;
}

export interface PedidoSugerido {
  readonly proveedorId: string;
  readonly proveedor: string;
  /** `null` cuando el proveedor no tiene ruta: se le llama por teléfono. */
  readonly diasHastaLaVisita: number | null;
  readonly diasDeCobertura: number;
  readonly renglones: readonly RenglonSugerido[];
}

export const sugerenciaDePedido = definirComando<
  Transaccion,
  typeof entradaSugerirPedido,
  PedidoSugerido
>({
  nombre: 'compras.sugerir_pedido',
  entidad: 'insumo',
  escribe: false,
  roles: [...ROLES],
  paquetes: PAQUETES_OPERATIVOS,
  modulo: 'compras',
  entrada: entradaSugerirPedido,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const proveedor = await ctx.paso('cargar_proveedor', () =>
      ctx.tx
        .selectFrom('proveedores')
        .select(['id', 'nombre', 'dia_visita as diaVisita'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', '=', entrada.proveedorId)
        .executeTakeFirst(),
    );
    if (proveedor === undefined) {
      throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese proveedor no existe en este negocio.');
    }

    // `dia_visita` es `not null default '{}'` desde la 099: el arreglo vacío es
    // «no tiene ruta», y no hace falta defenderse de un nulo que la base impide.
    const hastaLaVisita = diasHastaLaVisita(proveedor.diaVisita, ctx.ahora);
    // Sin ruta declarada se cubre una semana: es lo que tarda en promedio un
    // proveedor al que hay que llamar. Suponer cero pediría lo justo para hoy.
    const diasDeCobertura = (hastaLaVisita ?? 7) + DIAS_DE_COLCHON;

    // El almacén: el que se pidió, o el principal de la sucursal de la SESIÓN.
    // Nunca uno inventado: la existencia de otro almacén haría pedir de más en
    // esta tienda y de menos en la otra.
    const almacenId = entrada.almacenId ?? (await resolverAlmacen(ctx));

    const articulos = await ctx.paso('cargar_articulos', () =>
      ctx.tx
        .selectFrom('insumos')
        .select([
          'id',
          'nombre',
          'unidad_base as unidadBase',
          'stock_minimo as stockMinimo',
          'stock_critico as stockCritico',
          'unidad_compra_default as unidadCompra',
          'cantidad_por_compra_default as factorCompra',
          'costo_unitario_centavos as costoUnitario',
        ])
        .where('organizacion_id', '=', organizacionId)
        .where('proveedor_id', '=', entrada.proveedorId)
        .where('activo', '=', true)
        .execute(),
    );
    if (articulos.length === 0) {
      return {
        proveedorId: proveedor.id,
        proveedor: proveedor.nombre,
        diasHastaLaVisita: hastaLaVisita,
        diasDeCobertura,
        renglones: [],
      };
    }

    const existencias = await ctx.paso('cargar_existencias', () =>
      ctx.tx
        .selectFrom('existencias')
        .select(['insumo_id as insumoId', 'cantidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', '=', almacenId)
        .where(
          'insumo_id',
          'in',
          articulos.map((a) => a.id),
        )
        .execute(),
    );
    const porInsumo = new Map(existencias.map((e) => [e.insumoId, e.cantidad]));

    const desde = new Date(ctx.ahora.getTime() - entrada.diasDeVenta * 24 * 60 * 60 * 1000);
    const salidas = await ctx.paso('cargar_venta', () =>
      ctx.tx
        .selectFrom('movimientos_stock')
        .select(['insumo_id as insumoId', 'cantidad'])
        .where('organizacion_id', '=', organizacionId)
        .where('almacen_id', '=', almacenId)
        // SÓLO la venta. La merma y el ajuste de conteo salen del almacén
        // igual, pero no predicen nada: pedir para reponer lo que se echó a
        // perder es cómo se compra la merma dos veces.
        .where('tipo', '=', 'salida_venta')
        .where('created_at', '>=', desde)
        .execute(),
    );

    const vendido = new Map<string, bigint>();
    for (const salida of salidas) {
      // El ledger guarda la salida en negativo. Lo que se vendió es su valor
      // absoluto, y sumarlo con signo daría un ritmo negativo.
      const magnitud = aDiezmilesimas(salida.cantidad);
      vendido.set(salida.insumoId, (vendido.get(salida.insumoId) ?? 0n) + abs(magnitud));
    }

    const alertas = new Map(
      alertasDeMinimo(
        articulos.map((a) => ({
          insumoId: a.id,
          existenciaBase: porInsumo.get(a.id) ?? '0',
          stockMinimo: a.stockMinimo,
          stockCritico: a.stockCritico,
        })),
      ).map((a) => [a.insumoId, a.nivel]),
    );

    const renglones: RenglonSugerido[] = [];
    for (const articulo of articulos) {
      const existencia = porInsumo.get(articulo.id) ?? '0';
      const ventaDelPeriodoBase = deDiezmilesimas(vendido.get(articulo.id) ?? 0n);

      const sugerencia = sugerirPedido({
        existenciaBase: existencia,
        stockMinimo: articulo.stockMinimo,
        ventaDelPeriodoBase,
        diasDelPeriodo: entrada.diasDeVenta,
        diasDeCobertura,
        // Sin presentación de compra declarada se pide en unidad base: pedir
        // «1.7 cajas» no es una respuesta y suponer una caja de doce inventaría
        // un empaque que el proveedor no maneja.
        factorCompra: articulo.factorCompra ?? '1',
      });

      // Lo que ya está cubierto no entra a la lista. Una lista con el catálogo
      // entero es la lista que nadie lee con el repartidor en la puerta.
      if (sugerencia.presentacionesSugeridas === 0) continue;

      // Los dos importes, con el costo de la UNIDAD BASE:
      //   pedido   = presentaciones × unidades base por presentación × costo
      //   dormido  = existencia (diezmilésimas) × costo / 10 000
      // Redondeado hacia abajo al centavo, que es la única forma de que dos
      // pantallas sumen lo mismo.
      // La columna es `bigint`, así que la aritmética entera es entera de punta a
      // punta: un `number` de por medio perdería centavos en un pedido grande.
      const costo = articulo.costoUnitario;
      const porPresentacion = aDiezmilesimas(articulo.factorCompra ?? '1');
      const importe =
        (BigInt(sugerencia.presentacionesSugeridas) * porPresentacion * costo) / ESCALA_CANTIDAD;
      const dormido = (aDiezmilesimas(existencia) * costo) / ESCALA_CANTIDAD;

      renglones.push({
        insumoId: articulo.id,
        nombre: articulo.nombre,
        costoUnitarioCentavos: costo.toString(),
        importeCentavos: importe.toString(),
        dormidoCentavos: dormido.toString(),
        existenciaBase: existencia,
        ventaDelPeriodoBase,
        faltanBase: sugerencia.faltanBase,
        presentacionesSugeridas: sugerencia.presentacionesSugeridas,
        unidadCompra: articulo.unidadCompra ?? articulo.unidadBase,
        motivo: sugerencia.motivo,
        alerta: alertas.get(articulo.id) ?? 'normal',
      });
    }

    // Lo urgente arriba: si la lista se corta a la mitad porque el repartidor
    // tiene prisa, lo que se alcanzó a pedir es lo que hoy se acaba.
    renglones.sort(compararRenglones);

    return {
      proveedorId: proveedor.id,
      proveedor: proveedor.nombre,
      diasHastaLaVisita: hastaLaVisita,
      diasDeCobertura,
      renglones,
    };
  },
});

/** Diezmilésimas: la escala de `numeric(14,4)` y la de `Cantidad` en el dominio. */
const ESCALA_CANTIDAD = 10_000n;

/**
 * El almacén principal de la sucursal de la sesión.
 *
 * Aparte para que el comando lea de un golpe: la existencia de la que se decide
 * qué pedir es la de DONDE SE VENDE, y eso lo sabe el servidor.
 */
async function resolverAlmacen(ctx: ContextoComando<Transaccion>): Promise<string> {
  const { organizacionId, sucursalId } = ctx.ambito;
  if (sucursalId === null) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'La sugerencia mira la existencia de un almacén, y el almacén es de una sucursal: esta ' +
        'sesión no tiene una.',
    );
  }
  const almacenId = await ctx.paso('resolver_almacen', () =>
    repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
  );
  if (almacenId === null) {
    throw new ErrorDominio(
      'CONFIGURACION_INVALIDA',
      'Esta sucursal no tiene almacén dado de alta: no hay existencia que mirar.',
    );
  }
  return almacenId;
}

const PESO_DE_ALERTA: Record<NivelDeAlerta, number> = { critico: 0, bajo: 1, normal: 2 };

function compararRenglones(a: RenglonSugerido, b: RenglonSugerido): number {
  const peso = PESO_DE_ALERTA[a.alerta] - PESO_DE_ALERTA[b.alerta];
  if (peso !== 0) return peso;
  // Empate: por nombre, para que dos cargas de la misma lista salgan iguales.
  return a.nombre.localeCompare(b.nombre);
}

function abs(valor: bigint): bigint {
  return valor < 0n ? -valor : valor;
}

/** `'-24.0000'` → `-240000n`. Acepta el signo, que `cantidad()` rechaza. */
function aDiezmilesimas(texto: string): bigint {
  const limpio = texto.trim();
  const negativo = limpio.startsWith('-');
  const [entera = '0', decimal = ''] = (negativo ? limpio.slice(1) : limpio).split('.');
  const escalado = BigInt(entera || '0') * 10_000n + BigInt(decimal.padEnd(4, '0').slice(0, 4));
  return negativo ? -escalado : escalado;
}

function deDiezmilesimas(valor: bigint): string {
  return `${(valor / 10_000n).toString()}.${(valor % 10_000n).toString().padStart(4, '0')}`;
}
