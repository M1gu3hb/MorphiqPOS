'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Vacio } from '@morphiqpos/ui/sistema';
import { Repeat, X } from 'lucide-react';

import { useMotivosDeMerma } from '../conteo/MotivoDeLaDiferencia.tsx';

/**
 * EL CANJE EN LA MISMA NOTA (F-632, C.10 de la 2.4).
 *
 * «+18 piezas frescas, −6 de canje: dos movimientos, un documento. Si se capturan por
 * separado, uno de los dos se olvida» (`01-FUNCIONES` de abarrotes §3.13). Aquí se dice qué se
 * lleva el repartidor y por qué; el SERVIDOR lo saca del inventario ligado a esta nota y le
 * descuenta a lo que se paga lo que valía, a su costo de antes. El navegador no pone precio.
 */

export interface ArticuloDelProveedor {
  readonly insumoId: string;
  readonly nombre: string;
  readonly unidadBase: string;
}

export interface CanjeCapturado {
  readonly clave: number;
  readonly insumoId: string;
  readonly cantidad: string;
  readonly motivo: string;
}

const CANTIDAD = /^\d{1,10}(?:[.,]\d{1,4})?$/;

/** Los que sí se pueden mandar: con artículo y una cantidad mayor que cero. */
export function canjesParaElServidor(canjes: readonly CanjeCapturado[]) {
  return canjes
    .filter(
      (c) =>
        c.insumoId !== '' && CANTIDAD.test(c.cantidad) && Number(c.cantidad.replace(',', '.')) > 0,
    )
    .map((c) => ({
      insumoId: c.insumoId,
      cantidad: c.cantidad.replace(',', '.'),
      motivo: c.motivo,
    }));
}

export function CanjeDeLaNota({
  articulos,
  canjes,
  onCambiar,
}: {
  readonly articulos: readonly ArticuloDelProveedor[];
  readonly canjes: readonly CanjeCapturado[];
  readonly onCambiar: (canjes: readonly CanjeCapturado[]) => void;
}) {
  const motivos = useMotivosDeMerma(canjes.length > 0);
  if (articulos.length === 0) return null;

  const cambiar = (clave: number, cambios: Partial<CanjeCapturado>) => {
    onCambiar(canjes.map((c) => (c.clave === clave ? { ...c, ...cambios } : c)));
  };

  return (
    <section aria-labelledby="canje-titulo" className="flex flex-col gap-(--espacio-2)">
      <div className="flex flex-wrap items-baseline justify-between gap-(--espacio-2)">
        <h3 id="canje-titulo" className="text-base font-semibold">
          Canje: lo que se lleva
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            onCambiar([
              ...canjes,
              {
                clave: Math.max(0, ...canjes.map((c) => c.clave)) + 1,
                insumoId: '',
                cantidad: '',
                motivo: 'caducado',
              },
            ]);
          }}
        >
          <Repeat aria-hidden="true" />
          Agregar canje
        </Button>
      </div>
      {canjes.length === 0 ? (
        <Vacio
          icono={<Repeat />}
          titulo="Sin canje en esta nota."
          explicacion="Si el repartidor se lleva lo caducado, dilo aquí: sale del inventario y se le descuenta a la nota."
          className="py-(--espacio-3)"
        />
      ) : (
        <ul className="flex flex-col gap-(--espacio-2)">
          {canjes.map((canje) => {
            const articulo = articulos.find((a) => a.insumoId === canje.insumoId);
            return (
              <li
                key={canje.clave}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-(--espacio-2) rounded-md border border-borde p-(--espacio-2) md:grid-cols-[minmax(0,2fr)_8rem_minmax(0,1fr)_auto] md:items-end"
              >
                <div className="flex flex-col gap-(--espacio-1)">
                  <Label htmlFor={`canje-articulo-${String(canje.clave)}`}>Qué</Label>
                  <Select
                    value={canje.insumoId}
                    onValueChange={(insumoId) => {
                      cambiar(canje.clave, { insumoId });
                    }}
                  >
                    <SelectTrigger id={`canje-articulo-${String(canje.clave)}`} className="w-full">
                      <SelectValue placeholder="Elige el artículo" />
                    </SelectTrigger>
                    <SelectContent>
                      {articulos.map((a) => (
                        <SelectItem key={a.insumoId} value={a.insumoId}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-(--espacio-1)">
                  <Label htmlFor={`canje-cantidad-${String(canje.clave)}`}>
                    Cuántas ({articulo?.unidadBase ?? 'pz'})
                  </Label>
                  <Input
                    id={`canje-cantidad-${String(canje.clave)}`}
                    inputMode="decimal"
                    className="font-numeros tabular-nums"
                    value={canje.cantidad}
                    onChange={(evento) => {
                      cambiar(canje.clave, { cantidad: evento.target.value });
                    }}
                  />
                </div>
                <div className="col-span-2 flex flex-col gap-(--espacio-1) md:col-span-1">
                  <Label htmlFor={`canje-motivo-${String(canje.clave)}`}>Por qué</Label>
                  <Select
                    value={canje.motivo}
                    onValueChange={(motivo) => {
                      cambiar(canje.clave, { motivo });
                    }}
                  >
                    <SelectTrigger id={`canje-motivo-${String(canje.clave)}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(motivos.length === 0
                        ? [{ clave: 'caducado', etiqueta: 'Caducado' }]
                        : motivos
                      ).map((m) => (
                        <SelectItem key={m.clave} value={m.clave}>
                          {m.etiqueta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="row-start-1 self-start md:row-start-auto md:self-end"
                  aria-label={`Quitar el canje de ${articulo?.nombre ?? 'este artículo'}`}
                  onClick={() => {
                    onCambiar(canjes.filter((c) => c.clave !== canje.clave));
                  }}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
