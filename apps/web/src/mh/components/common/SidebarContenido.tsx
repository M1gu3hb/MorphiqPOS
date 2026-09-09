'use client';

import { ChevronLeft, ChevronRight, LogOut, Sparkles, Tag } from 'lucide-react';
import Link from 'next/link';

import type { ElementoNav } from '../../lib/permissions.ts';
import type { UsuarioPos } from '../../lib/POSAuthContext.tsx';
import type { ConfigNegocio } from '../../lib/ConfigContext.tsx';
import { ICON_MAP } from './sidebarOrden.ts';
import ThemeToggle from './ThemeToggle.tsx';

/**
 * El panel de su barra lateral: cabecera, navegación, tema y pie de usuario.
 *
 * En su `Sidebar.jsx` esto era un `SidebarContent` declarado DENTRO del
 * componente. Sale a su propio archivo por dos razones y ninguna cambia cómo
 * se ve: el límite de 300 líneas, y que un componente definido dentro de otro
 * se vuelve a crear en cada render — el panel entero se desmontaba y volvía a
 * montar al abrir el cajón en móvil.
 *
 * Ni una clase, ni un gradiente, ni una sombra han cambiado.
 */

interface Props {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly navItems: readonly ElementoNav[];
  readonly pathname: string;
  readonly config: ConfigNegocio;
  readonly posUser: UsuarioPos | null;
  readonly onLogout: () => void;
  readonly onNavigate: () => void;
}

export default function SidebarContenido({
  collapsed,
  onToggle,
  navItems,
  pathname,
  config,
  posUser,
  onLogout,
  onNavigate,
}: Props) {
  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center shrink-0 ring-2 ring-white/10">
          {config.logo_url !== '' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={config.logo_url}
              alt={config.nombre_negocio}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <Sparkles className="w-5 h-5 text-blue-300" />
          )}
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-heading font-bold truncate tracking-wide">
              {config.nombre_negocio}
            </p>
            <p className="text-[10px] text-sidebar-foreground/50 truncate">
              {config.platform_brand || 'MH Astral Systems'}
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground hidden lg:block"
          aria-label={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-y-auto space-y-0.5 px-2">
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] ?? Tag;
          const active = pathname === item.path;
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={onNavigate}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'text-white font-semibold' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
              style={
                active
                  ? {
                      // Skeuomorphism premium: gradiente diagonal del primario al
                      // acento (con fallback al sidebar-primary actual para no
                      // cambiar nada con la paleta por defecto), borde superior
                      // luminoso, sombra interior profunda y resplandor exterior.
                      background:
                        'linear-gradient(135deg, var(--brand-primary, hsl(var(--sidebar-primary))) 0%, var(--brand-accent, hsl(var(--sidebar-primary))) 100%)',
                      boxShadow: [
                        // Highlight superior (luz que cae): efecto de relieve
                        'inset 0 1px 0 rgba(255,255,255,0.25)',
                        // Sombra interior inferior: da profundidad de botón hundido sutil
                        'inset 0 -2px 4px rgba(0,0,0,0.20)',
                        // Sombra exterior premium con tinte del acento
                        '0 2px 6px rgba(0,0,0,0.35)',
                        '0 0 12px var(--brand-accent-glow, rgba(59,130,246,0.25))',
                      ].join(', '),
                      border: '1px solid rgba(255,255,255,0.10)',
                    }
                  : undefined
              }
            >
              {/* Rayita lateral secundaria — refuerzo visual del item activo
                  sin ser el efecto principal. Solo aparece cuando es active. */}
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full"
                  style={{
                    background: 'rgba(255,255,255,0.55)',
                    boxShadow: '0 0 6px rgba(255,255,255,0.4)',
                  }}
                />
              )}
              <Icon
                className="w-5 h-5 shrink-0"
                style={
                  active
                    ? {
                        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
                      }
                    : undefined
                }
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle — visible en todas las páginas internas */}
      <div className="px-2 pb-1">
        {collapsed ? (
          <div className="flex justify-center pb-1">
            <ThemeToggle
              variant="icon"
              className="bg-transparent border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent"
            />
          </div>
        ) : (
          <ThemeToggle variant="sidebar" />
        )}
      </div>

      {/* User footer */}
      {posUser && (
        <div className="border-t border-sidebar-border p-3">
          <div className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
            <div className="w-8 h-8 bg-sidebar-accent rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {posUser.nombre.charAt(0).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{posUser.nombre}</p>
                <p className="text-[10px] text-sidebar-foreground/50">{posUser.etiqueta}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={onLogout}
                className="text-sidebar-foreground/50 hover:text-red-400 transition-colors p-1"
                aria-label="Salir"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
