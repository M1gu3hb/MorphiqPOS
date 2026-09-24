#!/usr/bin/env node
/**
 * Humo de accesos: poner un PIN desde la aplicación (F1.1-C-05), contra un
 * servidor REAL.
 *
 *   node scripts/humo-accesos.mjs --negocio demo-acople-<giro> [--base URL] [--pin 1234]
 *
 * Comprueba lo que más importa: que **la respuesta nunca contiene el PIN ni su
 * hash**, que el PIN nuevo sirve y el viejo deja de servir, y que un navegador
 * SIN cookie de dispositivo puede entrar — que es lo que se ganó al retirar el
 * enrolamiento por código de seis dígitos.
 *
 * ── Lo que cambió en la 2.4 (bloque B.3) ──────────────────────────────────
 * Entraba con `empleados[0]` y le cambiaba el PIN al primero de la lista a 735192,
 * y NO se lo devolvía: contra producción eso podía ser el cajero de Restaurante MH, y
 * contra una demo la dejaba sin poder entrar con el PIN que `ACCESOS-DEMO.md` publica
 * —la primera corrida automática habría dejado el CI rojo para siempre—. Ahora:
 *   · el negocio es explícito y tiene que ser una demo, comprobado ANTES de pedir nada;
 *   · el objetivo es el CAJERO de esa demo, no «el primero»;
 *   · al terminar —salga bien o mal— su PIN vuelve al publicado (3456).
 */
import { llamar, exigir, paso, tarro } from './lib/cliente-humo.mjs';
import {
  demoDeLaCorrida,
  empleadosDeLaDemo,
  personaConRol,
  PIN_DE_DEMO,
} from './lib/demo-de-la-corrida.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3000');

// ANTES DE CUALQUIER PETICIÓN: el negocio es explícito y es una demo (bloque B.3).
const DEMO = demoDeLaCorrida('humo-accesos');

const PIN = bandera('pin', PIN_DE_DEMO.dueno);
const PIN_NUEVO = '735192';
const llamarAqui = (ruta, cuerpo) => llamar(BASE, ruta, cuerpo);

async function entrarComo(empleoId, pin, nombre) {
  return exigir(
    nombre,
    await llamar(BASE, '/api/auth/entrar', { empleoId, pin, negocio: DEMO.slug }),
  );
}

paso(1, 'Entrar como dueño');
const empleados = await empleadosDeLaDemo(llamarAqui, DEMO);
const dueno = personaConRol(empleados, 'dueno');
await entrarComo(dueno.empleoId, PIN, 'entrar');

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

// El objetivo: el cajero de ESTA demo. Tiene un PIN publicado al que volver.
const objetivo = accesos.empleados.find((e) => e.rol === 'cajero');
if (objetivo === undefined) {
  console.error('✗ La demo no tiene cajero. Resetéala antes de correr este humo.');
  process.exit(1);
}

let fallo = null;
try {
  paso(3, `Cambiar el PIN de ${objetivo.nombre} (cajero)`);
  const cambio = exigir(
    'POST /api/identidad/pin',
    await llamar(BASE, '/api/identidad/pin', { empleado: objetivo.empleoId, pin: PIN_NUEVO }),
  );
  if (JSON.stringify(cambio).includes(PIN_NUEVO)) {
    throw new Error('FUGA: la respuesta del cambio de PIN contiene el PIN.');
  }
  console.log(
    `  ${objetivo.nombre}: ${cambio.rotado ? 'PIN rotado' : 'PIN creado'}, sin eco del PIN`,
  );

  paso(4, 'Un navegador SIN cookie de dispositivo entra, y se da de alta solo');
  tarro.clear(); // dispositivo nuevo: se empieza de cero, sin código que teclear
  await entrarComo(
    objetivo.empleoId,
    PIN_NUEVO,
    'entrar con el PIN nuevo desde un dispositivo nuevo',
  );

  paso(5, 'El PIN viejo ya no sirve');
  const viejo = await llamar(BASE, '/api/auth/entrar', {
    empleoId: objetivo.empleoId,
    pin: PIN_DE_DEMO.cajero,
    negocio: DEMO.slug,
  });
  if (viejo.estado === 200)
    throw new Error('el PIN anterior sigue funcionando después de rotarlo.');
  console.log(`✓ rechazado con ${String(viejo.estado)}`);
} catch (error) {
  fallo = error;
} finally {
  // DEVOLVER EL PIN, pase lo que pase: la demo queda con el PIN publicado.
  paso(6, `Devolverle a ${objetivo.nombre} su PIN publicado`);
  tarro.clear();
  await entrarComo(dueno.empleoId, PIN, 'entrar otra vez como dueño');
  exigir(
    'POST /api/identidad/pin (el publicado)',
    await llamar(BASE, '/api/identidad/pin', {
      empleado: objetivo.empleoId,
      pin: PIN_DE_DEMO.cajero,
    }),
  );
  tarro.clear();
  await entrarComo(objetivo.empleoId, PIN_DE_DEMO.cajero, 'el PIN publicado vuelve a servir');
}

if (fallo !== null) {
  console.error(`✗ ${fallo instanceof Error ? fallo.message : String(fallo)}`);
  process.exit(1);
}
console.log(`\n✓ ACCESOS EN VERDE contra ${BASE} · «${DEMO.slug}» con su PIN publicado\n`);
