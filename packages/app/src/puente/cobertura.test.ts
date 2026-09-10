import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONFIG_POR_OMISION } from './configuracion.ts';
import { entidadMapeada } from './mapa.ts';

/**
 * EL CONTRATO DE COBERTURA DEL PUENTE.
 *
 * Su plataforma declaraba cada entidad en un `.jsonc` con todas sus
 * propiedades. Esos archivos siguen en `historico/restaurante/`, que ya no es
 * una carpeta prohibida: es la fuente del frontend.
 *
 * Esta prueba afirma que CADA propiedad declarada tiene destino en el puente:
 * una columna, un derivado, un calculado, o un descarte con motivo escrito.
 *
 * ── Por qué así y no contando campos ───────────────────────────────────────
 * Un contrato que compara números —«27 entidades», «50 campos»— pasa igual
 * cuando el campo que falta es justo el que una pantalla lee. Este compara
 * NOMBRE POR NOMBRE contra el esquema que su código daba por cierto, así que
 * un campo olvidado no puede esconderse detrás de un total que cuadra.
 *
 * Es la prueba que habría cazado `categoria_nombre` y `stock_actual` antes de
 * verlos en el navegador, y no después.
 *
 * NO es un `import` de `historico/`: se leen los archivos como datos. La
 * prohibición de `eslint.config.mjs` es sobre importar código, y sigue viva.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESQUEMAS = join(AQUI, '../../../../historico/restaurante/base44/entities');

/**
 * Lo que el puente NO expone, con el motivo.
 *
 * Un hueco declarado es honesto; un campo que desaparece en silencio, no.
 * Cada entrada dice POR QUÉ, y si mañana alguien quiere el campo, aquí está la
 * discusión ya hecha en vez de un misterio.
 */
