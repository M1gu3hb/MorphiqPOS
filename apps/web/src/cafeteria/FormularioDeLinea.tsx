'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso } from '@morphiqpos/ui/sistema';
import { Plus } from 'lucide-react';
import type { RefObject } from 'react';

import {
  CAMPO_DE_LISTA,
  CANALES,
  type InsumoDisponible,
  type NuevaLinea,
} from './receta-de-barra.ts';

/**
 * AGREGAR UN INGREDIENTE a la receta de la barra: el insumo, la cantidad en SU unidad
 * y el canal en el que entra. Es una pieza de `Recetas`, que decide qué hacer con él
 * —el comando reemplaza la receta entera—; aquí sólo se captura.
 */

interface FormularioDeLineaProps {
  readonly insumos: readonly InsumoDisponible[];
  readonly nueva: NuevaLinea;
  readonly ocupado: boolean;
  readonly campoDeInsumo: RefObject<HTMLSelectElement | null>;
  readonly alCambiar: (nueva: NuevaLinea) => void;
  readonly alAgregar: () => void;
}

/** La acción principal de la pantalla: agregar un ingrediente. */
export function FormularioDeLinea({
  insumos,
  nueva,
  ocupado,
  campoDeInsumo,
  alCambiar,
  alAgregar,
}: FormularioDeLineaProps) {
  const unidad = insumos.find((i) => i.id === nueva.insumoId)?.unidad_base;
  return (
    <form
      aria-label="Agregar un ingrediente"
      onSubmit={(evento) => {
        // El formulario es para que Enter en la cantidad agregue; la página no se va.
        evento.preventDefault();
        alAgregar();
      }}
      className="grid gap-(--espacio-3) border-t border-borde pt-(--espacio-4) sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end"
    >
      {insumos.length === 0 ? (
        <Aviso
          tono="atencion"
          titulo="Todavía no hay ingredientes dados de alta"
          className="sm:col-span-3"
          accion={
            <Button asChild variant="outline">
              <a href="/cafeteria/inventario">Ir al inventario</a>
            </Button>
          }
        >
          Una receta se arma con los ingredientes del inventario.
        </Aviso>
      ) : null}
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="insumo">Ingrediente</Label>
        <select
          id="insumo"
          ref={campoDeInsumo}
          className={CAMPO_DE_LISTA}
          value={nueva.insumoId}
          onChange={(evento) => {
            alCambiar({ ...nueva, insumoId: evento.target.value });
          }}
        >
          <option value="">Elige…</option>
          {insumos.map((insumo) => (
            <option key={insumo.id} value={insumo.id}>
              {insumo.nombre} ({insumo.unidad_base})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="cantidad">
          Cantidad{' '}
          {unidad === undefined ? null : <span className="text-texto-sutil">en {unidad}</span>}
        </Label>
        <Input
          id="cantidad"
          inputMode="decimal"
          className="text-right font-numeros tabular-nums"
          value={nueva.cantidad}
          onChange={(evento) => {
            alCambiar({ ...nueva, cantidad: evento.target.value });
          }}
        />
      </div>
      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="canal">Cuándo</Label>
        <select
          id="canal"
          className={CAMPO_DE_LISTA}
          value={nueva.canal}
          onChange={(evento) => {
            alCambiar({ ...nueva, canal: evento.target.value });
          }}
        >
          {CANALES.map((canal) => (
            <option key={canal.clave} value={canal.clave}>
              {canal.etiqueta}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={ocupado} className="sm:col-span-3 sm:justify-self-end">
        <Plus aria-hidden="true" />
        Agregar a la receta
      </Button>
    </form>
  );
}
