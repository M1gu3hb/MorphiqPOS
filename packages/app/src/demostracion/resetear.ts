import { PAQUETES, PLANTILLA_POR_GIRO, ErrorDominio, esGiro } from '@morphiqpos/contracts';
import { demoPorId, type NegocioConocido } from '@morphiqpos/contracts/negocios';
import { cantidad } from '@morphiqpos/domain/catalogo';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { validarEntorno } from '@morphiqpos/contracts';

import { definirComando } from '../comando.ts';
import { Rechazo } from '../fallos.ts';
import { hashearPin } from '../identidad/pin.ts';
import { recalcularCostosRecetas } from '../inventario/recetas.ts';
import { sembrarArranque, type ResumenArranque } from './arranque.ts';
import {
  APARIENCIA_DE_DEMO,
  IMPUESTO_DE_DEMO,
  PIN_DEL_DUENO_DE_DEMO,
  TOPES_DE_DESCUENTO,
} from './como-nueva.ts';
import { semillaParaPaquete } from './datos.ts';
import { equipoDelGiro, reponerPin, sembrarEquipo } from './equipo.ts';
import { sembrarOpcionesDeBebida, type ResumenBebidas } from './bebidas.ts';
import { asegurarEstacionGeneral, sembrarSala, type ResumenSala } from './sala.ts';
import { sembrarSalon, type ResumenSalon } from './salon.ts';
import { CICLOS, ORDEN_DE_LIMPIEZA } from './tablas-del-reseteo.ts';

export const entradaResetearDemo = z.object({ confirmacion: z.literal('RESETEAR') });

/**
 * LA CONTRASEÑA DEL MODO PRESENTACIÓN, que una demostración necesita tener.
 *
 * ── Por qué esto faltaba, y por qué importa ───────────────────────────────
 * `desbloquearPresentacion` no abre sin contraseña configurada, y con razón: la
 * anterior se comparaba EN EL NAVEGADOR contra un `'2797'` escrito en el código de
 * un repositorio público. Pero la siembra no configuraba ninguna, así que en las
 * cinco demostraciones el Modo Presentación **no se podía abrir** — y es la
 * pantalla desde la que se cambia de modelo de negocio delante de un prospecto, o
 * sea la más importante de una demostración.
 *
 * Va con Argon2id y pimienta, el mismo camino que los PIN, y sólo en las demos:
 * este comando se niega a correr sobre cualquier negocio que no sea una de las cinco
 * (`exigirQueSeaDemo`, abajo).
 *
 * La contraseña está ESCRITA en `docs/fase-2/ACCESOS-DEMO.md`, junto a los PIN, y
 * eso no es un descuido: una demostración cuya llave no está escrita es una
 * demostración que nadie puede enseñar.
 */
export const CONTRASENA_DE_PRESENTACION_DEMO = 'demo1234';

/**
 * LA CONFIGURACIÓN DE UNA DEMO RECIÉN NACIDA, escrita entera (bloque B.2 de la 2.4).
 *
 * Antes sólo se le añadía la contraseña del Modo Presentación y se conservaba todo lo
 * demás: el IVA que `humo-impuesto` movió, el estilo que alguien probó, un logo de
 * prueba. Ahora el documento se REESCRIBE: IVA general incluido en el precio, la
 * apariencia del giro y la contraseña. Nada de lo que dejó la corrida anterior.
 */
