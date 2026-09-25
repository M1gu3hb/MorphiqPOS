import { describe, expect, it } from 'vitest';

import { transaccionGrabadora } from '../pruebas/grabadora.ts';
import { filasDelPrograma, resumirPrograma } from './programa.ts';

/**
 * El programa de sellos en sus tres cifras (C.10 de la 2.4): el pasivo, a un sello del premio
 * y quién no viene hace 21 días. La pantalla leía doce clientes y no podía decir ninguna.
 */

const AHORA = new Date('2026-09-25T18:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000);
const fila = (clienteId: string, sellos: number, ultimaVisita: Date | null) => ({
  clienteId,
  nombre: clienteId,
  telefono: '5512345678',
  sellos,
  ultimaVisita,
});
const OPCIONES = {
  ahora: AHORA,
  sellosPorPremio: 5,
  costoPremioCentavos: 1_800n,
  diasInactivo: 21,
};

describe('resumirPrograma', () => {
  it('el pasivo: los premios exigibles de TODOS los sellos vivos, al costo del último canje', () => {
    const r = resumirPrograma(
      [fila('ana', 4, hace(2)), fila('beto', 9, hace(3)), fila('caro', 0, hace(40))],
      OPCIONES,
    );
    // 13 sellos vivos son dos premios de $18.
    expect(r.sellosVivos).toBe(13);
    expect(r.clientesConSaldo).toBe(2);
    expect(r.pasivoCentavos).toBe('3600');
  });

  it('a un sello del SIGUIENTE premio: 4 de 5 y también 9 de 5', () => {
    const r = resumirPrograma(
      [fila('ana', 4, hace(2)), fila('beto', 9, hace(3)), fila('dani', 3, hace(1))],
      OPCIONES,
    );
    expect(r.aUnSello.map((c) => c.clienteId)).toEqual(['ana', 'beto']);
  });

  it('los que no vienen hace 21 días, los que se fueron hace menos primero', () => {
    const r = resumirPrograma(
      [
        fila('ana', 4, hace(2)),
        fila('eli', 1, hace(60)),
        fila('fer', 0, hace(22)),
        fila('gil', 2, hace(21)),
        fila('hugo', 0, null),
      ],
      OPCIONES,
    );
    expect(r.inactivos.map((c) => c.clienteId)).toEqual(['gil', 'fer', 'eli']);
    expect(r.inactivos[0]?.diasSinVenir).toBe(21);
  });
});

describe('filasDelPrograma', () => {
  it('lee el ledger y los clientes de ESTE negocio, en un viaje', async () => {
    const ORG = '11111111-1111-4111-8111-111111111111';
    const { tx, conexion } = transaccionGrabadora([[]]);
    await filasDelPrograma(tx, ORG);
    const consulta = conexion.consultas[0];
    const texto = consulta?.sql.replace(/\s+/g, ' ') ?? '';
    expect(texto).toMatch(/where m\.organizacion_id = \$1/);
    expect(texto).toMatch(/c\.organizacion_id = \$2/);
    expect(consulta?.parameters).toEqual([ORG, ORG]);
  });
});
