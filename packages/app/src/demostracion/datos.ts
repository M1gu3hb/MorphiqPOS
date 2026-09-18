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

/**
 * Un SERVICIO, que no es un producto con otro nombre.
 *
 * Lo que lo separa son los cuatro tramos de F-401: aplicar, procesar, terminar
 * y recoger. Un tinte ocupa a la estilista 40 min, deja a la clienta 25 min
 * procesando —y en esos 25 min la estilista puede atender a otra, que es de
 * donde sale el dinero de un salón— y necesita 15 min de lavado y 10 de
 * limpieza. Un producto del anaquel no tiene ninguno de los cuatro.
 *
 * Vive en dos tablas: `productos`, porque se vende y se cobra como todo lo
 * demás, y `servicios`, que guarda los tramos y si necesita estación.
 */
export interface ServicioDemo {
  readonly nombre: string;
  readonly categoria: string;
  readonly precioCentavos: bigint;
  /** Lo que la profesional está encima. Es el único tramo obligatorio. */
  readonly activa1Min: number;
  /** El tinte procesando, el barniz secando. Aquí se puede intercalar otra. */
  readonly pasivaMin?: number;
  /** Volver a estar encima: enjuagar, peinar, retocar. */
  readonly activa2Min?: number;
  /** Limpiar la estación y cobrar. Sin esto la agenda promete huecos que no hay. */
  readonly cierreMin?: number;
  /** ¿Ocupa una estación? Un corte sí; vender un shampoo no. */
  readonly requiereEstacion?: boolean;
}

/** Un proveedor de verdad, con su día de visita (F-107). */
export interface ProveedorDemo {
  readonly nombre: string;
  readonly contacto: string;
  readonly telefono: string;
  /** 1 = lunes … 7 = domingo. */
  readonly diasVisita: readonly number[];
  readonly diasCredito: number;
}

export interface SemillaDemo {
  readonly categorias: readonly string[];
  readonly productos: readonly ProductoDemo[];
  readonly insumos: readonly InsumoDemo[];
  readonly recetas: readonly ProductoRecetaDemo[];
  /** Sólo los giros que venden tiempo. Vacío en los demás. */
  readonly servicios?: readonly ServicioDemo[];
  /**
   * El proveedor con el que se surte.
   *
   * Sin uno, la pantalla de Compras y la de Entradas abren vacías y no hay forma
   * de registrar una entrada de mercancía: el comando pide proveedor.
   */
  readonly proveedor: ProveedorDemo;
  /**
   * El fondo con el que abre la caja.
   *
   * Sin caja abierta no se puede cobrar —`abrirCaja` es el primer paso de
   * cualquier venta— y una demo que exige abrir caja a mano antes de enseñar
   * nada no se puede enseñar. El desglose importa: «$1,500» no dice si se puede
   * dar cambio (F-984).
   */
  readonly fondoCajaCentavos: bigint;
  readonly fondoMonedasCentavos: bigint;
  readonly fondoChicosCentavos: bigint;
  readonly fondoGrandesCentavos: bigint;
}

