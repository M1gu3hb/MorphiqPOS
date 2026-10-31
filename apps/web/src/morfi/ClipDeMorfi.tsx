'use client';

import { useCallback, useEffect, useState } from 'react';

import { CLIPS, rutasDe, type ClaveDeClip } from './clips';
import { useFormatoDeMorfi, useSinMovimiento, useTurnoDeMorfi } from './use-clip';

/**
 * UN CLIP DE MORFI (DP-11.1), en el formato que el navegador sí sabe pintar con transparencia:
 * WebM (VP9 con alfa) en Chrome, Edge, Firefox y Android; WebP animado en Safari y en todo el
 * iPhone y el iPad. Con «reducir movimiento», sin turno (otro Morfi se está moviendo) o antes de
 * saber el navegador, su imagen fija. Es decorativo: el texto de al lado dice lo que pasa.
 *
 * La sombra azul eléctrico sólida viene dibujada en el clip: aquí no se le pone ningún filtro.
 * Mientras el video se descarga se ve la imagen fija (`poster`); si no se puede reproducir (sin
 * red, sin el archivo, un navegador que no decodifica el alfa), se queda en ella.
 */
export function ClipDeMorfi({
  clave,
  prioridad,
  className,
  alTerminar,
}: {
  readonly clave: ClaveDeClip;
  readonly prioridad: number;
  readonly className?: string;
  /** Sólo para los que no se repiten: cuando Morfi ya se escondió. */
  readonly alTerminar?: () => void;
}) {
  const formato = useFormatoDeMorfi();
  const sinMovimiento = useSinMovimiento();
  const conTurno = useTurnoDeMorfi(prioridad);
  const { bucle, duracionMs } = CLIPS[clave];
  const rutas = rutasDe(clave);
  const [fallo, setFallo] = useState(false);
  const [webpCargado, setWebpCargado] = useState(false);
  const anima = formato !== null && !sinMovimiento && conTurno && !fallo;

  // El WebP no avisa cuando acaba: su duración es la del clip, contada desde que CARGÓ (en una
  // tableta lenta, contarla desde que se montó se comería la animación).
  useEffect(() => {
    if (!anima || formato !== 'webp' || !webpCargado || bucle || alTerminar === undefined)
      return undefined;
    const reloj = window.setTimeout(alTerminar, duracionMs);
    return () => {
      window.clearTimeout(reloj);
    };
  }, [anima, formato, webpCargado, bucle, duracionMs, alTerminar]);

  // Un video sólo arranca solo si está en silencio desde el principio (todos los navegadores).
  const enSilencio = useCallback((video: HTMLVideoElement | null) => {
    if (video === null) return;
    video.defaultMuted = true;
    video.muted = true;
  }, []);

  if (formato === null) return <span aria-hidden="true" className={className} />;
  if (!anima) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- el clip tal cual: `next/image` lo recomprimiría
      <img
        src={rutas.fijo}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-morfi="fijo"
        className={className}
      />
    );
  }
  if (formato === 'webp') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- el clip tal cual: `next/image` lo recomprimiría
      <img
        src={rutas.webp}
        alt=""
        aria-hidden="true"
        draggable={false}
        data-morfi="webp"
        onLoad={() => {
          setWebpCargado(true);
        }}
        onError={() => {
          setFallo(true);
        }}
        className={className}
      />
    );
  }
  return (
    <video
      ref={enSilencio}
      src={rutas.webm}
      poster={rutas.fijo}
      onError={() => {
        setFallo(true);
      }}
      muted
      autoPlay
      playsInline
      loop={bucle}
      preload="auto"
      disablePictureInPicture
      aria-hidden="true"
      data-morfi="webm"
      onEnded={alTerminar}
      className={className}
    />
  );
}
