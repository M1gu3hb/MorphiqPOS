#!/usr/bin/env node
/**
 * `pnpm db:bootstrap` — la puerta al sistema cerrado (F1.1-C-04).
 *
 *   pnpm db:bootstrap --org demo-ferreteria-la-broca --persona "Elena" --pin 4821
 *   pnpm db:bootstrap --org demo-cafe-jacaranda --persona "Mariana" --pin 1357 --terminal Barra
 *
 * Deja lista una cuenta de dueño con PIN y escupe el código de enrolamiento de
 * seis dígitos que hay que teclear una vez en `/enrolar`.
 *
 * **El PIN se pasa por argumento y eso deja rastro en el historial del shell.**
 * Es aceptable porque este script se corre una vez, en la máquina del
 * desarrollador, y el PIN se cambia después desde la aplicación. Si te importa,
 * pásalo por `MORPHIQPOS_PIN` en vez de `--pin`.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: [join(RAIZ, '.env.local'), join(RAIZ, '.env'), '.env.local', '.env'], quiet: true });

function bandera(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const organizacionSlug = bandera('org');
const nombrePersona = bandera('persona');
const pin = bandera('pin') ?? process.env['MORPHIQPOS_PIN'];
const nombreTerminal = bandera('terminal');
const pimienta = process.env['PIN_PEPPER'];

if (organizacionSlug === undefined || nombrePersona === undefined || pin === undefined) {
  console.error(
    'Uso: pnpm db:bootstrap --org <slug> --persona "<nombre>" --pin <4-8 dígitos> [--terminal "<nombre>"]',
  );
  process.exit(1);
}
if (pimienta === undefined || pimienta.length === 0) {
  console.error('Falta PIN_PEPPER en .env. Sin pimienta el hash del PIN no se calcula.');
  process.exit(1);
}

const { prepararPrimerAcceso } = await import('../src/arranque/primer-acceso.ts');
const { cerrarDb } = await import('@morphiqpos/data');

try {
  const r = await prepararPrimerAcceso({
    organizacionSlug,
    nombrePersona,
    pin,
    pimienta,
    nombreTerminal,
  });

  console.log('');
  console.log(`  Negocio ....... ${r.organizacion}`);
  console.log(`  Sucursal ...... ${r.sucursal}`);
  console.log(`  Terminal ...... ${r.terminal}`);
  console.log(`  Dueño ......... ${r.persona}`);
  console.log(`  PIN ........... ${r.pinRotado ? 'ROTADO' : 'creado'} (${pin.length} dígitos)`);
  console.log('');
  console.log(`  ┌──────────────────────────────────────────┐`);
  console.log(`  │  Código de enrolamiento:  ${r.codigoEnrolamiento}          │`);
  console.log(`  └──────────────────────────────────────────┘`);
  console.log(`  Caduca ${r.expiraEn.toLocaleTimeString('es-MX')}. Tecléalo en /enrolar.`);
  console.log('');
} catch (error) {
  console.error('');
  console.error('✗ El arranque falló. La base quedó como estaba.');
  console.error('');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  process.exitCode = 1;
} finally {
  await cerrarDb();
}