const ABARROTES: SemillaDemo = {
  categorias: ['Despensa', 'Bebidas', 'Lácteos', 'Botanas'],
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
    {
      nombre: 'Aceite de maíz 1 L',
      categoria: 'Despensa',
      sku: 'ACE-001',
      codigoBarras: '7500000000006',
      precioCentavos: 4290n,
      costoCentavos: 3480n,
      stock: '22',
    },
    {
      nombre: 'Arroz súper extra 1 kg',
      categoria: 'Despensa',
      sku: 'ARR-001',
      codigoBarras: '7500000000007',
      precioCentavos: 2890n,
      costoCentavos: 2210n,
      stock: '30',
    },
    {
      nombre: 'Azúcar estándar 1 kg',
      categoria: 'Despensa',
      sku: 'AZU-001',
      codigoBarras: '7500000000008',
      precioCentavos: 2750n,
      costoCentavos: 2180n,
      stock: '26',
    },
    {
      nombre: 'Sal de mesa 1 kg',
      categoria: 'Despensa',
      sku: 'SAL-001',
      codigoBarras: '7500000000009',
      precioCentavos: 1650n,
      costoCentavos: 1120n,
      stock: '18',
    },
    {
      nombre: 'Atún en agua 140 g',
      categoria: 'Despensa',
      sku: 'ATU-140',
      codigoBarras: '7500000000010',
      precioCentavos: 2350n,
      costoCentavos: 1790n,
      stock: '48',
    },
    {
      nombre: 'Sopa de pasta 200 g',
      categoria: 'Despensa',
      sku: 'SOP-200',
      codigoBarras: '7500000000011',
      precioCentavos: 1450n,
      costoCentavos: 980n,
      stock: '40',
    },
    {
      nombre: 'Papel higiénico 4 rollos',
      categoria: 'Despensa',
      sku: 'PAP-004',
      codigoBarras: '7500000000012',
      precioCentavos: 3990n,
      costoCentavos: 3050n,
      stock: '24',
    },
    {
      nombre: 'Detergente en polvo 1 kg',
      categoria: 'Despensa',
      sku: 'DET-001',
      codigoBarras: '7500000000013',
      precioCentavos: 4550n,
      costoCentavos: 3620n,
      stock: '16',
    },
    {
      nombre: 'Agua embotellada 1 L',
      categoria: 'Bebidas',
      sku: 'AGU-001',
      codigoBarras: '7500000000015',
      precioCentavos: 1500n,
      costoCentavos: 980n,
      stock: '72',
    },
    {
      nombre: 'Jugo de naranja 1 L',
      categoria: 'Bebidas',
      sku: 'JUG-001',
      codigoBarras: '7500000000016',
      precioCentavos: 3450n,
      costoCentavos: 2680n,
      stock: '20',
    },
    {
      nombre: 'Cerveza clara 355 ml',
      categoria: 'Bebidas',
      sku: 'CER-355',
      codigoBarras: '7500000000017',
      precioCentavos: 2600n,
      costoCentavos: 1950n,
      stock: '48',
    },
    {
      nombre: 'Queso panela 400 g',
      categoria: 'Lácteos',
      sku: 'QUE-400',
      codigoBarras: '7500000000018',
      precioCentavos: 6900n,
      costoCentavos: 5480n,
      stock: '10',
    },
    {
      nombre: 'Yogur natural 1 kg',
      categoria: 'Lácteos',
      sku: 'YOG-001',
      codigoBarras: '7500000000019',
      precioCentavos: 4200n,
      costoCentavos: 3310n,
      stock: '14',
    },
    {
      nombre: 'Crema ácida 450 ml',
      categoria: 'Lácteos',
      sku: 'CRE-450',
      codigoBarras: '7500000000020',
      precioCentavos: 3890n,
      costoCentavos: 3040n,
      stock: '12',
    },
    {
      nombre: 'Galletas saladas 200 g',
      categoria: 'Botanas',
      sku: 'GAL-200',
      codigoBarras: '7500000000021',
      precioCentavos: 2100n,
      costoCentavos: 1490n,
      stock: '32',
    },
    {
      nombre: 'Papas fritas 45 g',
      categoria: 'Botanas',
      sku: 'PAP-045',
      codigoBarras: '7500000000022',
      precioCentavos: 1900n,
      costoCentavos: 1320n,
      stock: '55',
    },
    {
      nombre: 'Cacahuates salados 120 g',
      categoria: 'Botanas',
      sku: 'CAC-120',
      codigoBarras: '7500000000023',
      precioCentavos: 2450n,
      costoCentavos: 1750n,
      stock: '28',
    },
  ],
  insumos: [],
  recetas: [],
  proveedor: {
    nombre: 'Abastos del Centro',
    contacto: 'Ramiro Cuéllar',
    telefono: '7717654321',
    diasVisita: [1, 4],
    diasCredito: 8,
  },
  fondoCajaCentavos: 120000n,
  fondoMonedasCentavos: 40000n,
  fondoChicosCentavos: 60000n,
  fondoGrandesCentavos: 20000n,
};

