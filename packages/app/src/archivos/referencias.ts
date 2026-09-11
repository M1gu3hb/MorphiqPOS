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
