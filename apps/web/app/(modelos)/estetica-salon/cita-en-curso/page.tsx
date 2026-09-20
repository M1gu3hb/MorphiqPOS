import { CitaEnCurso } from '~/estetica-salon/CitaEnCurso';

/**
 * La cita abierta, con la fórmula de la visita anterior a un toque.
 *
 * La página es una línea a propósito: el componente vive en `apps/web/src/`
 * —donde el verificador de primitivas sí vigila los literales— y la página sólo
 * dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <CitaEnCurso />;
}
