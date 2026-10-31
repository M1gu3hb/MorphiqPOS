import { describe, expect, it } from 'vitest';

import {
  MINUTOS_POR_OMISION,
  SEGUNDOS_DEL_PIN_SIN_TOCAR,
  debeDormir,
  decidirEspera,
  minutosDe,
  puestoDeEspera,
} from './reglas';

/**
 * DP-11.2 · EL MODO ESPERA: dónde entra, dónde no, y cuándo.
 *
 * Sí: Caja, Tablero, Cocina (y Bebidas, que es una estación de Cocina) y las pantallas de
 * administración. No: el mesero, el mapa y la mesa activa —se usan con la charola en la otra
 * mano y nunca deben quedar a oscuras—, el portal del comensal y el teléfono de cocina.
 */

describe('puestoDeEspera', () => {
  it('Caja, Tablero y Cocina, cada uno con su puesto', () => {
    expect(puestoDeEspera('/caja')).toBe('caja');
    expect(puestoDeEspera('/restaurante/cierre-diario-y-arqueo')).toBe('caja');
    expect(puestoDeEspera('/')).toBe('tablero');
    expect(puestoDeEspera('/cocina')).toBe('cocina');
  });

  it('las pantallas de administración', () => {
    for (const ruta of [
      '/ventas',
      '/inventario',
      '/compras',
      '/recetas',
      '/productos',
      '/registros',
      '/portal-qr',
      '/configuracion',
    ]) {
      expect(puestoDeEspera(ruta), ruta).toBe('administracion');
    }
  });

  it('NUNCA en el mesero, el mapa, la mesa activa, el portal ni el teléfono de cocina', () => {
    for (const ruta of [
      '/mesero',
      '/restaurante/mapa-de-mesas',
      '/restaurante/mesa-activa',
      '/qr/abc123',
      '/restaurante/portal-del-comensal',
      '/cocina-telefono/abc',
      '/login-pos',
      '/n/don-poncho/login-pos',
    ]) {
      expect(puestoDeEspera(ruta), ruta).toBeNull();
    }
  });

  it('una consulta o una diagonal al final no cambian el puesto', () => {
    expect(puestoDeEspera('/configuracion?tab=apariencia')).toBe('administracion');
    expect(puestoDeEspera('/caja/')).toBe('caja');
  });
});

describe('cuántos minutos', () => {
  it('por omisión 3 en Caja y Tablero y 2 en Cocina', () => {
    expect(MINUTOS_POR_OMISION.caja).toBe(3);
    expect(MINUTOS_POR_OMISION.tablero).toBe(3);
    expect(MINUTOS_POR_OMISION.cocina).toBe(2);
  });

  it('lo que el aparato eligió manda; un valor fuera de rango no', () => {
    expect(minutosDe('cocina', 5)).toBe(5);
    expect(minutosDe('caja', null)).toBe(3);
    expect(minutosDe('caja', 0)).toBe(3);
    expect(minutosDe('caja', 999)).toBe(3);
    // El tope es una hora: 60 sí, 61 ya no.
    expect(minutosDe('caja', 60)).toBe(60);
    expect(minutosDe('caja', 61)).toBe(3);
  });
});

describe('debeDormir', () => {
  const minuto = 60_000;
  const base = { ultimaActividad: 0, minutos: 3, bloqueada: false };

  it('se duerme justo al cumplir los minutos sin tocar, ni un instante antes', () => {
    expect(debeDormir({ ...base, ahora: 3 * minuto - 1 })).toBe(false);
    expect(debeDormir({ ...base, ahora: 3 * minuto })).toBe(true);
  });

  it('bloqueada (Cocina con comandas pendientes) no se duerme aunque pase el tiempo', () => {
    expect(debeDormir({ ...base, ahora: 30 * minuto, bloqueada: true })).toBe(false);
  });
});

describe('decidirEspera', () => {
  const minuto = 60_000;
  const base = {
    puesto: 'caja' as const,
    activa: true,
    ultimaActividad: 0,
    minutos: 3,
    bloqueada: false,
    cerrada: false,
  };

  it('dice por qué no se duerme: fuera del puesto, apagado en el aparato o bloqueada', () => {
    expect(decidirEspera({ ...base, puesto: null, ahora: 30 * minuto })).toBe('fuera');
    // Fuera del puesto manda sobre todo: ahí el modo espera no existe, esté como esté el aparato.
    expect(decidirEspera({ ...base, puesto: null, activa: false, ahora: 30 * minuto })).toBe(
      'fuera',
    );
    expect(decidirEspera({ ...base, activa: false, ahora: 30 * minuto })).toBe('apagado');
    expect(decidirEspera({ ...base, bloqueada: true, ahora: 30 * minuto })).toBe('bloqueada');
    expect(decidirEspera({ ...base, ahora: 3 * minuto - 1 })).toBe('despierta');
    expect(decidirEspera({ ...base, ahora: 3 * minuto })).toBe('dormir');
  });

  it('con el candado del PIN a la vista, vuelve a dormirse a los 30 s sin tocar', () => {
    expect(SEGUNDOS_DEL_PIN_SIN_TOCAR).toBe(30);
    const cerrada = { ...base, cerrada: true };
    expect(decidirEspera({ ...cerrada, ahora: 29_999 })).toBe('despierta');
    expect(decidirEspera({ ...cerrada, ahora: 30_000 })).toBe('dormir');
  });
});
