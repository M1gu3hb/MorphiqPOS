'use client';

import {
  ESTILOS_DE_CENTRO,
  ESTILOS_DE_MODULO,
  ESTILOS_DE_OJO,
  MARCOS,
  centrosCompatibles,
  esIdEstiloCentro,
  esIdEstiloModulo,
  esIdEstiloOjo,
  esIdMarco,
} from '@morphiqpos/domain/qr';
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
import { useId, type ReactNode } from 'react';

import { PAPEL_BLANCO } from './colores-del-qr';
import {
  LARGO_DEL_TEXTO_DEL_MARCO,
  TAMANO_MAXIMO_MM,
  TAMANO_MINIMO_MM,
  type DegradadoDelQr,
  type DisenoDeQr,
} from './diseno';

/**
 * Los controles del diseño de un QR de mesa (DP-9.8): estilos del catálogo del motor, colores,
 * degradado, logo, marco con sus textos y el tamaño impreso. Sólo cambian el diseño; si se lee,
 * lo dice la vista previa de al lado.
 */

const SIN_DEGRADADO = 'ninguno';
const SIN_MARCO = 'sin-marco';
const DEGRADADOS = [
  { valor: SIN_DEGRADADO, nombre: 'Sin degradado' },
  { valor: 'linear', nombre: 'Lineal' },
  { valor: 'radial', nombre: 'Radial' },
  { valor: 'duo', nombre: 'Dos tonos' },
] as const;

interface Opcion {
  readonly valor: string;
  readonly nombre: string;
}
const opciones = (lista: readonly { id: string; nombre: string }[]): Opcion[] =>
  lista.map(({ id, nombre }) => ({ valor: id, nombre }));

function Campo({
  etiqueta,
  children,
}: {
  readonly etiqueta: string;
  readonly children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <span className="flex min-w-0 flex-col gap-(--espacio-1)">
      <Label htmlFor={id} className="text-xs">
        {etiqueta}
      </Label>
      {children(id)}
    </span>
  );
}

