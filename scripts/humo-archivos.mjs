#!/usr/bin/env node
/**
 * HUMO DEL ALMACÉN · subir una imagen al despliegue y leerla de vuelta, desde fuera.
 *
 *   node scripts/humo-archivos.mjs --base https://<despliegue> [--pin 1234]
 *
 * El logo del negocio y las fotos del menú son parte del diseño: sin almacén, media
 * fase de interfaz no se ve. `VERCEL-ENTORNO §8` dejó las cuatro variables puestas y las
 * cinco operaciones probadas contra el proyecto — desde esta máquina. Esto lo prueba
 * como lo usa la aplicación: por HTTP, con sesión, por `/api/archivos/subir`, y después
 * pidiendo la imagen por la URL que la subida devolvió.
 *
 * Entra como la persona que se llama «Demo» —el dueño de las demostraciones—, así que
 * SÓLO sirve contra un despliegue que sirve una demostración: se niega si la lista de
 * personas no la trae. Para un despliegue detrás del muro de Vercel, la cookie de un
 * enlace compartido va en `MORPHIQPOS_COOKIE_VERCEL` (`_vercel_jwt=…`), como en
 * `verify:acople`. Ningún valor se imprime.
 */
import { deflateSync } from 'node:zlib';

import { exigir, llamar as llamarBase, paso, tarro } from './lib/cliente-humo.mjs';

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const BASE = bandera('base', 'http://localhost:3200');
const PIN = bandera('pin', '1234');
const llamar = (ruta, cuerpo) => llamarBase(BASE, ruta, cuerpo);

const COOKIE_DEL_MURO = process.env['MORPHIQPOS_COOKIE_VERCEL'] ?? '';
if (COOKIE_DEL_MURO !== '') {
  const igual = COOKIE_DEL_MURO.indexOf('=');
  tarro.set(COOKIE_DEL_MURO.slice(0, igual).trim(), COOKIE_DEL_MURO.slice(igual + 1).trim());
}

/** Un PNG de 32×32 de un solo color, armado a mano: sin archivos en el repositorio. */
function pngDePrueba() {
  const crc = (bytes) => {
    let c = ~0;
    for (const b of bytes) {
      c ^= b;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const suma = Buffer.alloc(4);
    suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const lado = 32;
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const fila = Buffer.concat([Buffer.from([0]), Buffer.alloc(lado * 3, 0)]);
  for (let x = 0; x < lado; x += 1) fila.set([30, 64, 175], 1 + x * 3);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', cabecera),
    trozo('IDAT', deflateSync(Buffer.concat(Array.from({ length: lado }, () => fila)))),
    trozo('IEND', Buffer.alloc(0)),
  ]);
}

function cabeceraCookie() {
  return [...tarro].map(([k, v]) => `${k}=${v}`).join('; ');
}

paso(1, 'Quién puede entrar');
const { empleados } = exigir('GET /api/auth/empleados', await llamar('/api/auth/empleados'));
const demo = Array.isArray(empleados) ? empleados.find((e) => e.nombre === 'Demo') : undefined;
if (demo === undefined) {
  console.error(
    '✗ Este despliegue no sirve una demostración (no hay nadie llamado «Demo»). Esta prueba ' +
      'escribe en el almacén del negocio: no se corre contra uno de verdad.',
  );
  process.exit(1);
}

paso(2, 'Entrar como el dueño de la demostración');
exigir(
  'POST /api/auth/entrar',
  await llamar('/api/auth/entrar', { empleoId: demo.empleoId, pin: PIN }),
);

paso(3, 'Subir una imagen');
const imagen = pngDePrueba();
const formulario = new FormData();
formulario.append('archivo', new Blob([imagen], { type: 'image/png' }), 'humo.png');
const cuerpo = new Response(formulario);
const bytes = Buffer.from(await cuerpo.arrayBuffer());
const subida = await fetch(`${BASE}/api/archivos/subir`, {
  method: 'POST',
  headers: {
    'content-type': cuerpo.headers.get('content-type') ?? '',
    'content-length': String(bytes.length),
    'x-morphiqpos-request': '1',
    'idempotency-key': crypto.randomUUID(),
    origin: BASE,
    cookie: cabeceraCookie(),
  },
  body: bytes,
  redirect: 'manual',
});
const respuesta = await subida.json().catch(() => ({}));
const url = respuesta?.datos?.file_url ?? respuesta?.file_url;
if (subida.status !== 200 || typeof url !== 'string') {
  console.error(
    `✗ POST /api/archivos/subir: HTTP ${String(subida.status)} ${JSON.stringify(respuesta).slice(0, 300)}`,
  );
  process.exit(1);
}
console.log(`✓ POST /api/archivos/subir → ${new URL(url).pathname.replace(/[^/]+$/, '…')}`);

paso(4, 'Leerla de vuelta por su URL');
const leida = await fetch(`${BASE}${new URL(url).pathname}`, {
  headers: { cookie: cabeceraCookie() },
});
const tipo = leida.headers.get('content-type') ?? '';
const recibidos = Buffer.from(await leida.arrayBuffer());
if (leida.status !== 200 || !tipo.startsWith('image/') || recibidos.length === 0) {
  console.error(
    `✗ GET de la imagen: HTTP ${String(leida.status)} · ${tipo} · ${String(recibidos.length)} bytes`,
  );
  process.exit(1);
}
console.log(`✓ GET de la imagen → 200 · ${tipo} · ${String(recibidos.length)} bytes`);
console.log('\n✓ El almacén de este despliegue guarda y devuelve imágenes.');
