import type { ReactNode } from 'react';

import { ProveedorDeVocabulario } from '~/cliente/vocabulario';
import { terminosDelServidor } from '~/servidor/vocabulario';

/**
 * El envoltorio de las pantallas de los cinco modelos de la Fase 2.
 *
 * ── Por qué un grupo de rutas APARTE de `(interno)` ───────────────────────
 * Porque `(interno)` monta `AppLayout` de `heredado/`, que es de Miguel. Estas
 * pantallas son nuevas y no dependen de esa barra lateral: al acoplar se decide
 * si entran dentro de su `AppLayout` o si conservan su propio marco, y eso es
 * una línea en el `FILE-MAP.md` de cada modelo, no una reescritura.
 *
 * ── Y por qué el marco es tan poco ────────────────────────────────────────
 * Porque cada modelo tiene su propia jerarquía y su propia pantalla de inicio
 * —el mapa de mesas, la fila de barra, la agenda del día— y un marco con
 * opinión se la quitaría a los cinco. Lo único común es el fondo, el color del
 * texto, el alto completo… y el VOCABULARIO.
 *
 * ── Por qué el vocabulario se inyecta AQUÍ y no en cada pantalla ──────────
 * Porque son 61. F-017 tenía dominio, tabla, repositorio, comandos y pruebas, y
 * cero consumidores: «mesa» no se convertía en «estación» en ningún sitio, y el
 * vocabulario era la mitad de lo que hace que una plantilla se sienta propia.
 * Enganchado en las 61 a mano, la primera que se olvidara diría «mesa» en una
 * estética; enganchado aquí, no hay ninguna que se pueda olvidar.
 *
 * Se resuelve en el SERVIDOR, donde ya hay sesión y transacción, y baja con el
 * HTML: así la primera pintada de cada pantalla ya trae los sustantivos buenos,
 * sin el parpadeo que delata una traducción pegada encima.
 */
export const dynamic = 'force-dynamic';

export default async function LayoutDeModelos({ children }: { children: ReactNode }) {
  const terminos = await terminosDelServidor();

  return (
    <ProveedorDeVocabulario terminos={terminos}>
      <div className="min-h-dvh bg-fondo text-texto">{children}</div>
    </ProveedorDeVocabulario>
  );
}
