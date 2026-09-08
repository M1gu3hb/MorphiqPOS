'use client';

import { AlertTriangle, Check, Printer, Trash2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@morphiqpos/ui/primitivas/alert';
import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@morphiqpos/ui/primitivas/card';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { RadioGroup, RadioGroupItem } from '@morphiqpos/ui/primitivas/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@morphiqpos/ui/primitivas/tabs';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';

/**
 * Las primitivas, mostradas con contenido REAL de un punto de venta.
 *
 * No hay "Lorem ipsum" ni "Button": los ejemplos son platillos, importes y
 * estados de mesa. Es la diferencia entre una galeria de componentes y algo
 * que se le puede ensenar a un dueno de restaurante sin explicarle nada.
 */

const RENGLONES = [
  { producto: 'Tacos de suadero', cantidad: 3, precio: '$45.00', total: '$135.00' },
  { producto: 'Agua de horchata 1 L', cantidad: 1, precio: '$38.50', total: '$38.50' },
  { producto: 'Orden de guacamole', cantidad: 2, precio: '$72.00', total: '$144.00' },
  { producto: 'Refresco 355 ml', cantidad: 4, precio: '$22.00', total: '$88.00' },
];

export function SeccionComponentes() {
  return (
    <div className="space-y-12">
      <section aria-labelledby="acciones" className="space-y-5">
        <h2 id="acciones" className="text-[length:var(--tamano-2xl)] font-[var(--peso-fuerte)]">
          Acciones
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Cobrar</Button>
          <Button variant="secondary">Guardar borrador</Button>
          <Button variant="outline">
            <Printer aria-hidden />
            Imprimir ticket
          </Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="destructive">
            <Trash2 aria-hidden />
            Eliminar línea
          </Button>
          <Button variant="link">Ver historial</Button>
          <Button disabled>Sin permiso</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Pequeño</Button>
          <Button>Normal</Button>
          <Button size="lg">Grande</Button>
          <Button size="icon" aria-label="Marcar como listo">
            <Check aria-hidden />
          </Button>
        </div>
        <p className="max-w-prose text-texto-sutil">
          Los tamaños salen de{' '}
          <code className="font-[family-name:var(--fuente-numeros)]">--altura-control</code>, que
          mueve la perilla de densidad. Cambia arriba a <strong>compacta</strong> y todo encoge
          junto, sin tocar un solo componente.
        </p>
      </section>

      <section aria-labelledby="formularios" className="space-y-5">
        <h2 id="formularios" className="text-[length:var(--tamano-2xl)] font-[var(--peso-fuerte)]">
          Captura
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="producto">Producto</Label>
            <Input id="producto" placeholder="Escanea o escribe el nombre" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unidad">Unidad de venta</Label>
            <Select>
              <SelectTrigger id="unidad">
                <SelectValue placeholder="Elige una unidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pieza">Pieza</SelectItem>
                <SelectItem value="kg">Kilogramo</SelectItem>
                <SelectItem value="l">Litro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notas">Notas para la cocina</Label>
            <Textarea id="notas" placeholder="Sin cebolla, término medio…" />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="mayoreo" />
            <Label htmlFor="mayoreo">Aplicar precio de mayoreo</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="stock" />
            <Label htmlFor="stock">Permitir venta sin existencia</Label>
          </div>
          <fieldset className="space-y-3 md:col-span-2">
            <legend className="mb-2 text-texto-sutil">Método de pago</legend>
            <RadioGroup defaultValue="efectivo" className="flex flex-wrap gap-6">
              {['efectivo', 'tarjeta', 'transferencia'].map((metodo) => (
                <div key={metodo} className="flex items-center gap-2">
                  <RadioGroupItem value={metodo} id={metodo} />
                  <Label htmlFor={metodo} className="capitalize">
                    {metodo}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        </div>
      </section>

      <section aria-labelledby="superficies" className="space-y-5">
        <h2 id="superficies" className="text-[length:var(--tamano-2xl)] font-[var(--peso-fuerte)]">
          Superficies y estado
        </h2>
        <div className="grid gap-5 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Mesa 7</CardTitle>
              <CardDescription>4 personas · abierta hace 22 min</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-texto-sutil">Consumo</span>
                <span
                  data-numeros
                  className="text-[length:var(--tamano-lg)] font-[var(--peso-fuerte)]"
                >
                  $405.50
                </span>
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Badge>En preparación</Badge>
                <Badge variant="secondary">Sin cebolla</Badge>
                <Badge variant="outline">Mesero: Ana</Badge>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <AlertTriangle aria-hidden />
            <AlertTitle>Existencia baja</AlertTitle>
            <AlertDescription>
              Quedan 3 órdenes de guacamole con el aguacate en almacén.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Cargando</CardTitle>
              <CardDescription>Estado de espera, no una pantalla en blanco</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="datos" className="space-y-5">
        <h2 id="datos" className="text-[length:var(--tamano-2xl)] font-[var(--peso-fuerte)]">
          Datos y dinero
        </h2>
        <p className="max-w-prose text-texto-sutil">
          Los importes van alineados a la derecha y con cifras de ancho fijo. Sin eso los totales
          bailan al leerlos en columna y el cajero se equivoca.
        </p>
        <Tabs defaultValue="cuenta">
          <TabsList>
            <TabsTrigger value="cuenta">Cuenta</TabsTrigger>
            <TabsTrigger value="pagos">Pagos</TabsTrigger>
          </TabsList>
          <TabsContent value="cuenta" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RENGLONES.map((renglon) => (
                  <TableRow key={renglon.producto}>
                    <TableCell>{renglon.producto}</TableCell>
                    <TableCell data-numeros className="text-right">
                      {renglon.cantidad}
                    </TableCell>
                    <TableCell data-numeros className="text-right">
                      {renglon.precio}
                    </TableCell>
                    <TableCell data-numeros className="text-right font-[var(--peso-medio)]">
                      {renglon.total}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-[var(--peso-medio)]">
                    Total
                  </TableCell>
                  <TableCell
                    data-numeros
                    className="text-right text-[length:var(--tamano-lg)] font-[var(--peso-fuerte)]"
                  >
                    $405.50
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TabsContent>
          <TabsContent value="pagos" className="mt-4 text-texto-sutil">
            Un pago mixto son varias filas en la tabla <code>pagos</code>, no columnas dentro de la
            venta. Llega en F1.2.
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