async function reponerConfiguracion(
  tx: Transaccion,
  organizacionId: string,
  giro: keyof typeof APARIENCIA_DE_DEMO,
  pimienta: string,
): Promise<void> {
  const valores = {
    impuesto: { ...IMPUESTO_DE_DEMO },
    apariencia: { ...APARIENCIA_DE_DEMO[giro] },
    presentacion_password_hash: await hashearPin(CONTRASENA_DE_PRESENTACION_DEMO, pimienta),
  };
  const fila = await tx
    .selectFrom('configuracion')
    .select(['id', 'version'])
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();

  if (fila === undefined) {
    await tx
      .insertInto('configuracion')
      .values({ organizacion_id: organizacionId, valores: JSON.stringify(valores), version: 1 })
      .execute();
    return;
  }
  // La versión SUBE aunque el contenido se reescriba: una pantalla abierta con la
  // configuración de antes tiene que chocar al guardar, no pisar la recién repuesta.
  await tx
    .updateTable('configuracion')
    .set({ valores: JSON.stringify(valores), version: fila.version + 1 })
    .where('id', '=', fila.id)
    .execute();
}

/**
 * EL EQUIPO, repuesto: cada persona sembrada con su PIN (lo hace `sembrarEquipo`), el
 * dueño con el suyo, y cualquiera que una prueba haya dado de alta, desactivado.
 *
 * Al dueño no se le toca el rol ni se le desactiva: es quien resetea. Sólo se le
 * repone el PIN publicado y se le desbloquea.
 */
async function reponerDueno(tx: Transaccion, organizacionId: string, pimienta: string) {
  const duenos = await tx
    .selectFrom('empleos')
    .select(['id', 'persona_id as personaId'])
    .where('organizacion_id', '=', organizacionId)
    .where('rol', '=', 'dueno')
    .execute();
  for (const dueno of duenos) {
    await tx.updateTable('empleos').set({ activo: true }).where('id', '=', dueno.id).execute();
    await reponerPin(tx, dueno.personaId, PIN_DEL_DUENO_DE_DEMO, pimienta);
  }
  return duenos.map((d) => d.id);
}

async function desactivarLoQueSobra(
  tx: Transaccion,
  organizacionId: string,
  seQuedan: readonly string[],
): Promise<void> {
  if (seQuedan.length === 0) return;
  await tx
    .updateTable('empleos')
    .set({ activo: false })
    .where('organizacion_id', '=', organizacionId)
    .where('id', 'not in', [...seQuedan])
    .execute();
}

/**
 * LA GUARDA · el reseteo sólo corre sobre una de las cinco demos (bloque B.1 de la 2.4).
 *
 * Aquí decía, arriba, que el comando «se niega a correr sobre los negocios que cobran»,
 * y NO era verdad: `ejecutar` sólo comprobaba el rol y borraba ventas, catálogo e
 * inventario. La única guarda estaba en `scripts/sembrar-demos.mjs`; la ruta
 * `/api/catalogo/demostracion/resetear` pasaba directo, y el dueño de un negocio real
 * que la llamara —o una prueba que se equivocara de negocio— se quedaba sin su día.
 *
 * La regla es POSITIVA y por ID: la organización del ámbito tiene que estar en `DEMOS`
 * (`packages/contracts/src/negocios`). Va antes de leer nada y, sobre todo, antes de
 * `limpiar`. Contesta 403 y deja su rastro de «denegado».
 */
export function exigirQueSeaDemo(organizacionId: string): NegocioConocido {
  const demo = demoPorId(organizacionId);
  if (demo === null) {
    throw new Rechazo('SIN_PERMISO', 'denegado', {
      codigo: 'SIN_PERMISO',
      mensaje: 'Sólo una demostración se puede resetear.',
    });
  }
  return demo;
}

export const resetearDemo = definirComando<
  Transaccion,
  typeof entradaResetearDemo,
  {
    readonly productos: number;
    readonly insumos: number;
    readonly empleados: number;
    readonly sala: ResumenSala | null;
    readonly salon: ResumenSalon | null;
    /** Los grupos de opciones de bebida. Sólo la cafetería los tiene. */
    readonly bebidas: ResumenBebidas | null;
    readonly arranque: ResumenArranque;
  }
