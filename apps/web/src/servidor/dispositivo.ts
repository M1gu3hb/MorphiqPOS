/**
 * La cookie del dispositivo de la terminal (F1.1-A-02).
 *
 * Separada de la de sesion a proposito y con vigencias muy distintas: el
 * dispositivo queda autorizado un ano, la sesion del cajero dura una jornada.
 * Mezclarlas obligaria a re-enrolar la tableta cada manana.
 */
export const NOMBRE_COOKIE_DISPOSITIVO = 'morphiqpos_dispositivo';

export interface OpcionesCookieDispositivo {
  readonly token: string;
  readonly maxEdadSegundos: number;
  readonly seguro: boolean;
}

export function cookieDeDispositivo({
  token,
  maxEdadSegundos,
  seguro,
}: OpcionesCookieDispositivo): string {
  const partes = [
    `${NOMBRE_COOKIE_DISPOSITIVO}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${String(maxEdadSegundos)}`,
  ];
  if (seguro) partes.push('Secure');
  return partes.join('; ');
}
