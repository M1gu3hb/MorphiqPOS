import { fijarTermino, terminosDeLaOrganizacion } from '@morphiqpos/app/configuracion';

import { PUBLICA, responderConsulta } from '~/servidor/http';
import { manejadorDeComando } from '~/servidor/ruta';

/**
 * F-017 · Cómo habla este negocio.
 *
 * ── La mitad de LECTURA, que es la que faltaba ─────────────────────────────
 * El vocabulario tenía dominio, tabla, repositorio, dos comandos de escritura y
 * tres archivos de prueba, y **cero consumidores**. Esta ruta existía sólo para
 * ESCRIBIR: nadie podía leer el vocabulario, así que las 61 pantallas seguían
 * diciendo «mesa» en una estética. Tres modelos lo habían pedido por su nombre
 * —`abarrotes` avisó, `ferreteria` lo dio por hecho consumado, `estetica-salon`
 * lo exige— y ninguno lo tenía.
 *
 * ── Por qué el GET no filtra por rol ───────────────────────────────────────
 * Porque el vocabulario no autoriza nada: dice cómo se llaman las cosas. Un
 * cajero y un dueño ven los mismos sustantivos, y negárselos a un rol sólo
 * conseguiría que su pantalla dijera «mesa» donde las demás dicen «estación».
 * La sesión SÍ hace falta —`responderConsulta` la exige antes de llegar aquí—
 * porque los términos son de una organización concreta.
 *
 * El POST es otra cosa y conserva su gate: `fijarTermino` declara
 * `roles: ['administrador','dueno']`, porque cambiar cómo habla el negocio para
 * todo el mundo no es lo mismo que leerlo.
 */
export const dynamic = 'force-dynamic';

export function GET(): Promise<Response> {
  return responderConsulta((sesion) => terminosDeLaOrganizacion(sesion.organizacionId), {
    roles: PUBLICA,
  });
}

/** F-017 · Cómo llama este negocio a una entidad: singular, plural y género. */
export const POST = manejadorDeComando(fijarTermino);

export const runtime = 'nodejs';