>({
  nombre: 'configuracion.resetear_demo',
  entidad: 'organizacion',
  escribe: true,
  roles: ['dueno', 'administrador'],
  paquetes: PAQUETES,
  entrada: entradaResetearDemo,
  async ejecutar(ctx) {
    const demo = exigirQueSeaDemo(ctx.ambito.organizacionId);
    const organizacion = await ctx.tx
      .selectFrom('organizaciones')
      .select('giro')
      .where('id', '=', ctx.ambito.organizacionId)
      .executeTakeFirst();
    if (organizacion === undefined || !esGiro(organizacion.giro)) {
      throw new ErrorDominio('CONFIGURACION_INVALIDA', 'La organización no tiene un giro válido.');
    }
    // A un `const` propio: el estrechamiento de `organizacion.giro` no sobrevive
    // a los `await` que hay en medio, y sin esto el giro llega como `string` a
    // `sembrarEquipo`.
    const giro = organizacion.giro;
    const sucursalId = ctx.ambito.sucursalId;
    if (sucursalId === null)
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Selecciona una sucursal para cargar la demostración.',
      );
    const semilla = semillaParaPaquete(organizacion.giro);
    await ctx.paso('limpiar_demo', () =>
      limpiar(ctx.tx, ctx.ambito.organizacionId, ctx.ambito.terminalId),
    );
    // El negocio vuelve a su nombre y a la plantilla de su giro: la suite cambia la
    // plantilla para comparar vocabularios, y la guarda de `app/(modelos)/` echa de sus
    // pantallas a una demo con la plantilla cruzada.
    await ctx.tx
      .updateTable('organizaciones')
      .set({ nombre: demo.nombre, paquete: PLANTILLA_POR_GIRO[giro] })
      .where('id', '=', ctx.ambito.organizacionId)
      .execute();
    // Los topes de descuento: un tope que no existe se lee como cero.
    await ctx.tx
      .insertInto('topes_descuento')
      .values(
        TOPES_DE_DESCUENTO.map((t) => ({
          organizacion_id: ctx.ambito.organizacionId,
          rol: t.rol,
          tope_centavos: t.topeCentavos,
          tope_bp: t.topeBp,
        })),
      )
      .execute();
    const almacen = await ctx.tx
      .insertInto('almacenes')
      .values({
        organizacion_id: ctx.ambito.organizacionId,
        sucursal_id: sucursalId,
        nombre: 'Almacén principal',
        principal: true,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    /**
     * EL SEGUNDO ALMACÉN DE UN SALÓN: la CABINA.
     *
     * ── Por qué la demostración lo necesita ──────────────────────────
     * Medio giro de la estética cuelga de él: abrir un producto para mezclar
     * —`cabina.abrir_producto`— y preguntar si alcanza —`cabina.alcanza`— buscan un
     * SEGUNDO almacén y sin él contestan «Este negocio no tiene almacén de CABINA».
     * La demo se sembraba con uno solo, así que en la demostración del salón esas dos
     * cosas no se podían enseñar. Lo encontró el rastreador: un 422 en la pantalla de
     * Productos, con su mensaje perfectamente claro y nadie leyendo la consola.
     *
     * SÓLO en el salón: una tiendita con dos almacenes tendría que explicar el
     * segundo, y en su giro no significa nada.
     */
    if (giro === 'estetica') {
      await ctx.tx
        .insertInto('almacenes')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          sucursal_id: sucursalId,
          nombre: 'Cabina',
          principal: false,
        })
        .execute();
    }
    const categorias = new Map<string, string>();
    for (const [orden, nombre] of semilla.categorias.entries()) {
      const fila = await ctx.tx
        .insertInto('categorias')
        .values({ organizacion_id: ctx.ambito.organizacionId, tipo: 'producto', nombre, orden })
        .returning('id')
        .executeTakeFirstOrThrow();
      categorias.set(nombre, fila.id);
    }
    let productos = 0;
    let insumos = 0;
    // El id de cada producto por su nombre: lo necesita el salon para colgarle
    // su fila de `servicios`, y el nombre es la unica llave que la semilla tiene.
    const productoPorNombre = new Map<string, string>();
    for (const dato of semilla.productos) {
      const producto = await ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          categoria_id: categorias.get(dato.categoria) ?? null,
          nombre: dato.nombre,
          sku: dato.sku,
          codigo_barras: dato.codigoBarras ?? null,
          precio_venta_centavos: dato.precioCentavos,
          costo_unitario_centavos: dato.costoCentavos,
          estrategia_consumo: 'sku',
          stock_minimo: '2',
          // En qué se vende. El insumo se da de alta en la MISMA unidad, así que
          // `sku` descuenta uno a uno y no hace falta un factor de conversión.
          unidad_venta: dato.unidadVenta ?? 'pieza',
          // F-145 · Lo que se vende cortado. `tipo_corte` sólo puede tener valor
          // si `es_continuo` —lo exige `producto_corte_solo_si_continuo`—, así
          // que los cuatro campos van juntos o no van.
          es_continuo: dato.continuo !== undefined,
          tipo_corte: dato.continuo?.tipoCorte ?? null,
          merma_corte_default_base:
            dato.continuo === undefined ? 0n : cantidad(dato.continuo.mermaTipica),
          umbral_retazo_base:
            dato.continuo === undefined ? 0n : cantidad(dato.continuo.umbralRetazo),
          // Sin area de preparacion la cocina no recibe NADA: no se crea
          // ninguna comanda y la mesa anuncia «pedido enviado» con la pantalla
          // de Cocina vacia. Una botella va a la barra, un plato a la cocina.
          area_preparacion: dato.area ?? 'ninguno',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      const insumo = await ctx.tx
        .insertInto('insumos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          producto_id: producto.id,
          nombre: dato.nombre,
          unidad_base: dato.unidadVenta ?? 'pieza',
          costo_unitario_centavos: dato.costoCentavos,
          stock_minimo: '2',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await entradaInicial(
        ctx.tx,
        ctx.ambito.organizacionId,
        almacen.id,
        insumo.id,
        dato.stock,
        dato.unidadVenta ?? 'pieza',
        dato.costoCentavos,
      );

      // LOS ROLLOS ABIERTOS, con su etiqueta.
      //
      // `piezas_abiertas` NO es el inventario: la existencia ya está contada
      // arriba, y esto dice cómo está REPARTIDA. Por eso la suma de los
      // restantes puede ser menor que la existencia —el resto son los rollos
      // cerrados, que a propósito no llevan identidad (migración 113)— y por eso
      // sembrarlas no altera ningún número del almacén.
      for (const pieza of dato.continuo?.piezas ?? []) {
        await ctx.tx
          .insertInto('piezas_abiertas')
          .values({
            organizacion_id: ctx.ambito.organizacionId,
            producto_id: producto.id,
            almacen_id: almacen.id,
            folio: pieza.folio,
            medida_restante_base: cantidad(pieza.restante),
            estado: 'abierta',
          })
          .execute();
      }

      productoPorNombre.set(dato.nombre, producto.id);
      productos += 1;
      insumos += 1;
    }
    // Los SERVICIOS, que se venden y no se almacenan.
    //
    // Un servicio es un `productos` -se cobra como todo lo demas- y NO lleva
    // insumo ni existencia: no hay nada que descontar de un almacen cuando se
    // corta el pelo. Su fila de `servicios`, con los cuatro tramos de duracion,
    // la pone `sembrarSalon` despues.
    for (const servicio of semilla.servicios ?? []) {
      const fila = await ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          categoria_id: categorias.get(servicio.categoria) ?? null,
          nombre: servicio.nombre,
          precio_venta_centavos: servicio.precioCentavos,
          estrategia_consumo: 'sku',
          // Un servicio se vende SIEMPRE: no hay stock que se acabe. Sin esto,
          // cobrar un corte fallaria por falta de existencia de un insumo que no
          // existe.
          permite_venta_sin_stock: true,
          area_preparacion: 'ninguno',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      productoPorNombre.set(servicio.nombre, fila.id);
      productos += 1;
    }

    const insumosCafe = new Map<string, { id: string; unidad: string }>();
    for (const dato of semilla.insumos) {
      const insumo = await ctx.tx
        .insertInto('insumos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          nombre: dato.nombre,
          unidad_base: dato.unidad,
          costo_unitario_centavos: dato.costoCentavos,
          stock_minimo: '5',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      await entradaInicial(
        ctx.tx,
        ctx.ambito.organizacionId,
        almacen.id,
        insumo.id,
        dato.stock,
        dato.unidad,
        dato.costoCentavos,
      );
      insumosCafe.set(dato.clave, { id: insumo.id, unidad: dato.unidad });
      insumos += 1;
    }
    for (const dato of semilla.recetas) {
      const producto = await ctx.tx
        .insertInto('productos')
        .values({
          organizacion_id: ctx.ambito.organizacionId,
          categoria_id: categorias.get(dato.categoria) ?? null,
          nombre: dato.nombre,
          precio_venta_centavos: dato.precioCentavos,
          estrategia_consumo: 'receta',
          permite_venta_sin_stock: false,
          area_preparacion: dato.area ?? 'ninguno',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      for (const ingrediente of dato.ingredientes) {
        const insumo = insumosCafe.get(ingrediente.clave);
        if (insumo === undefined)
          throw new ErrorDominio('INVENTARIO_INVALIDO', 'La semilla tiene un insumo desconocido.');
        await sql`insert into recetas (organizacion_id, producto_id, insumo_id, cantidad, unidad, merma_bp)
          values (${ctx.ambito.organizacionId}, ${producto.id}, ${insumo.id}, ${ingrediente.cantidad}, ${insumo.unidad}, 0)`.execute(
          ctx.tx,
        );
      }
      // También al mapa por nombre: las bebidas de una cafetería son productos DE
      // RECETA, y `sembrarOpcionesDeBebida` las cuelga por nombre. Sin esto el
      // mapa sólo tenía los de SKU y los servicios, así que los cuatro grupos de
      // opciones no se habrían podido colgar de ninguna bebida.
      productoPorNombre.set(dato.nombre, producto.id);
      productos += 1;
    }
    await recalcularCostosRecetas(ctx.tx, ctx.ambito.organizacionId);

    // EL EQUIPO · una persona por cada rol que opera.
    //
    // Va en los CINCO modelos y no solo en el restaurante. Con un solo empleado
    // -el dueno que crea `bootstrap`- no se ve nada de lo que este sistema hace:
    // los permisos por rol no se distinguen, el corte no sabe quien cobro, y la
    // comision de un salon no tiene a quien repartirse.
    const pimienta = validarEntorno(process.env).PIN_PEPPER;
    const empleos = await ctx.paso('sembrar_equipo', () =>
      sembrarEquipo(ctx.tx, ctx.ambito.organizacionId, sucursalId, giro, pimienta),
    );
    const duenos = await ctx.paso('reponer_dueno', () =>
      reponerDueno(ctx.tx, ctx.ambito.organizacionId, pimienta),
    );
    // Quien no es del equipo sembrado ni dueño, lo dio de alta una prueba: se desactiva
    // (no se borra: sus ventas ya no existen, pero su rastro en la auditoría sí).
    await ctx.paso('desactivar_lo_que_sobra', () =>
      desactivarLoQueSobra(ctx.tx, ctx.ambito.organizacionId, [...empleos.values(), ...duenos]),
    );
    if (empleos.size !== equipoDelGiro(giro).length) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'El equipo de la demostración quedó incompleto.',
      );
    }

    // La SALA solo tiene sentido en un restaurante: mesas, zonas y estaciones.
    // Sin ella, Mesero y Cocina abren vacias y el mapa de mesas -la pantalla que
    // Miguel mas quiere ver- no tiene nada que pintar.
    const sala =
      organizacion.giro === 'restaurante'
        ? await ctx.paso('sembrar_sala', () =>
            sembrarSala(ctx.tx, ctx.ambito.organizacionId, sucursalId),
          )
        : null;

    // Y la BARRA de la cafetería: su estación general, o la barra no recibe comandas.
    if (organizacion.giro === 'cafeteria') {
      await ctx.paso('asegurar_barra', () =>
        asegurarEstacionGeneral(ctx.tx, ctx.ambito.organizacionId, 'Barra'),
      );
    }

    // Y el SALON solo en una estetica: profesionales, muebles y los cuatro
    // tramos de cada servicio. Sin ellos la agenda del dia abre con cero
    // columnas y el catalogo de servicios abre vacio.
    const salon =
      organizacion.giro === 'estetica'
        ? await ctx.paso('sembrar_salon', () =>
            sembrarSalon(
              ctx.tx,
              ctx.ambito.organizacionId,
              sucursalId,
              empleos,
              semilla.servicios ?? [],
              productoPorNombre,
            ),
          )
        : null;

    // Y LAS OPCIONES DE BEBIDA sólo en una cafetería: tamaño, leche, temperatura
    // y extras. Sin ellas `opciones-de-la-bebida` abre con su estado vacío —«esta
    // bebida se agrega tal cual»— y lo que una cafetería hace cuarenta veces por
    // turno no se puede ni enseñar ni probar.
    const bebidas =
      organizacion.giro === 'cafeteria'
        ? await ctx.paso('sembrar_opciones_de_bebida', () =>
            sembrarOpcionesDeBebida(
              ctx.tx,
              ctx.ambito.organizacionId,
              productoPorNombre,
              insumosCafe,
            ),
          )
        : null;

    // LOS DATOS DE ARRANQUE · el proveedor. La caja queda CERRADA.
    //
    // Antes la semilla la abria «para que la demo este lista para cobrar», y
    // conseguia lo contrario: la sesion quedaba en una terminal que nadie vuelve
    // a usar, y como la base permite UNA sesion abierta por sucursal, desde
    // cualquier navegador nuevo no se podia ni cobrar —la abierta no es de esta
    // terminal— ni abrir la propia —la sucursal ya tiene una—. La abre el primer
    // cajero que entra, que es lo que pasa al empezar el turno. Ver
    // `sembrarArranque`.
    // No se le pasa a `sembrarArranque` —la semilla ya no abre la caja— pero la
    // comprobación se queda: una demostración sin nadie que pueda abrir caja no
    // se puede enseñar, y es mejor decirlo al sembrar que al cobrar.
    const abre = empleos.values().next().value ?? null;
    if (abre === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'La demostracion no tiene a nadie que pueda abrir la caja.',
      );
    }
    const arranque = await ctx.paso('sembrar_arranque', () =>
      sembrarArranque(ctx.tx, ctx.ambito.organizacionId, sucursalId, semilla),
    );

    // Y LA CONFIGURACIÓN: IVA, apariencia del giro y la contraseña del Modo
    // Presentación, sin la cual esa pantalla no abre.
    await ctx.paso('reponer_configuracion', () =>
      reponerConfiguracion(ctx.tx, ctx.ambito.organizacionId, giro, pimienta),
    );

    const empleados = empleos.size;
    ctx.auditar({
      entidadId: ctx.ambito.organizacionId,
      payload: {
        productos,
        insumos,
        empleados,
        giro: organizacion.giro,
        proveedor: arranque.proveedor,
        ...(sala ?? {}),
        ...(salon ?? {}),
        ...(bebidas ?? {}),
      },
    });
    return { productos, insumos, empleados, sala, salon, bebidas, arranque };
  },
});

