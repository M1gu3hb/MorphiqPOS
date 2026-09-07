import { redirect } from 'next/navigation';

/**
 * Raiz de la aplicacion.
 *
 * En F1.0 no hay panel todavia, y una pantalla de bienvenida generada seria
 * exactamente el "componente de andamiaje visible" que prohibe el gate PRS §03.
 * Asi que la raiz lleva a lo unico que ya existe y sirve: el sistema de diseno.
 *
 * En F1.1 esto pasa a ser el panel del negocio.
 */
export default function Raiz() {
  redirect('/estilos');
}
