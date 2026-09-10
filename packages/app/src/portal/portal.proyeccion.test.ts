import { describe, expect, it } from 'vitest';

import { banderasDe } from './banderas.ts';
import { cuentaPublica, type FilaCuenta, type FilaLineaCuenta } from './cuenta-publica.ts';
import { negocioPublico, productoDeMenu, type FilaProductoMenu } from './lista-blanca.ts';

/**
 * Lo que un DESCONOCIDO se lleva del portal, campo por campo.
 *
 * Esta mitad del módulo es proyección pura —entra una fila, sale un objeto—,
 * así que se puede afirmar entera sin base de datos. La otra mitad, la que
 * escribe, vive en `portal.escrituras.test.ts`.
 */

const PRODUCTO = '00000000-0000-4000-8000-00000000000a';

/** La configuración COMPLETA, como la descarga hoy `PortalCliente.jsx:65`. */
const CONFIGURACION_ENTERA = {
  id: 'cfg-1',
  nombre_negocio: 'Cantina La Mezcalera',
  logo_url: 'https://ejemplo.mx/logo.png',
  background_logo_url: 'https://ejemplo.mx/marca.png',
  // Lo que hoy se fuga, y que esta prueba existe para impedir.
  presentacion_password: '2797',
  paquete_modo: 'restaurante_pro',
  mostrar_costos_a_caja: true,
  modo_presentacion_activo: true,
  google_sheets_spreadsheet_id: '1AbCdEfGhIjK',
  google_drive_folder_id: '0BxYzZz',
  last_sync_error: 'ECONNREFUSED en /var/task/sync.js:41',
  direccion: 'Av. Juárez 120, Puebla',
  telefono: '2221234567',
  correo: 'miguel@ejemplo.mx',
  iva_porcentaje: 16,
  permitir_venta_sin_stock: true,
  hora_inicio_dia_operativo: '06:00',
} as const;

/** Los tres campos de identidad que `§36.3` autoriza. TODO lo demás sobra. */
const PERMITIDOS: readonly string[] = ['nombre_negocio', 'logo_url', 'background_logo_url'];

/**
 * Lo que no puede salir, DERIVADO de la configuración completa.
 *
 * Escribir la lista a mano dejaría fuera lo que se añada mañana al esquema, que
 * es exactamente cómo aparecen las fugas. Aquí, cualquier campo nuevo en el
 * documento cuenta como prohibido mientras nadie lo autorice a propósito.
 */
const SECRETOS = Object.keys(CONFIGURACION_ENTERA).filter(
  (clave) => clave !== 'id' && !PERMITIDOS.includes(clave),
);

const BANDERAS_ABIERTAS = banderasDe({
  portal_qr_activo: true,
  portal_qr_permitir_pedidos_cliente: true,
  asignacion_mesas_activa: true,
});

const FILA_PRODUCTO: FilaProductoMenu = {
  id: PRODUCTO,
  nombre: 'Mole poblano',
  descripcion: 'Con ajonjolí',
  imagen_url: 'https://ejemplo.mx/mole.jpg',
  categoria_id: 'cat-1',
  categoria_nombre: 'Fuertes',
  precio_venta_centavos: 21500n,
  tipo_venta: 'precio_fijo',
  unidad_venta: 'pieza',
  unidad_variable: null,
  presets_variable: [{ etiqueta: '1/2 kg', cantidad: '0.5' }],
  presets_porcion: null,
  precio_por_unidad_variable_centavos: null,
  nombre_porcion: null,
  precio_por_porcion_centavos: null,
};

const FILA_CUENTA: FilaCuenta = {
  id: 'orden-1',
  estado: 'cuenta_solicitada',
  serie: 'A',
  folio: 42n,
  personas: 2,
  subtotal_centavos: 21500n,
  descuento_centavos: 0n,
  impuestos_centavos: 2966n,
  total_centavos: 21500n,
  propina_puntos_base: 1500,
  propina_tipo: 'porcentaje',
  propina_origen: 'portal_qr',
  satisfaccion_score: null,
};

