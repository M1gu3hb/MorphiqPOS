/** Lo que el mensaje necesita saber del cliente. */
export interface ClienteParaMensaje {
  readonly nombre: string;
  readonly telefono: string | null;
  readonly sellos: number;
}

/** El mensaje, redactado; lo manda quien atiende, desde su teléfono. */
export function mensajeDeRegreso(cliente: ClienteParaMensaje, sellosPorPremio: number): string {
  const faltan = sellosPorPremio - (cliente.sellos % sellosPorPremio);
  const saludo = `¡Hola, ${cliente.nombre}! Te extrañamos por aquí.`;
  return cliente.sellos > 0
    ? `${saludo} Llevas ${String(cliente.sellos)} sellos: con ${String(faltan)} más, tu café va por nuestra cuenta.`
    : `${saludo} Tu próximo café te espera.`;
}

/** El enlace de WhatsApp para ese mensaje. Diez dígitos de México: con el 52 delante. */
export function enlaceDeWhatsApp(telefono: string | null, texto: string): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  if (digitos.length !== 10 && !(digitos.length === 12 && digitos.startsWith('52'))) return null;
  const numero = digitos.length === 10 ? `52${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
