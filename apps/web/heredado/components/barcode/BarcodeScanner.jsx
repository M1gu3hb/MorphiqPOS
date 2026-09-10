'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, X, Keyboard, SwitchCamera, AlertCircle, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { normalizeBarcode, isLikelyValidBarcode, isSuspiciousBarcode } from '@/utils/barcodeUtils';
import ScanFeedbackOverlay from './ScanFeedbackOverlay';
import ScannerMiniCart from './ScannerMiniCart';
// El restaurante llama a este botón `SoundUnlockButton`; la tiendita lo llamaba
// `ActivarSonidoButton`. Es el mismo trabajo: desbloquear el audio con el
// primer gesto del usuario, que es lo único que los navegadores aceptan.
import ActivarSonidoButton from '@/components/common/SoundUnlockButton';

/**
 * BarcodeScanner — modal reutilizable con lectura ESTABLE.
 *
 * Estrategia detección:
 *  1) BarcodeDetector nativo (rápido, Chrome Android, Edge, Safari iOS 17+)
 *  2) Fallback @zxing/browser (iPhone/Safari < 17, Firefox)
 *  3) Entrada manual si no hay cámara
 *
 * Estabilidad:
 *  - Mismo código normalizado debe leerse `minStableScans` veces seguidas (default 3).
 *  - Si el código cambia, contador se reinicia.
 *  - Si código es sospechoso (muy corto), no auto-aceptar.
 *
 * Confirmación (requireConfirmation=true):
 *  - Al estabilizarse, NO acepta automático: muestra botones Usar / Reintentar / Manual / Cancelar.
 *
 * Props:
 *  - open, onClose, onDetected(code)
 *  - title?
 *  - continuous? (no cierra tras aceptar, para POS)
 *  - requireConfirmation? (default false, Productos lo usa en true)
 *  - minStableScans? (default 3)
 *  - mode? ('product' | 'pos' | 'purchase' | 'remote')
 *  - feedback? { id, nombre, cantidad, precio, modo } | null  – overlay verde "agregado"
 *  - onFeedbackHide?
 *  - miniCart? { items, total, sym, recentScans, mode } | null
 *  - onViewCart?
 *  - onFinish?
 */
