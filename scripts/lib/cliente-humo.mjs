/**
 * Cliente HTTP mínimo para los guiones de humo.
 *
 * Vive aparte porque lo comparten `humo-venta.mjs` y `humo-accesos.mjs`, y
 * porque el tarro de cookies tiene que ser el mismo entre pasos: la cookie de
 * dispositivo la pone el enrolamiento y la de sesión el PIN, y sin conservarlas
 * los pasos siguientes son anónimos.
 *
 * `fetch` de Node no guarda cookies. Nadie las guarda por ti.
 */

/** Cookie a cookie, como haría el navegador. */
export const tarro = new Map();

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

/** Un 500 de Next devuelve HTML, no JSON: hay que poder enseñarlo igual. */
function interpretar(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return { crudo: texto.slice(0, 200) };
  }
}

export async function llamar(base, ruta, cuerpo, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: cuerpo === undefined ? 'GET' : 'POST',
    headers: {
      ...(cuerpo === undefined ? {} : { 'content-type': 'application/json' }),
      'idempotency-key': opciones.clave ?? crypto.randomUUID(),
      // Sin esta cabecera, `peticionDeEscrituraValida` rechaza la escritura.
      // Un formulario de otro origen no puede ponerla sin disparar el preflight.
      'x-morphiqpos-request': '1',
      origin: base,
      ...(tarro.size === 0 ? {} : { cookie: cabeceraCookie() }),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    redirect: 'manual',
  });
  guardarCookies(respuesta);
  return { estado: respuesta.status, datos: interpretar(await respuesta.text()) };
}

export function exigir(nombre, r, predicado = (x) => x.estado === 200 && x.datos?.ok !== false) {
  if (!predicado(r)) {
    console.error(`✗ ${nombre}: HTTP ${String(r.estado)} ${JSON.stringify(r.datos).slice(0, 300)}`);
    process.exit(1);
  }
  console.log(`✓ ${nombre}`);
  return r.datos?.datos ?? r.datos;
}

export const paso = (n, t) => {
  console.log(`\n── ${String(n)} · ${t} ─────────────────────────`);
};
