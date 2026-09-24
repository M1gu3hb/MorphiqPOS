/**
 * EL NEGOCIO SOBRE EL QUE CORRE UN GUION DE HUMO, y la negativa si no es una demo
 * (bloques B.3 y B.6 de la 2.4).
 *
 * ── Qué había ──────────────────────────────────────────────────────────────
 * `humo-venta`, `humo-turno`, `humo-accesos` y `humo-impuesto` entraban con
 * `empleados[0]`, y `humo-archivos` con el primer «Demo». Contra producción, que sirve
 * a Restaurante MH, eso podía ser el cajero de un negocio real: `humo-accesos` le
 * habría cambiado el PIN y `humo-impuesto` el IVA. Y la negativa llegaba TARDE: un PIN
 * mal tecleado contra un negocio real ya escribe en su credencial (`entrar.ts`, los
 * intentos fallidos), aunque el guion se niegue después.
 *
 * ── Qué hay ────────────────────────────────────────────────────────────────
 * Todos piden el negocio EXPLÍCITO —`--negocio <slug>` o `MORPHIQPOS_ORG_DEMO`— y lo
 * comprueban contra la lista de demos, por ID, ANTES DE CUALQUIER PETICIÓN: ni la
 * lista de empleados se pide si el negocio no es una demo. Después sólo eligen gente
 * de esa demo, y se niegan si la respuesta trae a alguien sin su marca.
 */
const { DEMOS, exigirDemo } = await import('../../packages/contracts/src/negocios/index.ts');

function bandera(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/**
 * La demo de esta corrida. Sale del proceso con 1 si falta o si no es una demo; nunca
 * devuelve otra cosa.
 */
export function demoDeLaCorrida(guion) {
  const slug = bandera('negocio') ?? process.env['MORPHIQPOS_ORG_DEMO'] ?? '';
  if (slug === '') {
    console.error(
      [
        `✗ ${guion}: falta el negocio. Este guion ESCRIBE, y sólo corre sobre una demostración`,
        '  que se le nombra: --negocio <slug> (o MORPHIQPOS_ORG_DEMO).',
        `  Las demos: ${DEMOS.map((d) => d.slug).join(', ')}.`,
      ].join('\n'),
    );
    process.exit(1);
  }
  try {
    return exigirDemo({ slug }, guion);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * La lista de empleados DE ESA DEMO, pedida por su dirección. Falla cerrada: si la
 * respuesta trae a una sola persona sin la marca de la demo, no se sigue.
 */
export async function empleadosDeLaDemo(llamar, demo) {
  const ruta = `/api/auth/empleados?negocio=${encodeURIComponent(demo.slug)}`;
  const respuesta = await llamar(ruta);
  if (respuesta.estado !== 200 || respuesta.datos?.ok !== true) {
    console.error(
      `✗ GET ${ruta} → ${String(respuesta.estado)}. El despliegue no sirve a «${demo.slug}».`,
    );
    process.exit(1);
  }
  const empleados = respuesta.datos.datos?.empleados ?? [];
  const ajenos = empleados.filter((e) => e.negocioSlug !== demo.slug);
  if (empleados.length === 0 || ajenos.length > 0) {
    console.error(
      `✗ La lista de «${demo.slug}» trae ${String(ajenos.length)} persona(s) sin su marca ` +
        `(de ${String(empleados.length)}). No se entra: podría ser gente de otro negocio.`,
    );
    process.exit(1);
  }
  return empleados;
}

/** Una persona de la demo por su ROL del servidor (`dueno`, `cajero`…). */
export function personaConRol(empleados, rol) {
  const persona = empleados.find((e) => e.rol === rol);
  if (persona === undefined) {
    console.error(
      `✗ La demo no tiene a nadie con rol «${rol}». Resetéala: \`node --conditions=react-server scripts/sembrar-demos.mjs --solo <slug>\`.`,
    );
    process.exit(1);
  }
  return persona;
}

/** Los PIN publicados de las demos (docs/fase-2/ACCESOS-DEMO.md §2), por rol. */
export const PIN_DE_DEMO = {
  dueno: '1234',
  gerente: '2345',
  cajero: '3456',
  mesero: '4567',
  cocina: '5678',
  almacen: '6789',
};
