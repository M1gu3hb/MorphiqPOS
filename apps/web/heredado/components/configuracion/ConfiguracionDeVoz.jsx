'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PlayCircle, Volume2 } from 'lucide-react';
import {
  getPreferredVoiceName,
  getVoiceRate,
  isVoiceSupported,
  listVoices,
  setPreferredVoice,
  setVoiceRate,
  speakSample,
} from '@/lib/voiceAlert';
import { VELOCIDAD_MAXIMA, VELOCIDAD_MINIMA } from '~/voz/preferencia-de-voz';
import { MUESTRA_DE_VOZ, estadoDeLaEleccion, vocesParaElegir } from '~/voz/voces';

/**
 * Configuración · «Voz de los avisos».
 *
 * Es autocontenida: no recibe props ni lee la configuración del negocio. Se monta en
 * Configuración con `<ConfiguracionDeVoz />`.
 *
 * ── Qué hace ────────────────────────────────────────────────────────────
 * Lista las voces en ESPAÑOL que ESTE dispositivo tiene instaladas (México primero, luego
 * Estados Unidos y el resto de América, al final España), deja escuchar una muestra de cada
 * una —«Mesa cuatro, su orden está lista.»— y guarda la elegida. La primera opción es
 * siempre «Automática»: la voz que el sistema ya escogía solo, que sigue siendo la
 * predeterminada. `voiceAlert.js` usa la elegida si el dispositivo la tiene y, si no, cae a
 * la automática.
 *
 * ── La preferencia es del DISPOSITIVO ───────────────────────────────────
 * Se guarda en el `localStorage` de este navegador (`mh_voice_manual` y `mh_voice_rate`),
 * nunca en la configuración compartida del negocio: un teléfono Android y un iPhone no
 * tienen las mismas voces, y la de uno no debe pisar la del otro.
 *
 * ── Lo que NO se muestra ────────────────────────────────────────────────
 *   · Voces que no son español.
 *   · Voces en la nube cuando no hay internet (no sonarían).
 *   · Una voz que acaba de fallar al escucharla: se quita de la lista hasta recargar, y si
 *     era la guardada, se vuelve a la automática en vez de dejar avisos mudos.
 *
 * La VELOCIDAD es un ajuste de la voz elegida y se presenta aparte; nunca como «otra voz».
 *
 * ── Audio en el teléfono (iOS y Android) ────────────────────────────────
 * Safari en iPhone/iPad y Chrome en Android no dejan sonar la voz hasta que la persona toca
 * la pantalla: el primer `speak()` tiene que ocurrir en la misma pila de llamadas que un
 * toque. Por eso la primera reproducción SIEMPRE sale de un botón («Escuchar», «Probar
 * voz») y `speakSample` es síncrona, sin `await` entre el toque y la voz. Otras notas:
 *   · iPhone: el interruptor lateral en silencio calla la voz, y con la pantalla bloqueada
 *     o la pestaña en segundo plano el sistema pausa el audio.
 *   · Android: las voces de Google en la nube necesitan internet; las que se descargan en
 *     Ajustes → Idioma → Texto a voz suenan sin conexión.
 *   · Algunos navegadores cargan las voces unos instantes después de abrir la página (o no
 *     avisan cuando están): la lista se vuelve a leer sola unas veces antes de rendirse.
 */

/** Cuántas veces se vuelve a pedir la lista si el navegador la entrega vacía. */
const REINTENTOS_DE_CARGA = 6;
const ESPERA_ENTRE_REINTENTOS_MS = 500;

/** Si una muestra no empieza a sonar en este tiempo, esa voz no responde. */
const ESPERA_DE_LA_MUESTRA_MS = 5000;

/** La clave de la fila «Automática» (ninguna voz tiene nombre vacío). */
const CLAVE_AUTOMATICA = '';

/** Todas las filas son UN grupo de radio: con el mismo `name` las flechas pasan de una a otra. */
const GRUPO_DE_RADIO = 'voz-del-dispositivo';

