import { PAQUETES_OPERATIVOS, PAQUETES_RESTAURANTE } from '@morphiqpos/contracts';
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
import { registrarConsumoInterno } from './consumo-interno.ts';
import { actualizarCostoInsumo, eliminarReceta, guardarReceta } from './recetas.ts';
import { resetearDemo } from '../demostracion/resetear.ts';
import { ambitoDeCajero } from '../pruebas/dobles.ts';
import { arnesGrabador } from '../pruebas/grabadora.ts';

describe('B-11 · comandos de insumos y almacenes', () => {
  it('la operación viene con las TRES plantillas, y nombres de comando estables', () => {
    expect(crearAlmacen.nombre).toBe('inventario.crear_almacen');

    // ── Qué afirmaba antes y por qué dejó de ser cierto ─────────────────────
    // Decía `toHaveLength(2)`, y era cierto mientras existió `esencial`: aquel
    // nivel vendía SIN controlar stock, así que inventario vivía en los otros
    // dos y en el tercero no. D-01 lo retiró —«una tienda sin inventario no es
    // una tienda, es una calculadora»— y la 058 renombró los tres valores de
    // `organizaciones.paquete`, con lo que `PAQUETES_OPERATIVOS` pasó a ser
    // las TRES plantillas.
    //
    // Pero la longitud nunca afirmó nada útil, ni antes: `['cafeteria',
    // 'restaurante']` y `['tienda','cafeteria']` miden lo mismo y son dos
    // sistemas distintos. Se compara contra la CONSTANTE, que es la lista que
    // el gate de `comando.ts` consulta de verdad, para que un comando de
    // inventario que se aparte de ella —porque alguien le escriba la lista a
    // mano o se la recorte— caiga aquí y no en la primera venta de un cliente.
    for (const comando of [crearInsumo, inventarioInicial, ajustarStock]) {
      expect([...comando.paquetes], comando.nombre).toEqual([...PAQUETES_OPERATIVOS]);
    }

    // Y en concreto lo que D-01 cambió: `tienda` está DENTRO. Sin esta línea,
    // recortar la lista a dos volvería a compilar y a pasar, y el resultado
    // sería el sistema partido por la mitad: `MODULOS_POR_PLANTILLA` le da a
    // `tienda` el bloque OPERACION entero, así que el menú de inventario
    // aparecería encendido y el POST contestaría 403.
    expect(crearInsumo.paquetes).toContain('tienda');

    // Que sean las tres no vuelve decorativo el gate de paquete, y el ejemplo
    // está en esta MISMA carpeta: `inventario.consumo_interno` —la comida del
    // personal, que sólo existe donde hay cocina— sigue siendo exclusivo de
    // `restaurante`. Si alguien colapsara los subconjuntos en una sola lista
    // «porque total, ya son todos», esto se pone rojo.
    expect([...registrarConsumoInterno.paquetes]).toEqual([...PAQUETES_RESTAURANTE]);
    expect(registrarConsumoInterno.paquetes).not.toContain('tienda');
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
  it('recetas y costos vienen con la operación entera; quien los apaga es la perilla', () => {
    // ── Qué afirmaba antes y por qué dejó de ser cierto ─────────────────────
    // Decía `toEqual(['cafeteria','restaurante'])`, y describía un mundo donde
    // la PLANTILLA decidía quién costea: `esencial` no llevaba stock, así que
    // tampoco escandallos. D-01 borró ese nivel y `MODULOS_POR_PLANTILLA` le
    // da hoy a `tienda` el bloque OPERACION completo, `recetas` incluido.
    //
    // Mantener la afirmación vieja habría obligado a partir el sistema por la
    // mitad para que pasara: el módulo `recetas` ENCENDIDO en la plantilla
    // `tienda` y `inventario.guardar_receta` devolviendo 403. Un menú que
    // enseña lo que el POST rechaza.
    expect([...guardarReceta.paquetes]).toEqual([...PAQUETES_OPERATIVOS]);
    expect([...actualizarCostoInsumo.paquetes]).toEqual([...PAQUETES_OPERATIVOS]);
    expect(guardarReceta.paquetes).toContain('tienda');

    // ── Qué protege ahora ───────────────────────────────────────────────────
    // Lo que decide si una ferretería costea recetas ya no es la plantilla
    // —no cambia de una ferretería a otra— sino la PERILLA (F-016), que guarda
    // excepciones negocio por negocio en `organizacion_modulos`. Y esa perilla
    // sólo EXISTE para un comando que declare módulo: `comando.ts` consulta
    // `leerModulosActivos` únicamente cuando `definicion.modulo !== undefined`.
    //
    // Sin esta línea, ensanchar `PAQUETES_OPERATIVOS` a las tres dejaría
    // `guardar_receta` sin ninguna puerta que una ferretería pueda cerrar: ni
    // el paquete la excluye ya, ni habría módulo que apagar.
    expect(guardarReceta.modulo).toBe('recetas');
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
function arnes(respuestas: readonly (readonly unknown[])[]) {
  return arnesGrabador(respuestas);
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

  it('declara nombre, entidad, módulo y paquetes estables', () => {
    expect(eliminarReceta.nombre).toBe('inventario.eliminar_receta');
    expect(eliminarReceta.entidad).toBe('receta');

    // Afirmaba `['cafeteria','restaurante']`, que era el `PAQUETES_OPERATIVOS`
    // de cuando `esencial` vendía sin stock. Escrito a mano, además, así que
    // no ataba este comando a `guardar_receta`: podían separarse sin que nada
    // avisara, y un negocio acabaría pudiendo escribir un escandallo que
    // después no puede retirar.
    //
    // Ahora se compara contra la constante, la misma que declara la propia
    // definición. Retirar una receta es una operación de recetas, no una
    // función de sala: las tres plantillas la traen.
    expect([...eliminarReceta.paquetes]).toEqual([...PAQUETES_OPERATIVOS]);
    expect([...eliminarReceta.paquetes]).toEqual([...guardarReceta.paquetes]);
    // Escrito además contra el valor, y no sólo contra la constante: comparar
    // dos cosas que apuntan a la MISMA constante sigue verde aunque alguien
    // estreche la constante, que es el agujero que ya tenía la prueba de roles
    // de aquí abajo. Estrechar `PAQUETES_OPERATIVOS` a dos tiene que doler.
    expect(eliminarReceta.paquetes).toContain('tienda');

    // Lo que acota quién entra por esta puerta NO es el paquete —son las tres—
    // sino las dos capas de encima, y cada una tiene su prueba: la perilla
    // `recetas` (F-016), que es lo único que un negocio puede apagar sin
    // cambiar de plantilla, y `ROLES_PARA_RETIRAR`, que es la de aquí abajo.
    expect(eliminarReceta.modulo).toBe('recetas');
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
