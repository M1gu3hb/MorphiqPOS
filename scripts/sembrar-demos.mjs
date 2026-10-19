#!/usr/bin/env node
/**
 * Siembra LAS CINCO demostraciones del acople, sin levantar cinco servidores.
 *
 *   node --conditions=react-server scripts/sembrar-demos.mjs [--solo <slug>]
 *
 * ── Por qué existe además de `sembrar-demo.mjs` ────────────────────────────
 * El otro siembra por HTTP, que es lo correcto para comprobar que la ruta y la
 * sesión funcionan. Pero un despliegue sirve a UN negocio (R16), así que sembrar
 * las cinco por HTTP son cinco arranques de servidor con su `ORGANIZACION`
 * distinta — quince minutos y cinco oportunidades de dejar una a medias.
 *
 * Esto ejecuta el MISMO comando, `configuracion.resetear_demo`, con las mismas
 * dependencias de producción: la misma transacción, el mismo gate de rol, la
 * misma auditoría. Lo único que no pasa por HTTP es el ámbito, que aquí se
 * construye leyendo la organización, su sucursal y su dueño de la base.
 *
 * ── La guarda, que es lo primero ───────────────────────────────────────────
 * Este comando BORRA el catálogo, el inventario y las ventas de la organización
 * sobre la que corre. Sobre uno de los cuatro negocios que cobran, eso es el día
 * de trabajo de alguien. Por eso sólo acepta slugs que empiecen por
 * `demo-acople-`, y además rechaza explícitamente los cuatro por su slug:
 * `F2.3-REGLAS §4.5`.
 */
import { existsSync, readFileSync } from 'node:fs';

/**
 * El `.env` a mano: este script no pasa por Next, que es quien lo carga.
 *
 * Y SI NO HAY, no pasa nada: en CI las variables llegan por el entorno del
 * trabajo y el archivo no existe. Antes esto reventaba con `ENOENT .env` antes de
 * leer una sola variable, lo que dejaba la siembra fuera de cualquier sitio que no
 * fuera una laptop con su `.env` — y con ella el rastreador, que necesita las cinco
 * demostraciones sembradas para poder tocar algo.
 */
for (const linea of (existsSync('.env') ? readFileSync('.env', 'utf8') : '').split('\n')) {
  const encontrado = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linea.trim());
  if (encontrado !== null && process.env[encontrado[1]] === undefined) {
    process.env[encontrado[1]] = encontrado[2].replace(/^["']|["']$/g, '');
  }
}
process.env['MORPHIQPOS_DB_POOL_MAX'] ??= '3';

const { obtenerDb } = await import('../packages/data/src/cliente.ts');
const { comando } = await import('../packages/app/src/produccion.ts');
const { resetearDemo } = await import('../packages/app/src/demostracion/index.ts');
const { DEMOS, exigirDemo } = await import('../packages/contracts/src/negocios/index.ts');

/**
 * LA PLANTILLA Y EL ESTILO DE CADA DEMO ya no se ponen aquí: los repone el propio
 * `resetear_demo` (`packages/app/src/demostracion/como-nueva.ts`), para que el botón de
 * reseteo de la aplicación deje la demo igual que esta siembra. Antes vivían aquí, y un
 * reseteo desde la pantalla dejaba la plantilla cruzada y el estilo de la última prueba.
 *
 * Y la lista de negocios vivos tampoco: la regla es POSITIVA y está en
 * `packages/contracts/src/negocios` —sólo se siembra lo que está en `DEMOS`, por ID—.
 */

const soloEste = process.argv.includes('--solo')
  ? process.argv[process.argv.indexOf('--solo') + 1]
  : null;

/**
 * El sello de esta corrida, para la clave de idempotencia.
 *
 * Lleva la hora: sembrar dos veces el mismo día es lo normal mientras se
 * construye, y con sólo la fecha la segunda corrida devolvería la primera sin
 * volver a sembrar — que es lo contrario de lo que se quiere aquí.
 */
const sello = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 14);

const db = obtenerDb();

// Las demos, POR ID y de la lista compartida. Esto era `slug like 'demo-acople-%'`:
// correcto hoy, pero es una regla de prefijo, y tres de los cuatro negocios reales
// tienen un slug que empieza por `demo-`.
const demos = await db
  .selectFrom('organizaciones')
  .select(['id', 'slug', 'nombre', 'giro', 'paquete'])
  .where(
    'id',
    'in',
    DEMOS.map((d) => d.id),
  )
  .where('activa', '=', true)
  .orderBy('slug')
  .execute();

