'use client';

import { Delete } from 'lucide-react';

/**
 * Los puntitos del PIN y el teclado numérico de su pantalla de acceso.
 *
 * Salen de `POSLogin.jsx` a su propio archivo por el límite de 300 líneas. Ni
 * una clase ni un estilo en línea han cambiado: mismos `w-3.5 h-3.5` con su
 * glow del acento, misma rejilla de tres columnas con `max-w-[280px]`, mismos
 * botones `h-14 sm:h-16` y su `<style>` con el hover dinámico.
 */

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

interface Props {
  readonly pin: string;
  readonly loading: boolean;
  readonly onTecla: (tecla: string) => void;
  readonly onBorrar: () => void;
}

export default function LoginTeclado({ pin, loading, onTecla, onBorrar }: Props) {
  return (
    <>
      {/* PIN dots — usa color de acento dinámico */}
      <div className="flex justify-center gap-3 mt-6 mb-5">
        {[0, 1, 2, 3].map((i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${filled ? 'scale-110' : ''}`}
              style={
                filled
                  ? {
                      background: 'var(--brand-accent, #60a5fa)',
                      borderColor: 'var(--brand-accent, #60a5fa)',
                      boxShadow: '0 0 12px var(--brand-accent-glow, rgba(96,165,250,0.8))',
                    }
                  : {
                      borderColor: 'rgba(255,255,255,0.2)',
                      background: 'transparent',
                    }
              }
            />
          );
        })}
      </div>

      {/* Keypad — hover/border usan acento dinámico */}
      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
        {keys.map((key, idx) =>
          key === '' ? (
            <div key={idx} />
          ) : key === '⌫' ? (
            <button
              key={idx}
              type="button"
              onClick={onBorrar}
              disabled={loading}
              className="keypad-btn h-14 sm:h-16 rounded-xl bg-white/5 border border-white/10 text-white active:scale-95 transition-all flex items-center justify-center backdrop-blur-sm"
              aria-label="Borrar"
            >
              <Delete className="w-5 h-5" />
            </button>
          ) : (
            <button
              key={idx}
              type="button"
              onClick={() => {
                onTecla(key);
              }}
              disabled={loading}
              className="keypad-btn h-14 sm:h-16 rounded-xl bg-white/5 border border-white/10 text-white text-xl sm:text-2xl font-heading font-medium active:scale-95 transition-all backdrop-blur-sm"
            >
              {key}
            </button>
          ),
        )}
      </div>
      {/* Hover dinámico para keypad sin necesidad de Tailwind plugin */}
      <style>{`
          .keypad-btn:hover {
            background: var(--brand-accent-soft, rgba(59,130,246,0.18));
            border-color: var(--brand-accent, rgba(96,165,250,0.4));
          }
        `}</style>
    </>
  );
}
