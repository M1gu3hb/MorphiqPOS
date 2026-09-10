import 'server-only';

import { ErrorDominio, PAQUETES_MOSTRADOR } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';
import { repoCaja } from '@morphiqpos/data';
import { z } from 'zod';

import { definirComando } from '../definicion.ts';

/**
 * Eliminar un corte de caja (F1-02 · `Registros.jsx:89`).
 *
 * ── El defecto que cierra ──────────────────────────────────────────────────
 * Hoy, en la pantalla de Registros:
 *
 *     const eliminarCorte = async (c) => {
 *       if (!isAdmin) return;
 *       if (!confirm(...)) return;
 *       await api.entidades.CorteCaja.delete(c.id);
 *
 * `isAdmin` es una variable del navegador. Quien abra las herramientas de
 * desarrollo y la ponga en `true` borra la contabilidad del negocio, y el
 * `confirm` es un diálogo que se cancela desde la consola sin tocarlo. Es la
 * misma familia de defecto que ya se cerró en las cinco funciones de
 * mantenimiento —allí el rol venía en el CUERPO de la petición—: la
 * autorización va en el servidor, por sesión.
 *
 * Aquí ni siquiera hace falta acordarse. `definirComando` recorre el esquema
 * de entrada y RECHAZA AL CARGAR EL MÓDULO cualquier comando que declare `rol`,
 * `organizacion_id`, `sucursal_id`, `identidad_id`, `empleo_id` o
 * `terminal_id`. Un comando que aceptara `{"rol":"dueno"}` no arranca. El rol
 * sale de `ctx.ambito`, que arma `resolverSesion` desde una cookie firmada y
 * `HttpOnly`, releída de la base en cada petición.
 *
 * ── Y una segunda cosa que su versión no tiene ─────────────────────────────
 * Su `delete` es una llamada suelta contra un `restrict` de Postgres: un corte
 * con ventas responde `23503` y la pantalla enseña el texto de la restricción.
 * Aquí las lecturas que deciden y el borrado están en la MISMA transacción, y
 * la negativa llega con números: «Ese corte tiene 34 ventas registradas…».
 */

/** Sólo el dueño. Ver `F1-07` §4.3: lo irreversible no es de administrador. */
const SOLO_DUENO = ['dueno'] as const;

export const entradaEliminarCorte = z.object({ corteId: z.uuid() });

export interface ResultadoEliminarCorte {
  readonly corteId: string;
  readonly serie: string;
  /** `bigint` de la base como texto: un folio no pasa por `number`. */
  readonly folio: string | null;
  /** El renglón del fondo inicial se va con el corte. Ver `referenciasDelCorte`. */
  readonly movimientosDeAperturaBorrados: number;
}

export const eliminarCorte = definirComando<
  Transaccion,
  typeof entradaEliminarCorte,
  ResultadoEliminarCorte
