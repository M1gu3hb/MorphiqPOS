import { ErrorDominio } from '@morphiqpos/contracts';
import type { repoVentaCatalogo } from '@morphiqpos/data';
import { describe, expect, it } from 'vitest';

import { validar } from '../errores.ts';
import { resolverAmbitoPortal, type FilaMesaPorToken } from './ambito.ts';
import { banderasDe, porcentajesValidos } from './banderas.ts';
import { definirComandoPublico } from './definicion-publica.ts';
import { entradaEnviarPedido, entradaPedirCuenta, entradaValorar } from './esquemas.ts';
import { puedeOrdenarDesdeQR } from './negocio.ts';
import { valorarParaPedido } from './productos.ts';

/**
 * Qué PUEDE HACER un desconocido con el token de una mesa.
 *
 * El ámbito, la forma de la entrada y los interruptores del negocio: tres
 * decisiones puras, comprobables sin base de datos. Sus dos hermanas son
 * `portal.proyeccion.test.ts` —qué se lleva— y `portal.escrituras.test.ts`
 * —con qué guardas escribe—. Lo que necesita Postgres de verdad —que el índice
 * único rechace la segunda solicitud, que la transacción revierta— vive en las
 * pruebas de integración y sigue declarado como hueco en el informe.
 */

const ORG = '00000000-0000-4000-8000-000000000001';
const OTRA_ORG = '00000000-0000-4000-8000-0000000000ff';
const MESA = '00000000-0000-4000-8000-000000000002';
const SUCURSAL = '00000000-0000-4000-8000-000000000003';
const PRODUCTO = '00000000-0000-4000-8000-00000000000a';

const BANDERAS_ABIERTAS = banderasDe({
  portal_qr_activo: true,
  portal_qr_permitir_pedidos_cliente: true,
  asignacion_mesas_activa: true,
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
    expect(puedeOrdenarDesdeQR('restaurante_pro', BANDERAS_ABIERTAS)).toBe(true);
    // Una ferretería no tiene mesas ni cocina.
    expect(puedeOrdenarDesdeQR('ferreteria', BANDERAS_ABIERTAS)).toBe(false);
    expect(puedeOrdenarDesdeQR('restaurante_pro', banderasDe({ portal_qr_activo: true }))).toBe(
      false,
    );
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
        paquetes: ['restaurante_pro'],
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
        paquetes: ['restaurante_pro'],
        entrada: entradaValorar,
        ejecutar: () => Promise.resolve(null),
      }),
    ).toThrow(/dominio.verbo/);
  });
});
