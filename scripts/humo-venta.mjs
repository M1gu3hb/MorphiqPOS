#!/usr/bin/env node
/**
 * Humo de la venta de punta a punta, contra un servidor REAL (F1.1-C-08/C-18).
 *
 *   node scripts/humo-venta.mjs <codigo-enrolamiento> [--base http://localhost:3000] [--pin 4821]
 *
 * Recorre la cadena entera por HTTP, como lo haría el navegador: enrolar,
 * entrar, abrir caja, agregar, cobrar, ticket. **No importa una sola línea del
 * servidor**: si el bundle de producción se rompe, esto se entera; una prueba
 * que importa el módulo, no.
 *
 * Sirve para localhost y para la URL pública. Es el `smoke test post-deploy`
 * que pide `morphiq-prs §23`.
 */

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const codigo = process.argv[2];
const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');

if (codigo === undefined || !/^\d{6}$/.test(codigo)) {
  console.error('Uso: node scripts/humo-venta.mjs <codigo-6-digitos> [--base URL] [--pin NNNN]');
  process.exit(1);
}

/** Las cookies se guardan a mano: `fetch` de Node no tiene tarro. */
const tarro = new Map();

function cabeceraCookie() {
  return [...tarro].map(([k, v]) => `${k}=${v}`).join('; ');
}

function guardarCookies(respuesta) {
  for (const linea of respuesta.headers.getSetCookie?.() ?? []) {
    const par = linea.split(';', 1)[0] ?? '';
    const igual = par.indexOf('=');
    if (igual > 0) tarro.set(par.slice(0, igual).trim(), par.slice(igual + 1).trim());
  }
}

let clave = crypto.randomUUID();

async function llamar(ruta, cuerpo, opciones = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: {
      ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
      'idempotency-key': opciones.clave ?? crypto.randomUUID(),
      'x-morphiqpos-request': '1',
      origin: BASE,
      ...(tarro.size === 0 ? {} : { cookie: cabeceraCookie() }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    redirect: 'manual',
  });
  guardarCookies(respuesta);
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = { crudo: texto.slice(0, 200) };
  }
  return { estado: respuesta.status, datos };
}

function exigir(nombre, r, predicado = (x) => x.estado === 200 && x.datos?.ok !== false) {
  if (!predicado(r)) {
    console.error(`✗ ${nombre}: HTTP ${String(r.estado)} ${JSON.stringify(r.datos).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`✓ ${nombre}`);
  return r.datos?.datos ?? r.datos;
}

const paso = (n, t) => console.log(`\n── ${String(n)} · ${t} ─────────────────────────`);

paso(1, 'Enrolar la terminal');
exigir('POST /api/auth/enrolar', await llamar('/api/auth/enrolar', { codigo }));

paso(2, 'Listar quién puede entrar');
const { empleados } = exigir('GET /api/auth/empleados', await llamar('/api/auth/empleados'));
if (!Array.isArray(empleados) || empleados.length === 0) {
  console.error('✗ La terminal no lista a nadie. Corre `pnpm db:bootstrap` primero.');
  process.exit(1);
}
console.log(
  `  ${String(empleados.length)} empleado(s): ${empleados.map((e) => e.nombre).join(', ')}`,
);

paso(3, 'Entrar con PIN');
const primero = empleados[0];
exigir(
  'POST /api/auth/entrar',
  await llamar('/api/auth/entrar', { empleoId: primero.empleoId, pin: PIN }),
);

paso(4, 'Estado de la venta (la sesión existe)');
const estado = exigir('POST /api/venta/estado', await llamar('/api/venta/estado', {}));

paso(5, 'Abrir caja');
if (estado.sesionCajaId === null) {
  exigir('POST /api/caja/abrir', await llamar('/api/caja/abrir', { fondoInicialCentavos: 50000 }));
} else {
  console.log('✓ ya había una caja abierta');
}

paso(6, 'Buscar en el catálogo');
const { productos } = exigir(
  'POST /api/venta/buscar',
  await llamar('/api/venta/buscar', { limite: 5 }),
);
if (productos.length === 0) {
  console.error('✗ El catálogo está vacío.');
  process.exit(1);
}
console.log(`  ${String(productos.length)} producto(s). Se venderá: ${productos[0].nombre}`);

paso(7, 'Crear la orden y agregar una línea');
const { ordenId } = exigir(
  'POST /api/venta/crear-orden',
  await llamar('/api/venta/crear-orden', {}),
);
exigir(
  'POST /api/venta/agregar-linea',
  await llamar('/api/venta/agregar-linea', { ordenId, productoId: productos[0].id, cantidad: '2' }),
);

paso(8, 'Cotizar en el servidor');
const conLinea = exigir('POST /api/venta/estado', await llamar('/api/venta/estado', { ordenId }));
const total = conLinea.cotizacion.totalCentavos;
console.log(
  `  total del servidor: ${total} centavos · ${String(conLinea.cotizacion.lineas.length)} línea(s)`,
);

paso(9, 'Cobrar en efectivo');
clave = crypto.randomUUID();
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

paso(10, 'Reintentar el MISMO cobro con la MISMA clave (idempotencia)');
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

paso(11, 'Ticket');
const ticket = exigir('POST /api/venta/ticket', await llamar('/api/venta/ticket', { ordenId }));
console.log(
  `  ${ticket.organizacionNombre} · ${ticket.serie}-${ticket.folio} · total ${ticket.totalCentavos}`,
);

console.log(
  `\n✓ HUMO COMPLETO contra ${BASE}\n  orden ${ordenId}\n  folio ${cobro.serie}-${cobro.folio}\n`,
);