const DESCARTADOS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Venta: {
    // Se DERIVAN de `pagos`, que es donde vive la propina. Ver F1-04 §6.1: que
    // estén en tablas distintas es lo que vuelve estructuralmente imposible
    // romper la regla 1 (`total` es la venta SIN propina).
    propina_monto: 'derivado de pagos.propina_centavos',
    propina_efectivo: 'derivado de pagos, por método, EXACTO (regla 3)',
    propina_tarjeta: 'derivado de pagos, por método, EXACTO (regla 3)',
    propina_transferencia: 'derivado de pagos, por método, EXACTO (regla 3)',
    total_cobrado_con_propina: 'derivado: total + suma de propinas, campo aparte de `total`',
    propina_liquidada: 'derivado de propina_liquidacion_id: un booleano aparte se desincroniza',
    metodo_pago: 'derivado de pagos: uno solo da ese, dos o más dan «mixto»',
    monto_efectivo: 'derivado de pagos (incluye la propina en efectivo)',
    monto_tarjeta: 'derivado de pagos',
    monto_transferencia: 'derivado de pagos',
    cambio: 'derivado de pagos.cambio_centavos',
    satisfaccion_label: 'derivado del score: guardar los dos es guardar el mismo dato dos veces',
    satisfaccion_origen: 'constante «portal_qr» en v1, no columna',
    fecha_apertura: 'es `created_at`: el mismo instante',
    tipo_venta: 'se abre en estrategia_captura + estrategia_cumplimiento (F1-04 §6.5)',
  },
  DetalleVenta: {
    costo_total_linea_snapshot: 'derivado: costo_unitario × cantidad (F1-04 §7.3)',
    utilidad_linea_snapshot: 'derivado de subtotal y costo',
    margen_linea_snapshot: 'derivado de subtotal y costo',
    modificadores_snapshot: 'se normaliza a filas de orden_linea_modificadores (F1-04 §7.4)',
  },
  Mesa: {},
  PedidoPreparacion: {
    items: 'se normaliza a comanda_items, que cocina actualiza fila por fila (F1-04 §10.1)',
    venta_folio: 'derivado del serie+folio de la orden',
    fecha_creacion: 'es `created_at`: el mismo instante',
  },
  Ingrediente: {
    // `stock_actual` sí está, pero como DERIVADO: es la diferencia que importa.
  },
  RecetaEscandallo: {},
  MovimientoInventario: {
    stock_anterior: 'se descarta a propósito: el ledger es la verdad (F1-04 §18.3)',
    stock_nuevo: 'se descarta a propósito: el ledger es la verdad (F1-04 §18.3)',
    costo_total_movimiento: 'derivado: cantidad × costo_unitario_en_momento',
    fecha: 'es `created_date`: el ledger es inmutable y sólo tiene un instante',
  },
  /**
   * `CorteCaja` es la entidad con más campos derivados de todas, y a propósito.
   *
   * `F1-04` §20.2: los totales NO SE GUARDAN. Salen de `movimientos_caja` y
   * `pagos` acotados al rango, cada vez. Guardarlos sería una segunda copia de
   * lo que ya está en la base, y la copia se desincroniza: es exactamente el
   * problema de `efectivo_esperado`, que hoy tiene TRES fórmulas distintas en
   * su código y no coinciden entre sí (§20.4).
   */
  CorteCaja: {
    tipo_corte: 'se parte en sesiones_caja y cortes_turno (F1-04 §20.1)',
    corte_padre_id: 'un corte de turno apunta a su sesión con sesion_caja_id',
    fecha_inicio: 'para la sesión coincide con fecha_apertura; el corte de turno tiene rango propio',
    diferencia_apertura: 'derivado: fondo contado menos fondo esperado',
    efectivo_esperado: 'derivado de movimientos_caja; tenía TRES fórmulas (F1-04 §20.4)',
    total_efectivo: 'derivado de pagos acotados al rango (F1-04 §20.2)',
    total_tarjeta: 'derivado de pagos acotados al rango',
    total_transferencia: 'derivado de pagos acotados al rango',
    total_general: 'derivado: la suma de los tres métodos',
    total_propinas: 'derivado de pagos.propina_centavos, nunca de ordenes.total',
    total_descuentos: 'derivado de ordenes.descuento_centavos del rango',
    total_cancelaciones: 'derivado de las órdenes canceladas del rango',
    numero_ventas: 'derivado: cuenta de órdenes del rango',
    ticket_promedio: 'derivado: total entre número de ventas',
    costo_total_estimado: 'derivado de las líneas del rango',
    utilidad_bruta_total: 'derivado: total menos costo, SIN propina (regla 2)',
    margen_promedio: 'derivado de utilidad y total',
    utilidad_neta_estimada: 'derivado: utilidad bruta menos gastos del rango',
    diferencia_efectivo: 'derivado: contado menos esperado',
    total_gastos: 'derivado de gastos del rango',
    propinas_por_mesero: 'derivado por empleado (F1-04 §20.8)',
    resumen_ingredientes: 'no existe: se deriva del ledger si hace falta (F1-04 §20.7)',
  },
  CompraInsumo: {},
  DetalleCompra: {
    costo_unitario_base_calculado: 'derivado: costo_total / cantidad (F1-04 §23)',
  },
  GastoOperativo: {},
  SolicitudQR: {
    fecha_creacion: 'es `created_at`: el mismo instante',
    total_estimado: 'derivado: subtotal + propina sugerida',
  },
  MenuQRSeccion: {
    archivo_url: 'MUERTO: ni se escribe ni se lee en los 244 archivos (F1-04 §29)',
  },
  LiquidacionPropina: {
    numero_ventas: 'derivado: count de órdenes con este propina_liquidacion_id',
    venta_ids: 'derivado de ordenes.propina_liquidacion_id (F1-04 §30.1)',
    desglose_meseros: 'derivado (F1-04 §30.1)',
  },
  CategoriaIngrediente: {
    descripcion: 'la columna existe; la entidad es zombi y no tiene interfaz (F1-04 §33.1)',
  },
  CategoriaProducto: {
    descripcion: 'la columna existe en categorias; su formulario no la escribe',
    estacion_preparacion_id: 'la columna existe; se resuelve en la cadena de F1-04 §11.2',
    estacion_preparacion_nombre: 'instantánea en la comanda, no en la categoría',
    estacion_preparacion_color: 'instantánea en la comanda, no en la categoría',
  },
  EstacionPreparacion: {},
  Proveedor: {},
  PlantillaGasto: {},
  PlantillaCompra: {},
  ProductoTerminado: {
    modificadores: 'se normaliza a tres tablas (F1-04 §15.4)',
    // Su `TipoVentaSection.jsx:132` lo escribe como la constante 'ml' y nadie
    // lo lee jamás. `ml_por_porcion` ya dice lo mismo y con un número.
    unidad_contenedor_base: 'constante «ml» que su formulario escribe y nadie lee',
  },
  IntegrationSyncLog: {},
  DescuentoInventarioVenta: {
    detalle_venta_id: 'la vista agrega por insumo y no puede reconstruirlo (F1-04 §19.1)',
    producto_id: 'la vista agrega por insumo y no puede reconstruirlo (F1-04 §19.1)',
    cantidad_producto: 'la vista agrega por insumo y no puede reconstruirlo (F1-04 §19.1)',
    cantidad_ingrediente_por_producto: 'la vista agrega por insumo y no lo reconstruye (F1-04 §19.1)',
    costo_total_descontado: 'derivado: cantidad × costo_unitario',
    fecha: 'coincide con created_date: el movimiento del ledger tiene un solo instante',
  },
};

