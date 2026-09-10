'use client';
/**
 * EJECUTORES DE IMPORTACIÓN — corren SOLO después de que el usuario confirmó
 * la vista previa. Reciben filas ya validadas (`parsed`) y escriben en BD.
 *
 * Reglas críticas:
 *  - Stock: si se ajusta, SIEMPRE queda el movimiento del ledger con motivo
 *    "Importación masiva". Ya no es una escritura aparte que se pueda perder:
 *    va dentro de la transacción del comando.
 *  - Inactivos: NUNCA reactivar silenciosamente. La vista previa marca esas
 *    filas como `advertencia/_isInactive` y aquí se IGNORAN.
 *  - Cualquier fila marcada como 'error' se ignora.
 *  - Catch por fila → reportamos el error pero seguimos con las demás.
 *
 * ── UNA LLAMADA POR FILA, CON SU PROPIA CLAVE ──────────────────────────────
 * Cada fila es una transacción independiente, y su clave de idempotencia sale
 * del CONTENIDO de la fila, no del azar. Es lo que hace que reimportar el mismo
 * archivo —porque la red se cayó a la mitad, o porque alguien lo subió dos
 * veces— no duplique el inventario: la segunda pasada topa con la ejecución ya
 * confirmada y el comando devuelve el resultado de la primera sin escribir.
 */

import { api } from '@/api/cliente';
import {
  claveDeContenido,
  obtenerAlmacenPrincipalId,
  textoDecimal,
  textoImporte,
} from '@/components/inventario/comandos';
import { unidadBaseDe } from '@/utils/unidadesMedida';

const safeStr = (v) => (v === null || v === undefined ? '' : String(v));

// ---------- INVENTARIO ----------
/**
 * @param previewRows  filas del preview de validarInventario
 * @param options      { ajustarStock: boolean, posUser, fechaIso }
 *                     ajustarStock=false → solo actualiza datos maestros, NO toca stock.
 *                     ajustarStock=true  → ajusta stock al valor del CSV, con su movimiento.
 *
 * `posUser` y `fechaIso` ya no se leen —quién importa sale de la sesión y la
 * fecha del movimiento la pone la transacción—, así que dejan de
 * desestructurarse. La pantalla que llama sigue pasándolos y no pasa nada: son
 * propiedades de más en un objeto de opciones.
 */
