'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { Aviso } from '@morphiqpos/ui/sistema';
import { Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import {
  cambiarTipo,
  faltaDelBoton,
  grupoPorCategoria,
  grupoPorLista,
  type BotonEditable,
} from './editor-de-botones';

export interface Opcion {
  readonly id: string;
  readonly nombre: string;
}

const SIN = '__ninguna__';

/**
 * Lo que dice el botón elegido (DP-9.7): de qué tipo es, qué platillo agrega o qué grupo
 * despliega —una categoría o una lista elegida—, si enseña el precio vigente, y quitarlo.
 */
export function PanelDelBoton({
  boton,
  platillos,
  categorias,
  alCambiar,
  alQuitar,
}: {
  readonly boton: BotonEditable;
  readonly platillos: readonly Opcion[];
  readonly categorias: readonly Opcion[];
  readonly alCambiar: (boton: BotonEditable) => void;
  readonly alQuitar: () => void;
}) {
  const id = useId();
  const [buscar, setBuscar] = useState('');
  const falta = faltaDelBoton(boton);
  const porLista = boton.tipo === 'grupo' && boton.productoIds !== undefined;
  const encontrados = platillos.filter((p) =>
    p.nombre.toLocaleLowerCase('es-MX').includes(buscar.trim().toLocaleLowerCase('es-MX')),
  );

  return (
    <div className="flex flex-col gap-(--espacio-3)">
      <div role="group" aria-label="Tipo de botón" className="flex gap-(--espacio-2)">
        {(['platillo', 'grupo'] as const).map((tipo) => (
          <Button
            key={tipo}
            type="button"
            size="sm"
            variant={boton.tipo === tipo ? 'default' : 'outline'}
            aria-pressed={boton.tipo === tipo}
            onClick={() => {
              if (boton.tipo !== tipo) alCambiar(cambiarTipo(boton, tipo));
            }}
          >
            {tipo === 'platillo' ? 'Platillo' : 'Grupo'}
          </Button>
        ))}
      </div>

      {boton.tipo === 'platillo' ? (
        <span className="flex flex-col gap-(--espacio-1)">
          <Label htmlFor={`${id}-platillo`} className="text-xs">
            Platillo
          </Label>
          <Select
            value={boton.productoId ?? SIN}
            onValueChange={(elegido) => {
              alCambiar({ ...boton, productoId: elegido });
            }}
          >
            <SelectTrigger id={`${id}-platillo`}>
              <SelectValue placeholder="Elige el platillo" />
            </SelectTrigger>
            <SelectContent>
              {platillos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      ) : (
        <>
          <span className="flex flex-col gap-(--espacio-1)">
            <Label htmlFor={`${id}-texto`} className="text-xs">
              Texto del grupo
            </Label>
            <Input
              id={`${id}-texto`}
              value={boton.etiqueta ?? ''}
              maxLength={40}
              placeholder="Cócteles"
              onChange={(evento) => {
                alCambiar({ ...boton, etiqueta: evento.target.value });
              }}
            />
          </span>
          <div role="group" aria-label="Qué despliega" className="flex gap-(--espacio-2)">
            <Button
              type="button"
              size="sm"
              variant={porLista ? 'outline' : 'default'}
              aria-pressed={!porLista}
              onClick={() => {
                alCambiar(grupoPorCategoria(boton));
              }}
            >
              Una categoría
            </Button>
            <Button
              type="button"
              size="sm"
              variant={porLista ? 'default' : 'outline'}
              aria-pressed={porLista}
              onClick={() => {
                alCambiar(grupoPorLista(boton));
              }}
            >
              Una lista
            </Button>
          </div>
          {porLista ? (
            <fieldset className="flex flex-col gap-(--espacio-1)">
              <legend className="text-xs">Platillos del grupo</legend>
              <Input
                aria-label="Buscar platillo"
                placeholder="Buscar"
                value={buscar}
                onChange={(evento) => {
                  setBuscar(evento.target.value);
                }}
              />
              <div className="flex max-h-56 flex-col gap-(--espacio-1) overflow-y-auto">
                {encontrados.map((p) => {
                  const marcado = boton.productoIds?.includes(p.id) === true;
                  return (
                    <Label
                      key={p.id}
                      className="flex items-center gap-(--espacio-2) text-sm font-normal"
                    >
                      <Checkbox
                        checked={marcado}
                        onCheckedChange={(valor) => {
                          const sin = (boton.productoIds ?? []).filter((x) => x !== p.id);
                          alCambiar({
                            ...boton,
                            productoIds: valor === true ? [...sin, p.id] : sin,
                          });
                        }}
                      />
                      {p.nombre}
                    </Label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <span className="flex flex-col gap-(--espacio-1)">
              <Label htmlFor={`${id}-categoria`} className="text-xs">
                Categoría
              </Label>
              <Select
                value={boton.categoriaId ?? SIN}
                onValueChange={(elegida) => {
                  alCambiar({ ...boton, categoriaId: elegida });
                }}
              >
                <SelectTrigger id={`${id}-categoria`}>
                  <SelectValue placeholder="Elige la categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </span>
          )}
        </>
      )}

      <Label className="flex items-center justify-between gap-(--espacio-2) text-sm font-normal">
        Enseñar el precio vigente del sistema
        <Switch
          checked={boton.mostrarPrecio}
          onCheckedChange={(valor) => {
            alCambiar({ ...boton, mostrarPrecio: valor });
          }}
        />
      </Label>

      {falta === null ? null : <Aviso tono="atencion" titulo={falta} />}

      <Button type="button" variant="destructive" size="sm" onClick={alQuitar}>
        <Trash2 aria-hidden />
        Quitar este botón
      </Button>
    </div>
  );
}
