import type { ReactElement } from 'react';

import {
  ESTILO_DE_LA_PALABRA,
  ESTILO_DE_LA_VARIANTE,
  contenidoDeLaMarca,
  type VarianteDeMarca,
} from './contenido';

/**
 * LA MARCA DE MORPHIQ · un solo componente para toda la plataforma.
 *
 * Es la firma de la plataforma —no el logo del negocio, que sale de su configuración—
 * y se pinta en cuatro sitios, cada uno con su variante:
 *
 *   · `acceso`    · bajo el teclado de la pantalla de acceso, sobre su degradado oscuro.
 *   · `ticket`    · la línea de plataforma de un ticket térmico de 80 mm.
 *   · `documento` · la firma de un PDF o de un corte (hoja carta).
 *   · `portal`    · el pie del portal del comensal.
 *
 * ── Qué pinta mientras no haya logo oficial ───────────────────────────────
 * La palabra «Morphiq» en texto, con tipografía de encabezado y letra abierta. No es un
 * logotipo —no se le dibujó ningún símbolo— y se dice así a propósito: el oficial no está
 * en el repositorio (ver `./logo.ts`, que dice dónde ponerlo). Cuando `RUTA_DEL_LOGO_OFICIAL`
 * deje de ser `null`, este mismo componente pinta el archivo y NINGUNA pantalla cambia.
 *
 * ── Y si el negocio puso otra marca ───────────────────────────────────────
 * `platform_brand` es un campo editable. Si trae un texto distinto de «Morphiq», se pinta
 * ese texto con el mismo estilo: la firma es del negocio, y respetarla no cuesta nada.
 *
 * Qué se decide y cómo se ve cada variante vive en `./contenido.ts`, donde se prueba.
 */

export type { VarianteDeMarca } from './contenido';

export interface MarcaMorphiqProps {
  readonly variante?: VarianteDeMarca;
  /** El `platform_brand` del negocio, si lo hay. Vacío o la marca anterior: «Morphiq». */
  readonly nombre?: string | null;
}

export function MarcaMorphiq({
  variante = 'documento',
  nombre = null,
}: MarcaMorphiqProps): ReactElement {
  const contenido = contenidoDeLaMarca(nombre);
  const clases = ESTILO_DE_LA_VARIANTE[variante];

  if (contenido.tipo === 'logo') {
    return (
      <span className={clases}>
        {/* Un <img> y no `next/image`: es un archivo estático de `public/`, y html2canvas
            captura el nodo tal cual al convertir un ticket o un corte en PDF. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={contenido.src} alt={contenido.alt} className="h-5 w-auto" />
      </span>
    );
  }

  if (variante === 'acceso') {
    return (
      <p className={clases}>
        <span aria-hidden="true" className="h-px w-(--espacio-6) bg-current opacity-40" />
        <span className={`${ESTILO_DE_LA_PALABRA} text-sm`}>{contenido.texto}</span>
        <span aria-hidden="true" className="h-px w-(--espacio-6) bg-current opacity-40" />
      </p>
    );
  }

  if (variante === 'portal') {
    return (
      <p className={clases}>
        <span className={ESTILO_DE_LA_PALABRA}>{contenido.texto}</span>
      </p>
    );
  }

  return <span className={clases}>{contenido.texto}</span>;
}
