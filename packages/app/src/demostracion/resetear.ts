import { PAQUETES, ErrorDominio, esGiro } from '@morphiqpos/contracts';
import { cantidad } from '@morphiqpos/domain/catalogo';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { validarEntorno } from '@morphiqpos/contracts';

import { definirComando } from '../comando.ts';
import { hashearPin } from '../identidad/pin.ts';
import { recalcularCostosRecetas } from '../inventario/recetas.ts';
import { limpiarArranque, sembrarArranque, type ResumenArranque } from './arranque.ts';
import { semillaParaPaquete } from './datos.ts';
import { sembrarEquipo } from './equipo.ts';
import { sembrarOpcionesDeBebida, type ResumenBebidas } from './bebidas.ts';
import { limpiarSala, sembrarSala, type ResumenSala } from './sala.ts';
import { limpiarSalon, sembrarSalon, type ResumenSalon } from './salon.ts';

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
 * este comando ya se niega a correr sobre los negocios que cobran.
 *
 * La contraseña está ESCRITA en `docs/fase-2/ACCESOS-DEMO.md`, junto a los PIN, y
 * eso no es un descuido: una demostración cuya llave no está escrita es una
 * demostración que nadie puede enseñar.
 */
export const CONTRASENA_DE_PRESENTACION_DEMO = 'demo1234';

