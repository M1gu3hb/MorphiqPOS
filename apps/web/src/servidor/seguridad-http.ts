export function peticionDeEscrituraValida(peticion: Request): boolean {
  const tipo = peticion.headers.get('content-type') ?? '';
  if (!tipo.toLocaleLowerCase('en-US').startsWith('application/json')) return false;
  if (peticion.headers.get('x-morphiqpos-request') !== '1') return false;

  const origen = peticion.headers.get('origin');
  return origen === null || origen === new URL(peticion.url).origin;
}