/** Las que no son una tabla con columnas y viven fuera del mapa. */
const FUERA_DEL_MAPA = new Set(['UsuarioPOS', 'ConfiguracionNegocio']);

interface EsquemaEntidad {
  readonly name?: string;
  readonly properties?: Readonly<Record<string, unknown>>;
}

function leerEsquemas(): Map<string, readonly string[]> {
  const mapa = new Map<string, readonly string[]>();
  for (const archivo of readdirSync(ESQUEMAS)) {
    if (!archivo.endsWith('.jsonc')) continue;
    const bruto = readFileSync(join(ESQUEMAS, archivo), 'utf8');
    // Los `.jsonc` de esta carpeta no traen comentarios de verdad, pero se
    // quitan por si acaso: un `JSON.parse` que revienta aquí se leería como
    // «la entidad no existe», que es justo el silencio que esta prueba evita.
    const limpio = bruto.replace(/^\s*\/\/.*$/gm, '');
    const esquema = JSON.parse(limpio) as EsquemaEntidad;
    const nombre = esquema.name ?? archivo.replace(/\.jsonc$/, '');
    mapa.set(nombre, Object.keys(esquema.properties ?? {}));
  }
  return mapa;
}

const ESQUEMAS_LEIDOS = leerEsquemas();

describe('el puente cubre lo que su esquema declaraba', () => {
  it('los `.jsonc` de su plataforma siguen ahí y se leen', () => {
    // Si esta falla, las de abajo pasarían vacías y dirían que todo está bien.
    expect(ESQUEMAS_LEIDOS.size).toBeGreaterThanOrEqual(25);
    expect(ESQUEMAS_LEIDOS.get('Mesa')).toContain('numero');
  });

  for (const [entidad, propiedades] of ESQUEMAS_LEIDOS) {
    if (FUERA_DEL_MAPA.has(entidad)) continue;

    it(`${entidad}: cada propiedad declarada tiene destino`, () => {
      const mapa = entidadMapeada(entidad);
      expect(mapa, `${entidad} no está en el puente`).not.toBeNull();
      if (mapa === null) return;

      const conocidas = new Set([
        ...Object.keys(mapa.campos),
        ...Object.keys(mapa.derivados ?? {}),
        ...Object.keys(mapa.calculados ?? {}),
      ]);
      const descartadas = DESCARTADOS[entidad] ?? {};

      const huerfanas = propiedades.filter(
        (p) => !conocidas.has(p) && !Object.prototype.hasOwnProperty.call(descartadas, p),
      );
      expect(
        huerfanas,
        `${entidad}: sin destino ni motivo → ${huerfanas.join(', ')}. ` +
          'O se mapea, o se añade a DESCARTADOS diciendo por qué.',
      ).toEqual([]);
    });
  }

  /**
   * El otro lado del contrato: un motivo de descarte que ya no corresponde a
   * ninguna propiedad es basura que sobrevive a un renombrado y hace creer que
   * la decisión sigue vigente.
   */
  it('ningún motivo de descarte sobra', () => {
    for (const [entidad, motivos] of Object.entries(DESCARTADOS)) {
      const propiedades = new Set(ESQUEMAS_LEIDOS.get(entidad) ?? []);
      const sobran = Object.keys(motivos).filter((p) => !propiedades.has(p));
      expect(sobran, `${entidad}: motivos que ya no describen nada → ${sobran.join(', ')}`).toEqual(
        [],
      );
    }
  });

  /**
   * Y el caso contrario: un motivo sobre un campo que SÍ está mapeado.
   *
   * Es peor que sobrar, porque miente en la dirección cómoda: dice «esto no
   * está y da igual» sobre algo que sí está, y esconde el mapeo de quien lea la
   * lista para saber qué falta.
   */
  it('ningún motivo describe un campo que sí está mapeado', () => {
    for (const [entidad, motivos] of Object.entries(DESCARTADOS)) {
      const mapa = entidadMapeada(entidad);
      if (mapa === null) continue;
      const mapeados = new Set([
        ...Object.keys(mapa.campos),
        ...Object.keys(mapa.derivados ?? {}),
        ...Object.keys(mapa.calculados ?? {}),
      ]);
      const contradictorios = Object.keys(motivos).filter((p) => mapeados.has(p));
      expect(
        contradictorios,
        `${entidad}: descartados pero mapeados → ${contradictorios.join(', ')}`,
      ).toEqual([]);
    }
  });

  it('todo motivo de descarte explica algo, no es un hueco en blanco', () => {
    for (const [entidad, motivos] of Object.entries(DESCARTADOS)) {
      for (const [propiedad, motivo] of Object.entries(motivos)) {
        expect(motivo.trim().length, `${entidad}.${propiedad} sin motivo`).toBeGreaterThan(10);
      }
    }
  });

  /**
   * EL AGUJERO QUE ESTE CONTRATO TENÍA, Y QUE SE CIERRA AQUÍ.
   *
   * «Se llama X en el puente» PARECE un motivo y no lo es: su código lee el
   * nombre DECLARADO, no el que a uno le guste más. Aceptarlo dejó pasar
   * `utilidad_bruta_snapshot` —que leen nueve archivos—, `costo_total_snapshot`
   * —otros nueve— y `fecha_apertura` —dieciséis—, todos devolviendo `undefined`
   * mientras el contrato decía que estaba todo cubierto.
   *
   * Un renombrado no es un descarte. Si el campo existe, se mapea CON SU
   * NOMBRE; si no existe, el motivo tiene que decir qué lo sustituye.
   */
  it('«se llama de otra forma» NO es un motivo de descarte', () => {
    const excusas = /^(se llama|es \w+_|se renombr)/i;
    for (const [entidad, motivos] of Object.entries(DESCARTADOS)) {
      for (const [propiedad, motivo] of Object.entries(motivos)) {
        // Se permite «es `created_at`: …» y similares SÓLO cuando explican que
        // el dato es el mismo instante o el mismo valor, no un alias distinto.
        const esAliasPuro = excusas.test(motivo.trim()) && !motivo.includes(':');
        expect(
          esAliasPuro,
          `${entidad}.${propiedad}: «${motivo}» es un renombrado, no un descarte. ` +
            'Su código lee el nombre declarado: mapéalo CON SU NOMBRE.',
        ).toBe(false);
      }
    }
  });
});

describe('ConfiguracionNegocio, que no es una tabla con columnas', () => {
  it('cada campo declarado tiene valor por omisión o motivo', () => {
    const propiedades = ESQUEMAS_LEIDOS.get('ConfiguracionNegocio') ?? [];
    expect(propiedades.length).toBeGreaterThan(30);
    // Su `Configuracion.jsx` lee la configuración completa y espera que los
    // interruptores tengan un valor. Un campo sin omisión sale `undefined`, y
    // un interruptor con `undefined` se pinta apagado aunque esté encendido.
    const conocidos = new Set(Object.keys(CONFIG_POR_OMISION));
    const sinOmision = propiedades.filter((p) => !conocidos.has(p));
    // No se exige cubrirlos todos —son 76 y la mayoría son texto libre—, pero
    // sí que el número no crezca sin que alguien lo mire.
    expect(sinOmision.length).toBeLessThanOrEqual(50);
  });

  it('la contraseña de presentación NO tiene valor por omisión', () => {
    // Un valor por omisión aquí sería una contraseña por omisión. Se compara en
    // el servidor contra un hash y no sale nunca por ningún camino (D-19).
    expect(Object.keys(CONFIG_POR_OMISION)).not.toContain('presentacion_password');
  });
});
