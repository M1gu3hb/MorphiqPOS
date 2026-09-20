import 'server-only';

import {
  esGiro,
  esModulo,
  ErrorDominio,
  modulosActivos,
  MODULOS,
  MODULOS_POR_PLANTILLA,
  PAQUETES_TODOS,
  plantillaDe,
  type Modulo,
  type Plantilla,
} from '@morphiqpos/contracts';
import { repoModulos, type Transaccion } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * F-015 y F-016 · La plantilla como preajuste, y las perillas por módulo.
 *
 * ── Lo que estaba mal ──────────────────────────────────────────────────────
 * `plantillaDe()`, `MODULOS_POR_PLANTILLA` y `modulosActivos()` estaban
 * escritas en `packages/contracts` desde la Etapa 2 y tenían **cero
 * importadores** fuera de su propia prueba. Es el peor estado posible: compila,
 * tipa, pasa su unitaria, se lee como construido en cualquier inventario, y no
 * gobierna nada. Este archivo es el que las pone a gobernar.
 *
 * ── Cómo queda resuelta la decisión pendiente P-01 ─────────────────────────
 * «Plantilla cerrada o plantilla + perillas». Se implementa la segunda, que es
 * la recomendación escrita en `05-DECISIONES.md`: la plantilla es el PREAJUSTE
 * y cada módulo se puede encender o apagar detrás de una pantalla de
 * administrador. Lo que vende es poder decir «sí, y además te pongo citas» sin
 * fabricar un paquete nuevo por cada negociación.
 *
 * ── Por qué la perilla pide motivo ─────────────────────────────────────────
 * Porque una perilla es una decisión comercial, no un ajuste. Dentro de seis
 * meses alguien va a preguntar por qué esta ferretería no tiene recetas, y la
 * respuesta «alguien lo apagó» no sirve para nada. El `motivo` es obligatorio
 * en el comando y en la columna.
 */

const ROLES_DE_ADMINISTRACION = ['administrador', 'dueno'] as const;

/** Lo que el servidor resuelve para una organización: su plantilla y sus módulos. */
export interface ModulosDelNegocio {
  readonly plantilla: Plantilla;
  readonly activos: ReadonlySet<Modulo>;
  /** Los módulos que están así porque alguien los tocó, no por el preajuste. */
  readonly personalizados: readonly Modulo[];
}

/**
 * Resuelve los módulos efectivos de una organización.
 *
 * Devuelve `null` cuando no se pudo leer el perfil. Quien llama **tiene que
 * fallar cerrado**: una organización de la que no sabemos nada no es una
 * organización con todo encendido.
 */
export async function modulosDelNegocio(
  tx: Transaccion,
  organizacionId: string,
): Promise<ModulosDelNegocio | null> {
  const perfil = await repoModulos.leerPerfil(tx, organizacionId);
  if (perfil === null) return null;

  // Un giro desconocido en la base no se asume: se trata como el giro más
  // restrictivo. `plantillaDe` ya degrada a `tienda` lo que no reconoce, y aquí
  // se le entrega un giro válido para que esa degradación sea la suya y no una
  // aserción de tipo que tape el dato roto.
  const giro = esGiro(perfil.giro) ? perfil.giro : 'tienda';
  const plantilla = plantillaDe(giro, perfil.valorGuardado);

  const perillas = perfil.perillas
    .filter((p) => esModulo(p.modulo))
    .map((p) => ({ modulo: p.modulo as Modulo, activo: p.activo }));

  return {
    plantilla,
    activos: modulosActivos(plantilla, perillas),
    personalizados: perillas.map((p) => p.modulo),
  };
}

export const entradaFijarModulo = z.object({
  modulo: z.enum(MODULOS),
  activo: z.boolean(),
  /**
   * Por qué. No es opcional a propósito: ver el docblock de arriba.
   *
   * El mínimo de cuatro caracteres existe para que «ok» y «x» no cuenten como
   * motivo. No impide escribir una tontería —nada lo impide— pero sí impide el
   * campo vacío por descuido, que es el caso real.
   */
  motivo: z.string().trim().min(4).max(200),
});

