'use client';
import { ShoppingCart, ChevronUp, ChevronDown, Check, X } from 'lucide-react';
import { useState } from 'react';
// La tiendita lo llamaba `formatMoney` y vivía en `utils/currency`; el
// restaurante lo llama `formatCurrency` y vive en `utils/financialUtils`. Es la
// misma función y se usa igual: se renombra en el import y el cuerpo no cambia.
import { formatCurrency as formatMoney } from '@/utils/financialUtils';

/**
 * Mini-carrito superpuesto en el BarcodeScanner.
 * Se muestra abajo, sin tapar el visor.
 *
 * Props:
 *  - items: array de items del carrito (carrito local) — {nombre, cantidad, precio, subtotal}
 *  - total: number
 *  - sym: string
 *  - onViewCart?: () => void  (abrir carrito completo)
 *  - onFinish?: () => void    (cerrar scanner)
 *  - mode: 'local' | 'remote'
 *  - recentScans?: array (modo remoto: últimos eventos enviados)
 */
export default function ScannerMiniCart({
  items = [],
  total = 0,
  sym = '$',
  onViewCart,
  onFinish,
  mode = 'local',
  recentScans = [],
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Fuente principal: en modo local usamos items; en remoto los últimos escaneos enviados
  const lista = mode === 'remote' ? recentScans : items;
  const totalItems = mode === 'remote'
    ? recentScans.reduce((s, x) => s + (x.cantidad || 1), 0)
    : items.reduce((s, i) => s + (i.cantidad || 0), 0);
  const totalDisplay = mode === 'remote'
    ? recentScans.reduce((s, x) => s + ((x.precio_unitario || 0) * (x.cantidad || 1)), 0)
    : total;

  const ultimos = lista.slice(-3).reverse();

  return (
    <div className="absolute top-2 left-2 right-2 z-20 pointer-events-auto">
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, rgba(20,20,28,0.92), rgba(15,15,22,0.95))',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08) inset',
          color: 'white',
        }}
      >
        {/* Header siempre visible */}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
        >
          <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase font-bold opacity-70 tracking-wide leading-none">
              {mode === 'remote' ? 'Enviados a caja' : 'Carrito'}
            </p>
            <p className="text-sm font-bold leading-tight tabular-nums truncate">
              {totalItems} {totalItems === 1 ? 'producto' : 'productos'} · {formatMoney(totalDisplay, sym)}
            </p>
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 opacity-70" /> : <ChevronUp className="h-4 w-4 opacity-70" />}
        </button>

        {!collapsed && (
          <div className="px-3 pb-3 space-y-2">
            {ultimos.length > 0 ? (
              <ul className="space-y-1">
                {ultimos.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                    <span className="flex-1 truncate font-medium">
                      {item.nombre || item.producto_nombre || 'Producto'}
                    </span>
                    <span className="text-white/70 font-bold tabular-nums">
                      x{item.cantidad || 1}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-white/60 italic">Aún no hay escaneos</p>
            )}

            <div className="flex gap-2 pt-1">
              {onViewCart && (
                <button
                  type="button"
                  onClick={onViewCart}
                  className="flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1"
                  style={{
                    background: 'linear-gradient(to bottom, hsl(214 80% 58%), hsl(214 80% 44%))',
                    boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
                  }}
                >
                  <ShoppingCart className="h-3.5 w-3.5" /> Ver carrito
                </button>
              )}
              {onFinish && (
                <button
                  type="button"
                  onClick={onFinish}
                  className="flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 bg-white/15 hover:bg-white/25 transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Terminar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}