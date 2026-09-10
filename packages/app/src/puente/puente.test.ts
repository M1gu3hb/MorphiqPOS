import { describe, expect, it } from 'vitest';

import { CONFIG_POR_OMISION, PUBLICOS } from './configuracion.ts';
import { calcular } from './consultar.ts';
import { entidadMapeada, MAPA } from './mapa.ts';
import { haciaEl, haciaLaBase, LIMITE_MAXIMO, type Conversion } from './tipos.ts';

/**
 * La prueba de IDA Y VUELTA del puente (E3-6).
 *
 * «Se construye un objeto con la forma vieja, se traduce, y debe volver
 * idéntico. Sin esa prueba, un campo mal mapeado rompe una pantalla en
 * silencio.» Y no rompe con un error: rompe con un precio que trae dos ceros de
 * más en un ticket, seis meses después, cuando ya nadie recuerda por qué.
 *
 * Aquí se prueba la CONVERSIÓN y la FORMA del mapa, que es lo que se puede
 * comprobar sin base. El viaje completo contra Postgres —escribir, leer y
 * comparar— vive en las pruebas de integración.
 */

/** Un valor representativo por cada tipo de conversión. */
const MUESTRAS: Readonly<Record<Conversion, readonly unknown[]>> = {
  texto: ['Panini caprese', '', 'Café con leche · 12 oz'],
  entero: [0, 1, 42, -7],
  // Los que más duelen si el redondeo falla.
  dinero: [0, 1, 45.5, 45.55, 0.01, 115, 1234.99, 99999.99],
  decimal: [0, 0.5, 1.25, 250, 1000.125],
  puntos_base: [0, 8, 16, 16.5, 35],
  booleano: [true, false],
  fecha: ['2026-09-09T18:30:00.000Z'],
  dia: ['2026-09-09'],
  json: [{ a: 1 }, [1, 2, 3]],
};

describe('el puente traduce sin perder nada', () => {
  for (const [conversion, valores] of Object.entries(MUESTRAS) as [Conversion, unknown[]][]) {
    it(`«${conversion}» cierra el círculo`, () => {
      for (const original of valores) {
        const enLaBase = haciaLaBase(original, conversion);
        const devuelto = haciaEl(enLaBase, conversion);
        if (conversion === 'json') {
          expect(devuelto).toStrictEqual(original);
        } else if (conversion === 'texto' || conversion === 'dia') {
          expect(devuelto).toBe(original);
        } else if (conversion === 'fecha') {
          expect(devuelto).toBe(original);
        } else {
          expect(devuelto).toBe(original);
        }
      }
    });
  }

  it('el dinero se guarda en centavos ENTEROS', () => {
    // `45.55 * 100` en coma flotante da 4554.999…, y sin el redondeo un
    // producto de 45.55 se guardaría a 45.54. Nadie lo notaría hasta el corte.
    expect(haciaLaBase(45.55, 'dinero')).toBe(4555n);
    expect(haciaLaBase(0.07, 'dinero')).toBe(7n);
    expect(haciaLaBase(1234.995, 'dinero')).toBe(123500n);
  });

  it('el nulo sigue siendo nulo en los dos sentidos', () => {
    for (const conversion of Object.keys(MUESTRAS) as Conversion[]) {
      expect(haciaEl(null, conversion)).toBeNull();
      expect(haciaLaBase(null, conversion)).toBeNull();
      expect(haciaEl(undefined, conversion)).toBeNull();
    }
  });

  it('un objeto convertido a texto no se vuelve «[object Object]»', () => {
    expect(haciaLaBase({ x: 1 }, 'texto')).toBe('{"x":1}');
  });
});

