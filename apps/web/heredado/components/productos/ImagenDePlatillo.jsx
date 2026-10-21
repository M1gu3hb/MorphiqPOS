'use client';
import React, { useState } from 'react';

/**
 * LA FOTO DE UN PLATILLO, con proporción fija y una salida digna cuando no hay foto.
 *
 * ── Qué resuelve ─────────────────────────────────────────────────────────────────
 * Las fotos llegan de fuentes distintas —subidas por el dueño, archivos locales
 * `/platillos/<archivo>.webp`— y no miden lo mismo. Con una altura fija (`h-32`) y
 * `object-cover` el recorte dependía del ancho de la tarjeta, que cambia con la pantalla,
 * y una foto que no cargaba dejaba el icono roto del navegador en medio de la carta.
 *
 *   · `aspect-[16/9]` + `object-cover`: la caja tiene SIEMPRE la misma proporción, así
 *     que todas las tarjetas de una fila miden lo mismo arriba, y la foto se recorta al
 *     centro en lugar de estirarse.
 *   · `width`/`height` + `loading="lazy"` + `decoding="async"`: reserva su hueco antes
 *     de bajar (nada salta) y no descarga la carta entera para pintar las ocho
 *     tarjetas que se ven.
 *   · Sin URL, o si la foto falla al cargar: la inicial del platillo sobre el fondo
 *     del sistema. Nunca un hueco, nunca el icono roto.
 *
 * `alt=""` a propósito: el nombre del platillo está en la tarjeta, junto a la foto, y
 * repetirlo haría que el lector de pantalla lo dijera dos veces.
 */
const ANCHO_DE_LA_FOTO = 640;
const ALTO_DE_LA_FOTO = 360;

export default function ImagenDePlatillo({ url, nombre, className = '' }) {
  // La URL que falló, y no un booleano: si el dueño cambia la foto, la nueva se intenta.
  const [urlRota, setUrlRota] = useState(null);
  const hayFoto = typeof url === 'string' && url.trim() !== '' && urlRota !== url;
  const inicial = (nombre || '').trim().charAt(0).toUpperCase() || '·';

  return (
    <div className={`relative aspect-[16/9] w-full overflow-hidden bg-muted ${className}`}>
      {hayFoto ? (
        <img
          src={url}
          alt=""
          width={ANCHO_DE_LA_FOTO}
          height={ALTO_DE_LA_FOTO}
          loading="lazy"
          decoding="async"
          onError={() => setUrlRota(url)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label="Sin foto"
          className="flex h-full w-full items-center justify-center"
        >
          <span
            aria-hidden="true"
            className="select-none font-heading text-5xl font-black text-muted-foreground/40"
          >
            {inicial}
          </span>
        </div>
      )}
    </div>
  );
}
