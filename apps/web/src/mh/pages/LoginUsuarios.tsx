'use client';

import { User } from 'lucide-react';

import { etiquetaDeRol } from '../lib/roles.ts';
import type { EmpleadoParaEntrar } from '../lib/useAccesoPin.ts';

/**
 * El panel de usuarios de abajo, a todo el ancho.
 *
 * Sale de `POSLogin.jsx` por el límite de 300 líneas. Es su panel: el borde
 * superior con `bg-black/30 backdrop-blur-md`, la etiqueta «Usuarios
 * disponibles», la rejilla que va de dos a ocho columnas, el avatar con la
 * inicial y sus tres estados —cargando, error con «Reintentar», y vacío—.
 *
 * Lo único que ya no está es la foto: la ficha de empleado de esta base guarda
 * nombre y rol, y no una imagen. Su componente ya dibujaba la inicial cuando
 * no había foto, así que ese es el aspecto que sale hoy; cuando la ficha
 * guarde foto, entra sin tocar el diseño.
 */

interface Props {
  readonly usuarios: readonly EmpleadoParaEntrar[];
  readonly cargando: boolean;
  readonly error: boolean;
  readonly seleccionado: EmpleadoParaEntrar | null;
  readonly onSeleccionar: (usuario: EmpleadoParaEntrar) => void;
  readonly onReintentar: () => void;
}

export default function LoginUsuarios({
  usuarios,
  cargando,
  error,
  seleccionado,
  onSeleccionar,
  onReintentar,
}: Props) {
  return (
    <div className="relative z-10 border-t border-white/10 bg-black/30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <p className="text-white/60 text-[10px] uppercase tracking-widest mb-2 text-center sm:text-left">
          Usuarios disponibles
        </p>
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-6 text-white/60 text-sm">
            <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <span>Cargando usuarios…</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-5 text-white/60 text-sm">
            <p>No pudimos cargar los usuarios.</p>
            <button
              type="button"
              onClick={onReintentar}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20"
            >
              Reintentar
            </button>
          </div>
        ) : usuarios.length === 0 ? (
          <div className="text-center py-6 text-white/40 text-sm">
            Sin usuarios activos. Crea uno desde Configuración.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
            {usuarios.map((u) => {
              const active = seleccionado?.empleoId === u.empleoId;
              return (
                <button
                  key={u.empleoId}
                  type="button"
                  onClick={() => {
                    onSeleccionar(u);
                  }}
                  className="user-tile group flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all bg-white/5 border-white/10"
                  data-active={active ? 'true' : 'false'}
                  style={
                    active
                      ? {
                          background: 'var(--brand-accent-soft, rgba(59,130,246,0.2))',
                          borderColor: 'var(--brand-accent, #60a5fa)',
                          boxShadow:
                            '0 0 0 2px var(--brand-accent-soft, rgba(96,165,250,0.4)), 0 0 20px var(--brand-accent-glow, rgba(59,130,246,0.35))',
                        }
                      : undefined
                  }
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{
                      background: active
                        ? 'var(--brand-accent, #3b82f6)'
                        : 'rgba(255,255,255,0.10)',
                    }}
                  >
                    {u.nombre === '' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      u.nombre.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 w-full text-center">
                    <p className="text-white text-xs font-medium truncate">{u.nombre}</p>
                    <p className="text-white/50 text-[10px] truncate">{etiquetaDeRol(u.rol)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <style>{`
          .user-tile[data-active="false"]:hover {
            background: var(--brand-accent-soft, rgba(59,130,246,0.12));
            border-color: var(--brand-accent, rgba(96,165,250,0.3));
          }
        `}</style>
    </div>
  );
}
