import 'server-only';

import { ErrorDominio, PAQUETES_TODOS } from '@morphiqpos/contracts';
import { repoCatalogo, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';
import {
  ejecutarDeclararEquivalencia,
  type ResultadoEquivalencia,
} from './organizacion-catalogo.ts';

/**
 * `catalogo.declarar_equivalencia_dicha` — lo que el mostradorista TECLEA (F-060).
 *
 * ── Por qué hacía falta, y qué pasaba sin él ─────────────────────────────
 * `ferreteria/FichaDePieza.tsx` publicaba en `/api/ferreteria/declarar-equivalencia`
 * con `{piezaId, texto}` y **esa ruta no existía**. La pantalla pinta el
 * equivalente en cuanto el servidor contesta bien —«lo dijiste tú»—, así que con
 * la ruta caída el botón daba el error genérico y la base de equivalencias, que
 * sólo se llena mientras se opera, no se llenaba nunca.
 *
 * `catalogo.declarar_equivalencia` ya existía, pero pide DOS identificadores. La
 * ficha no tiene el segundo: tiene un campo de texto a la vista, y está a la
 * vista a propósito —si para decir «el métrico de 6 mm sirve» hubiera que ir a
 * otra pantalla, nadie lo diría—. Este comando es el puente entre las dos cosas:
 * resuelve el texto contra el catálogo y delega en el cuerpo compartido.
 *
 * ── Por qué exige que el texto resuelva a UNA pieza ──────────────────────
 * Porque una equivalencia declarada sobre la pieza equivocada es peor que no
 * tenerla: el mostradorista de la semana que viene le ofrece al cliente algo que
 * no le sirve, con la confianza de que alguien lo comprobó. Si el texto no
 * encuentra nada, o encuentra varias, se dice cuáles y no se escribe: quien está
 * en el mostrador puede afinar en el mismo campo, con el cliente todavía ahí.
 *
 * ── Por qué NO se da de alta la pieza que no existe ──────────────────────
 * Porque un alta necesita precio, costo y unidad, y aquí no hay ninguno de los
 * tres: crearla vacía llenaría el catálogo de claves sin precio que después
 * salen en la búsqueda del mostrador. El alta tiene su pantalla y su comando
 * —`catalogo.alta_rapida`—, y el mensaje de aquí lo dice con esas palabras.
 */

const MOSTRADOR = ['cajero', 'gerente', 'administrador', 'dueno'] as const;

/** Cuántas candidatas se nombran en el mensaje: más no caben en el renglón. */
const CANDIDATAS_QUE_SE_NOMBRAN = 3;

export const entradaEquivalenciaDicha = z.object({
  piezaId: z.uuid(),
  /** Lo que se teclea: un nombre, una clave o un código de barras. */
  texto: z.string().trim().min(2).max(120),
  /** `sustituto` es «le sirve»; `complemento` es «va con». La ficha declara sustitutos. */
  tipo: z.enum(['sustituto', 'complemento']).default('sustituto'),
  nota: z.string().trim().max(200).nullable().default(null),
});

export interface ResultadoEquivalenciaDicha extends ResultadoEquivalencia {
  readonly equivalenteId: string;
  /** El nombre de catálogo de lo que se resolvió, que puede no ser lo tecleado. */
  readonly nombre: string;
}

interface Candidata {
  readonly id: string;
  readonly nombre: string;
}

export const declararEquivalenciaDicha = definirComando<
  Transaccion,
  typeof entradaEquivalenciaDicha,
  ResultadoEquivalenciaDicha
>({
  nombre: 'catalogo.declarar_equivalencia_dicha',
  entidad: 'equivalencia',
  escribe: true,
  roles: [...MOSTRADOR],
  paquetes: PAQUETES_TODOS,
  entrada: entradaEquivalenciaDicha,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;
    const texto = entrada.texto;
    // Los comodines de `ilike` como literales. Sin esto, teclear «%» pediría el
    // catálogo entero y la comprobación de que resolvió a UNA pieza se caería
    // siempre, justo cuando alguien escribe un porcentaje sin querer.
    const escapado = repoCatalogo.escaparPatronIlike(texto);

    /**
     * Primero por CLAVE y código de barras, y sólo después por nombre.
     *
     * Quien teclea una clave está señalando una pieza concreta y no describiendo
     * una: si el nombre fuera antes, una clave que además aparece dentro de un
     * nombre —«TIR-6X50» dentro de «juego TIR-6X50 y tuerca»— resolvería a la
     * pieza equivocada, que es justo el error que no se puede permitir.
     */
    const porClave = await ctx.paso('buscar_por_clave', () =>
      ctx.tx
        .selectFrom('productos')
        .select(['id', 'nombre'])
        .where('organizacion_id', '=', organizacionId)
        .where('activo', '=', true)
        .where((eb) =>
          eb.or([eb('sku', 'ilike', escapado), eb('codigo_barras', 'ilike', escapado)]),
        )
        .limit(2)
        .execute(),
    );

    const candidatas: readonly Candidata[] =
      porClave.length > 0
        ? porClave
        : await ctx.paso('buscar_por_nombre', () =>
            ctx.tx
              .selectFrom('productos')
              .select(['id', 'nombre'])
              .where('organizacion_id', '=', organizacionId)
              .where('activo', '=', true)
              // El nombre CONTIENE lo tecleado. Un `=` no serviría: nadie escribe
              // «Tornillo tirafondo 6 mm × 50 mm galvanizado» completo con el
              // cliente enfrente, y pedirlo exacto es pedir que no se use.
              .where('nombre', 'ilike', `%${escapado}%`)
              .orderBy('nombre')
              .limit(CANDIDATAS_QUE_SE_NOMBRAN + 1)
              .execute(),
          );

    // Se desestructura en vez de indexar: después de las dos guardas queda UNA,
    // y así lo dice el tipo en vez de una aserción que promete lo que las guardas
    // ya garantizan.
    const [elegida, ...demas] = candidatas;
    if (elegida === undefined) {
      throw new ErrorDominio(
        'PRODUCTO_NO_ENCONTRADO',
        `«${texto}» no está en el catálogo de este negocio. Si es una pieza nueva, dala de alta ` +
          'primero: una equivalencia apunta a una clave, no a un nombre escrito a mano.',
      );
    }

    if (demas.length > 0) {
      const nombradas = candidatas
        .slice(0, CANDIDATAS_QUE_SE_NOMBRAN)
        .map((c) => `«${c.nombre}»`)
        .join(', ');
      const resto = candidatas.length > CANDIDATAS_QUE_SE_NOMBRAN ? ' y alguna más' : '';
      throw new ErrorDominio(
        'CONFIGURACION_CONFLICTO',
        `«${texto}» encaja con ${nombradas}${resto}. Escribe la medida o la clave para que quede ` +
          'una sola: declararla sobre la pieza equivocada le ofrece al cliente algo que no le sirve.',
      );
    }

    const hecha = await ejecutarDeclararEquivalencia(ctx, {
      productoId: entrada.piezaId,
      equivalenteId: elegida.id,
      tipo: entrada.tipo,
      // Lo TECLEADO queda en la nota cuando no hubo nota. No es adorno: es la
      // única forma de saber después que la pieza se resolvió por búsqueda y con
      // qué palabras, que es lo que hay que leer si resultó ser la equivocada.
      nota: entrada.nota ?? `dicho en el mostrador: «${texto}»`,
      bidireccional: null,
    });

    ctx.auditar({
      entidadId: hecha.equivalenciaId,
      payload: {
        piezaId: entrada.piezaId,
        equivalenteId: elegida.id,
        texto,
        tipo: hecha.tipo,
        porClave: porClave.length > 0,
      },
    });

    return { ...hecha, equivalenteId: elegida.id, nombre: elegida.nombre };
  },
});
