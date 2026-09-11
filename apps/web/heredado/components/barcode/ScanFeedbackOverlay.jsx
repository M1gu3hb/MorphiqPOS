'use client';
import { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
// La tiendita lo llamaba `formatMoney` y vivía en `utils/currency`; el
// restaurante lo llama `formatCurrency` y vive en `utils/financialUtils`. Es la
// misma función y se usa igual: se renombra en el import y el cuerpo no cambia.
import { formatCurrency as formatMoney } from '@/utils/financialUtils';

/**
 * Overlay verde grande de "Producto agregado" sobre la cámara.
 * Auto-oculta tras `duration` ms.
 *
 * Props:
 *  - feedback: { id, nombre, cantidad, precio, modo: 'local'|'remote' } | null
 *  - sym: string
 *  - onHide?
 *  - duration?: ms (default 1300)
 */
export default function ScanFeedbackOverlay({ feedback, sym = '$', onHide, duration = 1300 }) {
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => { onHide?.(); }, duration);
    return () => clearTimeout(t);
  }, [feedback, duration, onHide]);

  if (!feedback) return null;

  const titulo = feedback.modo === 'remote' ? 'Enviado a caja' : 'Producto agregado';

  return (
    <div
      key={feedback.id}
      className="absolute inset-x-3 top-1/2 -translate-y-1/2 pointer-events-none z-30 flex justify-center"
    >
      <div
        className="rounded-2xl px-5 py-4 flex items-center gap-3 max-w-md w-full"
        style={{
          background: 'linear-gradient(160deg, rgba(34,197,94,0.97), rgba(22,163,74,0.97))',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.25) inset',
          animation: 'scanFeedbackIn 220ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        <div className="flex-shrink-0 h-14 w-14 rounded-full bg-white/95 flex items-center justify-center">
          <CheckCircle2 className="h-9 w-9 text-green-600" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0 text-white">
          <p className="text-xs font-bold uppercase tracking-wide opacity-90">{titulo}</p>
          <p className="text-base font-black truncate leading-tight">{feedback.nombre}</p>
          <p className="text-sm font-semibold opacity-95 tabular-nums">
            Cantidad: {feedback.cantidad} · {formatMoney(feedback.precio, sym)}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes scanFeedbackIn {
          from { transform: translateY(-4px) scale(0.92); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}