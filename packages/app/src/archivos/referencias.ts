import 'server-only';

import { ErrorDominio, validarEntorno } from '@morphiqpos/contracts';
import { crearAlmacenArchivos } from '@morphiqpos/data';

const CAMPOS_PUBLICOS: Readonly<Record<string, readonly string[]>> = {
  ProductoTerminado: ['imagen_url'],
  MenuQRSeccion: ['imagen_url'],
  ConfiguracionNegocio: ['logo_url', 'background_image_url', 'background_logo_url'],
};
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const CLAVE_PRIVADA = new RegExp(
  `^privado/(${UUID})/\\d{4}/(?:0[1-9]|1[0-2])/${UUID}\\.(?:jpg|png|webp|avif)$`,
  'i',
);

export interface OpcionesReferencias {
  readonly entidad: string;
  readonly datos: Readonly<Record<string, unknown>>;
  readonly organizacionId: string;
  readonly appUrl?: string;
  readonly copiar?: (origen: string, destino: string) => Promise<void>;
}

function clavePrivadaDeUrl(valor: string, appUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (
    url.origin !== new URL(appUrl).origin ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    !url.pathname.startsWith('/api/archivos/privado/')
  ) {
    return null;
  }
  try {
    return decodeURIComponent(url.pathname.slice('/api/archivos/'.length));
  } catch {
    throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', 'La referencia de archivo no es válida.');
  }
}

function perteneceAOrganizacion(clave: string, organizacionId: string): boolean {
  return (
    CLAVE_PRIVADA.exec(clave)?.[1]?.toLocaleLowerCase('en-US') ===
    organizacionId.toLocaleLowerCase('en-US')
  );
}

function configuracionAlmacen() {
  const entorno = validarEntorno(process.env);
  return {
    endpoint: entorno.STORAGE_ENDPOINT,
    bucket: entorno.STORAGE_BUCKET,
    accessKey: entorno.STORAGE_ACCESS_KEY,
    secretKey: entorno.STORAGE_SECRET_KEY,
  };
}

export async function prepararReferenciasPublicas(
  opciones: OpcionesReferencias,
): Promise<Record<string, unknown>> {
  const campos = CAMPOS_PUBLICOS[opciones.entidad] ?? [];
  if (campos.length === 0) return { ...opciones.datos };

  const salida: Record<string, unknown> = { ...opciones.datos };
  let entorno: ReturnType<typeof validarEntorno> | undefined;
  let copiar = opciones.copiar;

  for (const campo of campos) {
    const valor = opciones.datos[campo];
    if (typeof valor !== 'string' || valor === '') continue;
    const appUrl = opciones.appUrl ?? (entorno ??= validarEntorno(process.env)).APP_URL;
    const privada = clavePrivadaDeUrl(valor, appUrl);
    if (privada === null) continue;
    if (!perteneceAOrganizacion(privada, opciones.organizacionId)) {
      throw new ErrorDominio('PUENTE_SIN_PERMISO', 'El archivo pertenece a otra organización.');
    }
    const publica = privada.replace(/^privado\//, 'publico/');
    if (copiar === undefined) {
      const almacen = crearAlmacenArchivos(configuracionAlmacen());
      copiar = (origen, destino) => almacen.copiar(origen, destino);
    }
    await copiar(privada, publica);
    salida[campo] = `${new URL(appUrl).origin}/api/publico/archivo/${publica}`;
  }
  return salida;
}

/**
 * UNA FOTO DEL NEGOCIO, y no cualquier dirección (auditoría de la 2.4).
 *
 * Los comandos que atan una foto —el expediente de la clienta, la pieza del mostrador, la
 * nota del proveedor— aceptaban cualquier `z.url()`: `javascript:…` o una página ajena,
 * que la galería del dueño abría con un toque. La foto que el sistema guarda es SIEMPRE
 * la que devolvió `archivos/subir`: del origen de `APP_URL`, bajo `privado/<este negocio>/`.
 * Cualquier otra cosa se rechaza.
 */
export function exigirArchivoPropio(
  valor: string,
  organizacionId: string,
  appUrl: string | undefined = process.env['APP_URL'],
): void {
  if (appUrl === undefined || appUrl === '') {
    throw new ErrorDominio('CONFIGURACION_INVALIDA', 'Falta APP_URL: no se puede validar la foto.');
  }
  const clave = clavePrivadaDeUrl(valor, appUrl);
  if (clave === null || !perteneceAOrganizacion(clave, organizacionId)) {
    throw new ErrorDominio(
      'PUENTE_CAMPO_INVALIDO',
      'Esa foto no es un archivo de este negocio: súbela desde el sistema.',
    );
  }
}
