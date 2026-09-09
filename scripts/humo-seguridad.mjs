#!/usr/bin/env node
/**
 * Humo de endurecimiento (F1.1-C-13), contra un servidor REAL.
 *
 *   node scripts/humo-seguridad.mjs [--base URL]
 *
 * Comprueba tres cosas que no se ven leyendo el código:
 *   1 · una escritura sin la cabecera de la aplicación se rechaza;
 *   2 · una escritura desde OTRO origen se rechaza;
 *   3 · veinte PIN seguidos desde la misma IP acaban en 429.
 *
 * No hace falta sesión: las tres se rechazan ANTES de mirarla, que es
 * justamente lo que se está probando.
 */

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3000');
/** Una IP inventada y fija: aísla esta prueba del límite de la IP real. */
const IP = `203.0.113.${String(Math.floor(Date.now() / 1000) % 250)}`;

const paso = (n, t) => {
  console.log(`\n── ${String(n)} · ${t} ─────────────────────────`);
};

async function postear(ruta, cuerpo, cabeceras = {}) {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-morphiqpos-request': '1',
      origin: BASE,
      'x-forwarded-for': IP,
      ...cabeceras,
    },
    body: JSON.stringify(cuerpo),
    redirect: 'manual',
  });
  return respuesta.status;
}

function exigirEstado(nombre, obtenido, esperados) {
  if (!esperados.includes(obtenido)) {
    console.error(`✗ ${nombre}: HTTP ${String(obtenido)}, se esperaba ${esperados.join(' o ')}`);
    process.exit(1);
  }
  console.log(`✓ ${nombre} → HTTP ${String(obtenido)}`);
}

paso(1, 'Escritura sin la cabecera de la aplicación');
exigirEstado(
  'POST /api/venta/estado sin x-morphiqpos-request',
  await postear('/api/venta/estado', {}, { 'x-morphiqpos-request': '' }),
  [403],
);
exigirEstado(
  'POST /api/auth/entrar sin x-morphiqpos-request',
  await postear(
    '/api/auth/entrar',
    { empleoId: crypto.randomUUID(), pin: '0000' },
    {
      'x-morphiqpos-request': '',
    },
  ),
  [403],
);

paso(2, 'Escritura desde otro origen');
exigirEstado(
  'POST /api/venta/cobrar con origin ajeno',
  await postear(
    '/api/venta/cobrar',
    { ordenId: crypto.randomUUID(), pagos: [] },
    {
      origin: 'https://sitio-de-otro.example',
    },
  ),
  [403],
);

paso(3, 'Veinte PIN seguidos desde la misma IP');
let ultimo = 0;
let bloqueadoEn = 0;
for (let i = 1; i <= 30; i += 1) {
  ultimo = await postear('/api/auth/entrar', { empleoId: crypto.randomUUID(), pin: '0000' });
  if (ultimo === 429 && bloqueadoEn === 0) bloqueadoEn = i;
}

if (bloqueadoEn === 0) {
  console.error('✗ treinta intentos desde la misma IP y ninguno fue rechazado con 429.');
  process.exit(1);
}
console.log(`✓ bloqueado en el intento ${String(bloqueadoEn)} (429), y sigue en ${String(ultimo)}`);

console.log(`\n✓ ENDURECIMIENTO EN VERDE contra ${BASE}\n`);
