'use client';

import { Receipt } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@morphiqpos/ui/primitivas/card';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';

import { Campo } from './CamposConfiguracion';

/**
 * El impuesto del negocio (F1.1-C-12).
 *
 * Estaba fijo en 1600 puntos base dentro del código de cotización, así que un
 * negocio en frontera —donde el IVA es del 8 %— cobraba de más en cada venta y
 * la única forma de arreglarlo era un despliegue.
 *
 * Se teclea en por ciento porque es como lo dice la gente, y viaja en puntos
 * base porque es como se calcula sin punto flotante. La conversión vive en la
 * pantalla: el contrato del servidor es entero.
 *
 * `incluidoEnPrecio` importa más de lo que parece. En México el precio de
 * mostrador YA lleva IVA y el impuesto se EXTRAE del total; sumarlo encima
 * subiría un 16 % todos los precios del catálogo de un negocio que migre.
 */

interface Props {
  readonly iva: string;
  readonly ivaIncluido: boolean;
  readonly onIva: (valor: string) => void;
  readonly onIvaIncluido: (valor: boolean) => void;
}

export function TarjetaImpuestos({ iva, ivaIncluido, onIva, onIvaIncluido }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt aria-hidden="true" /> Impuestos
        </CardTitle>
        <CardDescription>
          Cambia el total de la <strong>siguiente</strong> venta. Las ya cobradas conservan el
          impuesto con el que se emitió su ticket.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Campo id="iva" etiqueta="IVA (%)">
          <Input
            id="iva"
            inputMode="decimal"
            value={iva}
            onChange={(evento) => {
              onIva(evento.target.value);
            }}
            placeholder="16"
          />
        </Campo>
        <Campo id="iva-incluido" etiqueta="¿El precio de lista ya lo incluye?">
          <Select
            value={ivaIncluido ? 'incluido' : 'agregado'}
            onValueChange={(valor) => {
              onIvaIncluido(valor === 'incluido');
            }}
          >
            <SelectTrigger id="iva-incluido" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="incluido">Sí · se extrae del precio (México)</SelectItem>
              <SelectItem value="agregado">No · se suma al total</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
      </CardContent>
    </Card>
  );
}