const FILA_LINEA: FilaLineaCuenta = {
  id: 'linea-1',
  producto_nombre: 'Mole poblano',
  cantidad: '1.0000',
  unidad: 'pieza',
  precio_unitario_centavos: 21500n,
  total_centavos: 21500n,
  notas: null,
  estado_preparacion: 'listo',
};

describe('D-14 · la respuesta pública se construye eligiendo, no quitando', () => {
  const negocio = negocioPublico(CONFIGURACION_ENTERA, BANDERAS_ABIERTAS, true);

  it('no deja salir la contraseña de presentación ni el plan contratado', () => {
    for (const prohibido of SECRETOS) {
      expect(Object.keys(negocio), prohibido).not.toContain(prohibido);
    }
  });

  it('tampoco deja salir sus VALORES por otro nombre', () => {
    // Comprobar las claves no basta: alguien podría copiar el valor a un campo
    // que sí sale. Se busca el secreto en la respuesta serializada entera.
    const serializada = JSON.stringify(negocio);
    expect(serializada).not.toContain('2797');
    expect(serializada).not.toContain('1AbCdEfGhIjK');
    expect(serializada).not.toContain('0BxYzZz');
    expect(serializada).not.toContain('ECONNREFUSED');
    expect(serializada).not.toContain('2221234567');
  });

  it('sustituye `paquete_modo` por un booleano derivado', () => {
    expect(negocio.puede_ordenar).toBe(true);
    expect(JSON.stringify(negocio)).not.toContain('restaurante_pro');
  });

  it('no publica si la cocina usa estaciones: es operación interna', () => {
    expect(Object.keys(negocio)).not.toContain('estaciones_preparacion_activas');
  });

  it('deja salir lo justo para que el menú se vea del negocio', () => {
    expect(negocio.nombre_negocio).toBe('Cantina La Mezcalera');
    expect(negocio.logo_url).toBe('https://ejemplo.mx/logo.png');
    expect(negocio.portal_qr_mostrar_precios).toBe(true);
  });
});

describe('el menú no lleva costos, márgenes ni receta', () => {
  const producto = productoDeMenu(FILA_PRODUCTO, true);

  it('la proyección tiene EXACTAMENTE los campos declarados', () => {
    // Un `toEqual` sobre las claves y no un `not.toContain`: así, añadir un
    // campo al menú es una decisión que rompe esta prueba, no un descuido.
    expect(Object.keys(producto).sort()).toEqual(
      [
        'categoria_id',
        'categoria_nombre',
        'descripcion',
        'id',
        'imagen_url',
        'nombre',
        'nombre_porcion',
        'precio_por_porcion',
        'precio_por_porcion_centavos',
        'precio_por_unidad_variable',
        'precio_por_unidad_variable_centavos',
        'precio_venta',
        'precio_venta_centavos',
        // Los atajos de cantidad que el comensal toca en vez de teclear. Son
        // los dos únicos campos que se añadieron a esta lista después del
        // hallazgo 7, y entraron a propósito: el mapa del puente ya los marca
        // `publico: true` para este portal y `ProductoQRDialog.jsx:157` los
        // pinta. Al pasar el portal a la lectura pública se quedaron fuera y
        // los botones desaparecieron sin que nada fallara.
        'presets_porcion_qr',
        'presets_variable_qr',
        'tipo_venta',
        'unidad_venta',
        'unidad_variable',
      ].sort(),
    );
  });

  it('los atajos no llevan precio, ni siquiera con los precios encendidos', () => {
    // Son cantidades y etiquetas. Si alguien mete un importe dentro, el portal
    // volvería a tener un precio que no pasó por `mostrarPrecios`.
    const texto = JSON.stringify(producto.presets_variable_qr);
    expect(texto).not.toMatch(/precio|importe|centavos|costo/i);
    expect(productoDeMenu({ ...FILA_PRODUCTO, presets_variable: null }, true).presets_variable_qr)
      .toEqual([]);
  });

  it('ni costo, ni utilidad, ni margen, ni receta, ni insumo', () => {
    const claves = Object.keys(producto).join(' ');
    for (const prohibido of ['costo', 'utilidad', 'margen', 'receta', 'insumo', 'estrategia']) {
      expect(claves, prohibido).not.toContain(prohibido);
    }
  });

  it('el precio sale en pesos, como lo espera su frontend', () => {
    expect(producto.precio_venta).toBe(215);
  });

  it('la precuenta tampoco enseña lo que le cuesta al negocio', () => {
    const cuenta = cuentaPublica(FILA_CUENTA, [FILA_LINEA], true);

    const serializada = JSON.stringify(cuenta);
    for (const prohibido of ['costo', 'utilidad', 'margen']) {
      expect(serializada, prohibido).not.toContain(prohibido);
    }
    expect(cuenta.total).toBe(215);
    expect(cuenta.folio).toBe('A-42');
  });
});

