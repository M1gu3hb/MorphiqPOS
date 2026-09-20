import { HistorialDeLaClienta } from '~/estetica-salon/HistorialDeLaClienta';

/**
 * El expediente de una clienta, para la profesional que va a tocarla: alergias,
 * la última fórmula y cuándo toca volver. La página es una línea a propósito —
 * el componente vive en `apps/web/src/`, donde el verificador de primitivas sí
 * vigila los literales, y aquí sólo se dice en qué ruta se monta.
 */
export const dynamic = 'force-dynamic';

export default function Pagina() {
  return <HistorialDeLaClienta />;
}