if (demos.length === 0) {
  console.error('✗ No hay ninguna demostración activa. Créalas con `db:alta-negocio`.');
  process.exit(1);
}
if (soloEste !== null && !demos.some((d) => d.slug === soloEste)) {
  // `--solo` con un negocio que no es una demo: se dice ANTES de tocar nada.
  try {
    exigirDemo({ slug: soloEste }, 'sembrar-demos');
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
}

let fallos = 0;

for (const demo of demos) {
  if (soloEste !== null && demo.slug !== soloEste) continue;

  // Segundo cerrojo, por ID y slug a la vez: la consulta ya filtró por la lista, así
  // que esto no puede fallar HOY. Se queda por si alguien cambia la consulta.
  exigirDemo({ id: demo.id, slug: demo.slug }, 'sembrar-demos');

  const sucursal = await db
    .selectFrom('sucursales')
    .select('id')
    .where('organizacion_id', '=', demo.id)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (sucursal === undefined) {
    console.error(`✗ «${demo.slug}» no tiene sucursal. \`db:alta-negocio\` crea la primera.`);
    fallos += 1;
    continue;
  }

  // El dueño, que es quien puede resetear. `resetearDemo` declara
  // `roles: ['dueno','administrador']` a propósito: borra el negocio entero.
  const dueno = await db
    .selectFrom('empleos')
    .innerJoin('personas', 'personas.id', 'empleos.persona_id')
    .innerJoin('identidades', 'identidades.persona_id', 'personas.id')
    .select(['empleos.id as empleoId', 'identidades.id as identidadId'])
    .where('empleos.organizacion_id', '=', demo.id)
    .where('empleos.rol', '=', 'dueno')
    .where('empleos.activo', '=', true)
    .executeTakeFirst();
  if (dueno === undefined) {
    console.error(
      `✗ «${demo.slug}» no tiene dueño. Lo crea \`db:bootstrap --org ${demo.slug}\`, que es otro paso.`,
    );
    fallos += 1;
    continue;
  }

  const resultado = await comando(resetearDemo, {
    ambito: {
      organizacionId: demo.id,
      sucursalId: sucursal.id,
      // No hay terminal en el ámbito: esto no corre desde una caja. La terminal
      // en la que abre la sesión de caja la resuelve `sembrarArranque`.
      terminalId: null,
      identidadId: dueno.identidadId,
      empleoId: dueno.empleoId,
      rol: 'dueno',
    },
    entrada: { confirmacion: 'RESETEAR' },
    // La clave de idempotencia es OBLIGATORIA para todo comando que escribe: es
    // lo que evita cobrar dos veces. Aquí se deriva del slug y del día, así que
    // dos corridas seguidas del mismo día devuelven la primera en vez de sembrar
    // dos veces — que es exactamente lo que la clave existe para hacer.
    idempotencyKey: `sembrar-demos:${demo.slug}:${sello}`,
  });

  if (!resultado.ok) {
    console.error(`✗ «${demo.slug}»: ${resultado.error.codigo} · ${resultado.error.mensaje ?? ''}`);
    fallos += 1;
    continue;
  }

  const d = resultado.datos;
  const partes = [
    `${String(d.productos)} vendibles`,
    `${String(d.insumos)} insumos`,
    `${String(d.empleados)} empleados`,
    `caja con $${(Number(d.arranque.fondoCentavos) / 100).toFixed(2)}`,
    d.arranque.proveedor,
  ];
  if (d.bebidas !== null && d.bebidas !== undefined) {
    partes.push(
      `${String(d.bebidas.opcionesDeBebida)} opciones de bebida en ${String(d.bebidas.bebidasConOpciones)} bebidas`,
    );
  }
  if (d.sala !== null) partes.push(`${String(d.sala.mesas)} mesas`);
  if (d.salon !== null) {
    partes.push(`${String(d.salon.profesionales)} profesionales`);
    partes.push(`${String(d.salon.servicios)} servicios`);
  }
  console.log(`  ✓ ${demo.slug.padEnd(26)} ${partes.join(' · ')}`);
}

console.log(
  fallos === 0
    ? '\n✓ Las demostraciones están sembradas.\n'
    : `\n✗ ${String(fallos)} demostración(es) sin sembrar.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
