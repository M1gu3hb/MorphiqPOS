#!/usr/bin/env node
/**
 * Da de alta un negocio y su primera sucursal.
 *
 *   node --conditions=react-server scripts/alta-negocio.mjs \
 *     --slug mh-restaurante --nombre "Restaurante MH" --giro restaurante --paquete restaurante_pro
 *
 * `db:bootstrap` crea al dueño y su PIN, pero exige que la organización ya
 * exista: «aquí no se crean negocios». Hasta hoy la única forma de crear una
 * era una migración con SQL directo, que es exactamente lo que dejó `auditoria`
 * en cero durante tres sesiones. Esto lo hace con el rol de aplicación, que
 * tiene DML y no DDL — no es una migración, es un alta.
 *
 * Idempotente: si el slug ya existe, no duplica nada y lo dice.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: [join(RAIZ, '.env.local'), join(RAIZ, '.env'), '.env.local', '.env'], quiet: true });

function bandera(nombre, porOmision) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porOmision : process.argv[i + 1];
}

const slug = bandera('slug');
const nombre = bandera('nombre');
const giro = bandera('giro', 'restaurante');
const paquete = bandera('paquete', 'restaurante_pro');
const sucursal = bandera('sucursal', 'Matriz');

if (slug === undefined || nombre === undefined) {
  console.error(
    'Uso: pnpm db:alta-negocio --slug <slug> --nombre "<nombre>" [--giro restaurante] [--paquete restaurante_pro] [--sucursal Matriz]',
  );
  process.exit(1);
}
if (!/^[a-z0-9-]{3,60}$/.test(slug)) {
  console.error('El slug son minúsculas, dígitos y guiones (3 a 60).');
  process.exit(1);
}

const { conTransaccion, cerrarDb } = await import('@morphiqpos/data');

try {
  const resultado = await conTransaccion(async (tx) => {
    const existente = await tx
      .selectFrom('organizaciones')
      .select(['id', 'nombre', 'giro', 'paquete'])
      .where('slug', '=', slug)
      .executeTakeFirst();

    const organizacion =
      existente ??
      (await tx
        .insertInto('organizaciones')
        .values({ nombre, slug, giro, paquete })
        .returning(['id', 'nombre', 'giro', 'paquete'])
        .executeTakeFirstOrThrow());

    const sucursalExistente = await tx
      .selectFrom('sucursales')
      .select(['id', 'nombre'])
      .where('organizacion_id', '=', organizacion.id)
      .executeTakeFirst();

    const primeraSucursal =
      sucursalExistente ??
      (await tx
        .insertInto('sucursales')
        .values({ organizacion_id: organizacion.id, nombre: sucursal })
        .returning(['id', 'nombre'])
        .executeTakeFirstOrThrow());

    return {
      organizacion,
      sucursal: primeraSucursal,
      reusada: existente !== undefined,
    };
  });

  console.log('');
  console.log(`  Negocio ....... ${resultado.organizacion.nombre} (${slug})`);
  console.log(`  Giro .......... ${resultado.organizacion.giro}`);
  console.log(`  Paquete ....... ${resultado.organizacion.paquete}`);
  console.log(`  Sucursal ...... ${resultado.sucursal.nombre}`);
  console.log(`  Estado ........ ${resultado.reusada ? 'ya existía, se reusó' : 'creado'}`);
  console.log('');
  console.log(`  Ahora: pnpm db:bootstrap --org ${slug} --persona "<nombre>" --pin <4-8 dígitos>`);
  console.log(`  Y en el entorno del despliegue: ORGANIZACION=${slug}`);
  console.log('');
} catch (error) {
  console.error('');
  console.error('✗ El alta falló. La base quedó como estaba.');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  console.error('');
  process.exitCode = 1;
} finally {
  await cerrarDb();
}
