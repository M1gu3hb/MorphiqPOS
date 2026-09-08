'use client';

import { Building2, Check, Palette, Save, Store } from 'lucide-react';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { toast } from 'sonner';

import { COLOR_ACENTO_DEFAULT, COLOR_PRIMARIO_DEFAULT, type Paquete } from '@morphiqpos/contracts';
import { useApariencia } from '@morphiqpos/ui/hooks';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@morphiqpos/ui/primitivas/card';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';

import { SelectorPaquete } from './SelectorPaquete';
import { PAQUETES_NEGOCIO } from './paquetes';

export function ConfiguracionPantalla() {
  const [paquete, setPaquete] = useState<Paquete>('ferreteria');
  const [nombre, setNombre] = useState('Ferretería La Broca');
  const [logoUrl, setLogoUrl] = useState('');
  const [primario, setPrimario] = useState(COLOR_PRIMARIO_DEFAULT);
  const [acento, setAcento] = useState(COLOR_ACENTO_DEFAULT);
  const [version, setVersion] = useState(3);
  const { apariencia, cambiarEstilo } = useApariencia('premium');
  const paqueteActivo = PAQUETES_NEGOCIO.find(({ id }) => id === paquete);

  function guardar(evento: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    evento.preventDefault();
    setVersion((actual) => actual + 1);
    toast.success('Configuración guardada', {
      description: `${nombre} ahora usa el paquete ${paqueteActivo?.nombre ?? paquete}.`,
    });
  }

  return (
    <form
      onSubmit={guardar}
      className="mx-auto grid w-full max-w-[92rem] gap-10 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
    >
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primario">
            <Store aria-hidden="true" className="size-4" /> Administración
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Configuración
          </h1>
          <p className="max-w-2xl text-texto-sutil">
            Adapta el sistema al giro, la identidad y la forma de trabajar del negocio.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-texto-sutil">Versión {version}</span>
          <Button type="submit" size="lg">
            <Save aria-hidden="true" /> Guardar cambios
          </Button>
        </div>
      </header>

      <section aria-labelledby="titulo-paquete" className="grid gap-5">
        <div className="grid gap-1">
          <h2 id="titulo-paquete" className="text-xl font-semibold">
            Tipo de negocio
          </h2>
          <p className="text-sm text-texto-sutil">
            Cambiar el paquete conserva el historial y ajusta las funciones disponibles.
          </p>
        </div>
        <SelectorPaquete valor={paquete} alCambiar={setPaquete} />
        <p className="flex items-center gap-2 rounded-lg border bg-fondo-sutil px-4 py-3 text-sm">
          <Check aria-hidden="true" className="size-4 text-exito" />
          Los permisos de <strong>{paqueteActivo?.nombre}</strong> se vuelven a comprobar en cada
          comando del servidor.
        </p>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 aria-hidden="true" /> Identidad del negocio
            </CardTitle>
            <CardDescription>
              Datos que aparecen en gestión, tickets y portal público.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Campo id="nombreNegocio" etiqueta="Nombre comercial">
                <Input
                  id="nombreNegocio"
                  value={nombre}
                  onChange={(evento) => {
                    setNombre(evento.target.value);
                  }}
                  required
                />
              </Campo>
              <Campo id="telefono" etiqueta="Teléfono">
                <Input id="telefono" name="telefono" type="tel" defaultValue="55 1234 5678" />
              </Campo>
            </div>
            <Campo id="direccion" etiqueta="Dirección">
              <Textarea
                id="direccion"
                name="direccion"
                defaultValue="Av. Hidalgo 214, Col. Centro, Ciudad de México"
              />
            </Campo>
            <Campo id="logoUrl" etiqueta="URL del logotipo">
              <Input
                id="logoUrl"
                type="url"
                value={logoUrl}
                onChange={(evento) => {
                  setLogoUrl(evento.target.value);
                }}
                placeholder="https://…"
              />
            </Campo>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette aria-hidden="true" /> Apariencia
            </CardTitle>
            <CardDescription>La vista previa cambia al instante.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="estilo">Estilo visual</Label>
              <Select value={apariencia.estilo} onValueChange={cambiarEstilo}>
                <SelectTrigger id="estilo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">Base · claro y funcional</SelectItem>
                  <SelectItem value="editorial">Editorial · expresivo</SelectItem>
                  <SelectItem value="premium">Premium · sobrio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Color id="primario" etiqueta="Primario" valor={primario} alCambiar={setPrimario} />
              <Color id="acento" etiqueta="Acento" valor={acento} alCambiar={setAcento} />
            </div>
            <VistaPrevia
              nombre={nombre}
              logoUrl={logoUrl}
              paquete={paqueteActivo?.nombre ?? paquete}
              primario={primario}
              acento={acento}
            />
          </CardContent>
        </Card>
      </section>
    </form>
  );
}

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
    </div>
  );
}

function Color({
  id,
  etiqueta,
  valor,
  alCambiar,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="flex items-center gap-2 rounded-md border p-2">
        <Input
          id={id}
          className="size-[calc(var(--altura-control)*0.8)] shrink-0 border-0 p-0 shadow-none"
          type="color"
          value={valor}
          onChange={(evento) => {
            alCambiar(evento.target.value);
          }}
        />
        <span className="numeros text-xs text-texto-sutil">{valor.toUpperCase()}</span>
      </div>
    </div>
  );
}

function VistaPrevia({
  nombre,
  logoUrl,
  paquete,
  primario,
  acento,
}: {
  nombre: string;
  logoUrl: string;
  paquete: string;
  primario: string;
  acento: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-fondo-sutil">
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${primario}, ${acento})` }}
      />
      <div className="flex items-center gap-3 p-4">
        <div className="grid size-[calc(var(--altura-control)*1.2)] place-items-center overflow-hidden rounded-lg bg-superficie shadow-1">
          {logoUrl === '' ? (
            <Store
              aria-hidden="true"
              className="size-[calc(var(--altura-control)*0.6)] text-primario"
            />
          ) : (
            <span className="text-xs font-bold">LOGO</span>
          )}
        </div>
        <div>
          <p className="font-display font-semibold">{nombre || 'Tu negocio'}</p>
          <p className="text-xs text-texto-sutil">MorphiqPOS · {paquete}</p>
        </div>
      </div>
    </div>
  );
}
