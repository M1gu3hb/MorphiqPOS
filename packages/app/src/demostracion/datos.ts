import type { Giro } from '@morphiqpos/contracts';

export interface ProductoDemo {
  readonly nombre: string;
  readonly categoria: string;
  /**
   * A donde va la comanda. Sin esto la cocina no recibe NADA: `areasDe`
   * devuelve una lista vacia, no se crea ninguna comanda, y la mesa anuncia
   * «pedido enviado» sin una sola fila en `comandas`.
   */
  readonly area?: 'cocina' | 'barra' | 'ambos' | 'ninguno';
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
  readonly area?: 'cocina' | 'barra' | 'ambos' | 'ninguno';
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

/**
 * La carta del restaurante (E11-2).
 *
 * Hasta ahora el restaurante reusaba la semilla de la cafetería: cuatro
 * productos, dos de ellos café. Un restaurante que abre su POS y ve «Latte 12
 * oz» no está viendo su sistema, está viendo el de otro.
 *
 * Todos los precios y costos son creíbles para un restaurante mexicano de
 * barrio en 2026, y los márgenes caen donde caen de verdad: alto en bebidas,
 * medio en platos fuertes, bajo en los que llevan carne.
 *
 * Las unidades base son `g`, `ml` y `pieza`, las únicas tres que el restaurante
 * admite (regla 7), y desde la migración 046 lo impone la base.
 */
const RESTAURANTE: SemillaDemo = {
  categorias: ['Entradas', 'Platos fuertes', 'Tacos', 'Postres', 'Bebidas', 'Cervezas'],
  productos: [
    {
      nombre: 'Agua embotellada 600 ml',
      categoria: 'Bebidas',
      area: 'barra',
      sku: 'BEB-001',
      codigoBarras: '7501055300012',
      precioCentavos: 2500n,
      costoCentavos: 900n,
      stock: '48',
    },
    {
      nombre: 'Refresco de cola 355 ml',
      categoria: 'Bebidas',
      area: 'barra',
      sku: 'BEB-002',
      codigoBarras: '7501055363513',
      precioCentavos: 3500n,
      costoCentavos: 1400n,
      stock: '60',
    },
    {
      nombre: 'Cerveza clara 355 ml',
      categoria: 'Cervezas',
      area: 'barra',
      sku: 'CER-001',
      codigoBarras: '7501064191114',
      precioCentavos: 5500n,
      costoCentavos: 2200n,
      stock: '72',
    },
    {
      nombre: 'Cerveza oscura 355 ml',
      categoria: 'Cervezas',
      area: 'barra',
      sku: 'CER-002',
      codigoBarras: '7501064191121',
      precioCentavos: 6000n,
      costoCentavos: 2500n,
      stock: '36',
    },
  ],
  insumos: [
    { clave: 'arrachera', nombre: 'Arrachera', unidad: 'g', costoCentavos: 32n, stock: '18000' },
    { clave: 'pollo', nombre: 'Pechuga de pollo', unidad: 'g', costoCentavos: 14n, stock: '22000' },
    { clave: 'pastor', nombre: 'Carne al pastor', unidad: 'g', costoCentavos: 19n, stock: '15000' },
    {
      clave: 'tortilla',
      nombre: 'Tortilla de maíz',
      unidad: 'pieza',
      costoCentavos: 70n,
      stock: '600',
    },
    { clave: 'queso', nombre: 'Queso Oaxaca', unidad: 'g', costoCentavos: 22n, stock: '9000' },
    { clave: 'aguacate', nombre: 'Aguacate', unidad: 'g', costoCentavos: 12n, stock: '7000' },
    { clave: 'jitomate', nombre: 'Jitomate', unidad: 'g', costoCentavos: 4n, stock: '12000' },
    { clave: 'cebolla', nombre: 'Cebolla blanca', unidad: 'g', costoCentavos: 3n, stock: '10000' },
    {
      clave: 'frijol',
      nombre: 'Frijol bayo cocido',
      unidad: 'g',
      costoCentavos: 5n,
      stock: '14000',
    },
    { clave: 'arroz', nombre: 'Arroz rojo', unidad: 'g', costoCentavos: 3n, stock: '13000' },
    { clave: 'totopo', nombre: 'Totopo de maíz', unidad: 'g', costoCentavos: 9n, stock: '5000' },
    { clave: 'crema', nombre: 'Crema ácida', unidad: 'ml', costoCentavos: 6n, stock: '6000' },
    { clave: 'limon', nombre: 'Limón', unidad: 'pieza', costoCentavos: 150n, stock: '200' },
    { clave: 'azucar', nombre: 'Azúcar', unidad: 'g', costoCentavos: 3n, stock: '9000' },
    { clave: 'jamaica', nombre: 'Flor de jamaica', unidad: 'g', costoCentavos: 28n, stock: '2500' },
    {
      clave: 'chocolate',
      nombre: 'Chocolate de mesa',
      unidad: 'g',
      costoCentavos: 24n,
      stock: '3000',
    },
    { clave: 'harina', nombre: 'Harina de trigo', unidad: 'g', costoCentavos: 3n, stock: '11000' },
    { clave: 'huevo', nombre: 'Huevo', unidad: 'pieza', costoCentavos: 380n, stock: '180' },
  ],
  recetas: [
    {
      nombre: 'Guacamole con totopos',
      categoria: 'Entradas',
      area: 'cocina',
      precioCentavos: 12500n,
      ingredientes: [
        { clave: 'aguacate', cantidad: '180' },
        { clave: 'jitomate', cantidad: '60' },
        { clave: 'cebolla', cantidad: '30' },
        { clave: 'limon', cantidad: '1' },
        { clave: 'totopo', cantidad: '80' },
      ],
    },
    {
      nombre: 'Queso fundido',
      categoria: 'Entradas',
      area: 'cocina',
      precioCentavos: 14500n,
      ingredientes: [
        { clave: 'queso', cantidad: '220' },
        { clave: 'tortilla', cantidad: '4' },
      ],
    },
    {
      nombre: 'Arrachera al carbón',
      categoria: 'Platos fuertes',
      area: 'cocina',
      precioCentavos: 32900n,
      ingredientes: [
        { clave: 'arrachera', cantidad: '280' },
        { clave: 'frijol', cantidad: '150' },
        { clave: 'arroz', cantidad: '150' },
        { clave: 'tortilla', cantidad: '4' },
      ],
    },
    {
      nombre: 'Pollo a la plancha',
      categoria: 'Platos fuertes',
      area: 'cocina',
      precioCentavos: 21500n,
      ingredientes: [
        { clave: 'pollo', cantidad: '260' },
        { clave: 'arroz', cantidad: '150' },
        { clave: 'jitomate', cantidad: '80' },
      ],
    },
    {
      nombre: 'Enchiladas de pollo',
      categoria: 'Platos fuertes',
      area: 'cocina',
      precioCentavos: 18900n,
      ingredientes: [
        { clave: 'pollo', cantidad: '150' },
        { clave: 'tortilla', cantidad: '4' },
        { clave: 'queso', cantidad: '60' },
        { clave: 'crema', cantidad: '60' },
        { clave: 'jitomate', cantidad: '120' },
      ],
    },
    {
      nombre: 'Orden de tacos al pastor',
      categoria: 'Tacos',
      area: 'cocina',
      precioCentavos: 11900n,
      ingredientes: [
        { clave: 'pastor', cantidad: '180' },
        { clave: 'tortilla', cantidad: '5' },
        { clave: 'cebolla', cantidad: '40' },
        { clave: 'limon', cantidad: '1' },
      ],
    },
    {
      nombre: 'Orden de tacos de arrachera',
      categoria: 'Tacos',
      area: 'cocina',
      precioCentavos: 16500n,
      ingredientes: [
        { clave: 'arrachera', cantidad: '160' },
        { clave: 'tortilla', cantidad: '5' },
        { clave: 'cebolla', cantidad: '40' },
      ],
    },
    {
      nombre: 'Agua de jamaica 1 L',
      categoria: 'Bebidas',
      area: 'barra',
      precioCentavos: 7500n,
      ingredientes: [
        { clave: 'jamaica', cantidad: '30' },
        { clave: 'azucar', cantidad: '90' },
      ],
    },
    {
      nombre: 'Churros con chocolate',
      categoria: 'Postres',
      area: 'cocina',
      precioCentavos: 9900n,
      ingredientes: [
        { clave: 'harina', cantidad: '120' },
        { clave: 'azucar', cantidad: '40' },
        { clave: 'huevo', cantidad: '1' },
        { clave: 'chocolate', cantidad: '40' },
      ],
    },
    {
      nombre: 'Flan de la casa',
      categoria: 'Postres',
      area: 'cocina',
      precioCentavos: 8500n,
      ingredientes: [
        { clave: 'huevo', cantidad: '2' },
        { clave: 'azucar', cantidad: '70' },
        { clave: 'crema', cantidad: '80' },
      ],
    },
  ],
};

export function semillaParaPaquete(giro: Giro): SemillaDemo {
  if (giro === 'ferreteria') return FERRETERIA;
  if (giro === 'restaurante') return RESTAURANTE;
  if (giro === 'cafeteria') return CAFETERIA;
  return ABARROTES;
}
