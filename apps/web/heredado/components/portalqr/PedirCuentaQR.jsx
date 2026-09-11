'use client';
import React, { useMemo, useState } from 'react';
import { nuevaClave } from '@/api/cliente';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Receipt, X, Heart, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/utils/financialUtils';
import { tipsEnabled, getPorcentajesSugeridos } from '@/utils/tipsUtils';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { pedirCuentaQR } from '@/utils/qrPedidoFlow';
import { toast } from 'sonner';

/**
 * Vista "Pedir cuenta" del Portal QR.
 *
 * Reglas:
 * - Si no hay venta activa en la mesa: mensaje claro "Sin consumo activo".
 *   NO crea solicitud falsa.
 * - Si precuenta está apagada: solo botón "Solicitar cuenta" sin ver detalle.
 * - Si propina QR está apagada: no muestra opciones de propina.
 * - Si propinas globales están apagadas: ignora completamente la propina QR.
 * - Anti-duplicado y ruteo del aviso: los resuelve `portal.pedir_cuenta`. Si ya
 *   había una solicitud pendiente, actualiza su instantánea; y si fue el mesero
 *   quien disparó la cuenta, NO crea aviso —ya lo sabe él, que lo pidió.
 * - Marcar la venta y la mesa como "cuenta_solicitada" ocurre en la MISMA
 *   transacción. Antes eran dos escrituras sueltas con el `catch` vacío puesto:
 *   el comensal leía «un mesero viene con tu cuenta» y Caja no recibía nada.
 * - NO cobra, NO cierra mesa, NO descuenta inventario.
 *
 * ── El dinero lo calcula el servidor ──────────────────────────────────────
 * Esta pantalla escribía `subtotal_consumo`, `propina_monto_sugerida` y
 * `total_estimado` calculados en el navegador. Ahora manda el TIPO de propina y
 * el porcentaje; el importe sale de `cotizar` + `aplicarPorcentaje` en centavos
 * enteros, dentro de la transacción. Lo que se pinta aquí antes de confirmar es
 * una vista previa sobre el total que ya publicó el servidor.
 *
 * Props:
 *  - token: el código de la mesa. Es la única credencial del comensal.
 *  - mesa: la mesa pública (id, numero, nombre, tiene_mesero…).
 *  - config: el bloque `negocio` de la respuesta pública.
 *  - cuenta: la venta viva de la mesa, con sus líneas. `null` si no hay.
 *  - onClose(): cerrar la vista.
 *  - onConfirmed(): callback cuando se solicitó la cuenta con éxito.
 */
