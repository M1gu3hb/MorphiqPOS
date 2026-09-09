/**
 * Crea la credencial de base de datos de la aplicación **sin que la contraseña
 * salga nunca de esta máquina**.
 *
 * El problema: para crear el rol hay que hablar con Postgres, y el único canal
 * disponible es una herramienta cuyo texto queda registrado. Mandar ahí un
 * `create role ... password 'secreto'` sería escribir el secreto en un log.
 *
 * La solución es la misma que usa el PIN: **no se manda el secreto, se manda su
 * verificador.** Postgres acepta en `PASSWORD` un verificador SCRAM-SHA-256 ya
 * calculado —lo documenta desde la 10— y lo guarda tal cual. Así el `ALTER
 * ROLE` viaja sin contraseña dentro, y la contraseña sólo se escribe en `.env`,
 * que está en `.gitignore`.
 *
 * Uso:
 *   node scripts/credencial-db.mjs <rol> <proyecto-ref> <host-pooler>
 *
 * Imprime el SQL a ejecutar (sin secretos) y escribe `DATABASE_URL` en `.env`.
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const [rol, proyecto, hostPooler] = process.argv.slice(2);
if (rol === undefined || proyecto === undefined || hostPooler === undefined) {
  console.error('Uso: node scripts/credencial-db.mjs <rol> <proyecto-ref> <host-pooler>');
  process.exit(1);
}

/** 32 bytes de entropía real. Nada que adivinar por fuerza bruta. */
const contrasena = randomBytes(32).toString('base64url');

/**
 * Verificador SCRAM-SHA-256, en el formato exacto que guarda `pg_authid`.
 *
 * `SCRAM-SHA-256$<iteraciones>:<sal b64>$<StoredKey b64>:<ServerKey b64>`
 *
 * 4096 iteraciones es el valor por omisión de Postgres. No se sube: subirlo
 * dejaría el verificador incompatible con lo que el servidor recalcula al
 * rotar, y con 256 bits de entropía el número de iteraciones no protege de
 * nada que importe.
 */
function verificadorScram(clave) {
  const sal = randomBytes(16);
  const iteraciones = 4096;
  const salteada = pbkdf2Sync(Buffer.from(clave, 'utf8'), sal, iteraciones, 32, 'sha256');
  const claveCliente = createHmac('sha256', salteada).update('Client Key').digest();
  const claveGuardada = createHash('sha256').update(claveCliente).digest();
  const claveServidor = createHmac('sha256', salteada).update('Server Key').digest();
  return `SCRAM-SHA-256$${String(iteraciones)}:${sal.toString('base64')}$${claveGuardada.toString('base64')}:${claveServidor.toString('base64')}`;
}

const verificador = verificadorScram(contrasena);

// El pooler de sesión de Supabase identifica al inquilino en el usuario:
// `<rol>.<ref>`. Sin el sufijo, Supavisor no sabe a qué proyecto conectarte.
const usuario = `${rol}.${proyecto}`;
const url = `postgresql://${encodeURIComponent(usuario)}:${encodeURIComponent(contrasena)}@${hostPooler}:5432/postgres`;

const rutaEnv = '.env';
const previo = existsSync(rutaEnv) ? readFileSync(rutaEnv, 'utf8') : '';
const lineas = previo.split(/\r?\n/).filter((l) => !l.startsWith('DATABASE_URL='));
lineas.unshift(`DATABASE_URL=${url}`);
writeFileSync(rutaEnv, lineas.join('\n'), 'utf8');

console.log('DATABASE_URL escrita en .env');
console.log(`  rol .............. ${usuario}`);
console.log(`  host ............. ${hostPooler}:5432`);
console.log(`  contraseña ....... ${String(contrasena.length)} caracteres (NO se imprime)`);
console.log('');
console.log('Ejecuta este SQL en la base. No contiene la contraseña, sólo su verificador:');
console.log('');
console.log(`do $$
begin
  if not exists (select 1 from pg_roles where rolname = '${rol}') then
    create role ${rol} with login bypassrls;
  end if;
end $$;

alter role ${rol} with login bypassrls password '${verificador}';

grant usage on schema public to ${rol};
grant select, insert, update, delete on all tables in schema public to ${rol};
grant usage, select on all sequences in schema public to ${rol};
alter default privileges in schema public
  grant select, insert, update, delete on tables to ${rol};
alter default privileges in schema public
  grant usage, select on sequences to ${rol};`);
