import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { sql } from 'kysely';
import { z } from 'zod';

import { definirComando } from '../comando.ts';
import { exigirNombreDelNegocio } from './confirmacion.ts';
import {
  contar,
  purgarSeccion,
  SECCIONES,
  SECCIONES_DEL_HISTORICO,
  TABLAS_DEL_CATALOGO,
  type Conteos,
} from './purgas.ts';

/**
 * EL MANTENIMIENTO DESTRUCTIVO (F1-02 E10-4).
 *
 * El encargo lo llama «el peor defecto del sistema», y con razón. Sus cinco
 * funciones decidían el permiso leyendo un campo del CUERPO de la petición:
 *
 *     if (body?.rol !== 'administrador') return 403;      // eliminarMesasDemo
 *
 * Una línea desde la consola de la tablet de un mesero borraba el mapa de mesas
 * del restaurante. Y `limpiarHistorialSeccion` era peor todavía: preguntaba
 * `posUser.some(u => u.rol === 'administrador')`, es decir «¿existe algún
 * administrador en este negocio?» y no «¿es administrador quien llama?». La
 * respuesta es siempre sí, así que ESE ENDPOINT NUNCA RECHAZÓ A NADIE.
 *
 * ── Por qué aquí eso ya no se puede escribir ───────────────────────────────
 * No es disciplina, es el tipo. `definirComando` recorre el esquema de entrada
 * y RECHAZA AL CARGAR EL MÓDULO cualquier comando que declare `rol`,
 * `organizacion_id`, `sucursal_id`, `identidad_id`, `empleo_id` o `terminal_id`.
 * Un comando que aceptara `{"rol":"administrador"}` no arranca.
 *
 * El rol sale de `ctx.ambito`, que arma `resolverSesion` desde una cookie
 * firmada y `HttpOnly`, releída de la base en CADA petición.
 *
 * ── Seis rutas y no cuatro ─────────────────────────────────────────────────
 * Sus cuatro rutas mezclaban operaciones de riesgo muy distinto detrás del
 * mismo nombre: `reiniciarSistema` con `mode:'tests'` borra el histórico y con
 * `mode:'all'` borra el negocio. Un solo rol y una sola palabra para las dos.
 * Aquí cada operación tiene su ruta, su rol y su nivel de confirmación.
 */

/** Las cinco irreversibles exigen DUEÑO, no administrador. Ver F1-07 §4.3. */
const SOLO_DUENO = ['dueno'] as const;
/** Las dos reversibles admiten también administrador. */
const ADMINISTRACION = ['dueno', 'administrador'] as const;

/**
 * La confirmación por nombre del negocio.
 *
 * No se llama `confirm` ni `password`: se llama `confirmacionNombreNegocio`
 * para que en el sitio de llamada se lea qué hay que escribir. Un `confirm:
 * 'BORRAR TODO'` no dice nada sobre qué se compara.
 */
const confirmacion = z.string().trim().min(1).max(200);

const entradaVacia = z.object({});
const entradaConfirmada = z.object({ confirmacionNombreNegocio: confirmacion });
const entradaSeccion = z.object({
  seccion: z.enum(SECCIONES),
  confirmacionNombreNegocio: confirmacion,
});
const entradaPurgarVentas = z.object({
  confirmacionNombreNegocio: confirmacion,
  /**
   * Devolver al inventario lo que las ventas borradas consumieron.
   *
   * Su `limpiarVentas` lo hacía SIN marca de idempotencia, así que un doble
   * clic o un reintento de red DUPLICABA el inventario del negocio. Aquí la
   * clave de idempotencia de `comando()` lo impide: el segundo intento con la
   * misma clave devuelve el resultado del primero y no vuelve a sumar.
   */
  revertirInventario: z.boolean().default(false),
});

export interface ResultadoMantenimiento {
  readonly negocio: string;
  /** Lo que HABÍA antes de borrar, por tabla. No reconstruye: deja constancia. */
  readonly borrado: Conteos;
}

/**
 * 1 · Vaciar el mapa de mesas. REVERSIBLE.
 *
 * Su `eliminarMesasDemo` listaba hasta 500 mesas y las borraba FÍSICAMENTE, una
 * por una, sin mirar `estado` ni `venta_activa_id`. El nombre dice «demo» y el
 * diálogo dice «mesas demo», pero el código no distingue demo de producción: se
 * llevaba el restaurante entero, y cada mesa ocupada dejaba su venta huérfana
 * para siempre.
 *
 * Aquí es borrado suave —regla 8 de `F1-01` §3— y SE NIEGA si alguna mesa tiene
 * una orden activa. Eso arregla de paso las huérfanas que aquella provocaba.
 */
