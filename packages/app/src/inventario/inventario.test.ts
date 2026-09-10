import type { Transaccion } from '@morphiqpos/data';
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import { describe, expect, it } from 'vitest';

import { archivarProducto } from '../catalogo/productos.ts';

import {
  ajustarStock,
  crearAlmacen,
  crearInsumo,
  entradaAjustarStock,
  entradaInventarioInicial,
  inventarioInicial,
} from './inventario.ts';
import { actualizarCostoInsumo, eliminarReceta, guardarReceta } from './recetas.ts';
import { crearComando } from '../comando.ts';
import { resetearDemo } from '../demostracion/resetear.ts';
import { ambitoDeCajero, crearFabrica } from '../pruebas/dobles.ts';
import type { RepositorioComandos } from '../repositorio.ts';

describe('B-11 · comandos de insumos y almacenes', () => {
  it('declara los cinco paquetes y nombres de comando estables', () => {
    expect(crearAlmacen.nombre).toBe('inventario.crear_almacen');
    expect(crearInsumo.paquetes).toHaveLength(5);
    expect(inventarioInicial.paquetes).toHaveLength(5);
    expect(ajustarStock.paquetes).toHaveLength(5);
  });

  it('exige inventario inicial positivo y ajuste distinto de cero', () => {
    expect(
      entradaInventarioInicial.safeParse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '0',
      }).success,
    ).toBe(false);
    expect(
      entradaAjustarStock.safeParse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '0',
        motivo: 'Conteo',
      }).success,
    ).toBe(false);
    expect(
      entradaAjustarStock.safeParse({
        almacenId: crypto.randomUUID(),
        insumoId: crypto.randomUUID(),
        cantidad: '-2.5',
        motivo: 'Conteo físico',
      }).success,
    ).toBe(true);
  });
});

describe('B-10 · reinicio de demostración', () => {
  it('exige confirmación literal y está disponible para cada paquete', () => {
    expect(resetearDemo.paquetes).toHaveLength(5);
    expect(resetearDemo.entrada.safeParse({ confirmacion: 'sí' }).success).toBe(false);
    expect(resetearDemo.entrada.safeParse({ confirmacion: 'RESETEAR' }).success).toBe(true);
  });
});

describe('B-12 · recetas por paquete', () => {
  it('limita recetas y cambios de costo a cafetería/restaurante', () => {
    expect(guardarReceta.paquetes).toEqual(['cafeteria', 'restaurante']);
    expect(actualizarCostoInsumo.paquetes).toEqual(['cafeteria', 'restaurante']);
  });

  it('valida cantidades exactas, unidad y merma en cada ingrediente', () => {
    const entrada = guardarReceta.entrada.safeParse({
      productoId: crypto.randomUUID(),
      ingredientes: [{ insumoId: crypto.randomUUID(), cantidad: '18', unidad: 'g', mermaBp: 250 }],
    });
    expect(entrada.success).toBe(true);

    // La lista VACÍA se admite: significa «este producto ya no lleva receta»,
    // y es lo que `RecetaFormDialog` hace cuando el usuario quita todos los
    // ingredientes y guarda. Estuvo prohibida y eso le quitó a Miguel una
    // función: el único camino que quedaba era «Eliminar receta», que además
    // archiva el producto.
    expect(
      guardarReceta.entrada.safeParse({ productoId: crypto.randomUUID(), ingredientes: [] })
        .success,
    ).toBe(true);

    // Lo que SÍ se sigue rechazando: una cantidad que no es un decimal exacto,
    // una unidad inventada y una merma fuera de rango.
    const malas = [
      { insumoId: crypto.randomUUID(), cantidad: '18,5', unidad: 'g', mermaBp: 0 },
      { insumoId: crypto.randomUUID(), cantidad: '18', unidad: 'cucharadas', mermaBp: 0 },
      { insumoId: crypto.randomUUID(), cantidad: '18', unidad: 'g', mermaBp: 10_001 },
    ];
    for (const mala of malas) {
      expect(
        guardarReceta.entrada.safeParse({ productoId: crypto.randomUUID(), ingredientes: [mala] })
          .success,
        JSON.stringify(mala),
      ).toBe(false);
    }
  });
});

/**
 * ── Arnés de `inventario.eliminar_receta` ──────────────────────────────────
 *
 * Es el envoltorio REAL (`crearComando`) sobre la definición REAL, con dos
 * dobles debajo: el repositorio de `pruebas/dobles.ts` —que hace de tabla de
 * idempotencia y de auditoría— y una conexión de Kysely que apunta el SQL
 * compilado y devuelve filas de guion.
 *
 * Con eso se puede afirmar lo que importa sin una base: qué consultas salen, en
 * qué orden, y qué hace el envoltorio alrededor. Lo que NO prueba es que
 * Postgres revierta de verdad —la conexión de guion no revierte nada—; esa
 * mitad la cubre `comando.integracion.test.ts` contra una base real.
 */
