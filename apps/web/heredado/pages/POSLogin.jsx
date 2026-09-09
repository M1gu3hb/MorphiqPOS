'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@/enrutado';
import { api } from '@/api/cliente';
import { usePOSAuth } from '@/lib/POSAuthContext';
import { useConfig } from '@/lib/ConfigContext';
import { ROLE_HOME_ROUTES, ROLE_LABELS } from '@/lib/constants';
import { Delete, User, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import LoginBrandColors from '@/components/common/LoginBrandColors';
import { ensureDefaultAdmin, isUsingDefaultAdminPin } from '@/lib/ensureDefaultAdmin';

export default function POSLogin() {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  // 6A.3: distinguir "todavía cargando" de "ya cargó y está vacío" para
  // no mostrar "Sin usuarios activos" antes del primer fetch en móvil.
  const [usuariosCargando, setUsuariosCargando] = useState(true);
  const [usuariosError, setUsuariosError] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const { login, posUser } = usePOSAuth();
  const { config } = useConfig();
  const navigate = useNavigate();
  const hiddenInputRef = useRef(null);

  useEffect(() => {
    if (posUser) navigate(ROLE_HOME_ROUTES[posUser.rol] || '/');
  }, [posUser, navigate]);

  // Garantiza que SIEMPRE haya un admin para que el login con PIN funcione.
  // Si ya hay usuarios, no crea nada (ensureDefaultAdmin es idempotente).
  // Después carga la lista de usuarios activos para el panel inferior.
  // 6A.3: reintento ligero si la primera carga falla (móvil con red lenta).
  const cargarUsuarios = useCallback(async () => {
    setUsuariosCargando(true);
    setUsuariosError(false);
    try {
      await ensureDefaultAdmin();
    } catch {
      /* falla silenciosa, abajo igual intentamos cargar */
    }
    try {
      const list = await api.entidades.UsuarioPOS.filter({ activo: true });
      setUsuarios(Array.isArray(list) ? list : []);
      setUsuariosError(false);
    } catch (err) {
      console.error('[POSLogin] cargar usuarios:', err);
      setUsuariosError(true);
    } finally {
      setUsuariosCargando(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await cargarUsuarios();
    })();
    return () => {
      cancelled = true;
    };
  }, [cargarUsuarios]);

  // Aviso discreto: admin sigue usando PIN default 1234.
  const usingDefaultPin = isUsingDefaultAdminPin(usuarios);

  // Foco persistente
  useEffect(() => {
    hiddenInputRef.current?.focus();
  }, [selectedUser]);

  const tryLogin = async (pinToUse) => {
    if (!pinToUse || pinToUse.length < 4) return;
    setLoading(true);
    const found = usuarios.find(
      (u) =>
        u.pin === pinToUse &&
        u.activo !== false &&
        (selectedUser ? u.id === selectedUser.id : true),
    );
    if (found) {
      login(found);
      navigate(ROLE_HOME_ROUTES[found.rol] || '/');
      toast.success(`Bienvenido, ${found.nombre}`);
    } else {
      toast.error('PIN incorrecto');
      setPin('');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (pin.length === 4) tryLogin(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleKey = (key) => {
    if (loading) return;
    if (pin.length < 4) setPin((p) => p + key);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (loading) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        if (pin.length < 4) setPin((p) => p + e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin((p) => p.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (pin.length >= 4) tryLogin(pin);
      } else if (e.key === 'Escape') {
        setPin('');
        setSelectedUser(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, loading, usuarios, selectedUser]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  const sistema = config.nombre_sistema || 'MH Astral Systems POS';
  const negocio = config.nombre_negocio || 'MH Astral Systems';

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#04070f] via-[#0a1428] to-[#0b1d3a] relative overflow-hidden">
      {/* Aplica color_primario/color_acento como CSS vars en <html>. */}
      <LoginBrandColors />

      {/* Glow decorativo — usa la paleta de marca dinámica.
          El fondo base siempre es oscuro/premium; solo cambian los tonos del glow. */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full blur-[120px]"
          style={{ background: 'var(--brand-primary-glow, rgba(37, 99, 235, 0.20))' }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] opacity-80"
          style={{ background: 'var(--brand-accent-glow, rgba(56, 189, 248, 0.18))' }}
        />
        {config.background_logo_url && (
          /* Marca de agua decorativa: más visible que antes (0.04 → 0.10)
             con un leve drop-shadow tintado de la marca para que se note
             como elemento premium sin competir con el logo principal. */
          <img
            src={config.background_logo_url}
            alt=""
            aria-hidden
            className="absolute right-[-10%] bottom-[-10%] w-[55vw] max-w-[700px] select-none brand-watermark"
            style={{
              opacity: 0.1,
              filter: 'drop-shadow(0 0 30px var(--brand-primary-glow, rgba(59,130,246,0.35)))',
              mixBlendMode: 'screen',
            }}
          />
        )}
      </div>

      {/* Hidden input */}
      <input
        ref={hiddenInputRef}
        type="text"
        inputMode="numeric"
        autoFocus
        value=""
        onChange={() => {}}
        className="sr-only"
        aria-label="PIN"
      />

      {/* HEADER central: logo + nombre + PIN + keypad */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        {/* Logo grande sin caja — drop-shadow usa color primario dinámico */}
        {config.logo_url ? (
          <img
            src={config.logo_url}
            alt={negocio}
            className="w-32 h-32 sm:w-40 sm:h-40 md:w-44 md:h-44 object-contain mb-4"
            style={{
              filter: 'drop-shadow(0 0 30px var(--brand-primary-glow, rgba(59,130,246,0.45)))',
            }}
          />
        ) : (
          <div
            className="w-28 h-28 mb-4 rounded-2xl flex items-center justify-center text-5xl font-bold text-white/80"
            style={{ background: 'var(--brand-primary-soft, rgba(37,99,235,0.20))' }}
          >
            M
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl font-heading font-black text-white tracking-wide text-center">
          {negocio}
        </h1>
        <p className="text-white/60 text-sm mt-1 tracking-wider uppercase">{sistema}</p>

        {selectedUser && (
          <p
            className="mt-3 px-3 py-1 rounded-full border text-white/90 text-xs font-medium"
            style={{
              background: 'var(--brand-accent-soft, rgba(56,189,248,0.15))',
              borderColor: 'var(--brand-accent, rgba(96,165,250,0.4))',
            }}
          >
            Iniciando como: {selectedUser.nombre}
          </p>
        )}

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
                onClick={() => setPin((p) => p.slice(0, -1))}
                disabled={loading}
                className="keypad-btn h-14 sm:h-16 rounded-xl bg-white/5 border border-white/10 text-white active:scale-95 transition-all flex items-center justify-center backdrop-blur-sm"
              >
                <Delete className="w-5 h-5" />
              </button>
            ) : (
              <button
                key={idx}
                onClick={() => handleKey(key)}
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

        <p className="text-center text-white/40 text-[11px] mt-4">
          Toca tu nombre o escribe directamente tu PIN · Enter para entrar
        </p>

        {/* Banner discreto: el admin sigue usando PIN default. */}
        {usingDefaultPin && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 text-amber-200 text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5" />
            Por seguridad, cambia el PIN del administrador inicial (1234) en Configuración.
          </div>
        )}
      </div>

      {/* USUARIOS abajo, full-width */}
      <div className="relative z-10 border-t border-white/10 bg-black/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-white/60 text-[10px] uppercase tracking-widest mb-2 text-center sm:text-left">
            Usuarios disponibles
          </p>
          {usuariosCargando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-white/60 text-sm">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
              <span>Cargando usuarios…</span>
            </div>
          ) : usuariosError ? (
            <div className="flex flex-col items-center gap-2 py-5 text-white/60 text-sm">
              <p>No pudimos cargar los usuarios.</p>
              <button
                type="button"
                onClick={cargarUsuarios}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20"
              >
                Reintentar
              </button>
            </div>
          ) : !Array.isArray(usuarios) || usuarios.length === 0 ? (
            <div className="text-center py-6 text-white/40 text-sm">
              Sin usuarios activos. Crea uno desde Configuración.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2.5">
              {usuarios.map((u) => {
                const active = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUser(u);
                      setPin('');
                      hiddenInputRef.current?.focus();
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
                      {u.nombre?.charAt(0).toUpperCase() || <User className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 w-full text-center">
                      <p className="text-white text-xs font-medium truncate">{u.nombre}</p>
                      <p className="text-white/50 text-[10px] truncate">{ROLE_LABELS[u.rol]}</p>
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
    </div>
  );
}