const FERRETERIA: SemillaDemo = {
  categorias: ['Herramienta eléctrica', 'Herramienta manual', 'Fijación', 'Pintura', 'Eléctrico'],
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
    {
      nombre: 'Desarmador de cruz 6 pulgadas',
      categoria: 'Herramienta manual',
      sku: 'DES-CRU-06',
      codigoBarras: '7506240644122',
      precioCentavos: 8900n,
      costoCentavos: 5600n,
      stock: '24',
    },
    {
      nombre: 'Pinza de electricista 8 pulgadas',
      categoria: 'Herramienta manual',
      sku: 'PIN-ELE-08',
      codigoBarras: '7506240644139',
      precioCentavos: 21900n,
      costoCentavos: 15200n,
      stock: '12',
    },
    {
      nombre: 'Llave ajustable 10 pulgadas',
      categoria: 'Herramienta manual',
      sku: 'LLA-AJU-10',
      codigoBarras: '7506240644146',
      precioCentavos: 17500n,
      costoCentavos: 12100n,
      stock: '14',
    },
    {
      nombre: 'Sierra para metal con arco',
      categoria: 'Herramienta manual',
      sku: 'SIE-MET-01',
      codigoBarras: '7506240644153',
      precioCentavos: 15900n,
      costoCentavos: 10900n,
      stock: '9',
    },
    {
      nombre: 'Esmeriladora angular 4 1/2 pulgadas',
      categoria: 'Herramienta eléctrica',
      sku: 'ESM-045',
      codigoBarras: '7506240634529',
      precioCentavos: 139900n,
      costoCentavos: 99800n,
      stock: '6',
    },
    {
      nombre: 'Rotomartillo SDS 800 W',
      categoria: 'Herramienta eléctrica',
      sku: 'ROT-800',
      codigoBarras: '7506240634536',
      precioCentavos: 289900n,
      costoCentavos: 214300n,
      stock: '4',
    },
    {
      nombre: 'Juego de brocas para concreto 5 piezas',
      categoria: 'Herramienta eléctrica',
      sku: 'BRO-CON-05',
      codigoBarras: '7506240634543',
      precioCentavos: 24900n,
      costoCentavos: 16400n,
      stock: '18',
    },
    {
      nombre: 'Taquete de plástico 1/4 pulgada',
      categoria: 'Fijación',
      sku: 'TAQ-014',
      precioCentavos: 150n,
      costoCentavos: 70n,
      stock: '600',
    },
    {
      nombre: 'Clavo de 2 1/2 pulgadas',
      categoria: 'Fijación',
      sku: 'CLA-250',
      precioCentavos: 90n,
      costoCentavos: 45n,
      stock: '1200',
    },
    {
      nombre: 'Tuerca hexagonal 3/8 pulgada',
      categoria: 'Fijación',
      sku: 'TUE-038',
      precioCentavos: 250n,
      costoCentavos: 120n,
      stock: '450',
    },
    {
      nombre: 'Pija para madera 2 pulgadas',
      categoria: 'Fijación',
      sku: 'PIJ-200',
      precioCentavos: 320n,
      costoCentavos: 160n,
      stock: '380',
    },
    {
      nombre: 'Pintura vinílica blanca 19 L',
      categoria: 'Pintura',
      sku: 'PIN-VIN-19',
      codigoBarras: '7506240652721',
      precioCentavos: 89900n,
      costoCentavos: 68400n,
      stock: '7',
    },
    {
      nombre: 'Esmalte negro brillante 1 L',
      categoria: 'Pintura',
      sku: 'ESM-NEG-01',
      codigoBarras: '7506240652738',
      precioCentavos: 22900n,
      costoCentavos: 16800n,
      stock: '15',
    },
    {
      nombre: 'Thinner estándar 1 L',
      categoria: 'Pintura',
      sku: 'THI-001',
      codigoBarras: '7506240652745',
      precioCentavos: 9500n,
      costoCentavos: 6700n,
      stock: '20',
    },
    {
      nombre: 'Rodillo con extensión 9 pulgadas',
      categoria: 'Pintura',
      sku: 'ROD-009',
      codigoBarras: '7506240652752',
      precioCentavos: 13900n,
      costoCentavos: 9200n,
      stock: '16',
    },
    {
      nombre: 'Cable THW calibre 12 por metro',
      categoria: 'Eléctrico',
      sku: 'CAB-THW-12',
      precioCentavos: 1890n,
      costoCentavos: 1240n,
      stock: '300',
    },
    {
      nombre: 'Manguera de jardín 1/2 pulgada por metro',
      categoria: 'Eléctrico',
      sku: 'MAN-JAR-012',
      precioCentavos: 2450n,
      costoCentavos: 1610n,
      stock: '150',
    },
    {
      nombre: 'Apagador sencillo blanco',
      categoria: 'Eléctrico',
      sku: 'APA-SEN-01',
      codigoBarras: '7506240661112',
      precioCentavos: 3900n,
      costoCentavos: 2400n,
      stock: '40',
    },
    {
      nombre: 'Contacto dúplex aterrizado',
      categoria: 'Eléctrico',
      sku: 'CON-DUP-01',
      codigoBarras: '7506240661129',
      precioCentavos: 5900n,
      costoCentavos: 3850n,
      stock: '35',
    },
    {
      nombre: 'Cinta de aislar 18 m',
      categoria: 'Eléctrico',
      sku: 'CIN-AIS-18',
      codigoBarras: '7506240661136',
      precioCentavos: 2900n,
      costoCentavos: 1750n,
      stock: '50',
    },
  ],
  insumos: [],
  recetas: [],
  proveedor: {
    nombre: 'Ferretera del Valle',
    contacto: 'Salvador Nava',
    telefono: '7712345678',
    diasVisita: [3, 6],
    diasCredito: 30,
  },
  fondoCajaCentavos: 200000n,
  fondoMonedasCentavos: 40000n,
  fondoChicosCentavos: 100000n,
  fondoGrandesCentavos: 60000n,
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
    {
      clave: 'cafe_descaf',
      nombre: 'Café descafeinado en grano',
      unidad: 'g',
      costoCentavos: 95n,
      stock: '1800',
    },
    {
      clave: 'leche_deslactosada',
      nombre: 'Leche deslactosada',
      unidad: 'ml',
      costoCentavos: 4n,
      stock: '9000',
    },
    {
      clave: 'leche_avena',
      nombre: 'Bebida de avena',
      unidad: 'ml',
      costoCentavos: 9n,
      stock: '6000',
    },
    {
      clave: 'chocolate',
      nombre: 'Chocolate en polvo',
      unidad: 'g',
      costoCentavos: 42n,
      stock: '2500',
    },
    {
      clave: 'matcha',
      nombre: 'Té matcha en polvo',
      unidad: 'g',
      costoCentavos: 210n,
      stock: '600',
    },
    {
      clave: 'jarabe_vainilla',
      nombre: 'Jarabe de vainilla',
      unidad: 'ml',
      costoCentavos: 7n,
      stock: '3000',
    },
    {
      clave: 'jarabe_caramelo',
      nombre: 'Jarabe de caramelo',
      unidad: 'ml',
      costoCentavos: 7n,
      stock: '3000',
    },
    {
      clave: 'hielo',
      nombre: 'Hielo en cubos',
      unidad: 'g',
      costoCentavos: 1n,
      stock: '40000',
    },
    {
      clave: 'crema_batida',
      nombre: 'Crema para batir',
      unidad: 'ml',
      costoCentavos: 12n,
      stock: '2500',
    },
    {
      clave: 'pan_dulce',
      nombre: 'Concha de vainilla',
      unidad: 'pieza',
      costoCentavos: 1500n,
      stock: '20',
    },
    {
      clave: 'galleta_avena',
      nombre: 'Galleta de avena artesanal',
      unidad: 'pieza',
      costoCentavos: 1800n,
      stock: '24',
    },
    {
      clave: 'bagel',
      nombre: 'Bagel integral con queso crema',
      unidad: 'pieza',
      costoCentavos: 4200n,
      stock: '15',
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
    {
      nombre: 'Espresso doble',
      categoria: 'Café',
      precioCentavos: 4500n,
      ingredientes: [{ clave: 'cafe', cantidad: '18' }],
    },
    {
      nombre: 'Cortado 8 oz',
      categoria: 'Café',
      precioCentavos: 5500n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '120' },
      ],
    },
    {
      nombre: 'Capuchino 12 oz',
      categoria: 'Café',
      precioCentavos: 6500n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '180' },
      ],
    },
    {
      nombre: 'Mocha 12 oz',
      categoria: 'Café',
      precioCentavos: 7500n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '200' },
        { clave: 'chocolate', cantidad: '25' },
      ],
    },
    {
      nombre: 'Latte vainilla 16 oz',
      categoria: 'Café',
      precioCentavos: 7900n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '300' },
        { clave: 'jarabe_vainilla', cantidad: '30' },
      ],
    },
    {
      nombre: 'Americano descafeinado 12 oz',
      categoria: 'Café',
      precioCentavos: 5200n,
      ingredientes: [{ clave: 'cafe_descaf', cantidad: '18' }],
    },
    {
      nombre: 'Latte de avena 12 oz',
      categoria: 'Café',
      precioCentavos: 7500n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche_avena', cantidad: '240' },
      ],
    },
    {
      nombre: 'Café helado 16 oz',
      categoria: 'Bebidas frías',
      precioCentavos: 6900n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '200' },
        { clave: 'hielo', cantidad: '150' },
      ],
    },
    {
      nombre: 'Frappé de caramelo 16 oz',
      categoria: 'Bebidas frías',
      precioCentavos: 8900n,
      ingredientes: [
        { clave: 'cafe', cantidad: '18' },
        { clave: 'leche', cantidad: '200' },
        { clave: 'jarabe_caramelo', cantidad: '40' },
        { clave: 'hielo', cantidad: '250' },
        { clave: 'crema_batida', cantidad: '40' },
      ],
    },
    {
      nombre: 'Matcha latte 12 oz',
      categoria: 'Bebidas frías',
      precioCentavos: 8500n,
      ingredientes: [
        { clave: 'matcha', cantidad: '8' },
        { clave: 'leche_deslactosada', cantidad: '240' },
      ],
    },
    {
      nombre: 'Chocolate caliente 12 oz',
      categoria: 'Bebidas frías',
      precioCentavos: 6500n,
      ingredientes: [
        { clave: 'chocolate', cantidad: '30' },
        { clave: 'leche', cantidad: '240' },
      ],
    },
    {
      nombre: 'Concha de vainilla',
      categoria: 'Alimentos',
      precioCentavos: 3200n,
      ingredientes: [{ clave: 'pan_dulce', cantidad: '1' }],
    },
    {
      nombre: 'Galleta de avena',
      categoria: 'Alimentos',
      precioCentavos: 3500n,
      ingredientes: [{ clave: 'galleta_avena', cantidad: '1' }],
    },
    {
      nombre: 'Bagel con queso crema',
      categoria: 'Alimentos',
      precioCentavos: 7900n,
      ingredientes: [{ clave: 'bagel', cantidad: '1' }],
    },
  ],
  proveedor: {
    nombre: 'Café de Altura Xico',
    contacto: 'Itzel Manrique',
    telefono: '2288765432',
    diasVisita: [2],
    diasCredito: 15,
  },
  fondoCajaCentavos: 100000n,
  fondoMonedasCentavos: 35000n,
  fondoChicosCentavos: 50000n,
  fondoGrandesCentavos: 15000n,
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
    {
      nombre: 'Agua mineral 355 ml',
      categoria: 'Bebidas',
      sku: 'AGM-355',
      codigoBarras: '7501055300011',
      precioCentavos: 3500n,
      costoCentavos: 1850n,
      stock: '48',
      area: 'barra',
    },
    {
      nombre: 'Refresco de toronja 355 ml',
      categoria: 'Bebidas',
      sku: 'REF-TOR-355',
      codigoBarras: '7501055300028',
      precioCentavos: 3500n,
      costoCentavos: 1780n,
      stock: '36',
      area: 'barra',
    },
    {
      nombre: 'Limonada natural 500 ml',
      categoria: 'Bebidas',
      sku: 'LIM-500',
      precioCentavos: 4500n,
      costoCentavos: 1600n,
      stock: '30',
      area: 'barra',
    },
    {
      nombre: 'Michelada preparada 500 ml',
      categoria: 'Cervezas',
      sku: 'MIC-500',
      precioCentavos: 8900n,
      costoCentavos: 3400n,
      stock: '24',
      area: 'barra',
    },
    {
      nombre: 'Flan napolitano',
      categoria: 'Postres',
      sku: 'FLA-001',
      precioCentavos: 7500n,
      costoCentavos: 2900n,
      stock: '12',
      area: 'cocina',
    },
    {
      nombre: 'Pastel de tres leches',
      categoria: 'Postres',
      sku: 'TRE-001',
      precioCentavos: 8900n,
      costoCentavos: 3600n,
      stock: '10',
      area: 'cocina',
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
    {
      clave: 'camaron',
      nombre: 'Camarón mediano limpio',
      unidad: 'g',
      costoCentavos: 48n,
      stock: '3000',
    },
    {
      clave: 'pulpo',
      nombre: 'Pulpo cocido',
      unidad: 'g',
      costoCentavos: 62n,
      stock: '2000',
    },
    {
      clave: 'chile_poblano',
      nombre: 'Chile poblano',
      unidad: 'pieza',
      costoCentavos: 1200n,
      stock: '30',
    },
    {
      clave: 'elote',
      nombre: 'Grano de elote',
      unidad: 'g',
      costoCentavos: 6n,
      stock: '5000',
    },
    {
      clave: 'nopal',
      nombre: 'Nopal limpio',
      unidad: 'g',
      costoCentavos: 4n,
      stock: '4000',
    },
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
    {
      nombre: 'Sopa de tortilla',
      categoria: 'Entradas',
      precioCentavos: 11500n,
      area: 'cocina',
      ingredientes: [
        { clave: 'tortilla', cantidad: '3' },
        { clave: 'jitomate', cantidad: '150' },
        { clave: 'crema', cantidad: '40' },
      ],
    },
    {
      nombre: 'Coctel de camarón',
      categoria: 'Entradas',
      precioCentavos: 18900n,
      area: 'cocina',
      ingredientes: [
        { clave: 'camaron', cantidad: '180' },
        { clave: 'jitomate', cantidad: '120' },
        { clave: 'cebolla', cantidad: '50' },
        { clave: 'aguacate', cantidad: '120' },
      ],
    },
    {
      nombre: 'Tacos de camarón (orden de 3)',
      categoria: 'Tacos',
      precioCentavos: 16900n,
      area: 'cocina',
      ingredientes: [
        { clave: 'camaron', cantidad: '150' },
        { clave: 'tortilla', cantidad: '3' },
        { clave: 'cebolla', cantidad: '30' },
      ],
    },
    {
      nombre: 'Tacos de nopal (orden de 3)',
      categoria: 'Tacos',
      precioCentavos: 10900n,
      area: 'cocina',
      ingredientes: [
        { clave: 'nopal', cantidad: '180' },
        { clave: 'tortilla', cantidad: '3' },
        { clave: 'cebolla', cantidad: '30' },
      ],
    },
    {
      nombre: 'Chiles rellenos de queso',
      categoria: 'Platos fuertes',
      precioCentavos: 21900n,
      area: 'cocina',
      ingredientes: [
        { clave: 'chile_poblano', cantidad: '2' },
        { clave: 'queso', cantidad: '120' },
        { clave: 'jitomate', cantidad: '150' },
      ],
    },
    {
      nombre: 'Pulpo a las brasas',
      categoria: 'Platos fuertes',
      precioCentavos: 32900n,
      area: 'cocina',
      ingredientes: [
        { clave: 'pulpo', cantidad: '220' },
        { clave: 'cebolla', cantidad: '60' },
        { clave: 'elote', cantidad: '120' },
      ],
    },
    {
      nombre: 'Esquites con queso',
      categoria: 'Entradas',
      precioCentavos: 8900n,
      area: 'cocina',
      ingredientes: [
        { clave: 'elote', cantidad: '250' },
        { clave: 'queso', cantidad: '40' },
        { clave: 'crema', cantidad: '30' },
      ],
    },
  ],
  proveedor: {
    nombre: 'Central de Abasto · bodega 214',
    contacto: 'Chuy Gaytán',
    telefono: '5512349876',
    diasVisita: [1, 3, 5],
    diasCredito: 15,
  },
  fondoCajaCentavos: 300000n,
  fondoMonedasCentavos: 50000n,
  fondoChicosCentavos: 150000n,
  fondoGrandesCentavos: 100000n,
};

