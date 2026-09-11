#!/usr/bin/env node
/**
 * Humo de la venta de punta a punta, contra un servidor REAL (F1.1-C-08/C-18).
 *
 *   node scripts/humo-venta.mjs [--base http://localhost:3000] [--pin 4821]
 *
 * Recorre la cadena entera por HTTP, como lo haría el navegador: entrar, abrir
 * caja, agregar, cobrar, ticket. **No importa una sola línea del
 * servidor**: si el bundle de producción se rompe, esto se entera; una prueba
 * que importa el módulo, no.
 *
 * Sirve para localhost y para la URL pública. Es el `smoke test post-deploy`
 * que pide `morphiq-prs §23`.
 */
import { exigir, llamar as llamarBase, paso } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');

const llamar = (ruta, cuerpo, opciones) => llamarBase(BASE, ruta, cuerpo, opciones);

paso(1, 'Listar quién puede entrar');
const { empleados } = exigir('GET /api/auth/empleados', await llamar('/api/auth/empleados'));
if (!Array.isArray(empleados) || empleados.length === 0) {
  console.error('✗ El servidor no lista a nadie. Corre `pnpm db:bootstrap` primero.');
  process.exit(1);
}
console.log(
  `  ${String(empleados.length)} empleado(s): ${empleados.map((e) => e.nombre).join(', ')}`,
);

paso(2, 'Entrar con PIN');
const primero = empleados[0];
exigir(
  'POST /api/auth/entrar',
  await llamar('/api/auth/entrar', { empleoId: primero.empleoId, pin: PIN }),
);

paso(3, 'Estado de la venta (la sesión existe)');
const estado = exigir('POST /api/venta/estado', await llamar('/api/venta/estado', {}));

paso(4, 'Abrir caja');
if (estado.sesionCajaId === null) {
  exigir('POST /api/caja/abrir', await llamar('/api/caja/abrir', { fondoInicialCentavos: 50000 }));
} else {
  console.log('✓ ya había una caja abierta');
}

paso(5, 'Buscar en el catálogo');
const { productos } = exigir(
  'POST /api/venta/buscar',
  await llamar('/api/venta/buscar', { limite: 5 }),
);
if (productos.length === 0) {
  console.error('✗ El catálogo está vacío.');
  process.exit(1);
}
console.log(`  ${String(productos.length)} producto(s). Se venderá: ${productos[0].nombre}`);

paso(6, 'Crear la orden y agregar una línea');
const { ordenId } = exigir(
  'POST /api/venta/crear-orden',
  await llamar('/api/venta/crear-orden', {}),
);
exigir(
  'POST /api/venta/agregar-linea',
  await llamar('/api/venta/agregar-linea', { ordenId, productoId: productos[0].id, cantidad: '2' }),
);

paso(7, 'Cotizar en el servidor');
const conLinea = exigir('POST /api/venta/estado', await llamar('/api/venta/estado', { ordenId }));
const total = conLinea.cotizacion.totalCentavos;
console.log(
  `  total del servidor: ${total} centavos · ${String(conLinea.cotizacion.lineas.length)} línea(s)`,
);

paso(8, 'Cobrar en efectivo');
/** La MISMA clave en el cobro y en su reintento: es lo que se está probando. */
const clave = crypto.randomUUID();
const cobro = exigir(
  'POST /api/venta/cobrar',
  await llamar(
    '/api/venta/cobrar',
    {
      ordenId,
      pagos: [
        {
          metodo: 'efectivo',
          montoCentavos: Number(total),
          recibidoCentavos: Number(total) + 10000,
        },
      ],
      totalEsperadoCentavos: Number(total),
    },
    { clave },
  ),
);
console.log(`  folio ${cobro.serie}-${cobro.folio} · cambio ${cobro.cambioCentavos} centavos`);

paso(9, 'Reintentar el MISMO cobro con la MISMA clave (idempotencia)');
const repetido = await llamar(
  '/api/venta/cobrar',
  {
    ordenId,
    pagos: [
      { metodo: 'efectivo', montoCentavos: Number(total), recibidoCentavos: Number(total) + 10000 },
    ],
    totalEsperadoCentavos: Number(total),
  },
  { clave },
);
if (repetido.estado === 200 && repetido.datos?.datos?.folio === cobro.folio) {
  console.log(
    `✓ devolvió el mismo folio ${String(repetido.datos.datos.folio)}: no cobró dos veces`,
  );
} else {
  console.error(`✗ el reintento NO fue idempotente: ${JSON.stringify(repetido).slice(0, 300)}`);
  process.exit(1);
}

paso(10, 'Ticket');
const ticket = exigir('POST /api/venta/ticket', await llamar('/api/venta/ticket', { ordenId }));
console.log(
  `  ${ticket.organizacionNombre} · ${ticket.serie}-${ticket.folio} · total ${ticket.totalCentavos}`,
);

console.log(
  `\n✓ HUMO COMPLETO contra ${BASE}\n  orden ${ordenId}\n  folio ${cobro.serie}-${cobro.folio}\n`,
);