export const vaciarMesas = definirComando<Transaccion, typeof entradaVacia, ResultadoMantenimiento>(
  {
    nombre: 'mantenimiento.vaciar_mesas',
    entidad: 'mesa',
    escribe: true,
    roles: ADMINISTRACION,
    paquetes: PAQUETES_TODOS,
    entrada: entradaVacia,
    async ejecutar(ctx) {
      const org = ctx.ambito.organizacionId;

      const ocupadas = await ctx.tx
        .selectFrom('mesas')
        .select(['numero'])
        .where('organizacion_id', '=', org)
        .where('activa', '=', true)
        .where('orden_activa_id', 'is not', null)
        .orderBy('numero', 'asc')
        .execute();

      if (ocupadas.length > 0) {
        const lista = ocupadas.map((m) => m.numero).join(', ');
        throw new ErrorDominio(
          'MESA_NO_LIBERABLE',
          `Hay mesas con venta abierta (${lista}). Cóbralas o cancélalas antes de vaciar el mapa.`,
        );
      }

      const antes = await contar(ctx.tx, ['mesas'], org);
      const apagadas = await ctx.paso('apagar_mesas', () =>
        ctx.tx
          .updateTable('mesas')
          .set({ activa: false, updated_at: ctx.ahora })
          .where('organizacion_id', '=', org)
          .where('activa', '=', true)
          .returning('id')
          .execute(),
      );

      const negocio = await nombreDelNegocio(ctx.tx, org);
      ctx.auditar({ entidadId: null, payload: { habia: antes, apagadas: apagadas.length } });
      return { negocio, borrado: { mesas: apagadas.length } };
    },
  },
);

/** 2 · Purgar UNA sección del histórico. NO reversible. */
export const purgarSeccionDelHistorico = definirComando<
  Transaccion,
  typeof entradaSeccion,
  ResultadoMantenimiento
>({
  nombre: 'mantenimiento.purgar_seccion',
  entidad: 'organizacion',
  escribe: true,
  roles: SOLO_DUENO,
  paquetes: PAQUETES_TODOS,
  entrada: entradaSeccion,
  async ejecutar(ctx, entrada) {
    const org = ctx.ambito.organizacionId;
    const negocio = await exigirNombreDelNegocio(ctx.tx, org, entrada.confirmacionNombreNegocio);
    const borrado = await ctx.paso('purgar', () => purgarSeccion(ctx.tx, org, entrada.seccion));
    ctx.auditar({ entidadId: org, payload: { seccion: entrada.seccion, habia: borrado } });
    return { negocio, borrado };
  },
});

/**
 * 3 · Purgar TODAS las ventas, con reversión de inventario opcional.
 *
 * Es la operación donde la clave de idempotencia no es burocracia sino la
 * corrección: sin ella, un reintento suma el stock dos veces.
 */
export const purgarVentas = definirComando<
  Transaccion,
  typeof entradaPurgarVentas,
  ResultadoMantenimiento
>({
  nombre: 'mantenimiento.purgar_ventas',
  entidad: 'organizacion',
  escribe: true,
  roles: SOLO_DUENO,
  paquetes: PAQUETES_TODOS,
  entrada: entradaPurgarVentas,
  async ejecutar(ctx, entrada) {
    const org = ctx.ambito.organizacionId;
    const negocio = await exigirNombreDelNegocio(ctx.tx, org, entrada.confirmacionNombreNegocio);

    if (entrada.revertirInventario) {
      // Se devuelve al inventario lo que las ventas consumieron, leyendo el
      // LEDGER —que es la única fuente que sabe cuánto salió de verdad— y no un
      // recálculo de las recetas, que hoy podrían ser otras.
      await ctx.paso('revertir_inventario', () =>
        sql`
          update existencias e
             set cantidad = e.cantidad + v.devuelto, actualizado_en = now()
            from (
              select m.almacen_id, m.insumo_id, sum(-m.cantidad) as devuelto
                from movimientos_stock m
               where m.organizacion_id = ${org}
                 and m.referencia_tipo = 'orden'
                 and m.tipo = 'salida_venta'
               group by m.almacen_id, m.insumo_id
            ) v
           where e.organizacion_id = ${org}
             and e.almacen_id = v.almacen_id
             and e.insumo_id = v.insumo_id
        `.execute(ctx.tx),
      );
    }

    const borrado = await ctx.paso('purgar_ventas', () => purgarSeccion(ctx.tx, org, 'ventas'));
    // Los movimientos de la venta se van con ella: dejar el ledger sin la orden
    // que lo causó es dejar un consumo que no se puede explicar.
    await sql`
      delete from movimientos_stock
       where organizacion_id = ${org} and referencia_tipo = 'orden'
    `.execute(ctx.tx);

    ctx.auditar({
      entidadId: org,
      payload: { habia: borrado, revertioInventario: entrada.revertirInventario },
    });
    return { negocio, borrado };
  },
});

