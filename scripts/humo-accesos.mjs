#!/usr/bin/env node
/**
 * Humo de accesos: poner un PIN desde la aplicación (F1.1-C-05), contra un
 * servidor REAL.
 *
 *   node scripts/humo-accesos.mjs [--base URL] [--pin 4821]
 *
 * Comprueba lo que más importa: que **la respuesta nunca contiene el PIN ni su
 * hash**, que el PIN nuevo sirve y el viejo deja de servir, y que un navegador
 * SIN cookie de dispositivo puede entrar — que es lo que se ganó al retirar el
 * enrolamiento por código de seis dígitos.
 */
import { llamar, exigir, paso, tarro } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');
const PIN_NUEVO = '735192';

paso(1, 'Entrar como dueño');
const { empleados } = exigir('empleados', await llamar(BASE, '/api/auth/empleados'));
exigir(
  'entrar',
  await llamar(BASE, '/api/auth/entrar', { empleoId: empleados[0].empleoId, pin: PIN }),
);

paso(2, 'Leer los accesos de la organización');
const accesos = exigir('GET /api/identidad/accesos', await llamar(BASE, '/api/identidad/accesos'));
console.log(
  `  ${String(accesos.empleados.length)} empleado(s), ${String(accesos.terminales.length)} caja(s), rol ${accesos.rol}`,
);

const crudo = JSON.stringify(accesos);
if (/\$argon2|pin_hash|pinHash/.test(crudo)) {
  console.error('✗ FUGA: la respuesta de accesos contiene el hash del PIN.');
  process.exit(1);
}
console.log('✓ la respuesta no contiene hash de PIN');

paso(3, 'Cambiar el PIN de un empleado');
const objetivo = accesos.empleados[0];
const cambio = exigir(
  'POST /api/identidad/pin',
  await llamar(BASE, '/api/identidad/pin', { empleado: objetivo.empleoId, pin: PIN_NUEVO }),
);
if (JSON.stringify(cambio).includes(PIN_NUEVO)) {
  console.error('✗ FUGA: la respuesta del cambio de PIN contiene el PIN.');
  process.exit(1);
}
console.log(
  `  ${objetivo.nombre}: ${cambio.rotado ? 'PIN rotado' : 'PIN creado'}, sin eco del PIN`,
);

paso(4, 'Un navegador SIN cookie de dispositivo entra, y se da de alta solo');
tarro.clear(); // dispositivo nuevo: se empieza de cero, sin código que teclear
const nuevos = exigir('empleados', await llamar(BASE, '/api/auth/empleados'));
exigir(
  'entrar con el PIN nuevo desde un dispositivo nuevo',
  await llamar(BASE, '/api/auth/entrar', {
    empleoId: nuevos.empleados[0].empleoId,
    pin: PIN_NUEVO,
  }),
);

paso(5, 'El PIN viejo ya no sirve');
const viejo = await llamar(BASE, '/api/auth/entrar', {
  empleoId: nuevos.empleados[0].empleoId,
  pin: PIN,
});
if (viejo.estado === 200) {
  console.error('✗ el PIN anterior sigue funcionando después de rotarlo.');
  process.exit(1);
}
console.log(`✓ rechazado con ${String(viejo.estado)}`);

console.log(`\n✓ ACCESOS EN VERDE contra ${BASE}\n`);
