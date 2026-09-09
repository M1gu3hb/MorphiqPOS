'use client';

import { Building2, Check, Palette, Save, Store } from 'lucide-react';
import { useEffect, useState, type SyntheticEvent } from 'react';
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
import { Campo, Color, VistaPrevia } from './CamposConfiguracion';
import { TarjetaImpuestos } from './TarjetaImpuestos';
import { ejecutarApi, obtenerApi } from '../../../src/cliente/api';

interface ConfiguracionApi {
  readonly version: number;
  readonly nombreNegocio: string;
  readonly telefono: string | null;
  readonly direccion: string | null;
  readonly logoUrl: string | null;
  readonly colorPrimario: string;
  readonly colorAcento: string;
  readonly estilo: 'base' | 'editorial' | 'premium';
  readonly paquete: Paquete;
  readonly impuestoPuntosBase: number;
  readonly impuestoIncluidoEnPrecio: boolean;
}

export function ConfiguracionPantalla() {
  const [paquete, setPaquete] = useState<Paquete>('tienda');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [primario, setPrimario] = useState(COLOR_PRIMARIO_DEFAULT);
  const [acento, setAcento] = useState(COLOR_ACENTO_DEFAULT);
  const [version, setVersion] = useState(0);
  // El IVA se teclea en por ciento —«16»— y viaja en puntos base. La conversión
  // vive aquí y no en el servidor porque es presentación: el contrato es entero.
  const [iva, setIva] = useState('16');
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const { apariencia, cambiarEstilo } = useApariencia('base');
  const paqueteActivo = PAQUETES_NEGOCIO.find(({ id }) => id === paquete);

  useEffect(() => {
    void obtenerApi<ConfiguracionApi>('/api/catalogo/configuracion')
      .then((configuracion) => {
        setPaquete(configuracion.paquete);
        setNombre(configuracion.nombreNegocio);
        setTelefono(configuracion.telefono ?? '');
        setDireccion(configuracion.direccion ?? '');
        setLogoUrl(configuracion.logoUrl ?? '');
        setPrimario(configuracion.colorPrimario);
        setAcento(configuracion.colorAcento);
        setVersion(configuracion.version);
        setIva((configuracion.impuestoPuntosBase / 100).toString());
        setIvaIncluido(configuracion.impuestoIncluidoEnPrecio);
        cambiarEstilo(configuracion.estilo);
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'No se pudo leer la configuración');
      });
  }, [cambiarEstilo]);

  async function guardar(evento: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    evento.preventDefault();
    setGuardando(true);
    try {
      const salida = await ejecutarApi<{ version: number; paquete: Paquete }>(
        '/api/catalogo/configuracion',
        {
          version,
          nombreNegocio: nombre,
          telefono: telefono || null,
          direccion: direccion || null,
          logoUrl: logoUrl || null,
          colorPrimario: primario,
          colorAcento: acento,
          estilo: apariencia.estilo,
          paquete,
          impuestoPuntosBase: Math.round(Number(iva.replace(',', '.')) * 100),
          impuestoIncluidoEnPrecio: ivaIncluido,
        },
      );
      setVersion(salida.version);
      toast.success('Configuración guardada', {
        description: `${nombre} ahora usa el paquete ${paqueteActivo?.nombre ?? paquete}.`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la configuración');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={(evento) => {
        void guardar(evento);
      }}
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
          <Button type="submit" size="lg" disabled={guardando}>
            <Save aria-hidden="true" /> Guardar cambios
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (
                !window.confirm('Se reemplazarán los productos e inventario de esta demostración.')
              )
                return;
              void ejecutarApi('/api/catalogo/demostracion/resetear', { confirmacion: 'RESETEAR' })
                .then(() => {
                  toast.success('Demostración restablecida');
                  window.location.reload();
                })
                .catch((error: unknown) => {
                  toast.error(error instanceof Error ? error.message : 'No se pudo restablecer');
                });
            }}
          >
            Restablecer demo
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
                <Input
                  id="telefono"
                  name="telefono"
                  type="tel"
                  value={telefono}
                  onChange={(evento) => {
                    setTelefono(evento.target.value);
                  }}
                />
              </Campo>
            </div>
            <Campo id="direccion" etiqueta="Dirección">
              <Textarea
                id="direccion"
                name="direccion"
                value={direccion}
                onChange={(evento) => {
                  setDireccion(evento.target.value);
                }}
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

        <TarjetaImpuestos
          iva={iva}
          ivaIncluido={ivaIncluido}
          onIva={setIva}
          onIvaIncluido={setIvaIncluido}
        />

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