/** 4 · Reiniciar el HISTÓRICO y dejar el catálogo intacto. NO reversible. */
export const reiniciarPruebas = definirComando<
  Transaccion,
  typeof entradaConfirmada,
  ResultadoMantenimiento
>({
  nombre: 'mantenimiento.reiniciar_pruebas',
  entidad: 'organizacion',
  escribe: true,
  roles: SOLO_DUENO,
  paquetes: PAQUETES_TODOS,
  entrada: entradaConfirmada,
  async ejecutar(ctx, entrada) {
    const org = ctx.ambito.organizacionId;
    const negocio = await exigirNombreDelNegocio(ctx.tx, org, entrada.confirmacionNombreNegocio);

    const borrado: Record<string, number> = {};
    for (const seccion of SECCIONES_DEL_HISTORICO) {
      const conteos = await ctx.paso(`purgar_${seccion}`, () =>
        purgarSeccion(ctx.tx, org, seccion),
      );
      for (const [tabla, n] of Object.entries(conteos)) borrado[tabla] = n;
    }

    ctx.auditar({ entidadId: org, payload: { habia: borrado } });
    return { negocio, borrado };
  },
});

/**
 * 5 · Reiniciar TODO: histórico y catálogo. NO reversible, y de verdad.
 *
 * Lo único que sobrevive: la organización, sus sucursales, las personas con su
 * empleo —incluido quien ejecuta, que por definición existe porque tiene
 * sesión—, y la estación general.
 *
 * Y lo que NO pasa, a diferencia de su `reiniciarSistema`: **no se crea ningún
 * usuario con PIN `1234`**. Aquella lo hacía cuando el padrón se quedaba vacío
 * (`entry.ts:218-223`), es decir, dejaba una puerta abierta con una contraseña
 * conocida justo después de borrar el negocio. Si hiciera falta un
 * administrador nuevo, se da de alta con `pnpm db:bootstrap`.
 */
export const reiniciarTodo = definirComando<
  Transaccion,
  typeof entradaConfirmada,
  ResultadoMantenimiento
>({
  nombre: 'mantenimiento.reiniciar_todo',
  entidad: 'organizacion',
  escribe: true,
  roles: SOLO_DUENO,
  paquetes: PAQUETES_TODOS,
  entrada: entradaConfirmada,
  async ejecutar(ctx, entrada) {
    const org = ctx.ambito.organizacionId;
    const negocio = await exigirNombreDelNegocio(ctx.tx, org, entrada.confirmacionNombreNegocio);

    const borrado: Record<string, number> = {};
    for (const seccion of SECCIONES_DEL_HISTORICO) {
      const conteos = await ctx.paso(`purgar_${seccion}`, () =>
        purgarSeccion(ctx.tx, org, seccion),
      );
      for (const [tabla, n] of Object.entries(conteos)) borrado[tabla] = n;
    }

    const antesCatalogo = await contar(ctx.tx, TABLAS_DEL_CATALOGO, org);
    await ctx.paso('purgar_catalogo', async () => {
      for (const tabla of TABLAS_DEL_CATALOGO) {
        await sql`delete from ${sql.table(tabla)} where organizacion_id = ${org}`.execute(ctx.tx);
      }
    });
    for (const [tabla, n] of Object.entries(antesCatalogo)) borrado[tabla] = n;

    // Y se vuelve a sembrar lo que el restaurante no puede no tener.
    await ctx.paso('resembrar_minimos', async () => {
      await sql`
        insert into zonas (organizacion_id, nombre, orden)
        select ${org}, z.nombre, z.orden
          from (values ('Interior',0),('Exterior',1),('Terraza',2),('Barra',3),('Otro',4))
               as z(nombre, orden)
         where exists (select 1 from organizaciones o
                        where o.id = ${org} and o.paquete = 'restaurante')
      `.execute(ctx.tx);
      await sql`
        insert into estaciones_preparacion
               (organizacion_id, nombre, descripcion, color, orden, es_general)
        select ${org}, 'Cocina general', 'Estación por defecto', '#4A5568', 0, true
         where exists (select 1 from organizaciones o
                        where o.id = ${org} and o.paquete = 'restaurante')
           and not exists (select 1 from estaciones_preparacion e
                            where e.organizacion_id = ${org} and e.es_general)
      `.execute(ctx.tx);
    });

    ctx.auditar({ entidadId: org, payload: { habia: borrado } });
    return { negocio, borrado };
  },
});

async function nombreDelNegocio(tx: Transaccion, organizacionId: string): Promise<string> {
  const fila = await tx
    .selectFrom('organizaciones')
    .select('nombre')
    .where('id', '=', organizacionId)
    .executeTakeFirst();
  return fila?.nombre ?? '';
}