describe('la forma del mapa', () => {
  it('ninguna entidad declara dos campos suyos sobre la misma columna', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      const columnas = Object.values(mapa.campos).map((c) => c.columna);
      // Dos campos apuntando a la misma columna es un error de copiar y pegar
      // que sólo se ve cuando uno pisa al otro al guardar.
      expect(new Set(columnas).size, `${entidad} repite una columna`).toBe(columnas.length);
    }
  });

  it('toda entidad trae `id`: su frontend lo lee siempre', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      expect(Object.keys(mapa.campos), `${entidad} sin id`).toContain('id');
    }
  });

  it('los tres campos automáticos nunca se aceptan del cliente', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      for (const clave of ['id', 'created_date', 'updated_date']) {
        const campo = mapa.campos[clave];
        if (campo === undefined) continue;
        expect(campo.escribible, `${entidad}.${clave}`).toBe(false);
      }
    }
  });

  it('el orden por omisión existe como campo', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      if (mapa.ordenPorOmision === undefined) continue;
      const clave = mapa.ordenPorOmision.replace(/^-/, '');
      expect(Object.keys(mapa.campos), `${entidad} ordena por un campo que no tiene`).toContain(
        clave,
      );
    }
  });

  /**
   * Las reglas 1 y 11 de `F1-01` §3, afirmadas sobre el USO y no sobre el
   * nombre: si alguien vuelve escribible el total de una venta, el servidor
   * dejaría de ser quien decide cuánto se cobra.
   */
  it('ningún importe de una venta se acepta del cliente', () => {
    for (const entidad of [
      'Venta',
      'DetalleVenta',
      'CompraInsumo',
      'DetalleCompra',
      'GastoOperativo',
      'LiquidacionPropina',
      'SolicitudQR',
    ] as const) {
      const mapa = MAPA[entidad];
      expect(mapa).toBeDefined();
      for (const [clave, campo] of Object.entries(mapa?.campos ?? {})) {
        if (campo.conversion !== 'dinero' && campo.conversion !== 'puntos_base') continue;
        expect(campo.escribible, `${entidad}.${clave} se puede escribir desde el cliente`).toBe(
          false,
        );
      }
    }
  });

  it('las entidades transaccionales no se escriben por el puente', () => {
    // Las catorce operaciones de `F1-01` §6 tienen su comando. Escribir una
    // venta campo por campo desde el navegador es el defecto D-07.
    for (const entidad of [
      'Venta',
      'DetalleVenta',
      'MovimientoInventario',
      'CorteCaja',
      'RecetaEscandallo',
      // Enviar el pedido escribe comanda, items y el estado de las líneas de
      // venta a la vez. Hoy `POS.jsx:462` se traga el error del `create` y el
      // pedido no llega a cocina sin que nadie se entere.
      'PedidoPreparacion',
      'PedidoPreparacionItem',
      // La compra escribe cabecera, líneas, stock, existencias y el costo
      // promedio ponderado. Hoy la cabecera va primero y el bucle después: si
      // falla la línea 3 de 5 queda una compra con el total mal (D-12).
      'CompraInsumo',
      'DetalleCompra',
      // Un gasto en efectivo sale del cajón: mueve la caja.
      'GastoOperativo',
      // Liquidar marca N ventas y crea la liquidación.
      'LiquidacionPropina',
      // Crear, atender y resolver mueven mesa y venta, y el anti-duplicado era
      // un TOCTOU (D-17).
      'SolicitudQR',
    ] as const) {
      expect(MAPA[entidad]?.escritura, entidad).toBe('comando');
    }
  });

  /**
   * Lo recíproco: el catálogo SÍ se escribe por el puente. Si alguien marcara
   * `Proveedor` como comando «por si acaso», la sección de proveedores dejaría
   * de guardar y el error sólo aparecería al pulsar el botón.
   */
  it('el catálogo se escribe por el puente, sin comando propio', () => {
    for (const entidad of [
      'ProductoTerminado',
      'CategoriaProducto',
      'CategoriaIngrediente',
      'Ingrediente',
      'Zona',
      'Mesa',
      'EstacionPreparacion',
      'Proveedor',
      'PlantillaGasto',
      'PlantillaCompra',
      'MenuQRSeccion',
      'IntegrationSyncLog',
    ] as const) {
      expect(MAPA[entidad]?.escritura, entidad).toBe('directa');
    }
  });

  /**
   * `F1-01` §3, regla 8: los registros históricos guardan el nombre en
   * instantánea, así que borrar de verdad rompería un ticket de hace seis
   * meses. Si una entidad de catálogo perdiera su campo `activo`, `borrar()`
   * pasaría a hacer un `delete` físico sin que nadie cambiara esa línea.
   */
  it('el catálogo se apaga, no se borra', () => {
    for (const entidad of [
      'ProductoTerminado',
      'CategoriaProducto',
      'Ingrediente',
      'Zona',
      'Mesa',
      'EstacionPreparacion',
      'Proveedor',
      'MenuQRSeccion',
    ] as const) {
      expect(MAPA[entidad]?.campos['activo'], `${entidad} sin borrado suave`).toBeDefined();
    }
  });

  /**
   * Las transiciones de la mesa —abrir, ocupar, pedir la cuenta, liberar— son
   * comandos, no campos. Poder escribir `estado` y `venta_activa_id` sueltos
   * desde el navegador es lo que hoy obliga a `detectarHuerfano` y sus cuatro
   * reglas heurísticas a existir.
   */
  /**
   * `F1-04` §14.3 y el defecto D-06. `stock_actual` tiene que ser DERIVADO y no
   * un campo: en su sistema es una columna que se lee, se calcula y se escribe,
   * y dos cajas cobrando a la vez se pisan el número. Si alguien lo moviera a
   * `campos`, `Ingrediente.update(id, {stock_actual})` volvería a compilar y a
   * corromper el inventario sin dar error.
   */
  it('el stock no se escribe desde el navegador', () => {
    expect(MAPA['Ingrediente']?.campos['stock_actual']).toBeUndefined();
    expect(MAPA['Ingrediente']?.derivados?.['stock_actual']).toBeDefined();
    // Y el costo tampoco: lo pondera el comando de compra (D-13).
    expect(MAPA['Ingrediente']?.campos['costo_por_unidad_base']?.escribible).toBe(false);
  });

  it('el estado de la mesa no se escribe a mano', () => {
    for (const clave of ['estado', 'venta_activa_id', 'personas_actuales']) {
      expect(MAPA['Mesa']?.campos[clave]?.escribible, `Mesa.${clave}`).toBe(false);
    }
  });

  /**
   * La estación general es el respaldo obligatorio (regla 10). Que haya una
   * sola y que no se pueda apagar lo imponen ahora un índice único parcial y
   * un `check`; el puente no puede dejar que se marque otra desde un formulario.
   */
  it('`es_general` no se acepta del cliente', () => {
    expect(MAPA['EstacionPreparacion']?.campos['es_general']?.escribible).toBe(false);
  });

  /**
   * Un rango se pide sobre un campo de FECHA. Las entidades que Registros
   * acota por periodo tienen que tener uno, o la pantalla vuelve a descargarlo
   * todo para filtrar en el navegador.
   */
  it('las entidades del histórico se pueden acotar por fecha', () => {
    const porFecha: Readonly<Record<string, string>> = {
      Venta: 'created_date',
      CorteCaja: 'created_date',
      MovimientoInventario: 'created_date',
      CompraInsumo: 'fecha',
      GastoOperativo: 'fecha',
      LiquidacionPropina: 'fecha_liquidacion',
    };
    for (const [entidad, clave] of Object.entries(porFecha)) {
      const campo = MAPA[entidad]?.campos[clave];
      expect(campo, `${entidad}.${clave} no existe`).toBeDefined();
      expect(
        campo?.conversion === 'fecha' || campo?.conversion === 'dia',
        `${entidad}.${clave} es «${String(campo?.conversion)}», no una fecha`,
      ).toBe(true);
    }
  });

  it('el tope de filas existe y no es absurdo', () => {
    expect(LIMITE_MAXIMO).toBeGreaterThan(0);
    expect(LIMITE_MAXIMO).toBeLessThanOrEqual(1000);
  });

  /**
   * La lista NO se inventa: son los nombres que su código usa de verdad, más
   * `Zona` y `PedidoPreparacionItem`, que la base ahora sí tiene.
   *
   * Si alguien añade una pantalla que consulta una entidad que el puente no
   * conoce, la pantalla devuelve `PUENTE_ENTIDAD_DESCONOCIDA` en producción y
   * nadie se entera hasta que un usuario la abre. Esta prueba lo caza antes.
   */
  it('las 27 entidades de su frontend tienen destino', () => {
    const suyas = [
      'Venta',
      'DetalleVenta',
      'Mesa',
      'Zona',
      'PedidoPreparacion',
      'PedidoPreparacionItem',
      'EstacionPreparacion',
      'Ingrediente',
      'CategoriaIngrediente',
      'ProductoTerminado',
      'CategoriaProducto',
      'RecetaEscandallo',
      'MovimientoInventario',
      'DescuentoInventarioVenta',
      'CorteCaja',
      'CompraInsumo',
      'DetalleCompra',
      'Proveedor',
      'GastoOperativo',
      'PlantillaGasto',
      'PlantillaCompra',
      'SolicitudQR',
      'MenuQRSeccion',
      'LiquidacionPropina',
      'IntegrationSyncLog',
    ];
    for (const nombre of suyas) {
      expect(entidadMapeada(nombre), `${nombre} no está en el puente`).not.toBeNull();
    }
    // `UsuarioPOS` y `ConfiguracionNegocio` NO están en el mapa a propósito: no
    // son una tabla con columnas. Viven en `usuarios.ts` y `configuracion.ts`,
    // y las rutas las despachan aparte.
    expect(entidadMapeada('UsuarioPOS')).toBeNull();
    expect(entidadMapeada('ConfiguracionNegocio')).toBeNull();
  });

  it('una entidad que no existe se rechaza, no devuelve vacío', () => {
    expect(entidadMapeada('Inventada')).toBeNull();
    // Y no se puede llegar a una tabla por su nombre real: el mapa es la única
    // puerta, y sus llaves son los nombres de él.
    expect(entidadMapeada('ordenes')).toBeNull();
    expect(entidadMapeada('credenciales_pin')).toBeNull();
  });
});

