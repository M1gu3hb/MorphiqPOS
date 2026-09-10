'use client';
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Heart, CheckCircle2, Loader2 } from 'lucide-react';
import { nuevaClave } from '@/api/cliente';
import { valorarVisitaQR } from '@/utils/qrPedidoFlow';
import { toast } from 'sonner';

const EMOJIS = [
  { score: 1, emoji: '😡', label: 'Muy mala' },
  { score: 2, emoji: '😕', label: 'Mala' },
  { score: 3, emoji: '😐', label: 'Regular' },
  { score: 4, emoji: '🙂', label: 'Buena' },
  { score: 5, emoji: '🤩', label: 'Excelente' },
];

/**
 * Modal de valoración del comensal.
 *
 * ── El emoji lo pone el SERVIDOR ──────────────────────────────────────────
 * Esta pantalla mandaba `satisfaccion_emoji` y `satisfaccion_label` desde el
 * navegador: dos campos de texto libre que acababan en la base y de ahí en un
 * reporte, así que cualquiera podía escribir lo que quisiera en la carita de
 * una venta. Ahora viaja el número del 1 al 5 y la carita sale de la tabla del
 * comando. `satisfaccion_label` no se guarda: es el mismo dato con letra.
 *
 * ── Qué venta se valora ───────────────────────────────────────────────────
 * La resuelve el token: la viva de la mesa, o la que se cerró hace menos de un
 * turno. Se acabó el `Venta.get(ventaId)` previo cuyo `.catch(() => null)`
 * dejaba `yaValorada` en falso y permitía valorar dos veces la misma visita
 * por un fallo de red. Insistir tampoco es un error: el comando devuelve
 * `yaValorada` y con él la calificación que quedó escrita.
 *
 * Props:
 *  - token: el código de la mesa.
 *  - ventaId: la venta que el portal ya vio. Aquí sólo sirve de guardia; quién
 *    se valora lo decide el servidor.
 *  - mesa: para el título.
 *  - yaValorada: lo que dijo la lectura pública (`cuenta.ya_valorada`).
 *  - onClose(): cerrar.
 */
export default function ValoracionEmoji({
  token,
  ventaId,
  mesa,
  yaValorada: yaValoradaInicial,
  onClose,
}) {
  const [seleccion, setSeleccion] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [yaValorada, setYaValorada] = useState(!!yaValoradaInicial);
  // Clave del diálogo: dos toques seguidos son la misma valoración.
  const [clave] = useState(() => nuevaClave());

  const submit = async () => {
    if (enviando) return;
    if (!ventaId) {
      toast.error('No se encontró tu cuenta para registrar la valoración.');
      return;
    }
    if (!seleccion) {
      toast.info('Toca un emoji para valorar.');
      return;
    }
    setEnviando(true);
    try {
      const resultado = await valorarVisitaQR({
        token,
        score: seleccion.score,
        comentario,
        clave,
      });
      // Otro teléfono de la misma mesa pudo valorar antes: el comando devuelve
      // LA QUE QUEDÓ, no la que este comensal mandó.
      if (resultado?.yaValorada) setYaValorada(true);
      else setEnviado(true);
    } catch (err) {
      toast.error(err?.message || 'No pudimos guardar tu valoración. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center"
    >
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        className="bg-card text-card-foreground w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
      >
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-500 shrink-0" />
          <p className="flex-1 font-heading font-bold">
            ¿Cómo estuvo tu experiencia?
            {mesa?.numero ? ` · Mesa ${mesa.numero}` : ''}
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {yaValorada && (
            <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold">¡Gracias por valorar tu experiencia!</p>
                <p className="text-xs opacity-90 mt-1">
                  Ya recibimos tu valoración. ¡Esperamos verte pronto otra vez!
                </p>
              </div>
            </div>
          )}

          {!yaValorada && enviado && (
            <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold">¡Gracias! Tu valoración fue registrada.</p>
                <p className="text-xs opacity-90 mt-1">Nos ayuda a mejorar tu próxima visita.</p>
              </div>
            </div>
          )}

          {!yaValorada && !enviado && (
            <>
              <p className="text-sm text-muted-foreground">
                Toca un emoji para valorar tu visita. Si quieres, déjanos un comentario.
              </p>

              <div className="grid grid-cols-5 gap-2">
                {EMOJIS.map((e) => {
                  const activo = seleccion?.score === e.score;
                  return (
                    <button
                      key={e.score}
                      type="button"
                      onClick={() => setSeleccion(e)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-2xl border-2 transition-transform ${
                        activo
                          ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 scale-105'
                          : 'border-border bg-card'
                      }`}
                    >
                      <span className="text-3xl leading-none">{e.emoji}</span>
                      <span className="text-[10px] font-semibold text-center leading-tight">
                        {e.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Comentario <span className="opacity-60 normal-case">(opcional)</span>
                </label>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value.slice(0, 500))}
                  placeholder="Cuéntanos qué te gustó o qué podemos mejorar."
                  rows={3}
                  className="w-full px-3 py-2 border rounded-xl bg-card mt-1 text-sm resize-none"
                />
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                  {comentario.length}/500
                </p>
              </div>
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-card border-t px-4 py-3 flex gap-2">
          {yaValorada || enviado ? (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
            >
              Cerrar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                className="flex-1 h-12 rounded-xl border font-semibold disabled:opacity-50"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={enviando || !seleccion}
                className="flex-1 h-12 rounded-xl bg-rose-600 text-white font-semibold disabled:opacity-50 active:scale-95 transition-transform inline-flex items-center justify-center gap-2"
              >
                {enviando && <Loader2 className="w-4 h-4 animate-spin" />}
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
