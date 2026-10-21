import type { Esquema, repoVentaCatalogo } from '@morphiqpos/data';
import type { ReglaImpuesto } from '@morphiqpos/domain/venta';
import type { Insertable } from 'kysely';

type IngredienteDeReceta = repoVentaCatalogo.IngredienteDeReceta;

/**
 * Las formas que comparten el lector del contexto, el planificador de un día y el escritor.
 *
 * El planificador es PURO: recibe un `ContextoDeHistorial` (lo que no cambia de un día a otro:
 * catálogo, gente, mesas) y un `EstadoDelDia` (lo que sí: folios, existencias, fondo) y
 * devuelve un `PlanDelDia` —las filas que se van a escribir, ya con sus ids y sus horas—. Sin
 * base de datos en el medio se puede probar que un día cuadra en milisegundos, y el escritor
 * se limita a insertar lo que el plan dice.
 */

export type Fila<T extends keyof Esquema> = Insertable<Esquema[T]>;

export interface EmpleadoRef {
  readonly id: string;
  readonly nombre: string;
  readonly rol: string;
}

export interface ProductoVendible {
  readonly id: string;
  readonly nombre: string;
  readonly sku: string | null;
  readonly codigoBarras: string | null;
  /** La clase de platillo, deducida del nombre de su categoría: decide cómo se arma una cuenta. */
  readonly clase: ClaseDePlatillo;
  readonly precioCentavos: bigint;
  readonly costoCentavos: bigint;
  readonly unidadVenta: string;
  readonly areaPreparacion: string;
  readonly estacionDeCategoriaId: string | null;
  readonly minutosPreparacion: number | null;
  readonly tiempoServicio: number | null;
  readonly estrategiaConsumo: string;
  readonly permiteVentaSinStock: boolean;
  readonly insumoId: string | null;
  readonly unidadBaseInsumo: string | null;
  readonly receta: readonly IngredienteDeReceta[];
  /** Qué tan pedido es, de 0.35 a 2: estable entre días, para que haya platillos estrella. */
  readonly popularidad: number;
}

export type ClaseDePlatillo = 'entrada' | 'principal' | 'bebida' | 'postre';

export interface MesaRef {
  readonly id: string;
  readonly numero: number;
  readonly capacidad: number;
}

export interface EstacionRef {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
  readonly esGeneral: boolean;
}

export interface InsumoRef {
  readonly id: string;
  readonly nombre: string;
  readonly unidadBase: string;
  readonly costoCentavos: bigint;
  /** En diezmilésimas, como `numeric(14,4)`. */
  readonly stockMinimo: bigint;
  readonly proveedorId: string | null;
}

export interface ProveedorRef {
  readonly id: string;
  readonly nombre: string;
}

export interface TopeRef {
  readonly topeCentavos: bigint;
  readonly topeBp: number;
}

/** Lo que no cambia de un día a otro de una misma corrida. */
export interface ContextoDeHistorial {
  readonly organizacionId: string;
  readonly sucursalId: string;
  readonly terminalId: string;
  readonly almacenId: string;
  readonly zona: string;
  readonly semilla: number;
  readonly cajeros: readonly EmpleadoRef[];
  readonly meseros: readonly EmpleadoRef[];
  readonly gerentes: readonly EmpleadoRef[];
  readonly productos: readonly ProductoVendible[];
  readonly mesas: readonly MesaRef[];
  readonly estaciones: readonly EstacionRef[];
  readonly insumos: ReadonlyMap<string, InsumoRef>;
  readonly proveedores: readonly ProveedorRef[];
  readonly impuesto: ReglaImpuesto;
  /** El tope de descuento libre del cajero: sin fila en `topes_descuento` es cero. */
  readonly topeDelCajero: TopeRef;
}

/** Lo que sí cambia: se lee dentro de la transacción del día, con el candado ya tomado. */
export interface EstadoDelDia {
  /** Los PRÓXIMOS folios de cada serie de la sucursal (`folios.siguiente`). */
  readonly folioOrden: bigint;
  readonly folioCaja: bigint;
  readonly folioTurno: bigint;
  /**
   * El saldo del ledger del almacén por insumo ANTES de este día, en diezmilésimas. Sin entrada
   * es cero. Es el ledger y no la proyección `existencias`: ver `leerEstadoDelDia`.
   */
  readonly existencias: ReadonlyMap<string, bigint>;
  /** Lo que dejó el último cierre de la terminal, o `null` si es la primera caja. */
  readonly fondoDejadoCentavos: bigint | null;
}

/** Un renglón de la existencia: cuánto sube o baja el saldo de un insumo en el día. */
export interface DeltaDeExistencia {
  readonly insumoId: string;
  readonly cantidad: bigint;
}

export interface ResumenDelDia {
  readonly dia: string;
  readonly tickets: number;
  readonly ventasCentavos: bigint;
  readonly propinasCentavos: bigint;
  readonly efectivoEsperadoCentavos: bigint;
  readonly compras: number;
  readonly gastos: number;
}

/** Todo lo que se escribe para un día, en el orden en que lo pide la integridad referencial. */
export interface PlanDelDia {
  readonly dia: string;
  readonly sesion: Fila<'sesiones_caja'>;
  readonly ordenes: readonly Fila<'ordenes'>[];
  readonly lineas: readonly Fila<'orden_lineas'>[];
  readonly pagos: readonly Fila<'pagos'>[];
  readonly movimientosCaja: readonly Fila<'movimientos_caja'>[];
  readonly comandas: readonly Fila<'comandas'>[];
  readonly comandaItems: readonly Fila<'comanda_items'>[];
  readonly compras: readonly Fila<'compras'>[];
  readonly compraLineas: readonly Fila<'compra_lineas'>[];
  readonly gastos: readonly Fila<'gastos'>[];
  readonly movimientosStock: readonly Fila<'movimientos_stock'>[];
  readonly autorizaciones: readonly Fila<'autorizaciones_descuento'>[];
  readonly cortesTurno: readonly Fila<'cortes_turno'>[];
  readonly conteos: readonly Fila<'conteos_denominacion'>[];
  readonly deltasDeExistencia: readonly DeltaDeExistencia[];
  readonly foliosConsumidos: {
    readonly orden: bigint;
    readonly caja: bigint;
    readonly turno: bigint;
  };
  readonly resumen: ResumenDelDia;
}
