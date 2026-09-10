import { ErrorDominio } from '@morphiqpos/contracts';
import type { repoVentaCatalogo } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { validar } from '../errores.ts';
import { resolverAmbitoPortal, type FilaMesaPorToken } from './ambito.ts';
import { banderasDe, porcentajesValidos } from './banderas.ts';
import { definirComandoPublico } from './definicion-publica.ts';
import { entradaEnviarPedido, entradaPedirCuenta, entradaValorar } from './esquemas.ts';
import { cuentaPublica } from './cuenta-publica.ts';
import { negocioPublico, productoDeMenu } from './lista-blanca.ts';
import { puedeOrdenarDesdeQR } from './negocio.ts';
import { valorarParaPedido } from './productos.ts';

/**
 * Las pruebas del portal público, sin base de datos.
 *
 * Lo que se afirma aquí es lo que un desconocido puede obtener y lo que puede
 * hacer. Son las dos preguntas del módulo, y las dos se pueden contestar con
 * funciones puras: la lista blanca es una proyección, y la resolución del
 * ámbito es una decisión sobre una fila. Lo que necesita Postgres —que la
 * transacción revierta, que el índice único rechace la segunda solicitud— vive
 * en las pruebas de integración y está declarado como hueco en el informe.
 */

const ORG = '00000000-0000-4000-8000-000000000001';
const OTRA_ORG = '00000000-0000-4000-8000-0000000000ff';
const MESA = '00000000-0000-4000-8000-000000000002';
const SUCURSAL = '00000000-0000-4000-8000-000000000003';
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
  const producto = productoDeMenu({
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
    precio_por_unidad_variable_centavos: null,
    nombre_porcion: null,
    precio_por_porcion_centavos: null,
  });

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
        'precio_por_unidad_variable',
        'precio_venta',
        'tipo_venta',
        'unidad_venta',
        'unidad_variable',
      ].sort(),
    );
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
    const cuenta = cuentaPublica(
      {
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
      },
      [
        {
          id: 'linea-1',
          producto_nombre: 'Mole poblano',
          cantidad: '1.0000',
          unidad: 'pieza',
          precio_unitario_centavos: 21500n,
          total_centavos: 21500n,
          notas: null,
          estado_preparacion: 'listo',
        },
      ],
    );

    const serializada = JSON.stringify(cuenta);
    for (const prohibido of ['costo', 'utilidad', 'margen']) {
      expect(serializada, prohibido).not.toContain(prohibido);
    }
    expect(cuenta.total).toBe(215);
    expect(cuenta.folio).toBe('A-42');
  });
});

