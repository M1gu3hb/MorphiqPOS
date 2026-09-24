#!/usr/bin/env node
/**
 * Siembra UNA demostración con el comando REAL, por HTTP (F1.1-C-14).
 *
 *   node scripts/sembrar-demo.mjs --negocio demo-acople-<giro> [--base URL]
 *
 * Hasta F1.1 los datos de Supabase eran atrezzo insertado por SQL directo en
 * las migraciones 042 y 043: ni una fila había pasado por un comando, y
 * `auditoria` lo delataba con cero filas. Esto los siembra por la puerta de
 * siempre — sesión, rol, transacción, idempotencia y rastro.
 *
 * Entra como el dueño de la demo (PIN publicado, `ACCESOS-DEMO.md` §2) y ejecuta
 * `resetearDemo`, que la deja como recién nacida: catálogo, equipo con sus PIN,
 * plantilla, estilo, IVA y topes.
 *
 * ── Lo que cambió en la 2.4 (bloque B) ─────────────────────────────────────
 * Sembraba por omisión `demo-ferreteria-la-broca`, y sus otras dos opciones eran
 * Jacaranda y Don Chuy: **los tres son negocios REALES** que nacieron como demos y se
 * quedaron a cobrar. Primero les corría `db:bootstrap` —que rota el PIN del dueño— y
 * después RESETEABA su negocio entero con `empleados[0]`. Hoy el negocio es explícito,
 * tiene que estar en la lista de demos (se comprueba antes de pedir nada), no corre
 * `db:bootstrap` —las demos ya tienen dueño— y el servidor además se niega a resetear
 * cualquier cosa que no sea una demo.
 */
import { exigir, llamar as llamarBase, paso } from './lib/cliente-humo.mjs';
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

// ANTES DE CUALQUIER PETICIÓN: el negocio es explícito y es una demo.
const DEMO = demoDeLaCorrida('sembrar-demo');
const PIN = bandera('pin', PIN_DE_DEMO.dueno);

const llamar = (ruta, cuerpo) => llamarBase(BASE, ruta, cuerpo);

paso(1, `Entrar como el dueño de ${DEMO.slug}`);
const empleados = await empleadosDeLaDemo(llamar, DEMO);
const dueno = personaConRol(empleados, 'dueno');
exigir(
  'entrar',
  await llamar('/api/auth/entrar', { empleoId: dueno.empleoId, pin: PIN, negocio: DEMO.slug }),
);

paso(2, 'Sembrar con el comando real');
const sembrado = exigir(
  'resetear demostración',
  await llamar('/api/catalogo/demostracion/resetear', { confirmacion: 'RESETEAR' }),
);
console.log(
  `  ${String(sembrado.productos)} producto(s) y ${String(sembrado.insumos)} insumo(s), con rastro en auditoría`,
);

console.log('\n═══ Listo para la demostración ═══\n');
console.log(`  ${DEMO.slug.padEnd(28)} ${dueno.nombre.padEnd(10)} PIN ${PIN}`);
console.log(`\n  Entrada: ${BASE}/n/${DEMO.slug}/login-pos\n`);
