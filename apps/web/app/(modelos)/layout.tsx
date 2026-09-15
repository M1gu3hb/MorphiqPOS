import type { ReactNode } from 'react';

/**
 * El envoltorio de las pantallas de los cinco modelos de la Fase 2.
 *
 * ── Por qué un grupo de rutas APARTE de `(interno)` ───────────────────────
 * Porque `(interno)` monta `AppLayout` de `heredado/`, que es de Miguel y que
 * D-09 prohíbe tocar mientras Codex trabaje. Estas pantallas son nuevas y no
 * pueden depender de esa barra lateral: al acoplar, se decide si entran dentro
 * de su `AppLayout` o si conservan su propio marco, y eso es una línea en el
 * `FILE-MAP.md` de cada modelo, no una reescritura.
 *
 * ── Y por qué el marco es tan poco ────────────────────────────────────────
 * Porque cada modelo tiene su propia jerarquía y su propia pantalla de inicio
 * —el mapa de mesas, la fila de barra, la agenda del día— y un marco con
 * opinión se la quitaría a los cinco. Lo único común es el fondo, el color del
 * texto y el alto completo: todo lo demás lo pone la pantalla.
 */
export const dynamic = 'force-dynamic';

export default function LayoutDeModelos({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
