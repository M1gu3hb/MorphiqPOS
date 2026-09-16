import { describe, expect, it } from 'vitest';

import {
  modulosActivos,
  PAQUETES,
  PAQUETES_MOSTRADOR,
  PAQUETES_OPERATIVOS,
  PAQUETES_RESTAURANTE,
  type Modulo,
  type Paquete,
} from '@morphiqpos/contracts';

import { sugerenciaDePedido } from './abarrotes/sugerencia.ts';
import { registrarCompra, usarPlantillaCompra } from './compras/compras.ts';
import { ajustarStock, crearAlmacen } from './inventario/inventario.ts';
import { registrarMerma } from './inventario/merma.ts';
import { eliminarReceta, guardarReceta } from './inventario/recetas.ts';
import { tomarValuacion } from './inventario/valuacion.ts';
import { marcharTiempo } from './restaurante/marcha.ts';
import { abrirMesa, liberarMesa } from './restaurante/mesas.ts';
import { relevarResponsable } from './restaurante/relevo.ts';
import { crearOrden } from './venta/carrito.ts';
import { ejecutorDeProduccion } from './pruebas/dobles.ts';

/**
 * El selector de paquete deja de ser humo (F1.1-C-15).
 *
 * ── Por qué con comandos REALES ────────────────────────────────────────────
 * Había una prueba del mecanismo que definía su propio comando de juguete
 * dentro del test. Esa prueba comprueba que `comando()` sabe rechazar por
 * paquete — que es cierto y ya lo sabía — pero **no** comprueba que ningún
 * comando de verdad esté mal declarado. Podían estar los treinta y cinco
 * abiertos a los tres paquetes y seguía en verde.
 *
 * Aquí se invocan `restaurante.abrir_mesa`, `inventario.guardar_receta` y
 * `venta.crear_orden` tal como viven en producción.
 *
 * ── Qué afirmaba este archivo antes de D-01, y por qué dejó de ser cierto ──
 * Dos pruebas de aquí afirmaban que el nivel `esencial` NO contrataba
 * operación: que `inventario.guardar_receta` devolvía `PAQUETE_NO_INCLUYE` en
 * la plantilla más baja, y que `PAQUETES_OPERATIVOS` era exactamente dos de los
 * tres paquetes.
 *
 * El renombre D-01 —migración 058— borró ese nivel. `esencial` era el paquete
 * que vendía sin controlar stock y ya no existe: D-01 dice con todas sus letras
 * que *una tienda sin inventario no es una tienda, es una calculadora*, y
 * `MODULOS_POR_PLANTILLA` le da a `tienda` el bloque OPERACION entero
 * —inventario, compras, gastos, recetas, gramajes, costos, reportes, portal—.
 * Con la lista de paquetes operativos en dos, el sistema quedaba partido por la
 * mitad: el módulo `recetas` ENCENDIDO en la plantilla `tienda` y el comando
 * `inventario.guardar_receta` devolviendo 403. Un menú que enseña lo que el
 * POST rechaza.
 *
 * Lo que decide hoy si una ferretería costea recetas NO es la plantilla: es la
 * PERILLA (F-016), `organizacion_modulos`, que guarda excepciones negocio por
 * negocio. Ahí es donde esa decisión debe vivir, porque cambia de un negocio a
 * otro y la plantilla no.
 *
 * ── Qué protege este archivo ahora, y por qué es MÁS fuerte ────────────────
 * 1. Que el gate de paquete SIGUE SIRVIENDO, con el ejemplo que sobrevivió al
 *    renombre: sala. `restaurante.abrir_mesa` declara `PAQUETES_RESTAURANTE` y
 *    tiene que devolver `PAQUETE_NO_INCLUYE` en `tienda` y en `cafeteria`.
 *    Mesas, mesero y cocina siguen fuera de las otras dos plantillas.
 * 2. Que NINGÚN comando puede quedar cerrado por plantilla mientras su módulo
 *    está encendido en esa misma plantilla. Ésa es la contradicción exacta que
 *    provocó D-01, y ahora tiene prueba propia en vez de estar implícita en un
 *    literal de dos cadenas. Cazar un caso particular era lo de antes; esto
 *    caza la clase entera, incluidos los comandos que aún no existen.
 * 3. Que los subconjuntos declarados se derivan del preajuste en vez de estar
 *    copiados a mano: `PAQUETES_OPERATIVOS` es exactamente el conjunto de
 *    plantillas con bloque de operación, ni una más ni una menos.
 */