/** Los códigos de la Web Speech API que significan «el navegador no me dejó», no «esta voz falla». */
const CODIGO_DE_AUDIO_BLOQUEADO = 'not-allowed';

/** Lee la lista de voces del navegador y la mantiene al día. */
function useVocesDelDispositivo() {
  const [estado, setEstado] = useState({ soportada: null, voces: [] });

  useEffect(() => {
    if (!isVoiceSupported()) {
      setEstado({ soportada: false, voces: [] });
      return undefined;
    }
    let cancelado = false;
    let intentos = 0;
    let temporizador = 0;

    const leer = () => {
      if (cancelado) return 0;
      const voces = listVoices();
      setEstado({ soportada: true, voces });
      return voces.length;
    };
    const reintentar = () => {
      if (cancelado) return;
      if (leer() > 0 || intentos >= REINTENTOS_DE_CARGA) return;
      intentos += 1;
      temporizador = window.setTimeout(reintentar, ESPERA_ENTRE_REINTENTOS_MS);
    };

    const sintesis = window.speechSynthesis;
    reintentar();
    // `addEventListener` y no `onvoiceschanged =`: esa propiedad es una sola, y
    // `voiceAlert.js` ya la usa. Con el evento conviven las dos. Un Safari viejo no trae
    // `addEventListener` en `speechSynthesis`: ahí quedan los reintentos de arriba.
    const conEventos = typeof sintesis.addEventListener === 'function';
    if (conEventos) sintesis.addEventListener('voiceschanged', leer);
    return () => {
      cancelado = true;
      window.clearTimeout(temporizador);
      if (conEventos) sintesis.removeEventListener('voiceschanged', leer);
    };
  }, []);

  return estado;
}

/** ¿Hay internet? Se vuelve a leer cuando el navegador avisa. */
function useEnLinea() {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    const leer = () => setEnLinea(typeof navigator === 'undefined' ? true : navigator.onLine);
    leer();
    window.addEventListener('online', leer);
    window.addEventListener('offline', leer);
    return () => {
      window.removeEventListener('online', leer);
      window.removeEventListener('offline', leer);
    };
  }, []);
  return enLinea;
}

