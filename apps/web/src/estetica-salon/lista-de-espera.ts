/**
 * LA LISTA DE ESPERA, en palabras y con su mensaje (F-409; C.10 de la 2.4). Lo puro de
 * `ListaDeEspera`: cómo se dice la ventana y el enlace que abre el WhatsApp de quien atiende
 * con el aviso escrito. El sistema no manda el mensaje: el proveedor es F-406 (§10).
 */

export interface EsperaViva {
  readonly esperaId: string;
  readonly clienteId: string;
  readonly clienteNombre: string;
  readonly telefono: string | null;
  readonly servicioNombre: string | null;
  readonly profesionalNombre: string | null;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly flexibleDeDia: boolean;
  readonly estado: string;
}

const DIA = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

/** «jue 26 sep – sáb 28 sep», o «cuando se pueda» sin ventana. */
export function ventanaEnPalabras(espera: Pick<EsperaViva, 'desde' | 'hasta'>): string {
  if (espera.desde === null || espera.hasta === null) return 'cuando se pueda';
  const desde = DIA.format(new Date(espera.desde));
  const hasta = DIA.format(new Date(espera.hasta));
  return desde === hasta ? desde : `${desde} – ${hasta}`;
}

/** El número como lo pide wa.me: sólo dígitos, con el 52 de México si no lo trae. */
function numeroParaWhatsApp(telefono: string | null): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length === 10) return `52${digitos}`;
  if (digitos.length === 12 && digitos.startsWith('52')) return digitos;
  return null;
}

export function mensajeDeAviso(espera: EsperaViva): string {
  const servicio =
    espera.servicioNombre === null ? '' : ` para tu ${espera.servicioNombre.toLowerCase()}`;
  const con = espera.profesionalNombre === null ? '' : ` con ${espera.profesionalNombre}`;
  return `Hola ${espera.clienteNombre}, se liberó un lugar${servicio}${con}. ¿Te lo apartamos?`;
}

/** El enlace de wa.me con el aviso escrito; nulo sin un teléfono que sirva. */
export function enlaceDeAviso(espera: EsperaViva): string | null {
  const numero = numeroParaWhatsApp(espera.telefono);
  if (numero === null) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeDeAviso(espera))}`;
}
