'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { ChevronDown, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { PlatilloParaPedir, type PlatilloPublico } from '../PlatilloParaPedir';
import {
  cajaDelBoton,
  platillosDelBoton,
  precioDelBoton,
  type BotonDePagina,
} from './botones-de-pagina';

export interface PaginaConBotonesProps {
  readonly pagina: {
    readonly id: string;
    readonly nombre: string;
    readonly descripcion?: string | null;
    readonly imagen_url?: string | null;
    readonly botones?: readonly BotonDePagina[] | null;
  };
  readonly productos: readonly PlatilloPublico[];
  readonly mostrarPrecios: boolean;
  /** Abre el diálogo de opciones de siempre. */
  readonly alPedir: (platillo: PlatilloPublico) => void;
}

/** La marca del botón sobre la imagen: «+» y, si se pide, el precio vigente del sistema. */
function Marca({
  centavos,
  icono,
}: {
  readonly centavos: number | null;
  readonly icono: ReactElement;
}) {
  return (
    <Badge className="pointer-events-none absolute top-1/2 right-0 max-h-full -translate-y-1/2 gap-0.5 rounded-full px-1.5 py-0 leading-none shadow-2">
      {centavos === null ? null : <Dinero centavos={centavos} tamano="xs" />}
      {icono}
    </Badge>
  );
}

/**
 * UNA PÁGINA DEL MENÚ SUBIDO CON SUS BOTONES ENCIMA (DP-9.7).
 *
 * Cada botón cubre su renglón de la carta, en % de la imagen: se toca el platillo donde se lee.
 * Uno de platillo abre el diálogo de siempre; uno de grupo despliega sus platillos bajo la
 * página. Sin botones (o sin poder pedir) la página es sólo imagen: ya no va la lista repetida.
 */
export function PaginaConBotones({
  pagina,
  productos,
  mostrarPrecios,
  alPedir,
}: PaginaConBotonesProps) {
  const [abierto, setAbierto] = useState<string | null>(null);
  // Los botones van en % de la imagen: hasta que la imagen tiene tamaño no hay dónde ponerlos (se
  // amontonarían arriba). Si no carga, los platillos de la página salen en lista para no dejar
  // al comensal sin pedir.
  const [imagen, setImagen] = useState<'cargando' | 'lista' | 'fallo'>('cargando');
  const elemento = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = elemento.current;
    if (img?.complete === true) setImagen(img.naturalWidth > 0 ? 'lista' : 'fallo');
  }, []);
  const botones = pagina.botones ?? [];
  const grupo = botones.find((b) => b.id === abierto && b.tipo === 'grupo');
  const delGrupo =
    imagen === 'fallo'
      ? botones.flatMap((b) => platillosDelBoton(b, productos))
      : grupo === undefined
        ? []
        : platillosDelBoton(grupo, productos);
  const titulo = imagen === 'fallo' ? `Pedir de ${pagina.nombre}` : (grupo?.etiqueta ?? null);

  return (
    <Superficie
      como="article"
      id={`pagina-${pagina.id}`}
      aria-label={pagina.nombre}
      relleno={0}
      className="scroll-mt-[calc(var(--altura-control)*2)] overflow-hidden"
    >
      {typeof pagina.imagen_url === 'string' && pagina.imagen_url !== '' ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- la carta del negocio, tal cual */}
          <img
            ref={elemento}
            src={pagina.imagen_url}
            alt={pagina.nombre}
            className="block h-auto w-full"
            onLoad={() => {
              setImagen('lista');
            }}
            onError={() => {
              setImagen('fallo');
            }}
          />
          {(imagen === 'lista' ? botones : []).map((boton) => {
            const [primero] = platillosDelBoton(boton, productos);
            if (primero === undefined) return null;
            const esGrupo = boton.tipo === 'grupo';
            return (
              <Button
                key={boton.id}
                type="button"
                variant="ghost"
                aria-label={
                  esGrupo ? `Ver ${boton.etiqueta ?? 'opciones'}` : `Agregar ${primero.nombre}`
                }
                aria-expanded={esGrupo ? abierto === boton.id : undefined}
                onClick={() => {
                  if (esGrupo) setAbierto(abierto === boton.id ? null : boton.id);
                  else alPedir(primero);
                }}
                style={cajaDelBoton(boton)}
                className="absolute h-auto rounded-md p-0 hover:bg-primario/10 active:bg-primario/20"
              >
                <Marca
                  centavos={esGrupo ? null : precioDelBoton(boton, primero, mostrarPrecios)}
                  icono={
                    esGrupo ? (
                      <ChevronDown aria-hidden className="size-3" />
                    ) : (
                      <Plus aria-hidden className="size-3" />
                    )
                  }
                />
              </Button>
            );
          })}
        </div>
      ) : null}
      <div className="p-(--espacio-3)">
        <p className="font-bold">{pagina.nombre}</p>
        {typeof pagina.descripcion === 'string' && pagina.descripcion !== '' ? (
          <p className="text-xs text-texto-sutil">{pagina.descripcion}</p>
        ) : null}
      </div>
      {titulo === null || delGrupo.length === 0 ? null : (
        <section aria-label={titulo} className="border-t border-borde px-(--espacio-3)">
          <div className="flex items-center justify-between pt-(--espacio-2)">
            <p className="font-semibold">{titulo}</p>
            {imagen === 'fallo' ? null : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAbierto(null);
                }}
              >
                Cerrar
              </Button>
            )}
          </div>
          <ul className="divide-y divide-borde">
            {delGrupo.map((p) => (
              <PlatilloParaPedir
                key={p.id}
                platillo={p}
                mostrarPrecios={mostrarPrecios}
                alPedir={() => {
                  alPedir(p);
                }}
              />
            ))}
          </ul>
        </section>
      )}
    </Superficie>
  );
}
