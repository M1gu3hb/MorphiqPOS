import 'server-only';

import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';
import { repoTomas, repoVentaCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import { exigirMotivoDeMerma } from '../inventario/motivos.ts';
import { ejecutarCierreDeConteo, type ResultadoCerrarConteo } from './conteo.ts';

/**
 * `inventario.ajustar_conteo` — contar una zona y cerrarla EN UN VIAJE (F-149).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `abarrotes/Conteo.tsx` cierra la zona publicando en `/api/inventario/ajustar-conteo`
 * y **esa ruta no existía**: el botón daba el error genérico después de veinte
 * minutos de conteo, y lo contado se perdía al recargar. Peor: la pantalla mandaba
 * `motivo: 'diferencia de conteo'`, que es una FRASE, y `movimientos_stock.motivo`
 * apunta a `motivos_merma.clave` desde la 062 — con la ruta puesta y la frase
 * intacta, la base habría contestado `23503` y el conteo tampoco cerraría.
 *
 * ── Por qué un viaje y no los tres comandos que ya existen ───────────────
 * Existen `inventario.abrir_conteo`, `capturar_conteo` y `cerrar_conteo`, y son los
 * correctos para contar desde una PC con la lista delante. Pero esta pantalla es la
 * ÚNICA del modelo hecha para el teléfono: se cuenta de pie, frente al anaquel, a
 * veces sin señal en el fondo de la bodega. Treinta peticiones —una por producto—
 * son treinta ocasiones de perder el trabajo hecho. Se aprieta una vez, al final,
 * y la transacción escribe todo o nada.
 *
 * ── Por qué la ZONA llega por nombre ─────────────────────────────────────
 * Porque es lo que la pantalla tiene: la vista `conteo_de_zona` (173) sirve la zona
 * que toca hoy y la pantalla lee su nombre de la primera fila. Se resuelve aquí
 * contra `zonas_anaquel`, acotada a la organización y a la sucursal de la sesión:
 * el nombre no elige el ámbito, sólo señala una fila dentro de él.
 *
 * ── Por qué se comprueba que cada insumo SEA de la zona ──────────────────
 * Porque si no, el cierre de la reja de refrescos podría traer en la lista un
 * insumo del congelador y ajustarlo con el sello de un conteo que nadie hizo en
 * ese anaquel. Es la misma clase de agujero que aceptar el factor del cliente:
 * no hace falta mala fe, basta una pantalla con estado viejo.
 */

const ROLES = ['almacen', 'gerente', 'administrador', 'dueno'] as const;
/** El cajero cuenta: en una tiendita es quien está y quien conoce el anaquel. */
const CUENTAN = ['cajero', ...ROLES] as const;

const CANTIDAD = /^\d{1,10}(\.\d{1,4})?$/;

export const entradaAjustarConteo = z.object({
  /** El NOMBRE de la zona, que es lo que la pantalla tiene en la mano. */
  zona: z.string().trim().min(1).max(80),
  movimientos: z
    .array(
      z.object({
        insumoId: z.uuid(),
        /**
         * Lo contado, en unidad base y COMO TEXTO.
         *
         * Texto porque una cantidad de inventario es `numeric(14,4)` y un `number`
         * de JavaScript no representa 0.1 sin error: quien convierte es el
         * servidor, igual que con los importes.
         */
        contado: z.string().regex(CANTIDAD, 'Lo contado va con hasta cuatro decimales.'),
        /**
         * El motivo de ESTA diferencia (C.10 de la 2.4): «caducado» no es «roto» ni
         * «faltante». Sin él, el de la zona. LA CLAVE de `motivos_merma`.
         */
        motivo: z.string().trim().min(3).max(60).optional(),
      }),
    )
    .min(1)
    // Una zona de anaquel son decenas de claves, no miles: una lista de cuatrocientas
    // ya es una toma completa y ésa tiene su propio camino, de tres comandos.
    .max(400),
  /** LA CLAVE de `motivos_merma`, no su etiqueta. La explicación va en `nota`. */
  motivo: z.string().trim().min(3).max(60).default('ajuste_conteo'),
  nota: z.string().trim().max(200).nullable().default(null),
});

export interface ResultadoAjustarConteo extends ResultadoCerrarConteo {
  readonly zonaId: string;
  readonly contados: number;
}

export const ajustarConteo = definirComando<
  Transaccion,
  typeof entradaAjustarConteo,
  ResultadoAjustarConteo
>({
  nombre: 'inventario.ajustar_conteo',
  entidad: 'toma_inventario',
  escribe: true,
  roles: [...CUENTAN],
  paquetes: PAQUETES_OPERATIVOS,
  modulo: 'inventario',
  entrada: entradaAjustarConteo,
  async ejecutar(ctx, entrada) {
    const { organizacionId, sucursalId, empleoId } = ctx.ambito;

    if (sucursalId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Un conteo es de un almacén, y el almacén es de una sucursal: esta sesión no tiene una.',
      );
    }

    // El almacén sale de la SESIÓN y nunca de la petición: con el almacén en la
    // entrada, quien llama elegiría en qué existencias se escribe el ajuste.
    const almacenId = await ctx.paso('resolver_almacen', () =>
      repoVentaCatalogo.almacenPrincipal(ctx.tx, organizacionId, sucursalId),
    );
    if (almacenId === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'Esta sucursal no tiene almacén dado de alta: el conteo no tiene dónde ajustar.',
      );
    }

    // El motivo, ANTES de escribir un solo renglón: un conteo de cien productos
    // que se aborta a la mitad por un motivo mal escrito es el recorrido entero.
    const motivo = await exigirMotivoDeMerma(ctx, entrada.motivo);
    const motivosPorInsumo = new Map<string, string>();
    for (const clave of new Set(
      entrada.movimientos.map((m) => m.motivo).filter((m) => m !== undefined),
    )) {
      await exigirMotivoDeMerma(ctx, clave);
    }
    for (const movimiento of entrada.movimientos) {
      if (movimiento.motivo !== undefined)
        motivosPorInsumo.set(movimiento.insumoId, movimiento.motivo);
    }

    const zona = await ctx.paso('resolver_zona', () =>
      ctx.tx
        .selectFrom('zonas_anaquel')
        .select(['id', 'nombre', 'activa'])
        .where('organizacion_id', '=', organizacionId)
        // De esta sucursal o de toda la organización —la tiendita de un local—,
        // nunca de otra: el nombre señala una fila dentro del ámbito, no el ámbito.
        .where((eb) => eb.or([eb('sucursal_id', '=', sucursalId), eb('sucursal_id', 'is', null)]))
        .where('nombre', '=', entrada.zona)
        .executeTakeFirst(),
    );
    if (zona === undefined) {
      throw new ErrorDominio(
        'PUENTE_NO_ENCONTRADO',
        `No hay una zona de anaquel llamada «${entrada.zona}» en este negocio.`,
      );
    }
    if (!zona.activa) {
      // Contar un anaquel que se desmontó produce un faltante entero contra un
      // esperado que ya nadie mantiene.
      throw new ErrorDominio('INVENTARIO_INVALIDO', 'Esa zona está apagada.');
    }

    const pedidos = entrada.movimientos.map((m) => m.insumoId);
    const insumos = await ctx.paso('cargar_insumos', () =>
      ctx.tx
        .selectFrom('insumos')
        .select(['id', 'unidad_base as unidadBase', 'zona_id as zonaId'])
        .where('organizacion_id', '=', organizacionId)
        .where('id', 'in', pedidos)
        .where('activo', '=', true)
        .execute(),
    );

    const unidadPorInsumo = new Map(insumos.map((i) => [i.id, i.unidadBase]));
    const ajenos = entrada.movimientos.filter((m) => {
      // Un insumo que no salió en la consulta —de otro negocio, o apagado— cae
      // aquí igual que el de otra zona: `undefined?.zonaId` no es la zona.
      return insumos.find((i) => i.id === m.insumoId)?.zonaId !== zona.id;
    });
    if (ajenos.length > 0) {
      throw new ErrorDominio(
        'INVENTARIO_INVALIDO',
        `${ajenos.length} de los renglones no son de «${zona.nombre}». Vuelve a abrir la zona: ` +
          'la lista que tienes en pantalla es de otro recorrido.',
        // El detalle lleva escalares: el primero basta para reconocer el renglón.
        { renglones: ajenos.length, primero: ajenos[0]?.insumoId ?? null },
      );
    }

    const tomaId = await ctx.paso('abrir_toma', () =>
      repoTomas.abrirToma(ctx.tx, {
        organizacionId,
        almacenId,
        empleadoId: empleoId,
        zonaId: zona.id,
        ahora: ctx.ahora,
      }),
    );

    for (const movimiento of entrada.movimientos) {
      await ctx.paso('anotar_conteo', () =>
        repoTomas.anotarConteo(
          ctx.tx,
          tomaId,
          almacenId,
          {
            insumoId: movimiento.insumoId,
            contado: movimiento.contado,
            unidad: unidadPorInsumo.get(movimiento.insumoId) ?? 'pieza',
            // Sin capturas: esta pantalla suma cajas y piezas en el teléfono y
            // manda el total. Guardar un crudo inventado sería peor que no
            // guardarlo, porque la discusión «yo conté nueve cajas» se tendría
            // contra un dato que el servidor se imaginó.
            capturas: [],
          },
          empleoId,
          ctx.ahora,
        ),
      );
    }

    const cerrado = await ejecutarCierreDeConteo(
      ctx,
      { id: tomaId, almacenId, zonaId: zona.id },
      motivo,
      entrada.nota,
      motivosPorInsumo,
    );

    ctx.auditar({
      entidadId: tomaId,
      payload: {
        zonaId: zona.id,
        zona: zona.nombre,
        contados: entrada.movimientos.length,
        ajustados: cerrado.ajustados,
        faltantes: cerrado.faltantes,
        motivo: entrada.motivo,
      },
    });

    return { ...cerrado, zonaId: zona.id, contados: entrada.movimientos.length };
  },
});