/**
 * Borra los datos de demostración de una organización: TODO lo que no está en
 * `CONSERVADAS` (bloque B.2 de la 2.4).
 *
 * ── Por qué ya no es una lista escrita a mano ────────────────────────────
 * Lo era, y se quedaba atrás con cada migración: el 24-09-2026 dejaba 70 tablas con
 * `organizacion_id` sin tocar —cotizaciones, anticipos, lealtad, pedidos anticipados,
 * tomas y traspasos…—. Ahora borra en el orden que `generar-limpieza-de-demo.mjs`
 * calcula del esquema: hijo antes que padre, así que una llave `restrict` nueva no
 * puede volver a abortar el reseteo entero (ya pasó con `remisiones → ordenes` y con
 * `comisiones_causadas → cita_servicios`).
 *
 * ── Por qué se borra también la OPERACIÓN, y no sólo el catálogo ──────────
 * Un reseteo de demostración devuelve el negocio a su punto de partida: eso incluye
 * las ventas y el folio. Es destructivo a conciencia — por eso pide la palabra
 * `RESETEAR`, sólo lo puede hacer un dueño o un administrador y sólo sobre una DEMO.
 *
 * Los CLIENTES también se borran: nada los siembra, así que lo que hubiera lo dejó una
 * prueba. Por eso ya no hace falta deshacer a mano el saldo que sube una remisión y
 * baja un pago —el cliente entero se va—.
 */
