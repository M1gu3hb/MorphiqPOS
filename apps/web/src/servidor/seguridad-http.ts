import type { Rol } from '@morphiqpos/contracts';

export function peticionDeEscrituraValida(peticion: Request, appUrl: string): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('application/json')) return false;
  if (peticion.headers.get('x-morphiqpos-request') !== '1') return false;

  const origen = peticion.headers.get('origin');
  return origen === null || origen === new URL(appUrl).origin;
}

export function peticionMultipartValida(peticion: Request, appUrl: string): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('multipart/form-data;')) return false;
  if (peticion.headers.get('x-morphiqpos-request') !== '1') return false;

  const origen = peticion.headers.get('origin');
  return origen === null || origen === new URL(appUrl).origin;
}

export function rolPermitidoParaConsulta(
  rol: Rol,
  permitidos: readonly Rol[] | undefined,
): boolean {
  return permitidos === undefined || permitidos.includes(rol);
}
