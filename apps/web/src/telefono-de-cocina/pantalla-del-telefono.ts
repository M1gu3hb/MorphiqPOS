/**
 * Lo que el teléfono de cocina lee y escribe (DP-9.4), por la API pública estrecha
 * `/api/publico/cocina/:token`. Sin sesión: el token del QR es todo.
 */

import { idAlAzar } from '~/cliente/id-al-azar';

export interface ComandaDelTelefono {
  readonly id: string;
  readonly estado: 'nuevo' | 'en_preparacion';
  readonly mesaNumero: number | null;
  readonly nombrePedido: string | null;
  readonly creadaEn: string;
  readonly notas: string | null;
  readonly alergias: string | null;
  readonly celebracion: boolean;
  readonly tipoCelebracion: string | null;
  readonly platillos: readonly {
    readonly nombre: string;
    readonly cantidad: string;
    readonly notas: string | null;
  }[];
}

export interface PantallaDelTelefono {
  readonly estacion: { readonly nombre: string; readonly color: string | null };
  readonly vigenteHasta: string;
  readonly comanda: ComandaDelTelefono | null;
  readonly pendientes: number;
}

/** El motivo que da el servidor, en español, para enseñarlo tal cual. */
export class FalloDelTelefono extends Error {
  constructor(
    mensaje: string,
    readonly codigoInvalido: boolean,
  ) {
    super(mensaje);
    this.name = 'FalloDelTelefono';
  }
}

interface Respuesta<T> {
  readonly ok: boolean;
  readonly datos?: T;
  readonly error?: { readonly mensaje?: string; readonly datos?: { readonly regla?: string } };
}

const ruta = (token: string): string => `/api/publico/cocina/${encodeURIComponent(token)}`;

async function leerRespuesta<T>(respuesta: Response): Promise<T> {
  const cuerpo = (await respuesta.json().catch(() => ({ ok: false }))) as Respuesta<T>;
  if (cuerpo.ok && cuerpo.datos !== undefined) return cuerpo.datos;
  const regla = cuerpo.error?.datos?.regla;
  throw new FalloDelTelefono(
    cuerpo.error?.mensaje ?? 'No se pudo hablar con el servidor. Revisa el wifi.',
    respuesta.status === 404 || regla === 'TELEFONO_DE_COCINA_INVALIDO',
  );
}

export async function leerPantalla(token: string): Promise<PantallaDelTelefono> {
  return leerRespuesta<PantallaDelTelefono>(await fetch(ruta(token), { cache: 'no-store' }));
}

export async function moverDesdeElTelefono(
  token: string,
  comandaId: string,
  estado: 'en_preparacion' | 'listo',
): Promise<void> {
  await leerRespuesta<unknown>(
    await fetch(`${ruta(token)}/transicion`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-morphiqpos-request': '1',
        'idempotency-key': idAlAzar(),
      },
      body: JSON.stringify({ comandaId, estado }),
    }),
  );
}
