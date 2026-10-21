import { createRequire } from 'node:module';

import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { RAICES_CON_VARIANTES, claves, type ClaveDeConsulta } from './claves-de-consulta.ts';

/**
 * Estas pruebas usan el `QueryClient` REAL de React Query: la regla que importa —una
 * invalidación por raíz alcanza a toda variante— es del comparador de claves de la librería, y
 * reescribirlo aquí probaría la copia, no la regla.
 *
 * Se carga desde `@tanstack/query-core`, que es donde vive, y no desde `@tanstack/react-query`:
 * el proyecto `unidad` resuelve `react` con la condición `react-server` (sin contextos) y el
 * paquete de React crea uno al importarse, así que ahí no carga. `query-core` no es una
 * dependencia directa de la app (pnpm no lo expone), por eso se resuelve DESDE react-query,
 * que sí lo tiene. El tipo sí viene de react-query: es el mismo.
 */
const desdeReactQuery = createRequire(
  createRequire(import.meta.url).resolve('@tanstack/react-query'),
);
const { QueryClient: ClienteReal } = desdeReactQuery('@tanstack/query-core') as {
  readonly QueryClient: new () => QueryClient;
};

/** Cada constructor de claves, con la raíz a la que dice pertenecer. */
function todasLasVariantes(): readonly {
  readonly raiz: string;
  readonly clave: ClaveDeConsulta;
}[] {
  return [
    { raiz: 'mesas', clave: claves.mesas.activas() },
    { raiz: 'mesas', clave: claves.mesas.todas() },
    { raiz: 'gastos_hoy', clave: claves.gastos.recientes(100) },
    { raiz: 'gastos_hoy', clave: claves.gastos.recientes(30) },
    { raiz: 'gastos_hoy', clave: claves.gastos.recientes() },
    { raiz: 'cortes_historial', clave: claves.cortes.historial(7) },
    { raiz: 'cortes_historial', clave: claves.cortes.historial(100) },
    { raiz: 'registros_ventas', clave: claves.registrosVentas.porOrden('-created_date', 1000) },
    { raiz: 'registros_ventas', clave: claves.registrosVentas.porOrden('-fecha_cierre', 2000) },
    { raiz: 'usuarios_pos', clave: claves.usuarios.activos() },
    { raiz: 'usuarios_pos', clave: claves.usuarios.meseros() },
  ];
}

describe('claves de consulta', () => {
  it('cada variante cuelga de su raíz de siempre, para que las invalidaciones existentes la alcancen', () => {
    for (const { raiz, clave } of todasLasVariantes()) {
      expect(clave[0]).toBe(raiz);
    }
  });

  it('dos preguntas distintas no comparten clave, ni siquiera dentro de la misma raíz', () => {
    const clavesEnTexto = todasLasVariantes().map(({ clave }) => JSON.stringify(clave));
    expect(new Set(clavesEnTexto).size).toBe(clavesEnTexto.length);
  });

  it('las raíces con variantes son exactamente las que el contrato vigila', () => {
    const conMasDeUna = new Set<string>();
    const vistas = new Map<string, number>();
    for (const { raiz } of todasLasVariantes()) vistas.set(raiz, (vistas.get(raiz) ?? 0) + 1);
    for (const [raiz, cuantas] of vistas) if (cuantas > 1) conMasDeUna.add(raiz);
    expect([...conMasDeUna].sort()).toEqual([...RAICES_CON_VARIANTES].sort());
  });

  it('la misma pregunta hecha desde dos pantallas lleva la misma clave', () => {
    expect(claves.mesas.activas()).toEqual(claves.mesas.activas());
    expect(claves.gastos.recientes(100)).toEqual(claves.gastos.recientes(100));
  });

  it('invalidar la raíz alcanza a todas las variantes, y una variante no toca a las demás', async () => {
    const cliente = new ClienteReal();
    for (const { clave } of todasLasVariantes()) cliente.setQueryData(clave, ['dato']);

    // Una sola variante: sólo ella queda invalidada.
    await cliente.invalidateQueries({ queryKey: claves.mesas.activas(), refetchType: 'none' });
    expect(cliente.getQueryState(claves.mesas.activas())?.isInvalidated).toBe(true);
    expect(cliente.getQueryState(claves.mesas.todas())?.isInvalidated).toBe(false);

    // La raíz de siempre: TODAS las variantes de esa raíz, y nada de otras raíces.
    for (const raiz of RAICES_CON_VARIANTES) {
      await cliente.invalidateQueries({ queryKey: [raiz], refetchType: 'none' });
    }
    for (const { clave } of todasLasVariantes()) {
      expect(cliente.getQueryState(clave)?.isInvalidated).toBe(true);
    }
  });

  it('el caché de la pregunta «todas las mesas» no llega a la pantalla que pide las activas', () => {
    // Es el defecto de las mesas encimadas, a nivel de caché: Cocina y Configuración llenaban
    // `['mesas']` con las 16 mesas (las 4 inactivas incluidas) y el mesero, que pedía las 12
    // activas con la misma clave, pintaba lo primero que encontraba.
    const cliente = new ClienteReal();
    const lasDieciseis = Array.from({ length: 16 }, (_, i) => ({ id: `m${String(i)}` }));
    cliente.setQueryData(claves.mesas.todas(), lasDieciseis);

    expect(cliente.getQueryData(claves.mesas.activas())).toBeUndefined();
    // Y lo que el mesero NO tiene, lo pide: sin dato no hay primera pintada engañosa.
    expect(cliente.getQueryState(claves.mesas.activas())?.status).toBeUndefined();
  });
});