function Seleccion({
  etiqueta,
  valor,
  lista,
  alCambiar,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly lista: readonly Opcion[];
  readonly alCambiar: (valor: string) => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      {(id) => (
        <Select value={valor} onValueChange={alCambiar}>
          <SelectTrigger id={id} className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {lista.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Campo>
  );
}

function Color({
  etiqueta,
  valor,
  alCambiar,
}: {
  readonly etiqueta: string;
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
}) {
  return (
    <Campo etiqueta={etiqueta}>
      {(id) => (
        <Input
          id={id}
          type="color"
          value={valor}
          onChange={(e) => {
            alCambiar(e.target.value);
          }}
        />
      )}
    </Campo>
  );
}

export function ControlesDelDiseno({
  diseno,
  hayLogo,
  alCambiar,
}: {
  readonly diseno: DisenoDeQr;
  readonly hayLogo: boolean;
  readonly alCambiar: (diseno: DisenoDeQr) => void;
}) {
  const cambiar = (parte: Partial<DisenoDeQr>) => {
    alCambiar({ ...diseno, ...parte });
  };
  const centros = ESTILOS_DE_CENTRO.filter((c) => centrosCompatibles(diseno.ojo).includes(c.id));
  const degradado = diseno.degradado;
  const marco = diseno.marco;
  const cambiarDegradado = (parte: Partial<DegradadoDelQr>) => {
    if (degradado !== null) cambiar({ degradado: { ...degradado, ...parte } });
  };

  return (
    <div className="grid grid-cols-1 gap-(--espacio-3) sm:grid-cols-2">
      <Seleccion
        etiqueta="Módulos"
        valor={diseno.modulo}
        lista={opciones(ESTILOS_DE_MODULO)}
        alCambiar={(v) => {
          if (esIdEstiloModulo(v)) cambiar({ modulo: v });
        }}
      />
      <Seleccion
        etiqueta="Esquinas"
        valor={diseno.ojo}
        lista={opciones(ESTILOS_DE_OJO)}
        alCambiar={(v) => {
          if (!esIdEstiloOjo(v)) return;
          const posibles = centrosCompatibles(v);
          cambiar({
            ojo: v,
            centro: posibles.includes(diseno.centro) ? diseno.centro : (posibles[0] ?? 'square'),
          });
        }}
      />
      <Seleccion
        etiqueta="Centro de las esquinas"
        valor={diseno.centro}
        lista={opciones(centros)}
        alCambiar={(v) => {
          if (esIdEstiloCentro(v)) cambiar({ centro: v });
        }}
      />
      <Campo
        etiqueta={`Tamaño impreso (${String(TAMANO_MINIMO_MM)} a ${String(TAMANO_MAXIMO_MM)} mm)`}
      >
        {(id) => (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={TAMANO_MINIMO_MM}
            max={TAMANO_MAXIMO_MM}
            value={diseno.tamanoMm}
            onChange={(e) => {
              cambiar({ tamanoMm: Math.round(Number(e.target.value)) });
            }}
          />
        )}
      </Campo>
      <Color
        etiqueta="Tinta"
        valor={diseno.primerPlano}
        alCambiar={(v) => {
          cambiar({ primerPlano: v });
        }}
      />
      <Color
        etiqueta="Esquinas (color)"
        valor={diseno.ojos}
        alCambiar={(v) => {
          cambiar({ ojos: v });
        }}
      />
      <Color
        etiqueta="Fondo"
        valor={diseno.fondo}
        alCambiar={(v) => {
          cambiar({ fondo: v });
        }}
      />
      <Seleccion
        etiqueta="Degradado"
        valor={degradado?.modo ?? SIN_DEGRADADO}
        lista={DEGRADADOS}
        alCambiar={(v) => {
          cambiar({
            degradado:
              v === 'linear' || v === 'radial' || v === 'duo'
                ? {
                    modo: v,
                    color: degradado?.color ?? diseno.ojos,
                    angulo: degradado?.angulo ?? 45,
                  }
                : null,
          });
        }}
      />
      {degradado === null ? null : (
        <>
          <Color
            etiqueta="Segundo color"
            valor={degradado.color}
            alCambiar={(v) => {
              cambiarDegradado({ color: v });
            }}
          />
          <Campo etiqueta="Ángulo (°)">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={360}
                value={degradado.angulo}
                onChange={(e) => {
                  cambiarDegradado({ angulo: Math.min(360, Math.max(0, Number(e.target.value))) });
                }}
              />
            )}
          </Campo>
        </>
      )}
      <span className="flex sm:col-span-2 items-center gap-(--espacio-2)">
        <Switch
          id="qr-con-logo"
          checked={diseno.conLogo}
          onCheckedChange={(v) => {
            cambiar({ conLogo: v });
          }}
          disabled={!hayLogo}
        />
        <Label htmlFor="qr-con-logo" className="text-sm">
          {hayLogo
            ? 'El logo del negocio al centro'
            : 'Logo al centro (sube el logo en Identidad del negocio)'}
        </Label>
      </span>
      <Seleccion
        etiqueta="Marco"
        valor={marco?.tipo ?? SIN_MARCO}
        lista={[
          { valor: SIN_MARCO, nombre: 'Sin marco' },
          ...MARCOS.map((m) => ({ valor: m.id, nombre: `${m.nombre} · ${m.grupo}` })),
        ]}
        alCambiar={(v) => {
          cambiar({
            marco: esIdMarco(v)
              ? {
                  tipo: v,
                  texto: marco?.texto ?? 'Mesa {mesa}',
                  textoSecundario: marco?.textoSecundario ?? 'Escanea y pide',
                  color: marco?.color ?? diseno.primerPlano,
                  colorTexto: marco?.colorTexto ?? PAPEL_BLANCO,
                }
              : null,
          });
        }}
      />
      {marco === null ? null : (
        <>
          <Campo etiqueta="Texto del marco ({mesa} = número)">
            {(id) => (
              <Input
                id={id}
                maxLength={LARGO_DEL_TEXTO_DEL_MARCO}
                value={marco.texto}
                onChange={(e) => {
                  cambiar({ marco: { ...marco, texto: e.target.value } });
                }}
              />
            )}
          </Campo>
          <Campo etiqueta="Segundo texto">
            {(id) => (
              <Input
                id={id}
                maxLength={LARGO_DEL_TEXTO_DEL_MARCO}
                value={marco.textoSecundario}
                onChange={(e) => {
                  cambiar({ marco: { ...marco, textoSecundario: e.target.value } });
                }}
              />
            )}
          </Campo>
          <Color
            etiqueta="Color del marco"
            valor={marco.color}
            alCambiar={(v) => {
              cambiar({ marco: { ...marco, color: v } });
            }}
          />
          <Color
            etiqueta="Color del texto"
            valor={marco.colorTexto}
            alCambiar={(v) => {
              cambiar({ marco: { ...marco, colorTexto: v } });
            }}
          />
        </>
      )}
    </div>
  );
}