export default function PedirCuentaQR({ token, mesa, config, cuenta, onClose, onConfirmed }) {
  const queryClient = useQueryClient();
  const verPrecuenta = config?.portal_qr_mostrar_precuenta !== false;
  const propinasGlobales = tipsEnabled(config);
  const propinaQRPermitida = config?.portal_qr_permitir_propina_cliente !== false;
  const propinaActiva = propinasGlobales && propinaQRPermitida;
  const porcentajes = getPorcentajesSugeridos(config);

  // La cuenta y sus líneas llegan de la lectura pública del padre. Ya no hay
  // query interna que dupliques —eran otras dos consultas anónimas— ni "hints"
  // que conservar para tapar el flash de «sin consumo activo».
  const venta = cuenta || null;
  const detalles = useMemo(() => venta?.lineas || [], [venta]);

  // Una clave de idempotencia por apertura del diálogo: un doble toque en
  // «Confirmar» con mala cobertura no pide la cuenta dos veces.
  const [clave] = useState(() => nuevaClave());
  // null = aún no eligió. 0 = "Sin propina". -1 = monto manual. >0 = porcentaje.
  const [pctActivo, setPctActivo] = useState(() => propinaPreviaPct(cuenta));
  const [montoManual, setMontoManual] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [decidirEnCaja, setDecidirEnCaja] = useState(
    () => cuenta?.propina_origen === 'portal_qr' && cuenta?.propina_tipo === 'decidir_en_caja',
  );

  // El total sale del SERVIDOR. Aquí se sumaban las líneas del navegador con
  // `getVentaTotal` como defensa contra la venta que quedaba en total 0 —el
  // defecto que este mismo módulo provocaba al re-totalizar sobre una lectura
  // fallida—. Esa causa ya no existe: `total` viene cotizado en la respuesta
  // pública, con impuestos y descuentos aplicados, y sin la propina (regla 1 de
  // `F1-01` §3). Con la precuenta apagada el servidor no publica importes y
  // llega `null`, que es lo que hay que respetar, no rellenar.
  const subtotal = Number(venta?.total) || 0;

  const propinaCalculada = useMemo(() => {
    if (!propinaActiva) return 0;
    if (decidirEnCaja) return 0;
    if (pctActivo === null) return 0;
    if (pctActivo > 0) {
      return Math.round(subtotal * (pctActivo / 100) * 100) / 100;
    }
    const manual = Number.parseFloat(montoManual);
    if (Number.isFinite(manual) && manual >= 0) return Math.round(manual * 100) / 100;
    return 0;
  }, [propinaActiva, decidirEnCaja, pctActivo, montoManual, subtotal]);

  const totalEstimado = subtotal + propinaCalculada;

  // Tipo de propina elegido por el cliente. NOTA: `decidir_en_caja` se distingue
  // de `sin_propina` para que Caja pueda mostrar mensajes diferentes.
  const propinaTipo = (() => {
    if (!propinaActiva) return 'sin_propina';
    if (decidirEnCaja) return 'decidir_en_caja';
    if (pctActivo === 0) return 'sin_propina';
    if (pctActivo > 0) return 'porcentaje';
    if (Number.parseFloat(montoManual) > 0) return 'monto_manual';
    return 'sin_propina';
  })();

  const yaEligio = decidirEnCaja || pctActivo !== null || Number.parseFloat(montoManual) > 0;

  // Las opciones de propina sólo se pueden pintar si hay un importe sobre el
  // que calcularlas. Con la precuenta apagada el servidor no publica ninguno
  // —y hace bien: es lo que el dueño pidió esconder—, así que el botón no
  // puede exigir una elección que la pantalla no ofrece, ni un subtotal que no
  // recibe. Quien decide si hay cuenta abierta es el comando.
  const puedeElegirPropina = propinaActiva && subtotal > 0;

  const elegirPorcentaje = (pct) => {
    setDecidirEnCaja(false);
    setPctActivo(pct);
    setMontoManual('');
  };

  const elegirDecidirEnCaja = () => {
    setDecidirEnCaja(true);
    setPctActivo(null);
    setMontoManual('');
  };

  const onChangeManual = (raw) => {
    const v = (raw || '').replace(',', '.');
    // Solo dígitos y un punto; rechazar negativos
    if (v === '' || /^\d*\.?\d*$/.test(v)) {
      setMontoManual(v);
      setPctActivo(-1); // -1 marca "usuario usando manual"
      setDecidirEnCaja(false);
    }
  };

  const confirmar = async () => {
    if (enviando) return;
    if (!mesa?.id) {
      toast.error('Mesa no válida');
      return;
    }
    setEnviando(true);
    try {
      // Aquí había NUEVE escrituras sueltas desde el navegador: la solicitud
      // (con su anti-duplicado leído antes, su ruteo elegido aquí y tres
      // importes calculados aquí), la venta y la mesa, las tres últimas con el
      // `catch` vacío puesto. Cuando la venta fallaba, el comensal leía «un
      // mesero viene con tu cuenta» y Caja no recibía nada: la venta seguía en
      // `enviada`, sin `codigo_caja`, y la mesa ocupada hasta que alguien
      // preguntaba.
      //
      // `portal.pedir_cuenta` hace las tres en UNA transacción: cotiza sobre las
      // líneas persistidas, calcula la propina en centavos enteros, congela los
      // totales, marca la venta con su código de caja, avisa al mesero sólo si
      // hace falta y mueve la mesa. O queda todo, o no queda nada.
      await pedirCuentaQR({
        token,
        propinaTipo,
        propinaPorcentaje: pctActivo > 0 ? pctActivo : 0,
        propinaMonto: montoManual,
        clave,
      });

      // Que el portal vuelva a leer: la venta ya está en `cuenta_solicitada`.
      queryClient.invalidateQueries({ queryKey: ['portal_publico', token] });

      // `setEnviado(true)` SÓLO tras respuesta OK del servidor.
      setEnviado(true);
      if (typeof onConfirmed === 'function') onConfirmed();
    } catch (err) {
      // «No hay una cuenta abierta en esta mesa», «El mesero es quien pide la
      // cuenta en este negocio»: el dominio ya lo dice en español.
      toast.error(err?.message || 'No pudimos enviar tu solicitud. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  // ----- RENDER -----
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
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-2">
          <Receipt className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="flex-1 font-heading font-bold">
            {venta?.propina_origen === 'pendiente_portal_qr' ||
            venta?.propina_tipo === 'pendiente_cliente'
              ? 'Tu cuenta fue solicitada'
              : `Pedir cuenta — Mesa ${mesa?.numero ?? '—'}`}
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
          {/* Ni «cargando tu cuenta» ni el enjambre de condiciones que tenía
              debajo: la cuenta llega con la pantalla, así que «no hay consumo
              activo» ya no puede salir como flash falso mientras cargaba. */}
          {!venta && (
            <div className="rounded-xl p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold">Esta mesa no tiene consumo activo</p>
                <p className="text-xs opacity-90 mt-1">
                  Llama a un mesero para iniciar tu cuenta. Si ya pediste y aún no aparece, espera
                  un momento.
                </p>
              </div>
            </div>
          )}

          {venta && enviado && (
            <div className="rounded-xl p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-bold">¡Cuenta solicitada!</p>
                <p className="text-xs opacity-90 mt-1">
                  En breve te atenderemos. El cobro final se confirma en caja.
                </p>
              </div>
            </div>
          )}

          {venta && !enviado && (
            <>
              {/* Precuenta — diseño premium, jerarquía clara.
                  La línea pública trae `total` y `precio_unitario` ya convertidos
                  a pesos desde los centavos exactos del servidor. Se conserva el
                  fallback derivado por si el negocio apaga los precios. */}
              {verPrecuenta ? (
                <div
                  className="rounded-2xl overflow-hidden bg-card border shadow-sm"
                  style={{
                    boxShadow: '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px rgba(0,0,0,0.06)',
                  }}
                >
                  <div className="px-4 py-3 border-b bg-gradient-to-b from-muted/60 to-muted/30 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    <p className="text-xs font-heading font-bold uppercase tracking-wider">
                      Tu consumo
                    </p>
                  </div>
                  <div className="px-4 py-3 space-y-2.5 max-h-64 overflow-y-auto divide-y divide-border/50">
                    {Array.isArray(detalles) && detalles.length > 0 ? (
                      detalles.map((d, i) => {
                        const qty = Number(d?.cantidad) || 0;
                        const lineSubtotal = Number(d?.total) || 0;
                        // Precio unitario: el del servidor, con fallback derivado.
                        const snap = Number(d?.precio_unitario);
                        const unit =
                          Number.isFinite(snap) && snap > 0
                            ? snap
                            : qty > 0
                              ? lineSubtotal / qty
                              : 0;
                        // 6B / 1.G — Texto legible si la línea es variable.
                        const txtVar = formatearCantidadVariable({
                          tipo_venta: d?.tipo_venta_snapshot,
                          cantidad_variable: d?.cantidad_variable_snapshot,
                          unidad_variable: d?.unidad_variable_snapshot,
                          cantidad_porciones: d?.cantidad_porciones_snapshot,
                          nombre_porcion: d?.nombre_porcion_snapshot,
                        });
                        const esVariable = !!txtVar;
                        return (
                          <div
                            key={d?.id || i}
                            className="flex justify-between items-start gap-3 pt-2.5 first:pt-0"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">
                                {d?.producto_nombre || '—'}
                                {esVariable && (
                                  <span className="ml-1.5 text-xs font-bold text-primary">
                                    · {txtVar}
                                  </span>
                                )}
                              </p>
                              {!esVariable && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  <span className="font-semibold text-foreground/80">{qty}</span>
                                  <span className="mx-1">×</span>
                                  <span>{formatCurrency(unit)}</span>
                                </p>
                              )}
                            </div>
                            <p className="font-heading font-bold text-sm shrink-0 tabular-nums">
                              {formatCurrency(lineSubtotal)}
                            </p>
                          </div>
                        );
                      })
                    ) : subtotal > 0 ? (
                      // HOTFIX 6A.3: hay total pero aún no llegan las líneas.
                      // No mostrar "no hay productos" — mostrar carga + reintento.
                      <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-xs">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Cargando detalle de tu consumo…</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Aún no hay productos registrados.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border bg-card p-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-bold tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
              )}

              {/* Propina — premium con icono destacado */}
              {puedeElegirPropina && (
                <div
                  className="rounded-2xl border bg-card p-4 space-y-3 shadow-sm"
                  style={{
                    boxShadow:
                      '0 1px 0 rgba(255,255,255,0.6) inset, 0 4px 12px rgba(244,63,94,0.06)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
                      <Heart className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    </div>
                    <p className="text-sm font-heading font-bold">¿Quieres dejar propina?</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <PropinaBtn
                      label="Sin propina"
                      sub="0%"
                      active={pctActivo === 0 && montoManual === '' && !decidirEnCaja}
                      onClick={() => elegirPorcentaje(0)}
                    />
                    {porcentajes.map((p) => (
                      <PropinaBtn
                        key={p}
                        label={`${p}%`}
                        sub={formatCurrency(Math.round(subtotal * (p / 100) * 100) / 100)}
                        active={pctActivo === p}
                        onClick={() => elegirPorcentaje(p)}
                      />
                    ))}
                  </div>

                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">O escribe otro monto:</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9]*\.?[0-9]*"
                      value={montoManual}
                      onChange={(e) => onChangeManual(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 px-3 rounded-lg border bg-card text-center text-lg font-bold"
                    />
                  </div>

                  {/* Decidir en caja — distinto de "sin propina" */}
                  <button
                    type="button"
                    onClick={elegirDecidirEnCaja}
                    className={`w-full px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                      decidirEnCaja
                        ? 'border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    Decidir en caja
                  </button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    El cobro final se confirma en caja.
                  </p>
                </div>
              )}

              {/* Resumen de totales — subtotal, propina y total final separados */}
              <div
                className="rounded-2xl p-4 bg-gradient-to-br from-primary/[0.07] via-primary/[0.04] to-primary/[0.07] border border-primary/25 space-y-2"
                style={{
                  boxShadow: '0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 18px rgba(0,0,0,0.06)',
                }}
              >
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {propinaActiva && propinaCalculada > 0 && (
                  <div className="flex justify-between text-sm text-rose-600 dark:text-rose-400">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      Propina {pctActivo > 0 ? `(${pctActivo}%)` : ''}
                    </span>
                    <span className="font-semibold tabular-nums">
                      + {formatCurrency(propinaCalculada)}
                    </span>
                  </div>
                )}
                {decidirEnCaja && (
                  <div className="flex justify-between text-xs text-amber-700 dark:text-amber-400">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" /> Propina
                    </span>
                    <span className="italic">Se decide en caja</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline font-heading font-black border-t border-primary/25 pt-2 mt-1">
                  <span className="text-sm uppercase tracking-wider">Total</span>
                  <span className="text-2xl tabular-nums text-primary">
                    {formatCurrency(totalEstimado)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground text-center pt-1 border-t border-primary/10">
                  Esta es una precuenta. El cobro final se confirma en caja.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer / acciones */}
        <div className="sticky bottom-0 bg-card border-t px-4 py-3 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            className="flex-1 h-12 rounded-xl border font-semibold disabled:opacity-50"
          >
            {enviado ? 'Cerrar' : 'Cancelar'}
          </button>
          {!enviado && venta && (
            <button
              type="button"
              onClick={confirmar}
              disabled={
                enviando || (verPrecuenta && subtotal <= 0) || (puedeElegirPropina && !yaEligio)
              }
              className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-semibold disabled:opacity-50 active:scale-95 transition-transform"
            >
              {enviando
                ? 'Enviando…'
                : puedeElegirPropina && !yaEligio
                  ? 'Elige una opción'
                  : 'Confirmar'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function PropinaBtn({ label, sub, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-2 rounded-xl border-2 text-center transition-all min-w-0 ${
        active
          ? 'border-rose-400 bg-rose-50 text-rose-700 shadow-md dark:bg-rose-950/40 dark:text-rose-300'
          : 'border-border bg-card text-muted-foreground'
      }`}
    >
      <p className="font-heading font-black text-base leading-none">{label}</p>
      <p className="text-[10px] mt-1 truncate">{sub}</p>
    </button>
  );
}

/**
 * La propina que el comensal ya había elegido, si volvió a entrar.
 *
 * Sólo se respeta cuando la eligió ÉL (`propina_origen === 'portal_qr'`): lo que
 * dejó el mesero es el estado intermedio `pendiente_portal_qr`, que significa
 * justo lo contrario —que falta por elegir—. `monto_manual` ya no se
 * preselecciona porque `ordenes` no guarda importes de propina.
 */
function propinaPreviaPct(cuenta) {
  if (cuenta?.propina_origen !== 'portal_qr') return null;
  if (cuenta.propina_tipo === 'sin_propina') return 0;
  if (cuenta.propina_tipo === 'porcentaje' && Number(cuenta.propina_porcentaje) > 0) {
    return Number(cuenta.propina_porcentaje);
  }
  return null;
}