/**
 * R15 en la frontera de salida.
 *
 * El flotante se queda porque su frontend lo lee, pero deja de ser la ÚNICA
 * fuente: el entero exacto viaja al lado. La prueba usa un importe cuyo
 * flotante NO es exacto —12 345 678 901 234 567 centavos— porque con 215.00
 * cualquier implementación pasa, incluida la que sólo sabe dividir entre cien.
 */
describe('el dinero sale también en centavos enteros', () => {
  it('el precio del menú lleva su entero exacto en cadena', () => {
    const producto = productoDeMenu(
      { ...FILA_PRODUCTO, precio_venta_centavos: 12_345_678_901_234_567n },
      true,
    );

    expect(producto.precio_venta_centavos).toBe('12345678901234567');
    // El flotante ya perdió dígitos: por eso el entero no puede faltar.
    expect(String(producto.precio_venta)).not.toContain('12345678901234567');
  });

  it('las líneas y los totales de la precuenta también', () => {
    const cuenta = cuentaPublica(FILA_CUENTA, [FILA_LINEA], true);

    expect(cuenta.total_centavos).toBe('21500');
    expect(cuenta.subtotal_centavos).toBe('21500');
    expect(cuenta.impuestos_centavos).toBe('2966');
    expect(cuenta.lineas[0]?.total_centavos).toBe('21500');
    expect(cuenta.lineas[0]?.precio_unitario_centavos).toBe('21500');
  });
});

/**
 * Hallazgo 7: las banderas DECIDEN, no sólo se publican.
 *
 * Con el interruptor apagado el importe no puede estar en la respuesta **por
 * ningún nombre**: ni en pesos, ni en centavos. Por eso se busca el número en
 * la respuesta serializada entera y no sólo en los campos que uno recuerda.
 */
describe('el negocio que apaga los precios no los manda', () => {
  it('un producto sin precios no lleva ningún importe', () => {
    const producto = productoDeMenu(FILA_PRODUCTO, false);

    expect(producto.precio_venta).toBeNull();
    expect(producto.precio_venta_centavos).toBeNull();
    expect(JSON.stringify(producto)).not.toContain('21500');
    expect(JSON.stringify(producto)).not.toContain('215');
    // Lo que no es dinero sigue saliendo: el menú tiene que poder pintarse.
    expect(producto.nombre).toBe('Mole poblano');
  });

  it('con la precuenta apagada no salen ni totales ni líneas', () => {
    const cuenta = cuentaPublica(FILA_CUENTA, [FILA_LINEA], false);

    expect(cuenta.lineas).toEqual([]);
    expect(cuenta.total).toBeNull();
    expect(cuenta.total_centavos).toBeNull();
    expect(cuenta.subtotal_centavos).toBeNull();
    expect(cuenta.impuestos_centavos).toBeNull();
    expect(JSON.stringify(cuenta)).not.toContain('21500');
    expect(JSON.stringify(cuenta)).not.toContain('Mole poblano');
    // El estado y `ya_valorada` no son dinero, y su pantalla los necesita para
    // saber qué puede hacer el comensal.
    expect(cuenta.estado).toBe('cuenta_solicitada');
    expect(cuenta.ya_valorada).toBe(false);
  });
});
