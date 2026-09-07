'use client';

/**
 * Tipografia y, sobre todo, NUMEROS.
 *
 * `--fuente-numeros` es tabular y obligatoria. Ninguno de los dos sistemas
 * fuente lo tenia, y es la clase de detalle que no se nota en una captura de
 * pantalla pero si a las tres horas de turno.
 */

const IMPORTES = ['$1,204.00', '$38.50', '$405.50', '$9.99', '$12,880.75'];

export function SeccionTipografia() {
  return (
    <section aria-labelledby="tipografia" className="space-y-6">
      <header>
        <h2 id="tipografia" className="text-[length:var(--tamano-2xl)] font-[var(--peso-fuerte)]">
          Tipografía y números
        </h2>
      </header>

      <div className="space-y-2">
        {(
          [
            ['3xl', 'Corte de caja del día'],
            ['2xl', 'Ventas por estación'],
            ['xl', 'Mesa 7 · 4 personas'],
            ['lg', 'Tacos de suadero'],
            ['base', 'Texto de lectura normal en pantallas de gestión.'],
            ['sm', 'Etiquetas de formulario y encabezados de tabla.'],
            ['xs', 'Marcas de tiempo y pies de nota.'],
          ] as const
        ).map(([tamano, texto]) => (
          <div key={tamano} className="flex items-baseline gap-4 border-b border-borde/60 pb-2">
            <span className="w-12 shrink-0 text-[length:var(--tamano-xs)] text-texto-tenue">
              {tamano}
            </span>
            <span style={{ fontSize: `var(--tamano-${tamano})` }}>{texto}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-md border border-borde p-4">
          <p className="mb-3 text-[length:var(--tamano-sm)] font-[var(--peso-medio)] text-exito">
            Con cifras tabulares — así se lee un ticket
          </p>
          <ul data-numeros className="space-y-1 text-right">
            {IMPORTES.map((importe) => (
              <li key={importe}>{importe}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-borde p-4">
          <p className="mb-3 text-[length:var(--tamano-sm)] font-[var(--peso-medio)] text-texto-sutil">
            Sin cifras tabulares — los puntos decimales no alinean
          </p>
          <ul className="space-y-1 text-right" style={{ fontVariantNumeric: 'normal' }}>
            {IMPORTES.map((importe) => (
              <li key={importe}>{importe}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