export interface ResultadoDeModulo {
  readonly modulo: Modulo;
  readonly activo: boolean;
  readonly plantilla: Plantilla;
  /** `true` si el preajuste de la plantilla ya decía eso: la perilla no cambia nada. */
  readonly coincideConElPreajuste: boolean;
}

export const fijarModulo = definirComando<
  Transaccion,
  typeof entradaFijarModulo,
  ResultadoDeModulo
>({
  nombre: 'configuracion.fijar_modulo',
  entidad: 'organizacion_modulo',
  escribe: true,
  roles: [...ROLES_DE_ADMINISTRACION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaFijarModulo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const perfil = await ctx.paso('leer perfil', () => modulosDelNegocio(ctx.tx, organizacionId));
    if (perfil === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'No se pudo leer la plantilla de este negocio, así que no se cambia nada.',
      );
    }

    await ctx.paso('fijar perilla', () =>
      repoModulos.fijarPerilla(ctx.tx, {
        organizacionId,
        modulo: entrada.modulo,
        activo: entrada.activo,
        motivo: entrada.motivo,
        empleadoId: ctx.ambito.empleoId,
        ahora: ctx.ahora,
      }),
    );

    const preajuste = MODULOS_POR_PLANTILLA[perfil.plantilla].includes(entrada.modulo);

    ctx.auditar({
      entidadId: null,
      payload: {
        modulo: entrada.modulo,
        activo: entrada.activo,
        motivo: entrada.motivo,
        plantilla: perfil.plantilla,
      },
    });

    return {
      modulo: entrada.modulo,
      activo: entrada.activo,
      plantilla: perfil.plantilla,
      coincideConElPreajuste: preajuste === entrada.activo,
    };
  },
});

export const entradaRestablecerModulo = z.object({ modulo: z.enum(MODULOS) });

export interface ResultadoDeRestablecer {
  readonly modulo: Modulo;
  readonly plantilla: Plantilla;
  /** A qué queda el módulo tras volver al preajuste. */
  readonly activo: boolean;
  readonly habiaPerilla: boolean;
}

/**
 * Quita la perilla y devuelve el módulo al preajuste de la plantilla.
 *
 * Es distinto de apagarlo. Apagar escribe `activo = false` y ahí se queda
 * aunque el preajuste cambie; restablecer vuelve a seguir a la plantilla. Sin
 * las dos operaciones, una personalización no se puede deshacer, sólo
 * invertir — y eso es una decisión permanente disfrazada de interruptor.
 */
export const restablecerModulo = definirComando<
  Transaccion,
  typeof entradaRestablecerModulo,
  ResultadoDeRestablecer
>({
  nombre: 'configuracion.restablecer_modulo',
  entidad: 'organizacion_modulo',
  escribe: true,
  roles: [...ROLES_DE_ADMINISTRACION],
  paquetes: PAQUETES_TODOS,
  entrada: entradaRestablecerModulo,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    const perfil = await ctx.paso('leer perfil', () => modulosDelNegocio(ctx.tx, organizacionId));
    if (perfil === null) {
      throw new ErrorDominio(
        'CONFIGURACION_INVALIDA',
        'No se pudo leer la plantilla de este negocio, así que no se cambia nada.',
      );
    }

    const quitadas = await ctx.paso('quitar perilla', () =>
      repoModulos.quitarPerilla(ctx.tx, organizacionId, entrada.modulo),
    );

    ctx.auditar({
      entidadId: null,
      payload: { modulo: entrada.modulo, quitadas, plantilla: perfil.plantilla },
    });

    return {
      modulo: entrada.modulo,
      plantilla: perfil.plantilla,
      activo: MODULOS_POR_PLANTILLA[perfil.plantilla].includes(entrada.modulo),
      habiaPerilla: quitadas > 0,
    };
  },
});