export async function ejecutarImportInventario(previewRows, { ajustarStock = false } = {}) {
  const reporte = {
    creados: 0,
    actualizados: 0,
    ajustes_stock: 0,
    omitidos_inactivos: 0,
    fallidos: 0,
    errores: [],
  };

  // El almacén, una sola vez para todo el archivo. Si no se puede resolver, no
  // se importa nada: importar la mitad de un CSV es peor que no importarlo.
  let almacenId = null;
  if (ajustarStock) {
    try {
      almacenId = await obtenerAlmacenPrincipalId();
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(e?.message || 'No se pudo resolver el almacén de la sucursal.');
      return reporte;
    }
  }

  for (const r of previewRows || []) {
    try {
      if (r.status === 'error') {
        continue;
      }
      if (r.status === 'advertencia' && r.parsed?._isInactive) {
        reporte.omitidos_inactivos++;
        continue;
      }
      if (!r.parsed) continue;
      const p = r.parsed;

      // La clave sale del contenido de la fila, no de la línea del archivo: si
      // el mismo insumo llega otra vez con los mismos números es el mismo
      // hecho, aunque esté en otra posición del CSV.
      const claveFila = (paso) =>
        claveDeContenido(`csv-inv-${paso}`, {
          nombre: p.nombre,
          unidad: p.unidad_base,
          stock: p.stock_actual,
          costo: p.costo_por_unidad_base,
          existente: p._existingId || '',
        });

      if (p._existingId) {
        // ACTUALIZAR datos maestros sin tocar stock (siempre seguro).
        //
        // `costo_por_unidad_base` sale de este `update`: el puente ya no lo
        // acepta y es D-13. El CSV lo sobrescribía sin ponderar, pisando el
        // costo histórico que el promedio de las compras había construido.
        // Cuando la fila trae un costo, va por `inventario.actualizar_costo`,
        // que además recalcula el costo de todos los productos que usan ese
        // insumo — que es la mitad que faltaba: sin eso, cambiar el costo de la
        // harina dejaba el margen de todos los panes en una cifra vieja.
        await api.entidades.Ingrediente.update(p._existingId, {
          stock_minimo: p.stock_minimo,
          stock_critico: p.stock_critico,
          unidad_compra_default: p.unidad_compra_default,
          cantidad_por_compra_default: p.cantidad_por_compra_default,
          costo_compra_default: p.costo_compra_default,
          notas: p.notas,
          // No actualizamos nombre/unidad_base/activo aquí para evitar romper recetas existentes
        });
        reporte.actualizados++;

        const costoCsv = Number(p.costo_por_unidad_base) || 0;
        if (costoCsv > 0) {
          await api.comandos.ejecutar(
            '/api/inventario/insumos/costo',
            { insumoId: p._existingId, costoUnitario: textoImporte(costoCsv) },
            claveFila('costo'),
          );
        }

        if (ajustarStock) {
          const oldStock = Number(p._existingStock) || 0;
          const newStock = Number(p.stock_actual) || 0;
          const delta = newStock - oldStock;
          if (delta !== 0) {
            // El ajuste y su movimiento, en una transacción. Se manda el DELTA
            // con signo: el stock es la proyección del ledger y sumar es lo que
            // dos escrituras simultáneas pueden hacer sin pisarse (D-06).
            await api.comandos.ejecutar(
              '/api/inventario/ajustar',
              {
                almacenId,
                insumoId: p._existingId,
                cantidad: textoDecimal(delta),
                motivo: `Importación masiva (línea ${r.line}). Δ = ${delta > 0 ? '+' : ''}${delta} ${p.unidad_base}`,
              },
              claveFila('ajuste'),
            );
            reporte.ajustes_stock++;
          }
        }
      } else {
        // CREAR nuevo insumo. `stock_actual` y `costo_por_unidad_base` ya no
        // son columnas escribibles: el costo entra por el comando de alta y la
        // existencia por `inventario.inicial`.
        const creado = await api.comandos.ejecutar(
          '/api/inventario/insumos/crear',
          {
            nombre: p.nombre,
            unidad: p.unidad_base,
            costoUnitario: textoImporte(Number(p.costo_por_unidad_base) || 0),
            stockMinimo: textoDecimal(Number(p.stock_minimo) || 0),
          },
          claveFila('alta'),
        );
        reporte.creados++;

        // El stock inicial ANTES de los datos maestros, porque entre esos datos
        // puede venir `activo: false` y el comando de existencias exige un
        // insumo activo: al revés, una fila del CSV marcada como inactiva se
        // quedaría sin su carga inicial.
        const stockIni = Number(p.stock_actual) || 0;
        if (stockIni > 0) {
          almacenId = almacenId ?? (await obtenerAlmacenPrincipalId());
          await api.comandos.ejecutar(
            '/api/inventario/inicial',
            { almacenId, insumoId: creado.id, cantidad: textoDecimal(stockIni) },
            claveFila('inicial'),
          );
        }

        // El resto de los datos maestros del CSV, que el comando de alta no
        // conoce, siguen entrando por el puente: son columnas escribibles.
        await api.entidades.Ingrediente.update(creado.id, {
          stock_critico: Number(p.stock_critico) || 0,
          unidad_compra_default: p.unidad_compra_default,
          cantidad_por_compra_default: p.cantidad_por_compra_default,
          costo_compra_default: p.costo_compra_default,
          activo: p.activo !== false,
          notas: p.notas,
        });
      }
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}

// ---------- PRODUCTOS ----------
export async function ejecutarImportProductos(
  previewRows,
  { crearCategoriasFaltantes = false } = {},
) {
  const reporte = { creados: 0, actualizados: 0, fallidos: 0, categorias_creadas: 0, errores: [] };
  const cacheCatPorNombre = new Map();

  for (const r of previewRows || []) {
    try {
      if (r.status === 'error' || !r.parsed) continue;
      const p = r.parsed;

      let catId = p.categoria_id;

      if (!catId && p._categoriaPorCrear && crearCategoriasFaltantes) {
        const claveCache = String(p._categoriaPorCrear).trim().toLowerCase();
        if (cacheCatPorNombre.has(claveCache)) {
          catId = cacheCatPorNombre.get(claveCache).id;
        } else {
          const nuevaCat = await api.entidades.CategoriaProducto.create({
            nombre: String(p._categoriaPorCrear).trim(),
            activo: true,
            orden: 99,
          });
          cacheCatPorNombre.set(claveCache, nuevaCat);
          catId = nuevaCat.id;
          reporte.categorias_creadas++;
        }
      }

      // `categoria_nombre` no viaja: es un derivado del puente —sale del `join`
      // con `categorias` al leer— y no tiene columna donde guardarse. La
      // instantánea del nombre dejó de ser cosa del cliente.
      //
      // `categoria_id` va en `null` y no en cadena vacía cuando no hay
      // categoría: la columna es un uuid, y '' no es uno.
      const payload = {
        nombre: p.nombre,
        categoria_id: catId || null,
        descripcion: safeStr(p.descripcion),
        precio_venta: Number(p.precio_venta) || 0,
        area_preparacion: p.area_preparacion || 'ninguno',
        visible_en_pos: p.visible_en_pos !== false,
        activo: p.activo !== false,
      };

      if (p._existingId) {
        await api.entidades.ProductoTerminado.update(p._existingId, payload);
        reporte.actualizados++;
      } else {
        await api.entidades.ProductoTerminado.create(payload);
        reporte.creados++;
      }
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}

// ---------- RECETAS ----------
/**
 * Agrupa las filas válidas por producto y guarda la receta de cada uno.
 *
 * ── D-11: una receta se reemplaza entera o no se toca ──────────────────────
 * Esto era una coreografía de escrituras sueltas: crear las líneas nuevas una
 * por una, después inactivar las viejas una por una —con un `catch` por línea
 * que sólo dejaba un aviso—, y si algo fallaba, un «rollback best-effort» que
 * borraba las nuevas con más `catch {}` vacíos. Cualquier fallo a mitad dejaba
 * el producto con líneas nuevas y líneas viejas conviviendo, y su costo, su
 * utilidad y su margen describiendo una receta que no existía.
 *
 * `inventario.guardar_receta` borra las líneas anteriores, inserta las nuevas y
 * recalcula el costo del producto DENTRO de una transacción. Un producto entra
 * entero o no entra, y no hay nada que revertir desde el navegador.
 *
 * REGLAS QUE SIGUEN VALIENDO:
 *  1. Sin `reemplazarExistente`, un producto que ya tiene receta se omite.
 *  2. Cualquier fila marcada como 'error' se ignora.
 *  3. La cantidad va EN LA UNIDAD BASE del insumo, que es la única que el
 *     comando acepta: el validador ya la convirtió en
 *     `cantidad_convertida_unidad_base` y comprobó la compatibilidad.
 */
export async function ejecutarImportRecetas(previewRows, { reemplazarExistente = false } = {}) {
  const reporte = {
    productos_actualizados: 0,
    lineas_creadas: 0,
    productos_omitidos: 0,
    lineas_inactivadas: 0,
    fallidos: 0,
    errores: [],
  };

  // Solo filas con parsed válido (status: 'nueva' o 'advertencia')
  const validas = (previewRows || []).filter((r) => r.parsed && r.status !== 'error');

  // Agrupar por producto_id
  const porProducto = new Map();
  for (const r of validas) {
    const k = r.parsed.producto_id;
    if (!porProducto.has(k)) porProducto.set(k, []);
    porProducto.get(k).push(r.parsed);
  }

  for (const [productoId, lineas] of porProducto.entries()) {
    const productoNombre = lineas[0]?.producto_nombre || productoId;
    try {
      // Verificar si hay recetas activas previas
      const existentes = await api.entidades.RecetaEscandallo.filter({ producto_id: productoId });
      const existentesActivas = (Array.isArray(existentes) ? existentes : []).filter(
        (x) => x?.activo !== false,
      );

      if (existentesActivas.length > 0 && !reemplazarExistente) {
        reporte.productos_omitidos++;
        reporte.errores.push(
          `Producto "${productoNombre}" ya tiene receta. Marca "Reemplazar receta existente" para sobrescribir.`,
        );
        continue;
      }

      const ingredientes = lineas.map((l) => {
        const cantBase = Number(l.cantidad_convertida_unidad_base);
        if (!Number.isFinite(cantBase) || cantBase <= 0) {
          throw new Error(
            `Línea inválida para "${l.ingrediente_nombre}": cantidad convertida ${cantBase}`,
          );
        }
        // La unidad base del insumo se deduce de la unidad del CSV, que el
        // validador ya declaró compatible: kg y g dan «g», l y ml dan «ml».
        // Mandar la unidad tal cual venía del archivo es justo lo que el
        // comando rechaza con `UNIDAD_INCOMPATIBLE` — y lo que multiplicaba
        // por mil el consumo cuando nadie lo rechazaba.
        const unidadBase = unidadBaseDe(l.unidad_usada) || l.unidad_usada;
        return {
          insumoId: l.ingrediente_id,
          cantidad: textoDecimal(cantBase),
          unidad: unidadBase,
          // La merma se guarda en puntos base, no en porcentaje.
          mermaBp: Math.min(10000, Math.max(0, Math.round((Number(l.merma_porcentaje) || 0) * 100))),
        };
      });

      // Una llamada por producto, con la clave derivada de su receta completa:
      // reimportar el mismo archivo no vuelve a escribirla.
      await api.comandos.ejecutar(
        '/api/inventario/recetas',
        { productoId, ingredientes },
        claveDeContenido('csv-receta', { productoId, ingredientes }),
      );

      // El costo, la utilidad y el margen del producto los recalcula el propio
      // comando sumando las líneas que acaba de guardar. El `update` con
      // `costo_calculado_actual` que iba aquí detrás —con su `catch {}` vacío—
      // era D-09 escrito a mano: cuando fallaba, el producto se quedaba con el
      // costo viejo y nadie se enteraba; y ahora esas columnas ni se aceptan.
      reporte.lineas_creadas += ingredientes.length;
      reporte.lineas_inactivadas += existentesActivas.length;
      reporte.productos_actualizados++;
    } catch (e) {
      // Sin rollback que hacer: si el comando falló, la receta anterior sigue
      // exactamente como estaba.
      reporte.fallidos++;
      reporte.errores.push(
        `Producto "${productoNombre}": ${e?.message || 'error'} — receta anterior intacta.`,
      );
    }
  }
  return reporte;
}

// ---------- PROVEEDORES ----------
export async function ejecutarImportProveedores(previewRows) {
  const reporte = { creados: 0, actualizados: 0, fallidos: 0, errores: [] };
  for (const r of previewRows || []) {
    try {
      if (r.status === 'error' || !r.parsed) continue;
      const p = r.parsed;
      const payload = {
        nombre: p.nombre,
        contacto: p.contacto,
        telefono: p.telefono,
        correo: p.correo,
        notas: p.notas,
        activo: p.activo !== false,
      };
      if (p._existingId) {
        await api.entidades.Proveedor.update(p._existingId, payload);
        reporte.actualizados++;
      } else {
        await api.entidades.Proveedor.create(payload);
        reporte.creados++;
      }
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}

// ---------- GASTOS ----------
/**
 * `posUser` deja de leerse: quién importa sale de la sesión del servidor.
 *
 * Un gasto en efectivo mueve la caja, y `gastos.registrar` escribe el
 * movimiento de salida en la misma transacción que el gasto. Por eso la clave
 * de idempotencia importa aquí más que en ningún otro importador: reimportar
 * el archivo de gastos del mes sin ella vaciaría el cajón dos veces.
 */
export async function ejecutarImportGastos(previewRows) {
  const reporte = { creados: 0, fallidos: 0, errores: [] };
  for (const r of previewRows || []) {
    try {
      if (r.status === 'error' || !r.parsed) continue;
      const p = r.parsed;
      const notas = `[Importado] ${p.notas || ''}`.trim();
      await api.comandos.ejecutar(
        '/api/gastos/registrar',
        {
          fecha: p.fecha,
          descripcion: p.descripcion,
          categoria: p.categoria,
          monto: textoDecimal(Number(p.monto) || 0),
          metodoPago: p.metodo_pago,
          notas,
        },
        claveDeContenido('csv-gasto', {
          fecha: p.fecha,
          descripcion: p.descripcion,
          categoria: p.categoria,
          monto: p.monto,
          metodo: p.metodo_pago,
        }),
      );
      reporte.creados++;
    } catch (e) {
      reporte.fallidos++;
      reporte.errores.push(`Línea ${r.line}: ${e?.message || 'error'}`);
    }
  }
  return reporte;
}
