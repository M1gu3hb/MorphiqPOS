#!/usr/bin/env node
/**
 * Siembra las organizaciones de demostración con el comando REAL (F1.1-C-14).
 *
 *   node scripts/sembrar-demo.mjs [--base URL] [--pin 4821]
 *
 * Hasta hoy los datos de Supabase eran atrezzo insertado por SQL directo en las
 * migraciones 042 y 043: ni una fila había pasado por un comando, y `auditoria`
 * lo delataba con cero filas. Esto los siembra por la puerta de siempre —
 * sesión, rol, transacción, idempotencia y rastro— y deja las tres cajas
 * enroladas con su PIN.
 *
 * Corre `db:bootstrap` por cada organización, entra, y ejecuta `resetearDemo`.
 * Al terminar imprime el código de enrolamiento de cada caja para que Miguel
 * pueda dar de alta un dispositivo desde el teléfono.
 */
import { spawnSync } from 'node:child_process';

import { exigir, llamar as llamarBase, paso, tarro } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3000');
const PIN = bandera('pin', '4821');

const NEGOCIOS = [
  { slug: 'demo-ferreteria-la-broca', persona: 'Elena' },
  { slug: 'demo-abarrotes-don-chuy', persona: 'Jesús' },
  { slug: 'demo-cafe-jacaranda', persona: 'Mariana' },
];

/** Corre `pnpm db:bootstrap` y devuelve el código de enrolamiento. */
function arrancar(slug, persona) {
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
      persona,
      '--pin',
      PIN,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  const codigo = /Código de enrolamiento:\s+(\d{6})/.exec(salida.stdout ?? '')?.[1];
  if (codigo === undefined) {
    console.error(`✗ el arranque de ${slug} no dio código:\n${salida.stdout}${salida.stderr}`);
    process.exit(1);
  }
  return codigo;
}

const resumen = [];

for (const [i, negocio] of NEGOCIOS.entries()) {
  paso(i + 1, `${negocio.slug}`);

  const codigo = arrancar(negocio.slug, negocio.persona);
  // Tarro limpio por negocio: cada uno es un dispositivo distinto, y arrastrar
  // la cookie del anterior haría que el segundo entrara con la sesión del
  // primero y sembrara dos veces la misma organización.
  tarro.clear();

  const llamar = (ruta, cuerpo) => llamarBase(BASE, ruta, cuerpo);
  exigir('enrolar', await llamar('/api/auth/enrolar', { codigo }));
  const { empleados } = exigir('empleados', await llamar('/api/auth/empleados'));
  exigir('entrar', await llamar('/api/auth/entrar', { empleoId: empleados[0].empleoId, pin: PIN }));

  const sembrado = exigir(
    'resetear demostración',
    await llamar('/api/catalogo/demostracion/resetear', { confirmacion: 'RESETEAR' }),
  );
  console.log(
    `  ${String(sembrado.productos)} producto(s) y ${String(sembrado.insumos)} insumo(s), con rastro en auditoría`,
  );

  // El reseteo borró la sesión, así que se pide un código nuevo para dejar la
  // caja lista. Se hace por el comando, no por el arranque: es el camino que
  // usará Miguel desde /accesos.
  const nuevo = exigir(
    'código de alta para la caja',
    await llamar('/api/identidad/codigo', {
      terminal: exigir('accesos', await llamar('/api/identidad/accesos')).terminales[0].terminalId,
    }),
  );
  resumen.push({ negocio: negocio.slug, persona: negocio.persona, codigo: nuevo.codigo });
}

console.log('\n═══ Listo para la demostración ═══\n');
for (const r of resumen) {
  console.log(`  ${r.negocio.padEnd(28)} ${r.persona.padEnd(10)} código ${r.codigo}`);
}
console.log(`\n  PIN de todos: ${PIN}. Los códigos caducan en 15 minutos.\n`);
