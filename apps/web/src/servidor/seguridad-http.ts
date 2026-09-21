import type { Rol } from '@morphiqpos/contracts';

/**
 * LOS ORIGENES QUE PUEDEN ESCRIBIR, todos nacidos de la CONFIGURACION.
 *
 * `APP_URL` es la direccion canonica y `APP_URL_ALTERNAS` la lista de los otros
 * origenes por los que el MISMO despliegue se sirve, separados por comas.
 *
 * ── Por que hacen falta los alternos ──────────────────────────────────────
 * Un despliegue de Vercel se sirve siempre por su dominio `*.vercel.app` ademas
 * del dominio propio. Con `APP_URL` puesta al dominio propio, esta guarda
 * contestaba 403 a TODA escritura hecha desde la URL del despliegue —empezando
 * por `/api/auth/entrar`, asi que no se podia ni entrar— y ninguna puerta lo vio:
 * las suites corren con `APP_URL=http://localhost:3200`, donde el origen siempre
 * coincide. Lo encontro el rastreador tocando la aplicacion desplegada.
 *
 * ── Y por que NO se lee el Host de la peticion (R-17) ─────────────────────
 * Porque seria dejar que quien ataca declare el origen esperado. La prueba
 * «rechaza un Host falsificado aunque coincida con Origin» sigue en pie: aqui no
 * se mira `peticion.url` ni una sola vez.
 */
function origenesPermitidos(appUrl: string, alternas: string): readonly string[] {
  const origenes = [appUrl, ...alternas.split(',')]
    .map((valor) => valor.trim())
    .filter((valor) => valor.length > 0)
    .map((valor) => {
      try {
        return new URL(valor).origin;
      } catch {
        // Una entrada mal escrita no abre la puerta: se descarta. El contrato de
        // entorno ya exige que `APP_URL` sea una URL completa.
        return '';
      }
    })
    .filter((valor) => valor.length > 0);
  return [...new Set(origenes)];
}

/**
 * El `Origin` es aceptable: o no viene —peticion de servidor a servidor, que no
 * es CSRF— o es uno de los origenes configurados.
 */
function origenAceptable(peticion: Request, appUrl: string, alternas: string): boolean {
  const origen = peticion.headers.get('origin');
  if (origen === null) return true;
  return origenesPermitidos(appUrl, alternas).includes(origen);
}

export function peticionDeEscrituraValida(
  peticion: Request,
  appUrl: string,
  alternas = '',
): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('application/json')) return false;
  if (peticion.headers.get('x-morphiqpos-request') !== '1') return false;

  return origenAceptable(peticion, appUrl, alternas);
}

export function peticionMultipartValida(peticion: Request, appUrl: string, alternas = ''): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('multipart/form-data;')) return false;
  if (peticion.headers.get('x-morphiqpos-request') !== '1') return false;

  return origenAceptable(peticion, appUrl, alternas);
}

export function rolPermitidoParaConsulta(
  rol: Rol,
  permitidos: readonly Rol[] | undefined,
): boolean {
  return permitidos === undefined || permitidos.includes(rol);
}