const AMBITO_TIENDA = {
  organizacionId: '00000000-0000-4000-8000-000000000001',
  sucursalId: '00000000-0000-4000-8000-000000000002',
  terminalId: '00000000-0000-4000-8000-000000000003',
  identidadId: '00000000-0000-4000-8000-000000000004',
  empleoId: '00000000-0000-4000-8000-000000000005',
  rol: 'dueno',
} as const;

/** El ejecutor acepta las definiciones reales; ver `ejecutorDeProduccion`. */
const comandoCon = (paquete: Paquete) => ejecutorDeProduccion(paquete);

describe('C-15 · el paquete decide qué comandos existen', () => {
  it('abrir mesa sólo existe en la plantilla restaurante', async () => {
    // Éste es el ejemplo que demuestra que el gate SIRVE, ahora que recetas ya
    // no puede demostrarlo: `PAQUETES_RESTAURANTE` no se movió con D-01 y sala
    // —mesas, mesero, cocina— sigue fuera de `tienda` y de `cafeteria`.
    //
    // Se comprueban las dos mitades a propósito. Sólo con el rechazo, un fallo
    // por cualquier otro motivo —un id inexistente, un rol— daría exactamente
    // el mismo verde sin decir nada del paquete; por eso `restaurante` tiene
    // que dejar pasar el comando hasta el cuerpo.
    for (const paquete of PAQUETES) {
      const salida = await comandoCon(paquete)(abrirMesa, {
        entrada: { mesaId: '00000000-0000-4000-8000-00000000000a', personas: 2 },
        ambito: AMBITO_TIENDA,
        idempotencyKey: `mesa-${paquete}`,
      });
      const resultado = salida.ok ? 'ejecutó' : salida.error.codigo;
      if (paquete === 'restaurante') expect(resultado).not.toBe('PAQUETE_NO_INCLUYE');
      else expect(resultado).toBe('PAQUETE_NO_INCLUYE');
    }
  });

  it('guardar receta pasa el gate en las tres plantillas, incluida tienda', async () => {
    // El reverso de la prueba anterior y la consecuencia directa de D-01: una
    // ferretería con plantilla `tienda` llega al cuerpo de
    // `inventario.guardar_receta`. Si alguien devolviera `PAQUETES_OPERATIVOS`
    // a dos paquetes para "recuperar" el nivel esencial, esto se pone rojo
    // antes que ninguna pantalla.
    for (const paquete of PAQUETES) {
      const salida = await comandoCon(paquete)(guardarReceta, {
        entrada: {
          productoId: '00000000-0000-4000-8000-00000000000a',
          ingredientes: [
            {
              insumoId: '00000000-0000-4000-8000-00000000000b',
              cantidad: '1',
              unidad: 'pieza',
              mermaBp: 0,
            },
          ],
        },
        ambito: AMBITO_TIENDA,
        idempotencyKey: `receta-${paquete}`,
      });
      expect(salida.ok ? 'ejecutó' : salida.error.codigo).not.toBe('PAQUETE_NO_INCLUYE');
    }
  });

  it('vender existe en los tres paquetes comerciales', async () => {
    for (const paquete of PAQUETES) {
      const salida = await comandoCon(paquete)(crearOrden, {
        entrada: {},
        ambito: AMBITO_TIENDA,
        idempotencyKey: `clave-${paquete}`,
      });
      expect(salida.ok ? 'ejecutó' : salida.error.codigo).not.toBe('PAQUETE_NO_INCLUYE');
    }
  });
});

/**
 * La forma mínima que necesita la comprobación: nombre para el mensaje de
 * error, y las dos declaraciones que no pueden contradecirse.
 */
interface ComandoVigilado {
  readonly nombre: string;
  readonly paquetes: readonly Paquete[];
  readonly modulo?: Modulo;
}

/**
 * Comandos con perilla declarada, uno por cada módulo que hoy gobierna alguno.
 *
 * Se importan por nombre y no se descubren recorriendo el árbol: un registro
 * —o un `readdir`— sólo contiene lo que alguien recordó registrar, y una lista
 * escrita a mano al menos se lee en la revisión. La prueba de abajo protege
 * esta lista de vaciarse sola.
 */
const COMANDOS_CON_MODULO: readonly ComandoVigilado[] = [
  // OPERACION — encendido en las tres plantillas desde D-01.
  guardarReceta, // recetas
  eliminarReceta, // recetas
  crearAlmacen, // inventario
  ajustarStock, // inventario
  registrarMerma, // movimientos_inventario
  tomarValuacion, // costos_basicos
  registrarCompra, // compras
  usarPlantillaCompra, // compras
  sugerenciaDePedido, // compras
  // SALA — sólo en `restaurante`, y por eso ninguna contradicción aquí.
  abrirMesa, // mesas
  liberarMesa, // mesas
  marcharTiempo, // cocina
  relevarResponsable, // mesero
];