/**
 * ESTÉTICA · el arquetipo A3, que vende TIEMPO y no piezas.
 *
 * Hasta el 17-09-2026 este giro caía en la semilla de abarrotes: una estética de
 * demostración abría con tortillas, frijol y huevo en su catálogo. No era un
 * detalle cosmético — las doce pantallas del modelo leen servicios con duración,
 * y sin una sola fila en `servicios` la agenda no tiene nada que colocar y el
 * catálogo abre vacío.
 *
 * Los precios son de un salón de barrio en septiembre de 2026, y las duraciones
 * están tomadas de la tabla de `04-INTERFAZ.md §4.2` del modelo.
 */
const ESTETICA: SemillaDemo = {
  categorias: ['Corte y peinado', 'Color', 'Uñas', 'Tratamientos', 'Anaquel'],
  productos: [
    {
      nombre: 'Shampoo sin sulfatos 300 ml',
      categoria: 'Anaquel',
      sku: 'SHA-300',
      codigoBarras: '7502240100014',
      precioCentavos: 28900n,
      costoCentavos: 17400n,
      stock: '14',
    },
    {
      nombre: 'Acondicionador reparador 300 ml',
      categoria: 'Anaquel',
      sku: 'ACO-300',
      codigoBarras: '7502240100021',
      precioCentavos: 29900n,
      costoCentavos: 18100n,
      stock: '12',
    },
    {
      nombre: 'Mascarilla de keratina 250 ml',
      categoria: 'Anaquel',
      sku: 'MAS-250',
      codigoBarras: '7502240100038',
      precioCentavos: 39900n,
      costoCentavos: 24600n,
      stock: '9',
    },
    {
      nombre: 'Aceite de argán 60 ml',
      categoria: 'Anaquel',
      sku: 'ARG-060',
      codigoBarras: '7502240100045',
      precioCentavos: 34900n,
      costoCentavos: 21300n,
      stock: '10',
    },
    {
      nombre: 'Protector térmico en spray 200 ml',
      categoria: 'Anaquel',
      sku: 'PRO-200',
      codigoBarras: '7502240100052',
      precioCentavos: 26900n,
      costoCentavos: 16200n,
      stock: '11',
    },
    {
      nombre: 'Esmalte semipermanente rojo',
      categoria: 'Anaquel',
      sku: 'ESM-ROJ',
      codigoBarras: '7502240100069',
      precioCentavos: 18900n,
      costoCentavos: 10400n,
      stock: '18',
    },
    {
      nombre: 'Tinte permanente castaño 6.0',
      categoria: 'Anaquel',
      sku: 'TIN-060',
      codigoBarras: '7502240100076',
      precioCentavos: 21900n,
      costoCentavos: 13100n,
      stock: '22',
    },
    {
      nombre: 'Agua oxigenada 20 volúmenes 1 L',
      categoria: 'Anaquel',
      sku: 'OXI-020',
      codigoBarras: '7502240100083',
      precioCentavos: 9900n,
      costoCentavos: 5400n,
      stock: '16',
    },
  ],
  insumos: [],
  recetas: [],
  servicios: [
    {
      nombre: 'Corte de dama',
      categoria: 'Corte y peinado',
      precioCentavos: 25000n,
      activa1Min: 40,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Corte de caballero',
      categoria: 'Corte y peinado',
      precioCentavos: 18000n,
      activa1Min: 30,
      cierreMin: 5,
      requiereEstacion: true,
    },
    {
      nombre: 'Corte de niño',
      categoria: 'Corte y peinado',
      precioCentavos: 15000n,
      activa1Min: 25,
      cierreMin: 5,
      requiereEstacion: true,
    },
    {
      nombre: 'Lavado y peinado',
      categoria: 'Corte y peinado',
      precioCentavos: 20000n,
      activa1Min: 35,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Peinado de evento',
      categoria: 'Corte y peinado',
      precioCentavos: 45000n,
      activa1Min: 60,
      cierreMin: 15,
      requiereEstacion: true,
    },
    {
      // El caso que gobierna la agenda de este modelo: 25 min de proceso en los
      // que la estilista atiende a otra clienta.
      nombre: 'Tinte de raíz',
      categoria: 'Color',
      precioCentavos: 65000n,
      activa1Min: 40,
      pasivaMin: 25,
      activa2Min: 15,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Tinte completo',
      categoria: 'Color',
      precioCentavos: 95000n,
      activa1Min: 55,
      pasivaMin: 35,
      activa2Min: 20,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Balayage',
      categoria: 'Color',
      precioCentavos: 180000n,
      activa1Min: 90,
      pasivaMin: 45,
      activa2Min: 30,
      cierreMin: 15,
      requiereEstacion: true,
    },
    {
      nombre: 'Mechas con papel aluminio',
      categoria: 'Color',
      precioCentavos: 140000n,
      activa1Min: 75,
      pasivaMin: 40,
      activa2Min: 25,
      cierreMin: 15,
      requiereEstacion: true,
    },
    {
      nombre: 'Manicure tradicional',
      categoria: 'Uñas',
      precioCentavos: 18000n,
      activa1Min: 40,
      cierreMin: 5,
      requiereEstacion: true,
    },
    {
      nombre: 'Uñas acrílicas',
      categoria: 'Uñas',
      precioCentavos: 55000n,
      activa1Min: 90,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Esmaltado semipermanente',
      categoria: 'Uñas',
      precioCentavos: 30000n,
      activa1Min: 45,
      // El curado en la lámpara, y el retirar y limpiar de después. Un procesado
      // sin terminado no existe —el `check` de la 131 lo impide— y es correcto:
      // dejaría a la clienta sentada y a nadie esperándola.
      pasivaMin: 10,
      activa2Min: 5,
      cierreMin: 5,
      requiereEstacion: true,
    },
    {
      nombre: 'Pedicure con spa',
      categoria: 'Uñas',
      precioCentavos: 35000n,
      activa1Min: 50,
      // El remojo, y el esmaltado de después.
      pasivaMin: 15,
      activa2Min: 20,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Tratamiento de keratina',
      categoria: 'Tratamientos',
      precioCentavos: 120000n,
      activa1Min: 60,
      pasivaMin: 30,
      activa2Min: 20,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Botox capilar',
      categoria: 'Tratamientos',
      precioCentavos: 85000n,
      activa1Min: 45,
      pasivaMin: 25,
      activa2Min: 15,
      cierreMin: 10,
      requiereEstacion: true,
    },
    {
      nombre: 'Depilación de cejas con hilo',
      categoria: 'Tratamientos',
      precioCentavos: 12000n,
      activa1Min: 20,
      cierreMin: 5,
      requiereEstacion: false,
    },
  ],
  proveedor: {
    nombre: 'Distribuidora de Belleza Hidalgo',
    contacto: 'Verónica Alcántara',
    telefono: '7711234567',
    diasVisita: [2, 5],
    diasCredito: 15,
  },
  fondoCajaCentavos: 150000n,
  fondoMonedasCentavos: 30000n,
  fondoChicosCentavos: 80000n,
  fondoGrandesCentavos: 40000n,
};

/**
 * La semilla de un giro.
 *
 * `farmacia` cae en la de abarrotes A PROPÓSITO y con su motivo: su modelo no
 * está construido —es uno de los 73 que faltan— y una tiendita con medicinas es
 * lo más cerca que se puede estar sin inventar un catálogo para un negocio que
 * el sistema todavía no sabe operar. El día que se construya, entra aquí.
 *
 * `tienda` es el que no lleva `if`: es la más restrictiva, y caer en ella ante
 * un giro que nadie declaró es lo correcto.
 */
export function semillaParaPaquete(giro: Giro): SemillaDemo {
  if (giro === 'ferreteria') return FERRETERIA;
  if (giro === 'restaurante') return RESTAURANTE;
  if (giro === 'cafeteria') return CAFETERIA;
  if (giro === 'estetica') return ESTETICA;
  return ABARROTES;
}