describe('los campos derivados', () => {
  it('nunca chocan con un campo real de la misma entidad', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      for (const clave of Object.keys(mapa.derivados ?? {})) {
        // Si un derivado se llamara igual que un campo, la fila traducida
        // pisaría el valor de la columna con el del `join` — y sólo se notaría
        // cuando el `join` diera nulo.
        expect(mapa.campos[clave], `${entidad}.${clave} existe dos veces`).toBeUndefined();
      }
    }
  });

  it('cada derivado apunta a una columna que ESTA entidad tiene', () => {
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      const columnas = new Set(Object.values(mapa.campos).map((c) => c.columna));
      for (const [clave, derivado] of Object.entries(mapa.derivados ?? {})) {
        expect(
          columnas.has(derivado.porColumna),
          `${entidad}.${clave} se une por «${derivado.porColumna}», que no está en el mapa`,
        ).toBe(true);
      }
    }
  });

  it('el nombre del mesero sale de la vista, no de las tablas del PIN', () => {
    // `empleados_visibles` existe justo para esto y NO incluye
    // `credenciales_pin`. Que un derivado apunte a `empleos` o a `personas`
    // sería un `join` de dos saltos que el puente no sabe hacer; que apuntara a
    // `credenciales_pin` sería sacar el hash del PIN por una lista de mesas.
    const permitidas = new Set([
      'empleados_visibles',
      'mesas',
      'zonas',
      'insumos',
      'categorias',
      'existencias_por_insumo',
    ]);
    for (const [entidad, mapa] of Object.entries(MAPA)) {
      for (const [clave, derivado] of Object.entries(mapa.derivados ?? {})) {
        expect(permitidas.has(derivado.tabla), `${entidad}.${clave} → ${derivado.tabla}`).toBe(
          true,
        );
      }
    }
    // Y lo que de verdad importa: ninguna tabla de credenciales, por si mañana
    // alguien amplía la lista de arriba sin pensarlo.
    for (const mapa of Object.values(MAPA)) {
      for (const derivado of Object.values(mapa.derivados ?? {})) {
        expect(derivado.tabla).not.toMatch(/credencial|pin|sesion|identidad/i);
      }
    }
  });
});

