import { DEMOS, NEGOCIOS_REALES } from '@morphiqpos/contracts/negocios';
import { describe, expect, it } from 'vitest';

import { ambitoDeCajero } from '../pruebas/dobles.ts';
import { arnesGrabador } from '../pruebas/grabadora.ts';
import { resetearDemo } from './resetear.ts';

/**
 * EL RESETEO SE NIEGA SOBRE UN NEGOCIO REAL (bloque B.1 de la 2.4).
 *
 * `resetear.ts` decía que el comando «se niega a correr sobre los negocios que cobran», y
 * no era verdad: sólo comprobaba el rol. Esto corre el envoltorio REAL sobre la
 * definición REAL con una conexión que apunta cada consulta, como dueño de cada negocio
 * real, y afirma que contesta 403 **sin haber mandado UNA sola consulta a la base** —ni
 * la lectura del giro, y mucho menos un `delete`—.
 *
 * Vista en ROJO sin la guarda: contesta `REGLA_DE_NEGOCIO` (sin giro en la base de
 * guion) después de haber consultado la base.
 */

function resetearComo(organizacionId: string) {
  const { ejecutar, conexion } = arnesGrabador([]);
  const salida = ejecutar(resetearDemo, {
    entrada: { confirmacion: 'RESETEAR' },
    ambito: ambitoDeCajero({ organizacionId, rol: 'dueno' }),
    idempotencyKey: `resetear-${organizacionId}`,
  });
  return { salida, conexion };
}

describe('configuracion.resetear_demo · la guarda', () => {
  it.each(NEGOCIOS_REALES.map((n) => [n.nombre, n.id] as const))(
    'sobre %s contesta SIN_PERMISO y no toca la base',
    async (_nombre, id) => {
      const { salida, conexion } = resetearComo(id);
      const resultado = await salida;
      expect(resultado.ok).toBe(false);
      if (resultado.ok) return;
      expect(resultado.error.codigo).toBe('SIN_PERMISO');
      expect(conexion.consultas).toHaveLength(0);
    },
  );

  it('sobre un negocio que no está en ninguna lista, también: la regla es positiva', async () => {
    const { salida, conexion } = resetearComo('99999999-0000-4000-8000-000000000009');
    const resultado = await salida;
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error.codigo).toBe('SIN_PERMISO');
    expect(conexion.consultas).toHaveLength(0);
  });

  it('sobre una demo pasa la guarda y la PRIMERA consulta es leer su giro', async () => {
    const demo = DEMOS[0];
    if (demo === undefined) throw new Error('sin demos');
    const { salida, conexion } = resetearComo(demo.id);
    await salida;
    expect(conexion.consultas.length).toBeGreaterThan(0);
    expect(conexion.consultas[0]?.sql).toMatch(/from\s+"organizaciones"/i);
    // Y ninguna consulta borra nada antes de saber qué negocio es.
    expect(conexion.consultas[0]?.sql).not.toMatch(/delete/i);
  });
});