export default function BarcodeScanner({
  open,
  onClose,
  onDetected,
  title = 'Escanear código de barras',
  continuous = false,
  requireConfirmation = false,
  minStableScans = 3,
  mode = 'pos',
  feedback = null,
  onFeedbackHide,
  miniCart = null,
  onViewCart,
  onFinish,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const rafRef = useRef(null);

  // Estabilidad
  const stableRef = useRef({ code: '', count: 0 });
  // Anti-duplicado tras aceptación en modo continuo
  const lastAcceptedRef = useRef({ code: '', ts: 0 });
  // Suspender detección mientras esperamos confirmación
  const pausedRef = useRef(false);

  const engineRef = useRef('none'); // 'native' | 'zxing' | 'none'
  const [engine, setEngine] = useState('none');
  const [error, setError] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [scanning, setScanning] = useState(false);

  // UI: candidato actual + contador estabilidad + código a confirmar
  const [candidate, setCandidate] = useState('');
  const [stableCount, setStableCount] = useState(0);
  const [pendingCode, setPendingCode] = useState(null);

  // Detectar motor disponible al abrir
  useEffect(() => {
    if (!open) return;
    if (typeof window === 'undefined') return;

    if ('BarcodeDetector' in window) {
      try {
        detectorRef.current = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code'],
        });
        engineRef.current = 'native';
        setEngine('native');
        return;
      } catch { /* fallthrough */ }
    }

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      engineRef.current = 'zxing';
      setEngine('zxing');
      return;
    }

    engineRef.current = 'none';
    setEngine('none');
    setManualMode(true);
  }, [open]);

  // Reset al abrir
  useEffect(() => {
    if (open) {
      stableRef.current = { code: '', count: 0 };
      lastAcceptedRef.current = { code: '', ts: 0 };
      pausedRef.current = false;
      setCandidate('');
      setStableCount(0);
      setPendingCode(null);
      setError(null);
      setManualValue('');
    }
  }, [open]);

  // Apagar cámara y loops
  const stopCamera = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (zxingControlsRef.current) {
      try { zxingControlsRef.current.stop(); } catch { /* noop */ }
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  // Procesar una lectura cruda (de cualquier motor)
  const processRaw = useCallback((raw) => {
    if (pausedRef.current) return;
    const code = normalizeBarcode(raw);
    if (!code) return;

    // Cooldown post-aceptación en modo continuo (1.5s)
    const now = Date.now();
    if (code === lastAcceptedRef.current.code && now - lastAcceptedRef.current.ts < 1500) return;

    // Actualizar candidato/estabilidad
    if (code !== stableRef.current.code) {
      stableRef.current = { code, count: 1 };
      setCandidate(code);
      setStableCount(1);
      return;
    }
    stableRef.current.count += 1;
    setStableCount(stableRef.current.count);

    if (stableRef.current.count >= minStableScans) {
      // Estable → decidir
      const suspicious = isSuspiciousBarcode(code);
      // Si requireConfirmation → siempre pausa y muestra botones
      // Si es sospechoso → forzar confirmación
      if (requireConfirmation || suspicious) {
        pausedRef.current = true;
        setPendingCode(code);
        return;
      }
      // Aceptar automáticamente
      acceptCode(code);
    }
  }, [minStableScans, requireConfirmation]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptCode = useCallback((code) => {
    const normalized = normalizeBarcode(code);
    if (!normalized) return;
    lastAcceptedRef.current = { code: normalized, ts: Date.now() };
    // Reiniciar candidato
    stableRef.current = { code: '', count: 0 };
    setCandidate('');
    setStableCount(0);
    setPendingCode(null);

    // Vibración táctil suave si está disponible (móvil)
    try { if (navigator.vibrate) navigator.vibrate(60); } catch { /* noop */ }

    onDetected(normalized);

    if (!continuous) {
      stopCamera();
      onClose();
    } else {
      // En modo continuo seguimos escuchando, dejamos pausado 600ms para que el lector se aleje del mismo código
      pausedRef.current = true;
      setTimeout(() => { pausedRef.current = false; }, 600);
    }
  }, [continuous, onClose, onDetected, stopCamera]);

  // Loop nativo
  const scanLoopNative = useCallback(async () => {
    if (!detectorRef.current || !videoRef.current || videoRef.current.readyState < 2) {
      rafRef.current = requestAnimationFrame(scanLoopNative);
      return;
    }
    try {
      const codes = await detectorRef.current.detect(videoRef.current);
      if (codes && codes.length > 0) {
        processRaw(codes[0].rawValue);
      }
    } catch { /* puntual */ }
    rafRef.current = requestAnimationFrame(scanLoopNative);
  }, [processRaw]);

  // Iniciar cámara
  const startCamera = useCallback(async () => {
    if (manualMode) return;
    setError(null);

    if (engineRef.current === 'native') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScanning(true);
          scanLoopNative();
        }
      } catch (err) { handleCameraError(err); }
      return;
    }

    if (engineRef.current === 'zxing') {
      try {
        const reader = new BrowserMultiFormatReader();
        const constraints = {
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        const controls = await reader.decodeFromConstraints(
          constraints,
          videoRef.current,
          (result /* , err */) => {
            if (result) processRaw(result.getText());
          }
        );
        zxingControlsRef.current = controls;
        if (videoRef.current && videoRef.current.srcObject) {
          streamRef.current = videoRef.current.srcObject;
        }
        setScanning(true);
      } catch (err) { handleCameraError(err); }
    }
  }, [facingMode, manualMode, scanLoopNative, processRaw]);

  const handleCameraError = (err) => {
    console.error('Cámara error:', err);
    if (err?.name === 'NotAllowedError') {
      setError('Permiso de cámara denegado. Habilítalo en los ajustes del navegador.');
    } else if (err?.name === 'NotFoundError') {
      setError('No se encontró cámara en este dispositivo.');
    } else if (err?.name === 'NotReadableError') {
      setError('La cámara está en uso por otra aplicación.');
    } else {
      setError('Tu navegador no permite escaneo por cámara. Ingresa el código manualmente.');
    }
    setManualMode(true);
  };

  // Arrancar/detener
  useEffect(() => {
    if (open && !manualMode && engine !== 'none') {
      startCamera();
    }
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, manualMode, engine, facingMode]);

  // Cleanup al cerrar
  useEffect(() => {
    if (!open) {
      stopCamera();
      setManualValue('');
      setError(null);
      setManualMode(false);
      setPendingCode(null);
    }
  }, [open, stopCamera]);

  // Confirmar/reintentar desde la UI
  const handleConfirmPending = () => {
    if (pendingCode) acceptCode(pendingCode);
  };
  const handleRetryPending = () => {
    stableRef.current = { code: '', count: 0 };
    setCandidate('');
    setStableCount(0);
    setPendingCode(null);
    pausedRef.current = false;
  };

  // Manual robusto
  const handleManualSubmit = () => {
    const code = normalizeBarcode(manualValue);
    if (!code) {
      toast.error('Ingresa un código');
      return;
    }
    if (isSuspiciousBarcode(code)) {
      // Aceptar pero advertir (el padre decide si es válido)
      toast.warning('Este código parece corto. Confirma que sea correcto.');
    }
    setManualValue('');
    // Siempre disparar onDetected — el padre maneja lo que sigue
    onDetected(code);
    if (!continuous) onClose();
  };

  const switchCamera = () => {
    stopCamera();
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!open) return null;

  const canUseCamera = engine !== 'none';

  // Texto de estado en cámara
  let statusText = 'Buscando código…';
  if (candidate && !pendingCode) {
    statusText = `Confirmando lectura ${Math.min(stableCount, minStableScans)}/${minStableScans}`;
  }
  if (pendingCode) statusText = 'Código listo — revísalo';

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white flex-shrink-0">
        <h2 className="text-base font-bold flex items-center gap-2">
          <Camera className="h-5 w-5" /> {title}
        </h2>
        <button
          onClick={() => { stopCamera(); onClose(); }}
          className="h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden flex flex-col items-center justify-center">
        {manualMode ? (
          <div className="w-full max-w-md p-6 space-y-4">
            {!canUseCamera && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-100">
                  Tu navegador no permite escaneo por cámara. Ingresa el código manualmente.
                </div>
              </div>
            )}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-100">{error}</div>
              </div>
            )}
            <div>
              <label className="text-sm font-semibold text-white block mb-2">Código de barras</label>
              <Input
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualSubmit(); } }}
                placeholder="Escribe o escanea con lector USB..."
                autoFocus
                inputMode="numeric"
                className="h-12 text-base bg-white text-gray-900"
              />
              {manualValue && isSuspiciousBarcode(manualValue) && (
                <p className="text-xs text-amber-300 mt-1">
                  Este código parece corto. Revisa que esté completo.
                </p>
              )}
            </div>
            <Button onClick={handleManualSubmit} className="w-full h-12 bg-primary text-base font-bold">
              <Check className="h-5 w-5 mr-1" /> Confirmar código
            </Button>
            {canUseCamera && (
              <button
                onClick={() => { setManualMode(false); setError(null); }}
                className="w-full text-sm text-blue-300 hover:text-blue-200 underline"
              >
                Volver a escaneo con cámara
              </button>
            )}
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Mini-carrito superior */}
            {miniCart && (
              <ScannerMiniCart
                items={miniCart.items}
                total={miniCart.total}
                sym={miniCart.sym}
                recentScans={miniCart.recentScans}
                mode={miniCart.mode || 'local'}
                onViewCart={onViewCart}
                onFinish={onFinish}
              />
            )}

            {/* Botón contextual "Activar sonido" — flotante, no tapa cámara ni carrito */}
            {!pendingCode && (
              <div className="absolute left-1/2 -translate-x-1/2 z-30 pointer-events-none"
                   style={{ top: miniCart ? '110px' : '16px' }}>
                <ActivarSonidoButton variant="overlay" />
              </div>
            )}

            {/* Feedback verde "Producto agregado" */}
            <ScanFeedbackOverlay
              feedback={feedback}
              sym={miniCart?.sym || '$'}
              onHide={onFeedbackHide}
            />

            {/* Overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative" style={{ width: 'min(85vw, 360px)', height: '180px' }}>
                {['top-0 left-0 border-t-4 border-l-4', 'top-0 right-0 border-t-4 border-r-4',
                  'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4'].map((cls, i) => (
                  <div key={i} className={`absolute h-8 w-8 border-white ${cls} rounded-md`} />
                ))}
                <div className="absolute inset-x-4 top-1/2 h-[2px] bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.8)] scan-line" />
              </div>

              {/* Estado + candidato */}
              <div className="mt-4 flex flex-col items-center gap-2 px-4">
                <p className="text-white text-sm font-medium drop-shadow-lg bg-black/50 px-4 py-2 rounded-full">
                  {statusText}
                </p>
                {candidate && (
                  <p className="text-white/90 text-xs font-mono bg-black/50 px-3 py-1 rounded-full">
                    {candidate}
                  </p>
                )}
                {engine === 'zxing' && !pendingCode && (
                  <p className="text-white/50 text-[10px]">Modo compatible</p>
                )}
              </div>
            </div>

            {/* Tarjeta de confirmación (pendingCode) */}
            {pendingCode && (
              <div className="absolute bottom-4 left-3 right-3 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-4 pointer-events-auto">
                <p className="text-xs text-muted-foreground mb-1">Código detectado:</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground mb-3 break-all">
                  {pendingCode}
                </p>
                {isSuspiciousBarcode(pendingCode) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 flex items-start gap-1">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    Este código parece incompleto. Revísalo o reintenta.
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={handleRetryPending}
                    variant="outline"
                    className="flex-1 h-11"
                  >
                    <RotateCcw className="h-4 w-4 mr-1" /> Reintentar
                  </Button>
                  <Button
                    onClick={handleConfirmPending}
                    className="flex-1 h-11 bg-primary text-base font-bold"
                  >
                    <Check className="h-5 w-5 mr-1" /> Usar este código
                  </Button>
                </div>
              </div>
            )}

            {!scanning && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="text-white text-sm">Iniciando cámara…</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 flex-shrink-0">
        <Button
          onClick={() => setManualMode(m => !m)}
          variant="outline"
          className="flex-1 bg-gray-800 border-gray-700 text-white hover:bg-gray-700 h-11"
        >
          <Keyboard className="h-4 w-4 mr-1" />
          {manualMode ? 'Usar cámara' : 'Ingresar manual'}
        </Button>
        {!manualMode && canUseCamera && (
          <Button
            onClick={switchCamera}
            variant="outline"
            size="icon"
            className="bg-gray-800 border-gray-700 text-white hover:bg-gray-700 h-11 w-11"
            title="Cambiar cámara"
          >
            <SwitchCamera className="h-5 w-5" />
          </Button>
        )}
      </div>

      <style>{`
        @keyframes scanline {
          0%, 100% { transform: translateY(-70px); opacity: 0.4; }
          50% { transform: translateY(70px); opacity: 1; }
        }
        .scan-line { animation: scanline 1.8s ease-in-out infinite; }
      `}</style>
    </div>
  );
}