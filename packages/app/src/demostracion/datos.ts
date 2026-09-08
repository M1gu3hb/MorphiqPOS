import type { Paquete } from '@morphiqpos/contracts';

export interface ProductoDemo {
  readonly nombre: string;
  readonly categoria: string;
  readonly sku: string;
  readonly codigoBarras?: string;
  readonly precioCentavos: bigint;
  readonly costoCentavos: bigint;
  readonly stock: string;
}

export interface InsumoDemo {
  readonly clave: string;
  readonly nombre: string;
  readonly unidad: 'pieza' | 'g' | 'ml';
  readonly costoCentavos: bigint;
  readonly stock: string;
}

export interface ProductoRecetaDemo {
  readonly nombre: string;
  readonly categoria: string;
  readonly precioCentavos: bigint;
  readonly ingredientes: readonly { readonly clave: string; readonly cantidad: string }[];
}

export interface SemillaDemo {
  readonly categorias: readonly string[];
  readonly productos: readonly ProductoDemo[];
  readonly insumos: readonly InsumoDemo[];
  readonly recetas: readonly ProductoRecetaDemo[];
}

const ABARROTES: SemillaDemo = {
  categorias: ['Despensa', 'Bebidas', 'Lácteos'],
  productos: [
    {
      nombre: 'Tortillas de maíz 1 kg',
      categoria: 'Despensa',
      sku: 'TOR-001',
      codigoBarras: '7500000000001',
      precioCentavos: 2600n,
      costoCentavos: 2100n,
      stock: '45',
    },
    {
      nombre: 'Frijol pinto 1 kg',
      categoria: 'Despensa',
      sku: 'FRI-001',
      codigoBarras: '7500000000002',
      precioCentavos: 3990n,
      costoCentavos: 3120n,
      stock: '24',
    },
    {
      nombre: 'Refresco de cola 600 ml',
      categoria: 'Bebidas',
      sku: 'REF-600',
      codigoBarras: '7500000000003',
      precioCentavos: 2000n,
      costoCentavos: 1450n,
      stock: '36',
    },
    {
      nombre: 'Leche entera 1 L',
      categoria: 'Lácteos',
      sku: 'LEC-1L',
      codigoBarras: '7500000000004',
      precioCentavos: 2950n,
      costoCentavos: 2420n,
      stock: '18',
    },
    {
      nombre: 'Huevo blanco 18 piezas',
      categoria: 'Despensa',
      sku: 'HUE-018',
      codigoBarras: '7500000000005',
      precioCentavos: 5800n,
      costoCentavos: 4890n,
      stock: '12',
    },
  ],
  insumos: [],
  recetas: [],
};

const FERRETERIA: SemillaDemo = {
  categorias: ['Herramienta eléctrica', 'Herramienta manual', 'Fijación', 'Pintura'],
  productos: [
    {
      nombre: 'Taladro percutor Truper 1/2 pulgada',
      categoria: 'Herramienta eléctrica',
      sku: 'TAL-PER-012',
      codigoBarras: '7506240634512',
      precioCentavos: 164990n,
      costoCentavos: 118025n,
      stock: '8',
    },
    {
      nombre: 'Martillo uña pulida 16 oz',
      categoria: 'Herramienta manual',
      sku: 'MAR-016',
      codigoBarras: '7506240644115',
      precioCentavos: 18900n,
      costoCentavos: 12850n,
      stock: '15',
    },
    {
      nombre: 'Tornillo galvanizado 1/4 × 2 pulgadas',
      categoria: 'Fijación',
      sku: 'TOR-142',
      precioCentavos: 350n,
      costoCentavos: 185n,
      stock: '240',
    },
    {
      nombre: 'Cinta métrica 5 m',
      categoria: 'Herramienta manual',
      sku: 'CIN-005',
      codigoBarras: '7506240614439',
      precioCentavos: 12900n,
      costoCentavos: 8350n,
      stock: '20',
    },
    {
      nombre: 'Brocha profesional 3 pulgadas',
      categoria: 'Pintura',
      sku: 'BRO-003',
      codigoBarras: '7506240652714',
      precioCentavos: 7900n,
      costoCentavos: 4720n,
      stock: '28',
    },
  ],
  insumos: [],
  recetas: [],
};

const CAFETERIA: SemillaDemo = {
  categorias: ['Café', 'Bebidas frías', 'Alimentos'],
  productos: [],
  insumos: [
    {
      clave: 'cafe',
      nombre: 'Café en grano mezcla de la casa',
      unidad: 'g',
      costoCentavos: 45n,
      stock: '5000',
    },
    { clave: 'leche', nombre: 'Leche entera', unidad: 'ml', costoCentavos: 3n, stock: '12000' },
    {
      clave: 'panini',
      nombre: 'Panini caprese preparado',
      unidad: 'pieza',
      costoCentavos: 5200n,
      stock: '18',
    },
    {
      clave: 'croissant',
      nombre: 'Croissant de mantequilla',
      unidad: 'pieza',
      costoCentavos: 2100n,
      stock: '24',
    },
  ],
  recetas: [
    {
      nombre: 'Café americano 12 oz',
      categoria: 'Café',
      precioCentavos: 4900n,
      ingredientes: [{ clave: 'cafe', cantidad: '18' }],
    },
    {
      nombre: 'Latte 12 oz',
      categoria: 'Café',
      precioCentavos: 6500n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '240' },
      ],
    },
    {
      nombre: 'Panini caprese',
      categoria: 'Alimentos',
      precioCentavos: 11500n,
      ingredientes: [{ clave: 'panini', cantidad: '1' }],
    },
    {
      nombre: 'Croissant de mantequilla',
      categoria: 'Alimentos',
      precioCentavos: 4800n,
      ingredientes: [{ clave: 'croissant', cantidad: '1' }],
    },
  ],
};

export function semillaParaPaquete(paquete: Paquete): SemillaDemo {
  if (paquete === 'ferreteria') return FERRETERIA;
  if (paquete === 'cafeteria' || paquete === 'restaurante') return CAFETERIA;
  return ABARROTES;
}
