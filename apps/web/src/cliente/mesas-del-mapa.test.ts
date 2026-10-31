import { describe, expect, it } from 'vitest';

import { claves } from './claves-de-consulta.ts';
import {
  LIENZO,
  ZONA_POR_OMISION,
  caeSobreAlgunaMesa,
  mesasDelPlano,
  mesasEncimadas,
  siguientePosicionLibre,
  soloMesasEnServicio,
  zonaDeLaMesa,
  zonasConMesas,
  zonasDelNegocio,
  type MesaDelPlano,
} from './mesas-del-mapa.ts';

/**
 * EL RESTAURANTE REAL (los datos que reportó el dueño):
 *
 *   · 12 mesas activas. Seis en «Interior» en una cuadrícula de 2 × 3 (x ≈ 135 / 316 / 489,
 *     y ≈ 95 / 300); 7–9 en «Terraza» y 10–12 en «Barra».
 *   · Las coordenadas se REPITEN entre zonas: (140, 140) en la Terraza, por ejemplo, está a
 *     un paso de la primera del Interior.
 *   · 4 mesas INACTIVAS cuyas coordenadas coinciden con las de cuatro activas.
 */
function salonDelDueno(): readonly MesaDelPlano[] {
  const interior: MesaDelPlano[] = [
    { id: 'i1', zona: 'Interior', posicion_x: 135, posicion_y: 95, activo: true },
    { id: 'i2', zona: 'Interior', posicion_x: 316, posicion_y: 95, activo: true },
    { id: 'i3', zona: 'Interior', posicion_x: 489, posicion_y: 95, activo: true },
    { id: 'i4', zona: 'Interior', posicion_x: 135, posicion_y: 300, activo: true },
    { id: 'i5', zona: 'Interior', posicion_x: 316, posicion_y: 300, activo: true },
    { id: 'i6', zona: 'Interior', posicion_x: 489, posicion_y: 300, activo: true },
  ];
  const terraza: MesaDelPlano[] = [
    { id: 't7', zona: 'Terraza', posicion_x: 140, posicion_y: 140, activo: true },
    { id: 't8', zona: 'Terraza', posicion_x: 316, posicion_y: 140, activo: true },
    { id: 't9', zona: 'Terraza', posicion_x: 489, posicion_y: 140, activo: true },
  ];
  const barra: MesaDelPlano[] = [
    { id: 'b10', zona: 'Barra', posicion_x: 135, posicion_y: 95, activo: true },
    { id: 'b11', zona: 'Barra', posicion_x: 316, posicion_y: 95, activo: true },
    { id: 'b12', zona: 'Barra', posicion_x: 489, posicion_y: 95, activo: true },
  ];
  // Las dadas de baja: mismas coordenadas que cuatro activas del Interior.
  const inactivas: MesaDelPlano[] = [
    { id: 'x1', zona: 'Interior', posicion_x: 135, posicion_y: 95, activo: false },
    { id: 'x2', zona: 'Interior', posicion_x: 316, posicion_y: 95, activo: false },
    { id: 'x3', zona: 'Interior', posicion_x: 135, posicion_y: 300, activo: false },
    { id: 'x4', zona: 'Interior', posicion_x: 489, posicion_y: 300, activo: false },
  ];
  return [...interior, ...terraza, ...barra, ...inactivas];
}

