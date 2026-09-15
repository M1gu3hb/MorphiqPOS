import 'server-only';

import { conTransaccion, repoComandos, repoModulos, type Transaccion } from '@morphiqpos/data';
import {
  esModulo,
  esPaquete,
  modulosActivos,
  plantillaDe,
  esGiro,
  type Modulo,
  type Paquete,
} from '@morphiqpos/contracts';

import { crearComando } from './comando.ts';
import type { RepositorioComandos } from './repositorio.ts';

/**
 * El `comando()` de producción: el puerto enlazado a Postgres.
 *
 * Aquí es donde la pieza genérica se vuelve concreta. `packages/data` exporta
 * funciones sueltas con la forma que el puerto pide, sin conocer el puerto: la
 * regla de dependencia va de `app` hacia `data`, nunca al revés, y el tipado
 * estructural une las dos mitades sin que ninguna importe hacia arriba.
 *
 * Es también el único archivo que hay que cambiar para llevar el envoltorio a
 * otra base. `04-ARQUITECTURA §5` lo dice del almacenamiento de archivos y vale
 * igual aquí: la lógica no se toca.
 */

const repositorio: RepositorioComandos<Transaccion> = {
  async leerPaquete(tx, organizacionId): Promise<Paquete | null> {
    const valor = await repoComandos.leerPaquete(tx, organizacionId);
    // La columna es `text` con `check`, así que el tipo generado dice `string`.
    // Se estrecha aquí en vez de aseverar: si alguien agregara un paquete en la
    // base sin agregarlo al contrato, esto lo trata como desconocido y el
    // comando falla cerrado, en vez de dejar pasar una cadena cualquiera.
    return valor !== null && esPaquete(valor) ? valor : null;
  },

  /**
   * F-015 + F-016 · La plantilla resuelve el preajuste, las perillas lo ajustan.
   *
   * Los tres nombres viejos de la columna siguen entendiéndose porque la
   * migración 058 NO se aplica en esta fase: un código que sólo entendiera los
   * nuevos dejaría a los cuatro negocios vivos sin plantilla y por tanto sin
   * ningún módulo, que es la peor forma posible de fallar cerrado.
   */
  async leerModulosActivos(tx, organizacionId): Promise<ReadonlySet<Modulo> | null> {
    const perfil = await repoModulos.leerPerfil(tx, organizacionId);
    if (perfil === null) return null;

    const giro = esGiro(perfil.giro) ? perfil.giro : 'tienda';
    const plantilla = plantillaDe(giro, perfil.valorGuardado);
    const perillas = perfil.perillas
      .filter((p): p is { modulo: Modulo; activo: boolean } => esModulo(p.modulo))
      .map((p) => ({ modulo: p.modulo, activo: p.activo }));

    return modulosActivos(plantilla, perillas);
  },

  reclamarClave: (tx, datos) => repoComandos.reclamarClave(tx, datos),

  leerEjecucion: (tx, organizacionId, comando, idempotencyKey) =>
    repoComandos.leerEjecucion(tx, organizacionId, comando, idempotencyKey),

  completarEjecucion: (tx, datos) => repoComandos.completarEjecucion(tx, datos),

  // Fuera de la transacción del comando: cuando se sirve un reintento, aquélla
  // ya se revirtió. Contar el reintento es observabilidad, no un efecto suyo.
  registrarReintento: (organizacionId, comando, idempotencyKey) =>
    conTransaccion((tx) =>
      repoComandos.registrarReintento(tx, organizacionId, comando, idempotencyKey),
    ),

  async escribirAuditoria(tx, fila) {
    // `tx` nulo es el rastro de un RECHAZO: va en su propia transacción, porque
    // tiene que sobrevivir a la reversión que lo causó.
    if (tx === null) {
      await conTransaccion((propia) => repoComandos.escribirAuditoria(propia, fila));
      return;
    }
    await repoComandos.escribirAuditoria(tx, fila);
  },
};

/** El envoltorio listo para usar desde una ruta. */
export const comando = crearComando<Transaccion>({ repositorio, conTransaccion });