describe('C-15 · la plantilla no puede contradecirse con sus módulos', () => {
  it('ningún comando queda cerrado por plantilla con su módulo encendido', () => {
    // LA regla que provocó D-01. El paquete dice qué contrató el negocio y el
    // módulo dice qué le dejaron encendido dentro de eso: el módulo es la capa
    // de ENCIMA, así que un módulo encendido con el comando cerrado por debajo
    // no es una política, es una avería. La navegación enseñaría `recetas` y el
    // POST devolvería 403.
    //
    // Al revés SÍ es legítimo —paquete abierto y perilla apagada— y por eso no
    // se comprueba: ése es exactamente el caso que F-016 existe para permitir,
    // la ferretería que apaga recetas sin cambiar de plantilla.
    const contradicciones: string[] = [];
    let comprobaciones = 0;

    for (const comando of COMANDOS_CON_MODULO) {
      const modulo = comando.modulo;
      if (modulo === undefined) continue;
      for (const plantilla of PAQUETES) {
        if (!modulosActivos(plantilla).has(modulo)) continue;
        comprobaciones += 1;
        if (comando.paquetes.includes(plantilla)) continue;
        contradicciones.push(
          `${comando.nombre} (módulo ${modulo}) excluye la plantilla ${plantilla}`,
        );
      }
    }

    expect(contradicciones).toEqual([]);
    // Sin esto, un `modulosActivos()` que devolviera un conjunto vacío dejaría
    // el bucle sin entrar ni una vez y la prueba pasaría afirmando nada.
    expect(comprobaciones).toBeGreaterThan(0);
  });

  it('la lista vigilada no puede vaciarse ni quedarse sin módulo', () => {
    // La prueba de arriba es un bucle sobre una lista escrita a mano: borrar
    // una entrada la pone verde. Estos tres son los que cubren los dos lados
    // del conflicto —operación encendida en `tienda` y sala encendida sólo en
    // `restaurante`— y quitarlos tiene que costar poner esta prueba en rojo.
    const nombres = COMANDOS_CON_MODULO.map((comando) => comando.nombre);
    expect(nombres).toContain('inventario.guardar_receta');
    expect(nombres).toContain('compras.registrar');
    expect(nombres).toContain('restaurante.abrir_mesa');
    expect(COMANDOS_CON_MODULO.every((comando) => comando.modulo !== undefined)).toBe(true);
  });
});

describe('C-15 · los subconjuntos declarados', () => {
  it('sala es exclusiva de la plantilla restaurante', () => {
    // Lo único que D-01 NO movió. Mientras esto siga siendo una sola plantilla,
    // el gate de paquete conserva un caso donde de verdad niega algo, y la
    // primera prueba de este archivo tiene qué demostrar.
    expect([...PAQUETES_RESTAURANTE]).toEqual(['restaurante']);
  });

  it('operación cubre exactamente las plantillas con bloque de operación', () => {
    // Antes esta prueba era un literal de dos cadenas —`['cafeteria',
    // 'restaurante']`— que había que recordar actualizar a mano. Ahora se
    // deriva del preajuste, que es de donde sale la verdad: la lista está mal
    // en cuanto deje de coincidir con los módulos que las plantillas encienden,
    // sin importar en qué dirección se rompa.
    const MODULOS_DE_OPERACION: readonly Modulo[] = [
      'inventario',
      'compras',
      'recetas',
      'costos_basicos',
    ];
    const conOperacion = PAQUETES.filter((plantilla) =>
      MODULOS_DE_OPERACION.every((modulo) => modulosActivos(plantilla).has(modulo)),
    );

    expect([...PAQUETES_OPERATIVOS]).toEqual(conOperacion);
    // Y el enunciado de D-01, escrito aparte para que una vuelta atrás
    // coordinada —quitarle operación a `tienda` y sacarla de la lista a la vez—
    // tampoco pase: una tienda sin inventario no es una tienda, es una
    // calculadora.
    expect(conOperacion).toContain('tienda');
  });

  it('mostrador cubre toda plantilla que cobre en caja', () => {
    // Están nombrados distinto a propósito: cuando llegue un giro sin caja
    // —una estética que sólo agenda— cambiará éste y no el de catálogo. Por eso
    // se deriva de `caja_directa` y no se copia de `PAQUETES`: copiado, el día
    // que ese giro llegue esta prueba seguiría verde diciendo que cobra.
    const conCaja = PAQUETES.filter(
      (plantilla) =>
        modulosActivos(plantilla).has('caja_directa') && modulosActivos(plantilla).has('ventas'),
    );
    expect([...PAQUETES_MOSTRADOR]).toEqual(conCaja);
  });
});
