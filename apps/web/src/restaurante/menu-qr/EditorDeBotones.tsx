'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso, EsqueletoDeLista } from '@morphiqpos/ui/sistema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, LayoutGrid, MousePointerClick, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';
import { idAlAzar } from '~/cliente/id-al-azar';

import type { BotonDePagina } from './botones-de-pagina';
import {
  conLosDeLaPagina,
  faltaDelBoton,
  nuevoBoton,
  type BotonEditable,
  type BotonesPorPagina,
  type TipoDeBoton,
} from './editor-de-botones';
import { LienzoDeBotones } from './LienzoDeBotones';
import { PaginaConBotones } from './PaginaConBotones';
import { PanelDelBoton, type Opcion } from './PanelDelBoton';

interface PlatilloDelCatalogo extends Opcion {
  readonly categoria_id?: string | null;
  readonly precio_venta?: number | null;
}

const CLAVE = ['menu_qr_botones'] as const;

async function leerBotones(): Promise<BotonesPorPagina> {
  const [configuracion] = await consultarPuente<{ portal_qr_botones?: BotonesPorPagina | null }>(
    'ConfiguracionNegocio',
    { limite: 1 },
  );
  return configuracion?.portal_qr_botones ?? {};
}

/** Cómo lo verá el comensal: los platillos que agrega cada botón, resueltos contra el catálogo. */
function comoComensal(
  botones: readonly BotonEditable[],
  platillos: readonly PlatilloDelCatalogo[],
): readonly BotonDePagina[] {
  return botones.map((b) => ({
    id: b.id,
    tipo: b.tipo,
    x: b.x,
    y: b.y,
    ancho: b.ancho,
    alto: b.alto,
    etiqueta: b.etiqueta ?? null,
    mostrarPrecio: b.mostrarPrecio,
    productoIds:
      b.tipo === 'platillo'
        ? [b.productoId ?? '']
        : b.categoriaId !== undefined
          ? platillos.filter((p) => p.categoria_id === b.categoriaId).map((p) => p.id)
          : (b.productoIds ?? []),
  }));
}

/**
 * EL EDITOR DE BOTONES DE UNA PÁGINA DEL MENÚ QR (DP-9.7). Sobre la imagen de la carta se
 * colocan botones arrastrando y se estiran; cada uno agrega un platillo o despliega un grupo. La
 * vista previa es la del comensal. Se guarda en la configuración del negocio.
 */
export function EditorDeBotones({
  pagina,
  platillos,
  categorias,
}: {
  readonly pagina: {
    readonly id: string;
    readonly nombre: string;
    readonly imagen_url?: string | null;
  };
  readonly platillos: readonly PlatilloDelCatalogo[];
  readonly categorias: readonly Opcion[];
}) {
  const clienteDeConsultas = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [botones, setBotones] = useState<readonly BotonEditable[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const guardados = useQuery({ queryKey: CLAVE, queryFn: leerBotones, enabled: abierto });

  const lista = botones ?? guardados.data?.[pagina.id] ?? [];
  const elegido = lista.find((b) => b.id === seleccionado);
  const nombreDe = (b: BotonEditable): string =>
    b.tipo === 'grupo'
      ? (b.etiqueta ?? 'Grupo')
      : (platillos.find((p) => p.id === b.productoId)?.nombre ?? 'Platillo');

  const cambiar = (boton: BotonEditable): void => {
    setBotones(lista.map((b) => (b.id === boton.id ? boton : b)));
  };
  const agregar = (tipo: TipoDeBoton): void => {
    const boton = nuevoBoton(tipo, idAlAzar());
    setBotones([...lista, boton]);
    setSeleccionado(boton.id);
    setVistaPrevia(false);
  };

  async function guardar(): Promise<void> {
    const incompleto = lista.find((b) => faltaDelBoton(b) !== null);
    if (incompleto !== undefined) {
      setSeleccionado(incompleto.id);
      setFallo(`Falta completar «${nombreDe(incompleto)}»: ${faltaDelBoton(incompleto) ?? ''}`);
      return;
    }
    setGuardando(true);
    setFallo(null);
    try {
      const todos = conLosDeLaPagina(await leerBotones(), pagina.id, lista);
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        datos: { portal_qr_botones: todos },
      });
      await clienteDeConsultas.invalidateQueries({ queryKey: CLAVE });
      setBotones(null);
      setAbierto(false);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudieron guardar los botones.');
    } finally {
      setGuardando(false);
    }
  }

  const imagen = pagina.imagen_url ?? '';
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={imagen === ''}
        onClick={() => {
          setBotones(null);
          setSeleccionado(null);
          setFallo(null);
          setAbierto(true);
        }}
      >
        <MousePointerClick aria-hidden />
        Botones
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Botones de «{pagina.nombre}»</DialogTitle>
            <DialogDescription>
              Arrastra cada botón sobre su platillo y estíralo desde la esquina. Se ve igual en
              cualquier teléfono.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-(--espacio-2)">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                agregar('platillo');
              }}
            >
              <Plus aria-hidden />
              Platillo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                agregar('grupo');
              }}
            >
              <LayoutGrid aria-hidden />
              Grupo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={vistaPrevia}
              onClick={() => {
                setVistaPrevia(!vistaPrevia);
              }}
            >
              {vistaPrevia ? <Pencil aria-hidden /> : <Eye aria-hidden />}
              {vistaPrevia ? 'Editar' : 'Vista previa'}
            </Button>
            <Button type="button" size="sm" cargando={guardando} onClick={() => void guardar()}>
              Guardar
            </Button>
          </div>
          {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
          {guardados.isPending ? (
            <EsqueletoDeLista filas={4} />
          ) : vistaPrevia ? (
            <div className="mx-auto w-full max-w-sm">
              <PaginaConBotones
                pagina={{ ...pagina, botones: comoComensal(lista, platillos) }}
                productos={platillos.map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  precio_venta_centavos: String(Math.round((p.precio_venta ?? 0) * 100)),
                }))}
                mostrarPrecios
                alPedir={() => undefined}
              />
            </div>
          ) : (
            <div className="grid gap-(--espacio-4) md:grid-cols-[minmax(0,1fr)_18rem]">
              <LienzoDeBotones
                imagenUrl={imagen}
                nombre={pagina.nombre}
                botones={lista}
                seleccionado={seleccionado}
                nombreDe={nombreDe}
                alSeleccionar={setSeleccionado}
                alCambiar={cambiar}
              />
              {elegido === undefined ? (
                <Aviso tono="info" titulo="Toca un botón para elegir qué hace, o agrega uno." />
              ) : (
                <PanelDelBoton
                  boton={elegido}
                  platillos={platillos}
                  categorias={categorias}
                  alCambiar={cambiar}
                  alQuitar={() => {
                    setBotones(lista.filter((b) => b.id !== elegido.id));
                    setSeleccionado(null);
                  }}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