describe('el plano de una zona', () => {
  it('los datos del dueño SÍ producen mesas encimadas si se dibujan sin el filtro (el defecto)', () => {
    const todas = salonDelDueno();
    expect(todas).toHaveLength(16);
    // Lo que pintaba el mesero al llegar desde Cocina: las 16 de «Interior» (sus 6 y 4 bajas).
    const loQueSeVeSinFiltro = todas.filter((m) => zonaDeLaMesa(m) === 'Interior');
    expect(mesasEncimadas(loQueSeVeSinFiltro).length).toBeGreaterThanOrEqual(4);
    // Y las zonas entre sí también se encima si comparten lienzo.
    expect(mesasEncimadas(todas).length).toBeGreaterThan(4);
  });

  it('el plano de cada zona trae sólo mesas en servicio de esa zona, y ninguna encimada', () => {
    const todas = salonDelDueno();
    const esperadas: Readonly<Record<string, number>> = { Interior: 6, Terraza: 3, Barra: 3 };
    for (const [zona, cuantas] of Object.entries(esperadas)) {
      const plano = mesasDelPlano(todas, zona);
      expect(plano).toHaveLength(cuantas);
      expect(plano.every((m) => m.activo !== false)).toBe(true);
      expect(plano.every((m) => zonaDeLaMesa(m) === zona)).toBe(true);
      expect(mesasEncimadas(plano)).toEqual([]);
    }
  });

  it('el caché de «todas» que llega a la pantalla del mesero no se pinta con las inactivas', () => {
    // Aunque una lista con bajas llegara hasta el mapa —el caché de Cocina era exactamente eso—,
    // el plano no las dibuja: es el segundo cerrojo, por si el primero (la clave) se rompe.
    const delCacheDeCocina = salonDelDueno();
    const plano = mesasDelPlano(delCacheDeCocina, 'Interior');
    expect(plano.map((m) => m.id)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5', 'i6']);
  });

  it('una mesa sin zona cuenta en la zona por omisión, como siempre', () => {
    expect(zonaDeLaMesa({ zona: null })).toBe(ZONA_POR_OMISION);
    expect(zonaDeLaMesa({ zona: '  ' })).toBe(ZONA_POR_OMISION);
    expect(zonaDeLaMesa({ zona: undefined })).toBe(ZONA_POR_OMISION);
    expect(zonaDeLaMesa({ zona: 'Terraza' })).toBe('Terraza');
  });

  it('sólo hay pestaña para las zonas que tienen mesas en servicio', () => {
    const conBajasSolamente: MesaDelPlano[] = [
      ...salonDelDueno(),
      { id: 'o1', zona: 'Otro', posicion_x: 100, posicion_y: 100, activo: false },
    ];
    const zonas = zonasConMesas(conBajasSolamente, [
      'Interior',
      'Exterior',
      'Terraza',
      'Barra',
      'Otro',
    ]);
    expect(zonas).toEqual([
      { zona: 'Interior', cuantas: 6 },
      { zona: 'Terraza', cuantas: 3 },
      { zona: 'Barra', cuantas: 3 },
    ]);
  });

  it('`activo` ausente cuenta como en servicio; sólo `false` es baja', () => {
    const lista: MesaDelPlano[] = [
      { id: 'a' },
      { id: 'b', activo: null },
      { id: 'c', activo: true },
      { id: 'd', activo: false },
    ];
    expect(soloMesasEnServicio(lista).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('una mesa sin posición se pinta en (100, 100), y varias sin posición se encima', () => {
    const sinPosicion: MesaDelPlano[] = [
      { id: 'a', posicion_x: null, posicion_y: null },
      { id: 'b' },
      { id: 'c', posicion_x: 100, posicion_y: 100 },
    ];
    expect(mesasEncimadas(sinPosicion)).toHaveLength(3);
  });
});

describe('las zonas del negocio (DP-5)', () => {
  const FIJAS = ['Interior', 'Exterior', 'Terraza', 'Barra', 'Otro'];
  const salon = (n: number): MesaDelPlano[] =>
    Array.from({ length: n }, (_, i) => ({ id: `m${String(i)}`, zona: 'Salón', activo: true }));

  it('las dadas de alta, por su orden, y sin las apagadas', () => {
    const zonas = [
      { nombre: 'Terraza', orden: 2, activo: true },
      { nombre: 'Salón', orden: 1, activo: true },
      { nombre: 'Jardín', orden: 0, activo: false },
    ];
    expect(zonasDelNegocio(zonas, [], FIJAS)).toEqual(['Salón', 'Terraza']);
  });

  it('una zona que sólo aparece en sus mesas también cuenta', () => {
    expect(zonasDelNegocio([{ nombre: 'Salón', orden: 0 }], [{ zona: 'Patio' }], FIJAS)).toEqual([
      'Salón',
      'Patio',
    ]);
  });

  it('sin zonas leídas, la lista de siempre y después las de sus mesas', () => {
    expect(zonasDelNegocio([], salon(1), FIJAS)).toEqual([...FIJAS, 'Salón']);
  });

  it('Don Poncho: sus 10 mesas en «Salón» se ven en el mapa del mesero', () => {
    const mesas = salon(10);
    expect(zonasConMesas(mesas, zonasDelNegocio([], mesas, FIJAS))).toEqual([
      { zona: 'Salón', cuantas: 10 },
    ]);
  });

  it('sin nada de nada, la lista de siempre', () => {
    expect(zonasDelNegocio([], [], FIJAS)).toEqual(FIJAS);
  });
});

describe('la lectura del salón y su clave van de la mano', () => {
  it('el mapa pide sólo las activas y su clave lo dice', () => {
    // La clave de «activas» lleva el mismo filtro con el que se pide al puente
    // (`Mesa.filter({ activo: true })`), y la de «todas» no: son dos preguntas.
    expect(claves.mesas.activas()[1]).toEqual({ activo: true });
    expect(claves.mesas.todas()[1]).not.toEqual({ activo: true });
  });
});

describe('dónde nace una mesa nueva', () => {
  it('sobre un salón vacío, en la primera casilla de la rejilla', () => {
    expect(siguientePosicionLibre([])).toEqual({ x: LIENZO.margen, y: LIENZO.margen });
  });

  it('con las seis del dueño ya puestas, la nueva no cae encima de ninguna', () => {
    const interior = mesasDelPlano(salonDelDueno(), 'Interior');
    const nueva = siguientePosicionLibre(interior);
    const conLaNueva: MesaDelPlano[] = [
      ...interior,
      { id: 'nueva', zona: 'Interior', posicion_x: nueva.x, posicion_y: nueva.y },
    ];
    expect(mesasEncimadas(conLaNueva)).toEqual([]);
    expect(caeSobreAlgunaMesa(nueva.x, nueva.y, interior)).toBe(false);
  });

  it('la fórmula de antes —por CUÁNTAS hay— ponía la nueva encima de una puesta a mano', () => {
    // El dueño colocó sus tres mesas del Interior a su gusto. La fórmula vieja ponía la cuarta
    // en x = 60 + (3 % 8) * 90 = 330, y = 60 sin mirar dónde estaban: encima de la de x = 316.
    const delDueno = mesasDelPlano(salonDelDueno(), 'Interior').slice(0, 3);
    const casillaDeLaFormulaVieja = { x: 60 + (3 % 8) * 90, y: 60 + Math.floor(3 / 8) * 100 };
    expect(caeSobreAlgunaMesa(casillaDeLaFormulaVieja.x, casillaDeLaFormulaVieja.y, delDueno)).toBe(
      true,
    );

    const nueva = siguientePosicionLibre(delDueno);
    expect(caeSobreAlgunaMesa(nueva.x, nueva.y, delDueno)).toBe(false);
  });

  it('las mesas dadas de baja no ocupan lugar', () => {
    const soloBajas: MesaDelPlano[] = [
      { id: 'x', posicion_x: LIENZO.margen, posicion_y: LIENZO.margen, activo: false },
    ];
    expect(siguientePosicionLibre(soloBajas)).toEqual({ x: LIENZO.margen, y: LIENZO.margen });
  });
});
