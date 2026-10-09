import type { ReactNode } from 'react';

import AppLayout from '@/components/common/AppLayout';
import { ProveedorDeContenido } from '@/enrutado';
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
 * ── El menú, que faltaba (bloque D de la 2.4) ─────────────────────────────
 * Se decidió al fin: entran en el MISMO `AppLayout`, con su menú por rol y plantilla, en
 * su variante `modelo` —barra colapsada, contenido sin relleno—. Sin él, ninguna de las 61
 * pantallas llevaba a otra: la cajera en Caja no tenía cómo llegar a Cobrar.
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
      <ProveedorDeContenido
        contenido={<div className="min-h-dvh bg-fondo text-texto">{children}</div>}
      >
        <AppLayout marco="modelo" />
      </ProveedorDeContenido>
    </ProveedorDeVocabulario>
  );
}
