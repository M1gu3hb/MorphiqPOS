/**
 * La raíz de Supabase sigue vigente (`verify:certificado`).
 *
 * El certificado va embebido en el código para que viaje en el bundle
 * serverless. Eso resuelve un problema y crea otro: nadie se entera de que
 * caduca. Cuando caduque, TODA consulta a la base fallará a la vez, en
 * producción, sin aviso previo — y el arreglo obvio bajo presión es apagar la
 * verificación, que es justo lo que este certificado existe para evitar.
 *
 * Así que la puerta avisa con noventa días de antelación.
 */
import { X509Certificate } from 'node:crypto';

const DIAS_DE_AVISO = 90;

const { RAIZ_SUPABASE } = await import('../packages/data/src/certificados/supabase-root-2021.ts');

let certificado;
try {
  certificado = new X509Certificate(RAIZ_SUPABASE);
} catch (error) {
  console.error('✗ La raíz embebida no es un certificado válido.');
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const caduca = new Date(certificado.validTo);
const dias = Math.floor((caduca.getTime() - Date.now()) / 86_400_000);

if (dias < 0) {
  console.error(`✗ La raíz de Supabase CADUCÓ hace ${String(-dias)} día(s).`);
  console.error('  Trae la nueva de https://supabase.com/docs/guides/platform/ssl-enforcement');
  console.error('  y NO desactives la verificación para salir del paso.');
  process.exit(1);
}

if (dias < DIAS_DE_AVISO) {
  console.error(`✗ La raíz de Supabase caduca en ${String(dias)} día(s).`);
  console.error('  Trae la nueva y deja las dos mientras dure el solape.');
  process.exit(1);
}

console.log(
  `✓ Raíz de Supabase vigente ${String(dias)} día(s) más (hasta ${caduca.toISOString().slice(0, 10)}).`,
);