describe('D-17 · el precio lo pone el servidor, no el comensal', () => {
  const producto: repoVentaCatalogo.ProductoParaVender = {
    id: PRODUCTO,
    nombre: 'Mole poblano',
    sku: null,
    codigoBarras: null,
    tipoVenta: 'precio_fijo',
    unidadVenta: 'pieza',
    precioVentaCentavos: 21500n,
    costoUnitarioCentavos: 7000n,
    precioMayoreoCentavos: null,
    cantidadMinimaMayoreo: null,
    unidadVariable: null,
    precioPorUnidadVariableCentavos: null,
    cantidadMinimaVariable: null,
    cantidadMaximaVariable: null,
    incrementoVariable: null,
    capacidadContenedorMl: null,
    mlPorPorcion: null,
    porcionesPorContenedor: null,
    precioPorPorcionCentavos: null,
    estrategiaConsumo: 'ninguno',
    permiteVentaSinStock: true,
    insumoId: null,
    unidadBaseInsumo: null,
  };

  it('un pedido con un precio dentro NO se acepta: se rechaza entero', () => {
    const conPrecio = validar(entradaEnviarPedido, {
      items: [{ productoId: PRODUCTO, cantidad: '2', precio_venta: 1 }],
      notaGeneral: '',
    });

    expect(conPrecio.ok).toBe(false);
    if (conPrecio.ok) return;
    expect(conPrecio.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('y el mismo pedido sin el precio sí se acepta', () => {
    const limpio = validar(entradaEnviarPedido, {
      items: [{ productoId: PRODUCTO, cantidad: '2' }],
    });
    expect(limpio.ok).toBe(true);
  });

  it('el importe sale del catálogo, cueste lo que cueste en el carrito', () => {
    const valorada = valorarParaPedido(producto, '2');
    expect(valorada.precio.subtotalCentavos).toBe(43000n);
    expect(valorada.precio.precioUnitarioCentavos).toBe(21500n);
  });

  it('la propina tampoco admite un importe del cliente', () => {
    const conMonto = validar(entradaPedirCuenta, {
      propinaTipo: 'porcentaje',
      propinaPorcentaje: 15,
      propinaCentavos: 5000,
    });
    expect(conMonto.ok).toBe(false);
  });

  it('la valoración no admite un emoji escrito por el cliente', () => {
    const conEmoji = validar(entradaValorar, { score: 5, satisfaccion_emoji: '💀' });
    expect(conEmoji.ok).toBe(false);
  });
});

describe('el token no distingue «no existe» de «no es tuyo»', () => {
  const filaDe = (cambios: Partial<FilaMesaPorToken> = {}): FilaMesaPorToken => ({
    id: MESA,
    organizacion_id: ORG,
    sucursal_id: SUCURSAL,
    numero: 5,
    nombre: 'Terraza 5',
    estado: 'libre',
    orden_activa_id: null,
    empleado_asignado_id: null,
    qr_activa: true,
    activa: true,
    ...cambios,
  });

  const fallo = async (
    filas: readonly FilaMesaPorToken[],
    token = 'mabc123xyz',
  ): Promise<unknown> =>
    resolverAmbitoPortal(() => Promise.resolve(filas), ORG, token).then(
      () => null,
      (error: unknown) => error,
    );

  const forma = (error: unknown): Readonly<Record<string, unknown>> => {
    expect(error).toBeInstanceOf(ErrorDominio);
    const dominio = error as ErrorDominio;
    return { codigo: dominio.codigo, mensaje: dominio.message, detalles: dominio.detalles };
  };

  it('los cinco casos devuelven exactamente la misma respuesta', async () => {
    const noExiste = forma(await fallo([]));
    const deOtraOrganizacion = forma(await fallo([filaDe({ organizacion_id: OTRA_ORG })]));
    const mesaDeBaja = forma(await fallo([filaDe({ activa: false })]));
    const qrApagado = forma(await fallo([filaDe({ qr_activa: false })]));
    const formaInvalida = forma(await fallo([filaDe()], 'no'));

    expect(deOtraOrganizacion).toEqual(noExiste);
    expect(mesaDeBaja).toEqual(noExiste);
    expect(qrApagado).toEqual(noExiste);
    expect(formaInvalida).toEqual(noExiste);
    expect(noExiste['codigo']).toBe('QR_TOKEN_INVALIDO');
  });

  it('un token repetido falla cerrado en vez de servir «la primera»', async () => {
    // `mesas.qr_token` no tiene índice único todavía. Dos filas significan que
    // no se sabe de qué mesa se habla, y adivinar sería enseñarle a alguien la
    // cuenta de otra mesa.
    const repetido = forma(await fallo([filaDe(), filaDe({ id: 'otra', numero: 6 })]));
    expect(repetido).toEqual(forma(await fallo([])));
  });

  it('la mesa que sí es suya resuelve con lo justo', async () => {
    const ambito = await resolverAmbitoPortal(
      () => Promise.resolve([filaDe({ empleado_asignado_id: 'empleo-1' })]),
      ORG,
      'mabc123xyz',
    );
    expect(ambito.mesaId).toBe(MESA);
    expect(ambito.mesaNumero).toBe(5);
    expect(ambito.tokenMesa).toBe('mabc123xyz');
    expect(ambito.empleadoAsignadoId).toBe('empleo-1');
  });
});

describe('los interruptores del portal', () => {
  it('un negocio que no configuró nada tiene el portal CERRADO', () => {
    expect(banderasDe({}).portalActivo).toBe(false);
    expect(banderasDe(null).portalActivo).toBe(false);
    expect(banderasDe('roto').portalActivo).toBe(false);
  });

  it('lo que falta y su código lee con `!== false` queda encendido', () => {
    const banderas = banderasDe({});
    expect(banderas.mostrarPrecios).toBe(true);
    expect(banderas.permitirAyuda).toBe(true);
    // Pedir desde el teléfono nace apagado: hay que encenderlo a propósito.
    expect(banderas.permitirPedidosCliente).toBe(false);
  });

  it('los porcentajes de propina se validan en el servidor', () => {
    expect(porcentajesValidos('5,10,15,20')).toEqual([5, 10, 15, 20]);
    expect(porcentajesValidos('5, 200, abc, -3')).toEqual([5]);
    expect(porcentajesValidos('basura')).toEqual([5, 10, 15, 20]);
    expect(porcentajesValidos(undefined)).toEqual([5, 10, 15, 20]);
  });

  it('ordenar desde el QR exige las cuatro condiciones', () => {
    expect(puedeOrdenarDesdeQR('restaurante', BANDERAS_ABIERTAS)).toBe(true);
    // Una ferretería no tiene mesas ni cocina.
    expect(puedeOrdenarDesdeQR('ferreteria', BANDERAS_ABIERTAS)).toBe(false);
    expect(puedeOrdenarDesdeQR('restaurante', banderasDe({ portal_qr_activo: true }))).toBe(false);
  });
});

describe('un comando público no puede recibir su propio ámbito', () => {
  const definir = (clave: string): (() => unknown) => {
    const entrada = entradaValorar;
    return () =>
      definirComandoPublico({
        nombre: 'portal.probar',
        entidad: 'orden',
        accion: 'valorar',
        paquetes: ['restaurante'],
        entrada: entrada.extend({ [clave]: entradaValorar.shape.score }),
        ejecutar: () => Promise.resolve(null),
      });
  };

  for (const clave of ['mesaId', 'mesa_id', 'token', 'tokenMesa', 'organizacionId', 'rol']) {
    it(`rechaza una entrada que declara "${clave}"`, () => {
      expect(definir(clave)).toThrow(/token de la mesa|ámbito/i);
    });
  }

  it('rechaza un nombre que no tenga la forma dominio.verbo', () => {
    expect(() =>
      definirComandoPublico({
        nombre: 'valorar',
        entidad: 'orden',
        accion: 'valorar',
        paquetes: ['restaurante'],
        entrada: entradaValorar,
        ejecutar: () => Promise.resolve(null),
      }),
    ).toThrow(/dominio.verbo/);
  });
});
