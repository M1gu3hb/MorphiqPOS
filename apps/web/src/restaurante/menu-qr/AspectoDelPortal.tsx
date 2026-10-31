'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { Aviso, EsqueletoDeLista, Superficie } from '@morphiqpos/ui/sistema';
import { ESTILOS } from '@morphiqpos/ui/tokens';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

import {
  FONDOS_DEL_PORTAL,
  TIPOGRAFIAS_DEL_PORTAL,
  temaDelPortal,
  type TemaDelPortal,
} from './tema-del-portal';

const DEL_NEGOCIO = '__del_negocio__';
const CLAVE = ['portal_qr_tema'] as const;

async function leerTema(): Promise<TemaDelPortal> {
  const [configuracion] = await consultarPuente<{ portal_qr_tema?: unknown }>(
    'ConfiguracionNegocio',
    { limite: 1 },
  );
  return temaDelPortal(configuracion?.portal_qr_tema);
}

function Eleccion({
  etiqueta,
  valor,
  opciones,
  alCambiar,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly opciones: readonly { readonly valor: string; readonly nombre: string }[];
  readonly alCambiar: (valor: string) => void;
}) {
  const id = useId();
  return (
    <span className="flex flex-col gap-(--espacio-1)">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      <Select value={valor} onValueChange={alCambiar}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </span>
  );
}

/**
 * EL ASPECTO DEL PORTAL DEL COMENSAL (DP-9.7), por tokens: uno de los estilos del sistema (o el
 * del negocio), la tipografía y el fondo. El orden de las páginas es el «Orden» de cada una.
 */
export function AspectoDelPortal() {
  const clienteDeConsultas = useQueryClient();
  const guardado = useQuery({ queryKey: CLAVE, queryFn: leerTema });
  const [cambios, setCambios] = useState<TemaDelPortal | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  if (guardado.isPending) return <EsqueletoDeLista filas={1} />;
  const tema = cambios ?? guardado.data ?? temaDelPortal(null);
  const cambiar = (parte: Partial<TemaDelPortal>): void => {
    setCambios({ ...tema, ...parte });
  };

  async function guardar(): Promise<void> {
    setGuardando(true);
    setFallo(null);
    try {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        datos: { portal_qr_tema: tema },
      });
      await clienteDeConsultas.invalidateQueries({ queryKey: CLAVE });
      setCambios(null);
    } catch (error: unknown) {
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar el aspecto.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Superficie
      como="section"
      aria-label="Aspecto del portal"
      relleno={4}
      className="flex flex-col gap-(--espacio-3)"
    >
      <p className="font-bold">Aspecto del portal</p>
      <div className="grid gap-(--espacio-3) sm:grid-cols-3">
        <Eleccion
          etiqueta="Estilo"
          valor={tema.estilo ?? DEL_NEGOCIO}
          opciones={[
            { valor: DEL_NEGOCIO, nombre: 'El del negocio' },
            ...Object.values(ESTILOS).map((e) => ({ valor: e.clave, nombre: e.nombre })),
          ]}
          alCambiar={(valor) => {
            cambiar({ estilo: valor === DEL_NEGOCIO ? null : valor });
          }}
        />
        <Eleccion
          etiqueta="Tipografía"
          valor={tema.tipografia}
          opciones={TIPOGRAFIAS_DEL_PORTAL}
          alCambiar={(valor) => {
            const elegida = TIPOGRAFIAS_DEL_PORTAL.find((t) => t.valor === valor);
            if (elegida !== undefined) cambiar({ tipografia: elegida.valor });
          }}
        />
        <Eleccion
          etiqueta="Fondo"
          valor={tema.fondo}
          opciones={FONDOS_DEL_PORTAL}
          alCambiar={(valor) => {
            const elegido = FONDOS_DEL_PORTAL.find((f) => f.valor === valor);
            if (elegido !== undefined) cambiar({ fondo: elegido.valor });
          }}
        />
      </div>
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      <Button
        type="button"
        size="sm"
        className="self-start"
        disabled={cambios === null}
        cargando={guardando}
        onClick={() => void guardar()}
      >
        Guardar aspecto
      </Button>
    </Superficie>
  );
}
