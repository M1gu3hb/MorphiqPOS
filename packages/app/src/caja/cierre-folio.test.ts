import type { Ambito, Rol } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { contextoFalso, crearBaseFalsa, type Fila } from '../restaurante/pruebas/base-falsa.ts';
import { cerrarCaja } from './sesion.ts';

/**
 * `caja.cerrar` tiene que DEVOLVER el folio que acaba de tomar.
 *
 * ── El defecto ─────────────────────────────────────────────────────────────
 * Su pantalla enseña «Folio del corte» en el diálogo de éxito. En su sistema
 * original ese dato venía dentro de la respuesta del cierre; al portarlo, la
 * respuesta dejó de traerlo y `Caja.jsx` acabó leyéndolo de la sesión ABIERTA
 * —`cajaAbierta.folio`—, donde SIEMPRE es nulo, porque el folio se asigna justo
 * al cerrar. Resultado: el cajero cierra la caja, la base guarda el corte
 * `CC-1`, y la pantalla le enseña un folio en blanco. El número que tendría que
 * apuntar para reclamar un faltante no aparece por ningún lado.
 *
 * ── Por qué no lo vio nada ─────────────────────────────────────────────────
 * Porque 891 pruebas pasaban igual antes y después: ninguna miraba la SALIDA
 * del cierre, sólo sus efectos en la base. El folio se escribía bien —eso ya lo
 * vigila `estados-con-columna`— y se devolvía mal. Apareció abriendo la caja en
 * el navegador y cerrándola, que es la única forma que había de verlo.
 */

const ORGANIZACION = '11111111-1111-4111-8111-111111111111';
const SUCURSAL = '22222222-2222-4222-8222-222222222222';
const TERMINAL = '33333333-3333-4333-8333-333333333333';
const SESION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const ABIERTA_EN = new Date('2026-03-01T14:00:00.000Z');
const AHORA = new Date('2026-03-01T23:30:00.000Z');

function ambitoDe(rol: Rol): Ambito {
  return {
    organizacionId: ORGANIZACION,
    sucursalId: SUCURSAL,
    terminalId: TERMINAL,
    identidadId: '44444444-4444-4444-8444-444444444444',
    empleoId: '55555555-5555-4555-8555-555555555555',
    rol,
  };
}

/** La sesión tal y como está ANTES de cerrarse: con serie, y sin folio. */
function sesionAbierta(): Fila {
  return {
    id: SESION,
    organizacion_id: ORGANIZACION,
    sucursal_id: SUCURSAL,
    terminal_id: TERMINAL,
    estado: 'abierta',
    serie: 'CC',
    folio: null,
    abierta_en: ABIERTA_EN,
    cerrada_en: null,
    fondo_inicial_centavos: 150_000n,
    efectivo_contado_centavos: null,
    efectivo_retirado_centavos: null,
  };
}

/** `arqueoDeSesion` y `tomarFolio` van en SQL crudo: se declara la respuesta. */
function baseCon(crudas: readonly Fila[]) {
  return crearBaseFalsa(
    {
      sesiones_caja: [sesionAbierta()],
      folios: [
        {
          id: 'folio-CC',
          organizacion_id: ORGANIZACION,
          sucursal_id: SUCURSAL,
          serie: 'CC',
          siguiente: 7,
        },
      ],
    },
    { filasCrudas: crudas },
  );
}

describe('caja.cerrar · el folio del corte vuelve a la pantalla', () => {
  it('devuelve serie y folio, no sólo los escribe en la base', async () => {
    const base = baseCon([{ siguiente: 7, fondo: '150000', esperado: '130000', ventas: '0' }]);
    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);

    const salida = await cerrarCaja.ejecutar(ctx, {
      efectivoContadoCentavos: 130_000,
      notas: 'Cierre del día',
    });

    // LO QUE ESTA PRUEBA EXISTE PARA VIGILAR. Sin estas dos líneas, el diálogo
    // de «Caja cerrada correctamente» sale con el folio en blanco.
    expect(salida.serie).toBe('CC');
    expect(salida.folio).not.toBe('');
    expect(salida.folio).not.toBe('null');
    expect(Number(salida.folio)).toBeGreaterThan(0);

    // Y el mismo folio queda escrito: devolver uno y guardar otro sería peor
    // que no devolver ninguno.
    const sesion = base.filas('sesiones_caja')[0];
    expect(sesion?.['estado']).toBe('cerrada');
    expect(String(sesion?.['folio'])).toBe(salida.folio);
  });

  it('el folio NO viene de la sesión abierta, que lo tiene en nulo', async () => {
    // Es exactamente el error que tenía la pantalla: leerlo de `cajaAbierta`.
    // Si alguien «simplificara» el comando devolviendo `sesion.folio`, esta
    // prueba lo caza, porque ahí vale null hasta el instante del cierre.
    const base = baseCon([{ siguiente: 7, fondo: '150000', esperado: '130000', ventas: '0' }]);
    expect(base.filas('sesiones_caja')[0]?.['folio']).toBe(null);

    const { ctx } = contextoFalso(base.tx, ambitoDe('cajero'), AHORA);
    const salida = await cerrarCaja.ejecutar(ctx, { efectivoContadoCentavos: 130_000 });

    expect(salida.folio).toBeTypeOf('string');
    expect(salida.folio.length).toBeGreaterThan(0);
  });
});