async function sembrarContrasenaDePresentacion(
  tx: Transaccion,
  organizacionId: string,
  pimienta: string,
): Promise<void> {
  const hash = await hashearPin(CONTRASENA_DE_PRESENTACION_DEMO, pimienta);
  const fila = await tx
    .selectFrom('configuracion')
    .select(['id', 'valores', 'version'])
    .where('organizacion_id', '=', organizacionId)
    .executeTakeFirst();

  const valores = {
    ...((fila?.valores ?? {}) as Record<string, unknown>),
    presentacion_password_hash: hash,
  };

  if (fila === undefined) {
    await tx
      .insertInto('configuracion')
      .values({ organizacion_id: organizacionId, valores: JSON.stringify(valores), version: 1 })
      .execute();
    return;
  }
  await tx
    .updateTable('configuracion')
    .set({ valores: JSON.stringify(valores), version: fila.version + 1 })
    .where('id', '=', fila.id)
    .execute();
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
    await ctx.paso('limpiar_demo', () => limpiar(ctx.tx, ctx.ambito.organizacionId));
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

    // La SALA solo tiene sentido en un restaurante: mesas, zonas y estaciones.
    // Sin ella, Mesero y Cocina abren vacias y el mapa de mesas -la pantalla que
    // Miguel mas quiere ver- no tiene nada que pintar.
    const sala =
      organizacion.giro === 'restaurante'
        ? await ctx.paso('sembrar_sala', () =>
            sembrarSala(ctx.tx, ctx.ambito.organizacionId, sucursalId),
          )
        : null;

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

    // Y LA CONTRASEÑA DEL MODO PRESENTACIÓN, sin la cual esa pantalla no abre.
    await ctx.paso('sembrar_contrasena_presentacion', () =>
      sembrarContrasenaDePresentacion(ctx.tx, ctx.ambito.organizacionId, pimienta),
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
 * Borra los datos de demostración de una organización.
 *
 * ── Por qué se borra también la OPERACIÓN, y no sólo el catálogo ──────────
 * La primera versión borraba catálogo e inventario y dejaba las ventas. El
 * resultado, comprobado ejecutándolo: la clave foránea de `orden_lineas` es
 * `on delete set null`, así que **las nueve líneas de órdenes ya cobradas se
 * quedaron con `producto_id` en nulo**, en silencio. El ticket seguía
 * reimprimiéndose porque la línea guarda su propia foto del producto, pero el
 * rastro hacia el catálogo se perdía sin que nadie lo pidiera.
 *
 * Y además el folio seguía subiendo sobre unas ventas que ya no existían.
 *
 * Un reseteo de demostración devuelve el negocio a su punto de partida: eso
 * incluye las ventas. Es destructivo a conciencia — por eso pide la palabra
 * `RESETEAR` y sólo lo puede hacer un dueño o un administrador.
 *
 * El orden importa: hijos antes que padres, o la clave foránea lo impide.
 */
async function limpiar(tx: Transaccion, organizacionId: string): Promise<void> {
  // Salon de la estetica. Va PRIMERO por la misma razon que la sala:
  // `cita_servicios` apunta a `servicios` con `restrict` y `servicios` cuelga de
  // `productos` con `cascade`, asi que borrar el producto antes abortaria la
  // transaccion entera si quedo una cita.
  await limpiarSalon(tx, organizacionId);

  // ── Sala del restaurante ──────────────────────────────────────────────────
  // Va PRIMERO, y no es un detalle de orden: `mesas.orden_activa_id` apunta a
  // `ordenes` y `ordenes.mesa_id` apunta a `mesas`. Sin soltar el lado de la
  // mesa antes, borrar órdenes aborta la transacción entera por la foránea.
  await limpiarSala(tx, organizacionId);

  // ── Crédito ───────────────────────────────────────────────────────────────
  // VA ANTES QUE LAS ÓRDENES, y no por orden estético: `remisiones.orden_id`
  // apunta a `ordenes` con **RESTRICT**. En cuanto una demo fía algo —el botón
  // «A cuenta» de la caja de ferretería—, `delete from ordenes` aborta la
  // transacción entera y el reseteo deja la demo exactamente como estaba.
  await limpiarCredito(tx, organizacionId);

  // ── Operación: ventas, cobros y caja ──────────────────────────────────────
  await sql`delete from pagos where organizacion_id = ${organizacionId}`.execute(tx);
  // Esta tabla NO lleva `organizacion_id`: cuelga de la línea, que sí lo lleva.
  // Se filtra por la línea, no por la organización, y por eso va antes que ella.
  await sql`delete from orden_linea_modificadores where orden_linea_id in (
    select id from orden_lineas where organizacion_id = ${organizacionId}
  )`.execute(tx);
  await sql`delete from orden_lineas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from ordenes where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from movimientos_caja where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from sesiones_caja where organizacion_id = ${organizacionId}`.execute(tx);
  // El consecutivo vuelve a empezar. Si no, la demostración arrancaría en el
  // folio 47 y la primera venta que se le enseña a un cliente no sería la 1.
  await sql`delete from folios where organizacion_id = ${organizacionId}`.execute(tx);

  // ── Catálogo e inventario ─────────────────────────────────────────────────
  // El CORTE primero: `cortes_material` apunta a los dos movimientos de stock
  // con `no action` y al producto con `restrict`, y `piezas_abiertas` al producto
  // igual. Sin estos dos borrados, la primera demo que corte un metro de cable
  // deja el reseteo roto para siempre.
  await sql`delete from cortes_material where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from piezas_abiertas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from movimientos_stock where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from existencias where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from recetas where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from producto_modificadores where organizacion_id = ${organizacionId}`.execute(
    tx,
  );
  await sql`delete from modificador_opciones where modificador_id in (select id from modificadores where organizacion_id = ${organizacionId})`.execute(
    tx,
  );
  await sql`delete from modificadores where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from insumos where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from productos where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from categorias where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from almacenes where organizacion_id = ${organizacionId}`.execute(tx);

  // Y el proveedor, al final: despues de compras y de documentos por pagar, que
  // lo referencian con `restrict`. Las TERMINALES no se borran -una terminal
  // enrolada es un dispositivo de verdad, y un reseteo de demostracion no
  // desenrola la tablet de nadie-.
  await limpiarArranque(tx, organizacionId);
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
/**
 * EL CRÉDITO DE LA DEMO, DESHECHO CON SU ARITMÉTICA.
 *
 * ── Por qué no basta con borrar las filas ─────────────────────────────────
 * Porque el saldo del cliente NO es una vista: es una columna que la remisión
 * sube y el pago baja. Los clientes de la demo no se borran —su ficha, su límite
 * y su deuda de arranque son parte de lo que se enseña— así que borrar las
 * remisiones sin restar lo que sumaron dejaría al contratista debiendo miles de
 * pesos de documentos que ya no existen, y la demostración de la semana que
 * viene empezaría con el mejor cliente bloqueado por mora.
 *
 * Se deshace en el orden inverso al que se hizo: primero vuelve al saldo lo que
 * los pagos bajaron, después se resta lo que las remisiones subieron, y sólo
 * entonces se borran las filas.
 */
async function limpiarCredito(tx: Transaccion, organizacionId: string): Promise<void> {
  // 1 · Lo que los pagos aplicaron vuelve al saldo.
  await sql`
    update clientes c
       set saldo_pendiente_centavos = c.saldo_pendiente_centavos + aplicado.suma
      from (
        select p.cliente_id, sum(a.monto_centavos) as suma
          from pagos_credito p
          join aplicaciones_pago a on a.pago_id = p.id
         where p.organizacion_id = ${organizacionId}
         group by p.cliente_id
      ) aplicado
     where c.id = aplicado.cliente_id
       and c.organizacion_id = ${organizacionId}
  `.execute(tx);

  // 2 · Y lo que las remisiones subieron se resta. `greatest` porque un saldo
  //     negativo es un cliente al que el negocio le debe dinero, y eso no es lo
  //     que pasó: lo que pasó es que la demo se reseteó.
  await sql`
    update clientes c
       set saldo_pendiente_centavos = greatest(0, c.saldo_pendiente_centavos - fiado.suma)
      from (
        select r.cliente_id, sum(r.importe_centavos) as suma
          from remisiones r
         where r.organizacion_id = ${organizacionId}
         group by r.cliente_id
      ) fiado
     where c.id = fiado.cliente_id
       and c.organizacion_id = ${organizacionId}
  `.execute(tx);

  // `aplicaciones_pago` cae con su pago (cascade), y se borra explícito: la tabla
  // no lleva `organizacion_id`, y depender del cascade obliga a leer otra
  // migración para saber si el borrado de al lado la arrastra.
  await sql`delete from aplicaciones_pago where pago_id in (
    select id from pagos_credito where organizacion_id = ${organizacionId}
  )`.execute(tx);
  await sql`delete from pagos_credito where organizacion_id = ${organizacionId}`.execute(tx);
  await sql`delete from remisiones where organizacion_id = ${organizacionId}`.execute(tx);
}
