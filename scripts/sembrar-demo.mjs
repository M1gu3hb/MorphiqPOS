#!/usr/bin/env node
/**
 * Siembra una organización de demostración con el comando REAL (F1.1-C-14).
 *
 *   node scripts/sembrar-demo.mjs [--org <slug>] [--base URL] [--pin 4821]
 *
 * Hasta F1.1 los datos de Supabase eran atrezzo insertado por SQL directo en
 * las migraciones 042 y 043: ni una fila había pasado por un comando, y
 * `auditoria` lo delataba con cero filas. Esto los siembra por la puerta de
 * siempre — sesión, rol, transacción, idempotencia y rastro.
 *
 * ── Por qué ya no siembra las tres de golpe ────────────────────────────────
 * Al retirarse el enrolamiento de terminal (T2 del port del restaurante), la
 * pantalla de acceso necesita saber a qué negocio sirve el despliegue, y eso lo
 * dice `ORGANIZACION` en el servidor. Un mismo servidor ya no puede atender a
 * tres organizaciones distintas por HTTP, así que este script siembra la que le
 * digas — y esa tiene que ser la misma que tenga el servidor.
 *
 * Corre `db:bootstrap`, entra y ejecuta `resetearDemo`.
 */
import { spawnSync } from 'node:child_process';

import { exigir, llamar as llamarBase, paso } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');
const SLUG = bandera('org', 'demo-ferreteria-la-broca');

const PERSONAS = {
  'demo-ferreteria-la-broca': 'Elena',
  'demo-abarrotes-don-chuy': 'Jesús',
  'demo-cafe-jacaranda': 'Mariana',
};

const persona = bandera('persona', PERSONAS[SLUG] ?? 'Encargada');

/** Corre `pnpm db:bootstrap`. Falla ruidosamente si el arranque no pudo. */
function arrancar(slug, nombrePersona) {
  // `node` directo y no `pnpm`: en Windows `spawnSync` con un `.cmd` necesita
  // shell, y con shell el nombre con acento de la persona se rompe. El binario
  // del arranque es el mismo que ejecuta `pnpm db:bootstrap`.
  const salida = spawnSync(
    process.execPath,
    [
      '--conditions=react-server',
      'packages/app/bin/bootstrap.mjs',
      '--org',
      slug,
      '--persona',
      nombrePersona,
      '--pin',
      PIN,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (salida.status !== 0) {
    console.error(`✗ el arranque de ${slug} falló:\n${salida.stdout ?? ''}${salida.stderr ?? ''}`);
    process.exit(1);
  }
  console.log(`  dueño ${nombrePersona} con PIN listo`);
}

const llamar = (ruta, cuerpo) => llamarBase(BASE, ruta, cuerpo);

paso(1, `Dar de alta al dueño de ${SLUG}`);
arrancar(SLUG, persona);

paso(2, 'Entrar');
const { empleados } = exigir('empleados', await llamar('/api/auth/empleados'));
if (!Array.isArray(empleados) || empleados.length === 0) {
  console.error(
    `✗ El servidor no lista a nadie. ¿Tiene ORGANIZACION=${SLUG}?\n` +
      '  La pantalla de acceso sirve a UN negocio, y tiene que ser el mismo que siembras.',
  );
  process.exit(1);
}
exigir('entrar', await llamar('/api/auth/entrar', { empleoId: empleados[0].empleoId, pin: PIN }));

paso(3, 'Sembrar el catálogo con el comando real');
const sembrado = exigir(
  'resetear demostración',
  await llamar('/api/catalogo/demostracion/resetear', { confirmacion: 'RESETEAR' }),
);
console.log(
  `  ${String(sembrado.productos)} producto(s) y ${String(sembrado.insumos)} insumo(s), con rastro en auditoría`,
);

console.log('\n═══ Listo para la demostración ═══\n');
console.log(`  ${SLUG.padEnd(28)} ${persona.padEnd(10)} PIN ${PIN}`);
console.log('\n  Abre /login-pos, toca el nombre y teclea el PIN.\n');