function FilaDeVoz({ id, titulo, detalle, seleccionada, sonando, onElegir, onEscuchar }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
        seleccionada ? 'border-primary bg-primary/10' : 'border-border bg-card'
      }`}
    >
      <input
        type="radio"
        id={id}
        name={GRUPO_DE_RADIO}
        checked={seleccionada}
        onChange={onElegir}
        className="h-4 w-4 shrink-0 accent-primary"
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block truncate text-sm font-medium">{titulo}</span>
        <span className="block truncate text-xs text-muted-foreground">{detalle}</span>
      </label>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onEscuchar}
        className="shrink-0 gap-1.5"
        aria-label={`Escuchar ${titulo}`}
      >
        <PlayCircle className="h-4 w-4" />
        {sonando ? 'Sonando…' : 'Escuchar'}
      </Button>
    </div>
  );
}

export default function ConfiguracionDeVoz() {
  const { soportada, voces } = useVocesDelDispositivo();
  const enLinea = useEnLinea();
  const [elegida, setElegida] = useState('');
  const [velocidad, setVelocidad] = useState(1);
  const [fallidas, setFallidas] = useState(() => new Set());
  const [sonando, setSonando] = useState(null);
  const [aviso, setAviso] = useState(null);
  const vigilante = useRef(0);
  // Cada muestra tiene su turno. Al tocar «Escuchar» en otra voz, el navegador corta la anterior
  // y sus eventos (`onend`, `onerror`) llegan DESPUÉS de que la nueva ya arrancó: sin el turno,
  // el final de la vieja apagaba el vigilante y el «Sonando…» de la nueva.
  const turno = useRef(0);

  // La preferencia se lee en el navegador, no al renderizar en el servidor.
  useEffect(() => {
    setElegida(getPreferredVoiceName());
    setVelocidad(getVoiceRate());
    return () => window.clearTimeout(vigilante.current);
  }, []);

  const opciones = useMemo(
    () => vocesParaElegir(voces, { enLinea }).filter((voz) => !fallidas.has(voz.nombre)),
    [voces, enLinea, fallidas],
  );
  const estado = estadoDeLaEleccion(voces, elegida, { enLinea });
  const hayElegida = estado === 'elegida' && opciones.some((voz) => voz.nombre === elegida);

  const decir = (tono, texto) => setAviso({ tono, texto });

  const elegir = (nombre) => {
    if (!setPreferredVoice(nombre)) {
      decir(
        'error',
        'Este navegador no dejó guardar la elección. Al recargar volverá la voz automática.',
      );
      return;
    }
    setElegida(nombre);
    decir(
      'ok',
      nombre === CLAVE_AUTOMATICA
        ? 'Listo: este dispositivo usará la voz automática.'
        : 'Voz guardada en este dispositivo.',
    );
  };

  /** Una voz que no suena sale de la lista; si era la guardada, se vuelve a la automática. */
  const retirar = (nombre, motivo) => {
    setFallidas((previas) => new Set(previas).add(nombre));
    if (nombre === elegida) {
      setPreferredVoice('');
      setElegida('');
      decir(
        'error',
        `${motivo} Era la voz guardada, así que este dispositivo vuelve a la automática.`,
      );
      return;
    }
    decir('error', `${motivo} La quitamos de la lista.`);
  };

  /**
   * Escucha una muestra. SÍNCRONA a propósito: se llama desde el clic y llega a
   * `speechSynthesis.speak()` sin pasar por un `await` (ver el encabezado: iOS y Android).
   */
  const escuchar = (nombre, etiqueta) => {
    window.clearTimeout(vigilante.current);
    setAviso(null);
    turno.current += 1;
    const mio = turno.current;

    const empezo = speakSample(MUESTRA_DE_VOZ, {
      voiceName: nombre,
      rate: velocidad,
      onStart: () => {
        if (mio !== turno.current) return;
        window.clearTimeout(vigilante.current);
        setSonando(nombre);
      },
      onEnd: () => {
        if (mio !== turno.current) return;
        window.clearTimeout(vigilante.current);
        setSonando((actual) => (actual === nombre ? null : actual));
      },
      onError: (codigo) => {
        if (mio !== turno.current) return;
        window.clearTimeout(vigilante.current);
        setSonando(null);
        if (codigo === CODIGO_DE_AUDIO_BLOQUEADO) {
          decir(
            'error',
            'El navegador bloqueó el audio. Toca «Escuchar» otra vez; si sigue mudo, revisa el volumen y el modo silencio del teléfono.',
          );
        } else if (nombre === CLAVE_AUTOMATICA) {
          decir(
            'error',
            'La voz automática no sonó. Revisa el volumen y que el teléfono no esté en silencio.',
          );
        } else {
          retirar(nombre, `«${etiqueta}» no suena en este dispositivo.`);
        }
      },
    });

    if (!empezo) {
      decir('error', 'No se pudo reproducir la muestra en este navegador.');
      return;
    }
    setSonando(nombre);
    // Hay voces que ni suenan ni dan error (las de la nube, con mala red). Sin vigilante la
    // fila se quedaría en «Sonando…» para siempre.
    vigilante.current = window.setTimeout(() => {
      if (mio !== turno.current) return;
      try {
        window.speechSynthesis.cancel();
      } catch {}
      setSonando(null);
      if (nombre === CLAVE_AUTOMATICA) {
        decir('error', 'La voz automática no respondió. Revisa el volumen del dispositivo.');
      } else {
        retirar(nombre, `«${etiqueta}» no respondió.`);
      }
    }, ESPERA_DE_LA_MUESTRA_MS);
  };

  const cambiarVelocidad = (valor) => setVelocidad(setVoiceRate(valor));

  if (soportada === null) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-base">
          <Volume2 className="h-5 w-5 text-primary" /> Voz de los avisos
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Con qué voz te avisa este dispositivo cuando un pedido está listo o una mesa llama. Se
          guarda sólo aquí: cada teléfono, tableta o monitor tiene sus propias voces.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {soportada === false ? (
          <p className="rounded-md border border-advertencia/30 bg-advertencia/10 px-3 py-2 text-xs text-advertencia">
            Este navegador no puede hablar. Los avisos se darán con sonido y en pantalla; para
            usar voz abre el sistema en Chrome, Edge o Safari.
          </p>
        ) : (
          <>
            {/* `min-w-0`: un fieldset mide por omisión lo que su contenido, y en el teléfono los renglones
                de voz no se encogían: la pestaña Apariencia se desbordaba a lo ancho (DP-11.1). */}
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1 text-sm font-semibold">Voz</legend>

              <FilaDeVoz
                id="voz-automatica"
                titulo="Automática (recomendada)"
                detalle="La mejor voz en español que tenga este dispositivo."
                seleccionada={!hayElegida}
                sonando={sonando === CLAVE_AUTOMATICA}
                onElegir={() => elegir(CLAVE_AUTOMATICA)}
                onEscuchar={() => escuchar(CLAVE_AUTOMATICA, 'Automática')}
              />

              {opciones.map((voz, indice) => (
                <FilaDeVoz
                  key={`${voz.nombre}-${voz.idioma}`}
                  id={`voz-${indice}`}
                  titulo={voz.etiqueta}
                  detalle={`${voz.region}${voz.local ? '' : ' · necesita internet'}`}
                  seleccionada={hayElegida && elegida === voz.nombre}
                  sonando={sonando === voz.nombre}
                  onElegir={() => elegir(voz.nombre)}
                  onEscuchar={() => escuchar(voz.nombre, voz.etiqueta)}
                />
              ))}

              {opciones.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {voces.length === 0
                    ? 'Este dispositivo todavía no entrega su lista de voces. Si no aparece ninguna en unos segundos, usa la automática.'
                    : 'Este dispositivo no tiene voces en español disponibles ahora. Se usa la voz por defecto del sistema.'}
                </p>
              )}
            </fieldset>

            {estado === 'no-disponible' && (
              <p className="rounded-md border border-advertencia/30 bg-advertencia/10 px-3 py-2 text-xs text-advertencia">
                La voz que se guardó no está en este dispositivo. Mientras no elijas otra, se
                usa la automática.
              </p>
            )}
            {estado === 'sin-conexion' && (
              <p className="rounded-md border border-advertencia/30 bg-advertencia/10 px-3 py-2 text-xs text-advertencia">
                La voz guardada necesita internet y ahora no hay. Mientras tanto se usa la
                automática; la tuya vuelve sola con la conexión.
              </p>
            )}

            <div>
              <Label htmlFor="velocidad-de-la-voz" className="text-xs">
                Velocidad de la voz
              </Label>
              <input
                id="velocidad-de-la-voz"
                type="range"
                min={VELOCIDAD_MINIMA}
                max={VELOCIDAD_MAXIMA}
                step="0.05"
                value={velocidad}
                onChange={(evento) => cambiarVelocidad(parseFloat(evento.target.value))}
                aria-valuetext={`${Math.round(velocidad * 100)} por ciento`}
                className="w-full"
              />
              <p className="text-[10px] text-muted-foreground">
                {Math.round(velocidad * 100)}% · Es un ajuste de la voz que elegiste, no otra
                voz.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => escuchar(hayElegida ? elegida : CLAVE_AUTOMATICA, 'La voz elegida')}
                className="gap-2"
              >
                <PlayCircle className="h-4 w-4" /> Probar voz
              </Button>
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                «{MUESTRA_DE_VOZ}»
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground">
              En iPhone, iPad y Android el navegador sólo deja sonar la voz después de que tocas
              la pantalla; por eso la primera vez hay que usar «Probar voz» o «Escuchar». Si no
              se oye nada, sube el volumen y revisa que el teléfono no esté en silencio (en
              iPhone, el interruptor lateral).
            </p>
          </>
        )}

        {aviso && (
          <p
            role="status"
            className={`rounded-md border px-3 py-2 text-xs ${
              aviso.tono === 'ok'
                ? 'border-exito/30 bg-exito/10 text-exito'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            {aviso.texto}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
