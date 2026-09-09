#!/usr/bin/env node
/**
 * Humo del impuesto configurable (F1.1-C-12), contra un servidor REAL.
 *
 *   node scripts/humo-impuesto.mjs <codigo-enrolamiento> [--base URL] [--pin 4821]
 *
 * Prueba lo único que importa de C-12: **cambiar el IVA en /configuracion cambia
 * el total de la siguiente cotización.** Con el impuesto incluido en el precio,
 * bajar la tasa NO cambia el total —el precio de mostrador es el mismo— pero sí
 * cambia cuánto de ese total es impuesto. Eso es lo que se comprueba.
 *
 * Restaura el 16 % al terminar, pase lo que pase: dejar una organización de
 * demostración con un IVA raro se descubriría en la peor demostración posible.
 */
import { exigir, llamar as llamarBase, paso } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const codigo = process.argv[2];
const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');

if (codigo === undefined || !/^\d{6}$/.test(codigo)) {
  console.error('Uso: node scripts/humo-impuesto.mjs <codigo-6-digitos> [--base URL] [--pin NNNN]');
  process.exit(1);
}

const llamar = (ruta, cuerpo, opciones) => llamarBase(BASE, ruta, cuerpo, opciones);

async function guardarIva(configuracion, puntosBase) {
  return llamar('/api/catalogo/configuracion', {
    ...configuracion,
    impuestoPuntosBase: puntosBase,
  });
}

paso(1, 'Entrar');
exigir('enrolar', await llamar('/api/auth/enrolar', { codigo }));
const { empleados } = exigir('empleados', await llamar('/api/auth/empleados'));
exigir('entrar', await llamar('/api/auth/entrar', { empleoId: empleados[0].empleoId, pin: PIN }));

paso(2, 'Leer la configuración actual');
const inicial = exigir(
  'GET /api/catalogo/configuracion',
  await llamar('/api/catalogo/configuracion'),
);
console.log(
  `  IVA actual: ${String(inicial.impuestoPuntosBase / 100)} % · incluido en precio: ${String(inicial.impuestoIncluidoEnPrecio)}`,
);

/** Lo que se manda de vuelta al guardar. La versión avanza en cada escritura. */
let configuracion = {
  version: inicial.version,
  nombreNegocio: inicial.nombreNegocio,
  telefono: inicial.telefono,
  direccion: inicial.direccion,
  logoUrl: inicial.logoUrl,
  colorPrimario: inicial.colorPrimario,
  colorAcento: inicial.colorAcento,
  estilo: inicial.estilo,
  paquete: inicial.paquete,
  impuestoIncluidoEnPrecio: inicial.impuestoIncluidoEnPrecio,
};

try {
  paso(3, 'Poner una venta con una línea');
  const { productos } = exigir('buscar', await llamar('/api/venta/buscar', { limite: 3 }));
  const { ordenId } = exigir('crear orden', await llamar('/api/venta/crear-orden', {}));
  exigir(
    'agregar línea',
    await llamar('/api/venta/agregar-linea', {
      ordenId,
      productoId: productos[0].id,
      cantidad: '1',
    }),
  );

  const con16 = exigir('cotizar con 16 %', await llamar('/api/venta/estado', { ordenId }));
  console.log(
    `  total ${con16.cotizacion.totalCentavos} · impuesto ${con16.cotizacion.impuestosCentavos}`,
  );

  paso(4, 'Bajar el IVA a 8 % desde configuración');
  const guardado = exigir('POST /api/catalogo/configuracion', await guardarIva(configuracion, 800));
  configuracion = { ...configuracion, version: guardado.version };

  const con8 = exigir('cotizar con 8 %', await llamar('/api/venta/estado', { ordenId }));
  console.log(
    `  total ${con8.cotizacion.totalCentavos} · impuesto ${con8.cotizacion.impuestosCentavos}`,
  );

  paso(5, 'Comprobar');
  if (con8.cotizacion.impuestosCentavos === con16.cotizacion.impuestosCentavos) {
    console.error('✗ el impuesto NO cambió: la cotización sigue usando la constante del código.');
    process.exit(1);
  }
  if (con8.cotizacion.totalCentavos !== con16.cotizacion.totalCentavos) {
    console.error(
      '✗ con el impuesto INCLUIDO en el precio, el total no debe cambiar al bajar la tasa: ' +
        'el precio de mostrador es el mismo, sólo cambia cuánto de él es impuesto.',
    );
    process.exit(1);
  }
  console.log('✓ el impuesto extraído cambió y el precio de mostrador se mantuvo');
} finally {
  paso(6, 'Restaurar el 16 %');
  const actual = await llamar('/api/catalogo/configuracion');
  const r = await guardarIva({ ...configuracion, version: actual.datos.datos.version }, 1600);
  console.log(
    r.estado === 200 ? '✓ IVA restaurado al 16 %' : `✗ NO se restauró: HTTP ${String(r.estado)}`,
  );
}

console.log(`\n✓ IMPUESTO CONFIGURABLE EN VERDE contra ${BASE}\n`);
