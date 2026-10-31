import {
  conectarTelefonoDeCocina,
  firmarTokenDeEstacion,
  type TelefonoConectado,
} from '@morphiqpos/app/telefono-de-cocina';
import { validarEntorno } from '@morphiqpos/contracts';

import { manejadorDeComando } from '~/servidor/ruta';

/**
 * DP-9.4 · «Conectar teléfono» en la pantalla de Cocina.
 *
 * El comando sube la versión de la estación (revoca el código anterior) y dice para qué día
 * vale; ESTA ruta firma el código con la pimienta del servidor, que el comando no ve. El código
 * no se guarda en ninguna parte: se vuelve a calcular igual si el comando se reintenta.
 */
const ejecutar = manejadorDeComando(conectarTelefonoDeCocina);

interface Respuesta {
  readonly ok: boolean;
  readonly datos?: TelefonoConectado;
}

export async function POST(peticion: Request): Promise<Response> {
  const salida = await ejecutar(peticion);
  if (salida.status !== 200) return salida;
  const cuerpo = (await salida.json()) as Respuesta & Record<string, unknown>;
  const datos = cuerpo.datos;
  if (!cuerpo.ok || datos === undefined) {
    return new Response(JSON.stringify(cuerpo), { status: salida.status, headers: salida.headers });
  }
  const { PIN_PEPPER } = validarEntorno(process.env);
  const token = firmarTokenDeEstacion(
    {
      organizacionId: datos.organizacionId,
      estacionId: datos.estacionId,
      dia: datos.dia,
      version: datos.version,
    },
    PIN_PEPPER,
  );
  // El negocio no viaja de vuelta: la pantalla sólo necesita el código y hasta cuándo vale.
  const publicos = {
    estacionId: datos.estacionId,
    estacionNombre: datos.estacionNombre,
    dia: datos.dia,
    version: datos.version,
    vigenteHasta: datos.vigenteHasta,
    token,
  };
  return new Response(JSON.stringify({ ...cuerpo, datos: publicos }), {
    status: salida.status,
    headers: salida.headers,
  });
}

export const runtime = 'nodejs';
