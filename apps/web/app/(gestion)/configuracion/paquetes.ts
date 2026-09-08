import type { Paquete } from '@morphiqpos/contracts';

export interface PaqueteNegocio {
  readonly id: Paquete;
  readonly nombre: string;
  readonly descripcion: string;
  readonly capacidades: readonly string[];
}

export const PAQUETES_NEGOCIO: readonly PaqueteNegocio[] = [
  {
    id: 'tienda',
    nombre: 'Tienda',
    descripcion: 'Venta rápida de productos por pieza, caja o paquete.',
    capacidades: ['Catálogo', 'Venta', 'Caja', 'Inventario'],
  },
  {
    id: 'ferreteria',
    nombre: 'Ferretería',
    descripcion: 'Control de piezas, metros, kilos y precios de mayoreo.',
    capacidades: ['Unidades de medida', 'Mayoreo', 'Inventario'],
  },
  {
    id: 'farmacia',
    nombre: 'Farmacia',
    descripcion: 'Catálogo sanitario preparado para lotes y caducidades.',
    capacidades: ['Lotes', 'Caducidad', 'Trazabilidad'],
  },
  {
    id: 'cafeteria',
    nombre: 'Cafetería',
    descripcion: 'Bebidas y alimentos con tamaños, extras y modificadores.',
    capacidades: ['Modificadores', 'Porciones', 'Recetas'],
  },
  {
    id: 'restaurante',
    nombre: 'Restaurante',
    descripcion: 'Servicio completo con mesas, meseros y flujo de cocina.',
    capacidades: ['Mesas', 'Meseros', 'Cocina'],
  },
] as const;
