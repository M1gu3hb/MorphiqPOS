import { describe, expect, it } from 'vitest';

import {
  PAQUETES,
  PAQUETES_MOSTRADOR,
  PAQUETES_OPERATIVOS,
  PAQUETES_RESTAURANTE,
  type Paquete,
} from '@morphiqpos/contracts';

import { guardarReceta } from './inventario/recetas.ts';
import { abrirMesa } from './restaurante/mesas.ts';
import { crearOrden } from './venta/carrito.ts';
import { ejecutorDeProduccion } from './pruebas/dobles.ts';

/**
 * El selector de paquete deja de ser humo (F1.1-C-15).
 *
 * ── Por qué con comandos REALES ────────────────────────────────────────────
 * Había una prueba del mecanismo que definía su propio comando de juguete
 * dentro del test. Esa prueba comprueba que `comando()` sabe rechazar por
 * paquete — que es cierto y ya lo sabía — pero **no** comprueba que ningún
 * comando de verdad esté mal declarado. Podían estar los treinta y cinco
 * abiertos a los cinco paquetes y seguía en verde.
 *
 * Aquí se invocan `inventario.guardar_receta` y `venta.crear_orden` tal como
 * viven en producción. Si mañana alguien le pone los cinco paquetes a recetas
 * para "arreglar" un 403 en una ferretería, esta prueba se pone roja.
 */

const AMBITO_TIENDA = {
  organizacionId: '00000000-0000-4000-8000-000000000001',
  sucursalId: '00000000-0000-4000-8000-000000000002',
  terminalId: '00000000-0000-4000-8000-000000000003',
  identidadId: '00000000-0000-4000-8000-000000000004',
  empleoId: '00000000-0000-4000-8000-000000000005',
  rol: 'dueno',
} as const;

/** El ejecutor acepta las definiciones reales; ver `ejecutorDeProduccion`. */
const comandoCon = (paquete: Paquete) => ejecutorDeProduccion(paquete);

describe('C-15 · el paquete decide qué comandos existen', () => {
  it('recetas NO existe en Esencial, y el comando es el real', async () => {
    const comando = comandoCon('esencial');

    const salida = await comando(guardarReceta, {
      entrada: {
        productoId: '00000000-0000-4000-8000-00000000000a',
        ingredientes: [
          {
            insumoId: '00000000-0000-4000-8000-00000000000b',
            cantidad: '1',
            unidad: 'pieza',
            mermaBp: 0,
          },
        ],
      },
      ambito: AMBITO_TIENDA,
      idempotencyKey: 'clave-de-prueba-1',
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
  });

  it('recetas SÍ existe en Operativo', async () => {
    // La otra mitad: si el rechazo fuera por cualquier otra razón —un id que no
    // existe, un rol— la prueba anterior pasaría igual y no diría nada del
    // paquete. Con cafetería el comando llega a ejecutarse.
    const comando = comandoCon('operativo');

    const salida = await comando(guardarReceta, {
      entrada: {
        productoId: '00000000-0000-4000-8000-00000000000a',
        ingredientes: [
          {
            insumoId: '00000000-0000-4000-8000-00000000000b',
            cantidad: '1',
            unidad: 'pieza',
            mermaBp: 0,
          },
        ],
      },
      ambito: AMBITO_TIENDA,
      idempotencyKey: 'clave-de-prueba-2',
    });

    expect(salida.ok ? 'ejecutó' : salida.error.codigo).not.toBe('PAQUETE_NO_INCLUYE');
  });

  it('vender existe en los tres paquetes comerciales', async () => {
    for (const paquete of PAQUETES) {
      const salida = await comandoCon(paquete)(crearOrden, {
        entrada: {},
        ambito: AMBITO_TIENDA,
        idempotencyKey: `clave-${paquete}`,
      });
      expect(salida.ok ? 'ejecutó' : salida.error.codigo).not.toBe('PAQUETE_NO_INCLUYE');
    }
  });

  it('abrir mesa sólo existe en Restaurante Pro', async () => {
    for (const paquete of PAQUETES) {
      const salida = await comandoCon(paquete)(abrirMesa, {
        entrada: { mesaId: '00000000-0000-4000-8000-00000000000a', personas: 2 },
        ambito: AMBITO_TIENDA,
        idempotencyKey: `mesa-${paquete}`,
      });
      const resultado = salida.ok ? 'ejecutó' : salida.error.codigo;
      if (paquete === 'restaurante_pro') expect(resultado).not.toBe('PAQUETE_NO_INCLUYE');
      else expect(resultado).toBe('PAQUETE_NO_INCLUYE');
    }
  });
});

describe('C-15 · los subconjuntos declarados', () => {
  it('operación excluye Esencial', () => {
    expect([...PAQUETES_OPERATIVOS]).toEqual(['operativo', 'restaurante_pro']);
  });

  it('sala es exclusiva de Restaurante Pro', () => {
    expect([...PAQUETES_RESTAURANTE]).toEqual(['restaurante_pro']);
  });

  it('mostrador cubre los tres paquetes de hoy', () => {
    // Están nombrados distinto a propósito: cuando llegue un giro sin caja
    // —una estética que sólo agenda— cambiará éste y no el de catálogo.
    expect([...PAQUETES_MOSTRADOR]).toEqual([...PAQUETES]);
  });
});