/**
 * El costo de una línea de receta es lo que su pantalla de Productos SUMA para
 * enseñar el costo, la utilidad y el margen de cada producto. Si esta fórmula
 * se desvía de la de `recalcularCostosRecetas` (`inventario/recetas.ts:131`),
 * la pantalla y el producto guardado dirían números distintos, y la pantalla
 * ganaría porque es la que se ve.
 */
describe('el costo de una línea de receta', () => {
  const linea = (costoCentavos: string, cantidad: string, mermaBp: string) =>
    calcular('costoDeLineaDeReceta', {
      costo_unitario_base_snapshot: costoCentavos,
      cantidad_convertida_unidad_base: cantidad,
      merma_porcentaje: mermaBp,
    });

  it('multiplica costo por cantidad y suma la merma', () => {
    // 8.10 el gramo × 100 g × 1.05 = 850.50 → 850.50 pesos.
    expect(linea('810', '100.0000', '500')).toBe(850.5);
    // Sin merma.
    expect(linea('2100', '1.0000', '0')).toBe(21);
  });

  it('redondea UNA vez y al final, no en cada paso', () => {
    // 0.07 × 3 × 1.05 = 0.2205 → 0.22. Redondeando por pasos daría 0.24.
    expect(linea('7', '3.0000', '500')).toBe(0.22);
    // El caso que rompe la coma flotante: 1234.995 en centavos.
    expect(linea('123500', '1.0000', '0')).toBe(1235);
  });

  it('la cantidad admite los cuatro decimales de `numeric(14,4)`', () => {
    // 1000 centavos × 0.0001 = 0.1 centavos → 0 tras redondear.
    expect(linea('1000', '0.0001', '0')).toBe(0);
    expect(linea('1000', '0.5000', '0')).toBe(5);
  });

  it('sin costo o sin cantidad devuelve nulo, no cero', () => {
    // Cero y «no sé» son cosas distintas: un cero se suma en la pantalla y
    // hace creer que el ingrediente es gratis.
    expect(linea('810', '', '0')).toBeNull();
    expect(
      calcular('costoDeLineaDeReceta', { cantidad_convertida_unidad_base: '1.0000' }),
    ).toBeNull();
  });

  it('un objeto donde se esperaba un número no se vuelve «[object Object]»', () => {
    expect(
      calcular('costoDeLineaDeReceta', {
        costo_unitario_base_snapshot: { x: 1 },
        cantidad_convertida_unidad_base: '1.0000',
      }),
    ).toBeNull();
  });
});

describe('la lista blanca del portal QR cierra la fuga D-14', () => {
  it('no deja salir la contraseña de presentación', () => {
    expect(PUBLICOS as readonly string[]).not.toContain('presentacion_password');
  });

  it('no deja salir el paquete ni si se muestran costos a caja', () => {
    for (const prohibido of ['paquete_modo', 'mostrar_costos_a_caja', 'modo_presentacion_activo']) {
      expect(PUBLICOS as readonly string[], prohibido).not.toContain(prohibido);
    }
  });

  it('todo lo público existe en la configuración', () => {
    for (const campo of PUBLICOS) {
      expect(Object.keys(CONFIG_POR_OMISION), campo).toContain(campo);
    }
  });

  it('deja salir lo justo para que el menú se vea del negocio', () => {
    for (const necesario of ['nombre_negocio', 'logo_url', 'color_primario', 'simbolo_moneda']) {
      expect(PUBLICOS as readonly string[], necesario).toContain(necesario);
    }
  });
});
