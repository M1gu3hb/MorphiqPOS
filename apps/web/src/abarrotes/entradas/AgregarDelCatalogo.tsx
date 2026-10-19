'use client';

import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Aviso, Esqueleto, Vacio } from '@morphiqpos/ui/sistema';
import { PackagePlus } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente } from '~/cliente/api';

/**
 * LO QUE TRAE EL REPARTIDOR Y EL SUGERIDO NO PIDIÓ (F-632, D-32 de la 2.4).
 *
 * La nota se llenaba SÓLO desde el pedido sugerido, y el sugerido sale de catorce días de
 * venta de «lo que se le compra a este proveedor». En una tienda nueva, con un producto
 * recién dado de alta o con uno que se vende poco, no salía nada: la pantalla decía «o
 * captura lo que traiga el repartidor» y no había dónde. Aquí se elige cualquier producto
 * del catálogo; al recibir la nota, el primer proveedor que lo trae queda como el suyo
 * (`compras.recibir_nota`), y desde la visita siguiente ya sale en su sugerido y en su canje.
 */

/** Un insumo del catálogo, como lo sirve el puente (`Ingrediente`). */
export interface InsumoDelCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base?: string | null;
  readonly unidad_compra_default?: string | null;
  /** En PESOS (`conversion: 'dinero'`); `null` para quien no ve costos. */
  readonly costo_por_unidad_base?: number | null;
  readonly activo?: boolean | null;
}

export function AgregarDelCatalogo({
  yaEnLaNota,
  onAgregar,
}: {
  readonly yaEnLaNota: ReadonlySet<string>;
  readonly onAgregar: (insumo: InsumoDelCatalogo) => void;
}) {
  const [catalogo, setCatalogo] = useState<readonly InsumoDelCatalogo[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    consultarPuente<InsumoDelCatalogo>('Ingrediente', { limite: 500, signal: control.signal })
      .then((filas) => {
        if (!control.signal.aborted) setCatalogo(filas.filter((f) => f.activo !== false));
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) {
          setFallo(error instanceof Error ? error.message : 'No se pudo leer el catálogo.');
        }
      });
    return () => {
      control.abort();
    };
  }, []);

  if (fallo !== null) {
    return <Aviso tono="atencion" titulo="No se pudo leer el catálogo para agregar a mano." />;
  }
  if (catalogo === null) {
    return <Esqueleto className="h-(--altura-control) w-full" />;
  }
  const disponibles = catalogo.filter((i) => !yaEnLaNota.has(i.id));
  if (catalogo.length === 0) {
    return (
      <Vacio
        icono={<PackagePlus />}
        tamano="compacto"
        titulo="Todavía no hay productos dados de alta."
        explicacion="Dalo de alta en «Alta rápida» y vuelve: aquí aparece para recibirlo."
      />
    );
  }

  return (
    <div className="flex flex-col gap-(--espacio-1)">
      <Label htmlFor="agregar-del-catalogo">Agregar a la nota</Label>
      <Select
        value=""
        disabled={disponibles.length === 0}
        onValueChange={(id) => {
          const elegido = catalogo.find((i) => i.id === id);
          if (elegido !== undefined) onAgregar(elegido);
        }}
      >
        <SelectTrigger id="agregar-del-catalogo" className="w-full">
          <SelectValue
            placeholder={
              disponibles.length === 0 ? 'Ya está todo en la nota' : 'Lo que trae y no se pidió…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {disponibles.map((insumo) => (
            <SelectItem key={insumo.id} value={insumo.id}>
              {insumo.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