>({
  nombre: 'caja.eliminar_corte',
  entidad: 'sesion_caja',
  escribe: true,
  roles: SOLO_DUENO,
  paquetes: PAQUETES_MOSTRADOR,
  entrada: entradaEliminarCorte,
  async ejecutar(ctx, entrada) {
    const { organizacionId } = ctx.ambito;

    // No se exige terminal, a diferencia de abrir, cerrar y mover caja. Esto no
    // se opera desde el cajón: se hace desde Registros, y el dueño entra por
    // correo desde su teléfono, donde `ambito.terminalId` es nulo. Pedir
    // terminal aquí haría el comando inalcanzable justo para quien puede usarlo.
    const corte = await ctx.paso('cargar_corte', () =>
      repoCaja.corteDeOrganizacion(ctx.tx, organizacionId, entrada.corteId),
    );

    if (corte === null) {
      throw new ErrorDominio(
        'CORTE_NO_ENCONTRADO',
        'Ese corte de caja no existe en este negocio.',
      );
    }

    // Regla 1: sólo un corte CERRADO. La caja abierta no se elimina, se cierra
    // —y cerrarla es lo que produce el arqueo. Borrarla en vez de cerrarla
    // tiraría el fondo, los movimientos del turno y la cuenta de lo que hay en
    // el cajón, sin que nadie llegue a contarlo.
    if (corte.estado !== 'cerrada') {
      throw new ErrorDominio(
        'CAJA_YA_ABIERTA',
        'Esa caja sigue abierta. Ciérrala desde la terminal y haz el corte; ' +
          'una caja abierta no se elimina.',
        { estado: corte.estado },
      );
    }

    // Regla 2: si algo apunta al corte, se falla diciendo qué y cuánto. Las
    // seis cuentas salen de una sola consulta, DENTRO de esta transacción: si
    // se leyeran antes, una venta cobrada en ese hueco se borraría con el corte.
    const referencias = await ctx.paso('contar_referencias', () =>
      repoCaja.referenciasDelCorte(ctx.tx, organizacionId, entrada.corteId),
    );

    const inventario = enumerarReferencias(referencias);
    if (inventario !== null) {
      throw new ErrorDominio(
        'CORTE_NO_ELIMINABLE',
        `Ese corte tiene ${inventario} y no se puede eliminar. Es el histórico de la caja: ` +
          'si el turno quedó mal, corrígelo con un movimiento de ajuste.',
        { ...referencias },
      );
    }

    // Los hijos antes que el padre: la llave foránea es `restrict` y al revés
    // aborta la transacción entera.
    const movimientosDeAperturaBorrados = await ctx.paso('borrar_apertura', () =>
      repoCaja.borrarMovimientosDeApertura(ctx.tx, organizacionId, entrada.corteId),
    );

    const borrados = await ctx.paso('borrar_corte', () =>
      repoCaja.borrarCorteCerrado(ctx.tx, organizacionId, entrada.corteId),
    );

    // Cero filas: entre la lectura y el borrado, otra sesión se lo llevó. No es
    // un éxito silencioso, y tampoco un `ERROR_INTERNO`: es un hecho del mundo
    // que el dueño entiende leyéndolo.
    if (borrados !== 1) {
      throw new ErrorDominio(
        'CORTE_NO_ENCONTRADO',
        'Ese corte ya no existe: alguien lo eliminó mientras tanto.',
      );
    }

    const folio = corte.folio === null ? null : corte.folio.toString();

    // ── La constancia ────────────────────────────────────────────────────────
    // Mismo criterio que `contar()` en `mantenimiento/purgas.ts`: no reconstruye
    // nada, y no hay que fingir que sí, pero deja escrito QUÉ HABÍA. Es la
    // diferencia entre «se borró un corte» y «no sabemos qué corte se borró».
    // Aquí eso incluye el folio —que es como se reclama un corte en el
    // histórico—, el dinero que declaraba y los seis conteos en cero: dentro de
    // seis meses, «¿y cómo sabemos que no tenía ventas?» tiene respuesta.
    ctx.auditar({
      entidadId: corte.id,
      payload: {
        serie: corte.serie,
        folio,
        sucursal: corte.sucursalId,
        terminal: corte.terminalId,
        abiertaEn: corte.abiertaEn.toISOString(),
        cerradaEn: corte.cerradaEn === null ? null : corte.cerradaEn.toISOString(),
        fondoInicialCentavos: corte.fondoInicialCentavos.toString(),
        efectivoContadoCentavos: textoDeCentavos(corte.efectivoContadoCentavos),
        efectivoRetiradoCentavos: textoDeCentavos(corte.efectivoRetiradoCentavos),
        movimientosDeAperturaBorrados,
        referencias: { ...referencias },
      },
    });

    return { corteId: corte.id, serie: corte.serie, folio, movimientosDeAperturaBorrados };
  },
});

/** `bigint | null` de la base a texto. Nunca a `number`: es dinero (R15). */
function textoDeCentavos(valor: bigint | null): string | null {
  return valor === null ? null : valor.toString();
}

/**
 * Cómo se llama cada cosa que puede haber dentro del corte, en uno y en varios.
 *
 * Las dos formas y no una con «(s)» pegada: «1 ventas registradas» es la clase
 * de detalle que hace que la gente deje de leer los avisos del sistema, y este
 * aviso es el que separa borrar un turno vacío de borrar la contabilidad.
 */
const ETIQUETAS = [
  ['ventas', 'venta registrada', 'ventas registradas'],
  ['pagos', 'pago registrado', 'pagos registrados'],
  ['movimientos', 'movimiento de caja', 'movimientos de caja'],
  ['gastos', 'gasto pagado del cajón', 'gastos pagados del cajón'],
  ['cortesTurno', 'corte de turno firmado', 'cortes de turno firmados'],
  ['liquidaciones', 'liquidación de propina', 'liquidaciones de propina'],
] as const satisfies readonly (readonly [keyof repoCaja.ReferenciasDelCorte, string, string])[];

/**
 * Qué hay dentro del corte, en castellano y con números. `null` si no hay nada.
 *
 * `null` no es «no sé»: es la única puerta que autoriza el borrado. Por eso el
 * mismo valor que arma la frase decide, y no hay una segunda comprobación que
 * pueda desincronizarse de ella.
 */
export function enumerarReferencias(referencias: repoCaja.ReferenciasDelCorte): string | null {
  const partes: string[] = [];
  for (const [clave, singular, plural] of ETIQUETAS) {
    const cuantos = referencias[clave];
    if (cuantos <= 0) continue;
    partes.push(`${cuantos} ${cuantos === 1 ? singular : plural}`);
  }

  const ultima = partes.pop();
  if (ultima === undefined) return null;
  if (partes.length === 0) return ultima;
  return `${partes.join(', ')} y ${ultima}`;
}
