import { describe, expect, it } from 'vitest';

import {
  autorizadosDeLaObra,
  clientesParaElegir,
  filtrarClientes,
  pasaDelLimite,
} from './cliente-del-mostrador.ts';

const clientes = [
  {
    id: 'c1',
    nombre: 'Construcciones del Valle',
    telefono: '55 1234 4455',
    limite_credito_pesos: 80_000,
  },
  { id: 'c2', nombre: 'Álvaro Herrería', telefono: null, limite_credito_pesos: null },
];
const cartera = [
  { cliente_id: 'c1', obra_nombre: 'Torre B', saldo_centavos: 1_200_000, dias_mas_viejo: 12 },
  { cliente_id: 'c1', obra_nombre: 'Casa Palmas', saldo_centavos: 300_000, dias_mas_viejo: 41 },
];
const obras = [
  { id: 'o1', cliente_id: 'c1', nombre: 'Torre B', estado: 'abierta' },
  { id: 'o2', cliente_id: 'c1', nombre: 'Casa Palmas', estado: 'cerrada' },
];
const autorizados = [
  { id: 'a1', cliente_id: 'c1', obra_id: 'o1', nombre: 'Beto (Torre B)', activo: true },
  { id: 'a2', cliente_id: 'c1', obra_id: null, nombre: 'Doña Mary', activo: true },
  { id: 'a3', cliente_id: 'c1', obra_id: null, nombre: 'Ya no', activo: false },
];

describe('el cliente de crédito del mostrador', () => {
  const lista = clientesParaElegir(clientes, cartera, obras, autorizados);

  it('junta su deuda de todas las obras, con los días del saldo más viejo', () => {
    expect(lista.find((c) => c.id === 'c1')).toMatchObject({
      saldoCentavos: 1_500_000,
      limiteCentavos: 8_000_000,
      diasVencido: 41,
    });
    // Sin límite capturado es cero, y sin deuda también: no se inventa.
    expect(lista.find((c) => c.id === 'c2')).toMatchObject({ saldoCentavos: 0, limiteCentavos: 0 });
  });

  it('sólo las obras ABIERTAS y los autorizados activos', () => {
    const valle = lista.find((c) => c.id === 'c1');
    expect(valle?.obras.map((o) => o.nombre)).toEqual(['Torre B']);
    expect(valle?.autorizados.map((a) => a.nombre)).toEqual(['Beto (Torre B)', 'Doña Mary']);
  });

  it('ordenados por nombre, con acentos como se leen', () => {
    expect(lista.map((c) => c.nombre)).toEqual(['Álvaro Herrería', 'Construcciones del Valle']);
  });

  it('se busca por nombre sin acentos o por los dígitos del teléfono', () => {
    expect(filtrarClientes(lista, 'alvaro').map((c) => c.id)).toEqual(['c2']);
    expect(filtrarClientes(lista, '4455').map((c) => c.id)).toEqual(['c1']);
    expect(filtrarClientes(lista, '44')).toEqual([]);
    expect(filtrarClientes(lista, '  ')).toHaveLength(2);
  });

  it('para una obra, recogen los de esa obra y los del cliente en general', () => {
    const valle = lista.find((c) => c.id === 'c1');
    if (valle === undefined) throw new Error('falta el cliente');
    expect(autorizadosDeLaObra(valle, 'o1').map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(autorizadosDeLaObra(valle, 'otra').map((a) => a.id)).toEqual(['a2']);
  });

  it('pasa del límite con lo que ya debe MÁS lo que se lleva', () => {
    const valle = lista.find((c) => c.id === 'c1');
    if (valle === undefined) throw new Error('falta el cliente');
    expect(pasaDelLimite(valle, 6_500_000)).toBe(false);
    expect(pasaDelLimite(valle, 6_500_001)).toBe(true);
  });
});