async function limpiar(
  tx: Transaccion,
  organizacionId: string,
  terminalQueSeQueda: string | null,
): Promise<void> {
  // 1 · Los ciclos de llaves, rotos poniendo su columna en nulo.
  for (const { tabla, columna } of CICLOS) {
    await sql`update ${sql.table(tabla)} set ${sql.ref(columna)} = null
      where organizacion_id = ${organizacionId} and ${sql.ref(columna)} is not null`.execute(tx);
  }

  // 2 · Todo lo demás, hijo antes que padre.
  for (const paso of ORDEN_DE_LIMPIEZA) {
    if (paso.via === null) {
      await sql`delete from ${sql.table(paso.tabla)} where organizacion_id = ${organizacionId}`.execute(
        tx,
      );
    } else {
      await sql`delete from ${sql.table(paso.tabla)} where ${sql.ref(paso.via.columna)} in (
        select ${sql.ref(paso.via.referida)} from ${sql.table(paso.via.padre)}
        where organizacion_id = ${organizacionId}
      )`.execute(tx);
    }
  }

  // 3 · Las terminales, menos la de quien resetea. Cada corrida de Playwright con una
  //     cookie de dispositivo nueva deja una, y la lista crecía sin fin. La de quien
  //     pide el reseteo se queda: su sesión está abierta en ella. Un navegador cuya
  //     terminal se borró vuelve a tener una en cuanto alguien teclea su PIN.
  if (terminalQueSeQueda === null) {
    await sql`delete from terminales where organizacion_id = ${organizacionId}`.execute(tx);
  } else {
    await sql`delete from terminales
      where organizacion_id = ${organizacionId} and id <> ${terminalQueSeQueda}`.execute(tx);
  }
}

async function entradaInicial(
  tx: Transaccion,
  org: string,
  almacen: string,
  insumo: string,
  cantidad: string,
  unidad: string,
  costo: bigint,
): Promise<void> {
  await tx
    .insertInto('existencias')
    .values({ organizacion_id: org, almacen_id: almacen, insumo_id: insumo, cantidad })
    .execute();
  await tx
    .insertInto('movimientos_stock')
    .values({
      organizacion_id: org,
      almacen_id: almacen,
      insumo_id: insumo,
      tipo: 'inventario_inicial',
      cantidad,
      unidad,
      costo_unitario_centavos: costo,
      referencia_tipo: 'manual',
    })
    .execute();
}