class ConexionGrabadora implements DatabaseConnection {
  readonly consultas: CompiledQuery[] = [];
  constructor(private readonly respuestas: readonly (readonly unknown[])[]) {}
  async executeQuery<R>(consulta: CompiledQuery): Promise<QueryResult<R>> {
    this.consultas.push(consulta);
    const filas = this.respuestas[this.consultas.length - 1] ?? [];
    return { rows: filas as R[] };
  }
  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    yield { rows: [] };
  }
}

class DriverGrabador implements Driver {
  constructor(private readonly conexion: ConexionGrabadora) {}
  init(): Promise<void> {
    return Promise.resolve();
  }
  async acquireConnection(): Promise<DatabaseConnection> {
    return this.conexion;
  }
  beginTransaction(): Promise<void> {
    return Promise.resolve();
  }
  commitTransaction(): Promise<void> {
    return Promise.resolve();
  }
  rollbackTransaction(): Promise<void> {
    return Promise.resolve();
  }
  releaseConnection(): Promise<void> {
    return Promise.resolve();
  }
  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

function arnes(respuestas: readonly (readonly unknown[])[]) {
  const conexion = new ConexionGrabadora(respuestas);
  const db = new Kysely<never>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DriverGrabador(conexion),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  const fabrica = crearFabrica('restaurante');
  const ejecutar = crearComando<Transaccion>({
    repositorio: fabrica.repositorio as unknown as RepositorioComandos<Transaccion>,
    conTransaccion: <T>(fn: (tx: Transaccion) => Promise<T>): Promise<T> =>
      fabrica.conTransaccion(() => fn(db as unknown as Transaccion)),
  });
  return { ejecutar, conexion, fabrica };
}

const PRODUCTO = '66666666-6666-4666-8666-666666666666';
const OTRO_PRODUCTO = '77777777-7777-4777-8777-777777777777';
const CLAVE = 'eliminar-receta-1';

/** El guion del camino feliz, consulta por consulta. */
const CAMINO_FELIZ: readonly (readonly unknown[])[] = [
  // 1 · nadie más usa este producto como ingrediente
  [],
  // 2 · `delete from recetas ... returning id` — dos líneas borradas
  [{ id: 'linea-1' }, { id: 'linea-2' }],
  // 3 · `catalogo.archivar_producto`: update productos ... returning id
  [{ id: PRODUCTO }],
  // 4 · `catalogo.archivar_producto`: update insumos (el espejo)
  [],
  // 5 · ocultar del menú digital
  [],
];

describe('B-12 · inventario.eliminar_receta', () => {
  it('borra las líneas y retira el producto en la MISMA transacción', async () => {
    const { ejecutar, conexion, fabrica } = arnes(CAMINO_FELIZ);

    const salida = await ejecutar(eliminarReceta, {
      entrada: { productoId: PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'gerente' }),
      idempotencyKey: CLAVE,
    });

    if (!salida.ok) expect.unreachable(`tenía que salir bien: ${salida.error.mensaje}`);
    expect(salida.datos).toEqual({ productoId: PRODUCTO, lineasEliminadas: 2 });

    // Las cinco escrituras salen y salen en orden. Esto es lo que hoy son
    // llamadas sueltas desde el navegador con un `.catch(() => {})` por línea.
    expect(conexion.consultas).toHaveLength(5);
    expect(conexion.consultas[1]?.sql).toMatch(/delete\s+from\s+"recetas"/i);
    expect(conexion.consultas[1]?.parameters).toContain(PRODUCTO);
    expect(conexion.consultas[2]?.sql).toMatch(/update\s+"productos"/i);
    expect(conexion.consultas[2]?.sql).toMatch(/"activo"\s*=/i);
    expect(conexion.consultas[2]?.sql).toMatch(/"visible_en_pos"\s*=/i);
    // El insumo espejo se archiva porque se REUSA `catalogo.archivar_producto`.
    // Es la parte que se olvida al copiar y pegar el archivado a mano.
    expect(conexion.consultas[3]?.sql).toMatch(/update\s+"insumos"/i);
    expect(conexion.consultas[4]?.sql).toMatch(/"visible_en_menu_digital"\s*=/i);

    expect(fabrica.base.transacciones).toHaveLength(1);
    expect(fabrica.base.transacciones[0]?.confirmada).toBe(true);

    // Una sola fila de auditoría, la de ESTE comando, y con las dos mitades
    // dentro: cuántas líneas se fueron y que el producto quedó archivado.
    const auditoria = fabrica.auditoriaConfirmada();
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]?.accion).toBe('inventario.eliminar_receta');
    expect(auditoria[0]?.entidad).toBe('receta');
    expect(auditoria[0]?.entidadId).toBe(PRODUCTO);
    expect(auditoria[0]?.payload).toMatchObject({
      lineasEliminadas: 2,
      archivado: true,
      visibleEnMenuDigital: false,
    });
  });

  it('almacén SÍ guarda recetas pero NO las elimina, y se le rechaza sin tocar la base', async () => {
    // El contraste que da sentido al estrechamiento. Quien lleva el almacén
    // ajusta existencias y escribe escandallos —está en `guardar_receta`—, pero
    // eliminar una receta ARCHIVA el producto, y eso es retirar un platillo de
    // la carta. `eliminar_receta` llama al cuerpo de `catalogo.archivar_producto`
    // y llamar al cuerpo se salta la comprobación de rol, así que sin este
    // recorte almacén archivaba productos por la puerta de atrás.
    const { ejecutar, conexion, fabrica } = arnes([]);

    const salida = await ejecutar(eliminarReceta, {
      entrada: { productoId: PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'almacen' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) expect.unreachable('almacén no puede archivar productos');
    expect(salida.error.codigo).toBe('SIN_PERMISO');
    expect(conexion.consultas).toHaveLength(0);
    expect(fabrica.base.transacciones).toHaveLength(0);
  });

  it('un mesero no elimina recetas, y se le rechaza ANTES de tocar la base', async () => {
    const { ejecutar, conexion, fabrica } = arnes([]);

    const salida = await ejecutar(eliminarReceta, {
      entrada: { productoId: PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'mesero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) expect.unreachable('un mesero no puede eliminar una receta');
    expect(salida.error.codigo).toBe('SIN_PERMISO');

    // Ni una consulta, ni una transacción abierta: el rol se mira antes que
    // nada. Si el 400 llegara primero, un rol sin permiso podría sondear el
    // esquema del comando campo por campo con entradas inválidas.
    expect(conexion.consultas).toHaveLength(0);
    expect(fabrica.base.transacciones).toHaveLength(0);
    // El intento denegado SÍ deja rastro: es justo lo que hay que revisar.
    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
    expect(fabrica.auditoriaConfirmada()[0]?.payload).toMatchObject({ resultado: 'denegado' });
  });

  it('dos llamadas con la misma clave dejan un solo efecto', async () => {
    const { ejecutar, conexion, fabrica } = arnes(CAMINO_FELIZ);
    const peticion = {
      entrada: { productoId: PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'gerente' }),
      idempotencyKey: CLAVE,
    };

    const primera = await ejecutar(eliminarReceta, peticion);
    const consultasTrasLaPrimera = conexion.consultas.length;
    const segunda = await ejecutar(eliminarReceta, peticion);

    if (!primera.ok)
      expect.unreachable(`la primera tenía que salir bien: ${primera.error.mensaje}`);
    if (!segunda.ok) expect.unreachable(`la segunda tenía que servirse: ${segunda.error.mensaje}`);

    expect(primera.reintento).toBe(false);
    expect(segunda.reintento).toBe(true);
    expect(segunda.datos).toEqual(primera.datos);

    // LO QUE IMPORTA: la segunda no volvió a borrar ni a archivar nada. Sin
    // esto, el doble clic del almacenista sobre «eliminar» ejecutaría dos veces
    // un comando que archiva un producto.
    expect(consultasTrasLaPrimera).toBe(5);
    expect(conexion.consultas).toHaveLength(5);
    expect(fabrica.auditoriaConfirmada()).toHaveLength(1);
  });

  it('no archiva el producto si su insumo espejo es ingrediente de otra receta', async () => {
    // Lo que la base impide en un `delete` —`recetas.insumo_id` es `on delete
    // restrict`— pero no en un `activo = false`. La salsa que se vende sola y
    // además va en los tacos: archivarla dejaría la receta de los tacos
    // apuntando a un insumo que `guardar_receta` ya no acepta.
    const { ejecutar, conexion, fabrica } = arnes([
      [{ productoId: OTRO_PRODUCTO, nombre: 'Tacos al pastor' }],
    ]);

    const salida = await ejecutar(eliminarReceta, {
      entrada: { productoId: PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'gerente' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) expect.unreachable('tenía que rechazarse');
    expect(salida.error.codigo).toBe('REGLA_DE_NEGOCIO');
    expect(salida.error.datos).toMatchObject({ regla: 'INVENTARIO_INVALIDO' });

    // El mensaje sale TAL CUAL en la pantalla del almacenista: dice qué receta
    // estorba y qué hacer. Nada de códigos de Postgres ni nombres de índice.
    expect(salida.error.mensaje).toMatch(/Tacos al pastor/);
    expect(salida.error.mensaje).toMatch(/ingrediente/i);
    expect(salida.error.mensaje).not.toMatch(/23503|violates|constraint|foreign key|recetas_/i);

    // Nada se borró: el rechazo llegó antes del `delete` y la transacción cayó.
    expect(conexion.consultas).toHaveLength(1);
    expect(fabrica.base.transacciones[0]?.confirmada).toBe(false);
  });

  it('un producto sin receta no se archiva de rebote', async () => {
    // Es la guarda que acota el permiso: `catalogo.archivar_producto` no admite
    // a `almacen` y este comando sí, así que sin ella un almacenista archivaría
    // cualquier producto del catálogo pasando su id por aquí.
    const { ejecutar, conexion, fabrica } = arnes([[], []]);

    const salida = await ejecutar(eliminarReceta, {
      entrada: { productoId: OTRO_PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'gerente' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) expect.unreachable('tenía que rechazarse');
    expect(salida.error.datos).toMatchObject({ regla: 'CATALOGO_INVALIDO' });
    expect(salida.error.mensaje).toMatch(/no tiene receta/i);

    // Se miró y se intentó borrar; no se llegó a archivar nada.
    expect(conexion.consultas).toHaveLength(2);
    expect(fabrica.base.transacciones[0]?.confirmada).toBe(false);
  });

  it('rechaza el cuerpo que manda hoy Recetas.jsx, con los campos de ámbito dentro', async () => {
    // `Recetas.jsx:137` manda `{ activo, visible_en_pos, visible_en_menu_digital }`
    // al puente. Esos tres los decide el servidor: aquí la entrada es
    // `{ productoId }` y nada más, y `validar()` la valida en modo estricto.
    const { ejecutar, conexion } = arnes([]);

    const salida = await ejecutar(eliminarReceta, {
      entrada: {
        productoId: PRODUCTO,
        activo: false,
        visible_en_pos: false,
        visible_en_menu_digital: false,
      },
      ambito: ambitoDeCajero({ rol: 'gerente' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) expect.unreachable('tenía que rechazarse');
    expect(salida.error.codigo).toBe('ENTRADA_INVALIDA');
    expect(conexion.consultas).toHaveLength(0);
  });

  it('si el último paso se cae, no queda ni media receta borrada', async () => {
    // Inyección de fallo por NOMBRE de paso. Es el estado imposible que hoy sí
    // existe: `Promise.all` con `.catch(() => {})` por línea deja el producto
    // archivado con media receta viva, y el costo —que se calcula sumando las
    // líneas— pasa a ser una cifra que no corresponde a nada.
    const { ejecutar, fabrica } = arnes(CAMINO_FELIZ);

    const salida = await ejecutar(eliminarReceta, {
      entrada: { productoId: PRODUCTO },
      ambito: ambitoDeCajero({ rol: 'gerente' }),
      idempotencyKey: CLAVE,
      interrumpirEn: 'ocultar_del_menu_digital',
    });

    expect(salida.ok).toBe(false);
    expect(fabrica.base.transacciones[0]?.confirmada).toBe(false);
    // Ni la clave de idempotencia ni el rastro de éxito sobreviven: la clave
    // queda libre para reintentar, que es lo que quiere el almacenista.
    expect(fabrica.base.confirmadas.filter((e) => e.tabla === 'comandos_ejecutados')).toHaveLength(
      0,
    );
    expect(fabrica.base.revertidas.some((e) => e.tabla === 'comandos_ejecutados')).toBe(true);
  });

  it('declara nombre, entidad, roles y paquetes estables', () => {
    expect(eliminarReceta.nombre).toBe('inventario.eliminar_receta');
    expect(eliminarReceta.entidad).toBe('receta');
    expect(eliminarReceta.paquetes).toEqual(['cafeteria', 'restaurante']);
  });

  it('NO deja entrar a nadie que no pueda archivar un producto', () => {
    // `eliminar_receta` llama al CUERPO de `catalogo.archivar_producto`, y
    // llamar al cuerpo se salta la comprobación de rol —vive en el envoltorio
    // (`comando.ts:98`), no en la definición—. Si su lista fuera más ancha, esta
    // puerta serviría para archivar productos a quien no puede hacerlo de frente.
    //
    // La versión anterior de esta prueba era `toEqual(guardarReceta.roles)`, y
    // no protegía de nada: las dos apuntaban a la MISMA constante, así que
    // añadir un rol a esa constante seguía dando verde con el agujero abierto.
    for (const rol of eliminarReceta.roles) {
      expect(archivarProducto.roles, `«${rol}» no puede archivar productos`).toContain(rol);
    }
    // Y en concreto: almacén ajusta existencias, no retira platillos de la carta.
    expect(eliminarReceta.roles).not.toContain('almacen');
    expect(guardarReceta.roles).toContain('almacen');
  });
});
