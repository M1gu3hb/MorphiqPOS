'use client';

import { interpretarCodigoInterno, type LayoutEanInterno } from '@morphiqpos/domain/catalogo';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Checkbox } from '@morphiqpos/ui/primitivas/checkbox';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { Check, Scale } from 'lucide-react';
import { useEffect, useState } from 'react';

import { consultarPuente, invocarComando } from '~/cliente/api';

import { layoutDeLaConfiguracion } from './cobro/escaneo.ts';

/**
 * LA BÁSCULA DE ETIQUETAS · F-148 (C.10 de la 2.4).
 *
 * El jamón, el queso y la fruta ya empaquetada no traen código de fábrica: la báscula del
 * departamento imprime un EAN-13 que empieza por 2 con el artículo y el peso —o el importe—
 * dentro. Cada marca de báscula reparte esos dígitos a su manera, y por eso el cobro NO
 * interpreta ninguna etiqueta hasta que el negocio dice cómo es la suya: leer un importe
 * como si fuera peso cobraría una cosa por otra sin que nada fallara.
 *
 * Se declara una vez y se PRUEBA aquí mismo: se pega una etiqueta impresa y se ve qué
 * artículo y qué peso lee, antes de guardar. El servidor vuelve a validar que el layout
 * quepa en los trece dígitos.
 */

interface Formulario {
  readonly prefijos: string;
  readonly digitosArticulo: string;
  readonly digitosValor: string;
  readonly contenido: 'peso' | 'importe';
  readonly decimales: string;
  readonly verificadorInterno: boolean;
}

/** El que usan casi todas las básculas de mostrador: 2 · seis del artículo · cinco del peso. */
const DE_FABRICA: Formulario = {
  prefijos: '2',
  digitosArticulo: '6',
  digitosValor: '5',
  contenido: 'peso',
  decimales: '3',
  verificadorInterno: false,
};

function desdeLayout(layout: LayoutEanInterno): Formulario {
  return {
    prefijos: layout.prefijos.join(', '),
    digitosArticulo: String(layout.digitosArticulo),
    digitosValor: String(layout.digitosValor),
    contenido: layout.contenido,
    decimales: String(layout.decimales),
    verificadorInterno: layout.verificadorInterno,
  };
}

/** El formulario como layout, o nulo si todavía no tiene forma. */
export function layoutDelFormulario(f: Formulario): LayoutEanInterno | null {
  return layoutDeLaConfiguracion({
    prefijos: f.prefijos
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== ''),
    digitosArticulo: Number(f.digitosArticulo),
    digitosValor: Number(f.digitosValor),
    contenido: f.contenido,
    decimales: Number(f.decimales),
    verificadorInterno: f.verificadorInterno,
  });
}

/** Lo que la etiqueta de prueba dice con este layout, dicho como lo diría el cajero. */
export function lecturaDePrueba(codigo: string, layout: LayoutEanInterno | null): string | null {
  const limpio = codigo.trim();
  if (limpio === '' || layout === null) return null;
  try {
    const leido = interpretarCodigoInterno(limpio, layout);
    return leido.contenido === 'peso'
      ? `Artículo ${leido.codigoArticulo} · ${leido.valor} kg`
      : `Artículo ${leido.codigoArticulo} · $${leido.valor}`;
  } catch (fallo: unknown) {
    return fallo instanceof Error ? fallo.message : 'Esa etiqueta no se pudo leer.';
  }
}

export function BasculaDeEtiquetas() {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [activa, setActiva] = useState(false);
  const [prueba, setPrueba] = useState('');
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado'>('quieto');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const control = new AbortController();
    consultarPuente<Record<string, unknown>>('ConfiguracionNegocio', {
      limite: 1,
      signal: control.signal,
    })
      .then(([config]) => {
        if (control.signal.aborted) return;
        const layout = layoutDeLaConfiguracion(config?.['bascula_etiqueta']);
        setActiva(layout !== null);
        setFormulario(layout === null ? DE_FABRICA : desdeLayout(layout));
      })
      .catch(() => {
        // Sin leer, se ofrece el de fábrica: guardar lo que aquí se vea es explícito.
        if (!control.signal.aborted) setFormulario(DE_FABRICA);
      });
    return () => {
      control.abort();
    };
  }, []);

  if (formulario === null) return null;
  const layout = layoutDelFormulario(formulario);
  const lectura = lecturaDePrueba(prueba, layout);

  async function guardar(valor: LayoutEanInterno | null): Promise<void> {
    setEstado('guardando');
    setError(null);
    try {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        datos: { bascula_etiqueta: valor },
      });
      setActiva(valor !== null);
      setEstado('guardado');
    } catch (fallo: unknown) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo guardar la báscula.');
      setEstado('quieto');
    }
  }

  const campo = (clave: keyof Formulario, etiqueta: string, ayuda: string) => (
    <div className="flex flex-col gap-(--espacio-1)">
      <Label htmlFor={`bascula-${clave}`}>{etiqueta}</Label>
      <Input
        id={`bascula-${clave}`}
        inputMode={clave === 'prefijos' ? 'text' : 'numeric'}
        className="font-numeros tabular-nums"
        value={String(formulario[clave])}
        aria-describedby={`bascula-${clave}-ayuda`}
        onChange={(evento) => {
          setEstado('quieto');
          setFormulario({ ...formulario, [clave]: evento.target.value });
        }}
      />
      <p id={`bascula-${clave}-ayuda`} className="text-xs text-texto-sutil">
        {ayuda}
      </p>
    </div>
  );

  return (
    <Superficie
      nivel={1}
      relleno={4}
      como="section"
      aria-labelledby="bascula-titulo"
      className="flex flex-col gap-(--espacio-3)"
    >
      <header className="flex items-start gap-(--espacio-2)">
        <Scale aria-hidden="true" className="mt-(--espacio-1) size-5 text-texto-sutil" />
        <div>
          <h2 id="bascula-titulo" className="text-lg font-bold">
            La báscula de etiquetas
          </h2>
          <p className="text-sm text-texto-sutil">
            {activa
              ? 'El cobro lee las etiquetas de tu báscula con este formato.'
              : 'Apagada: el cobro no lee ninguna etiqueta de báscula hasta que digas cómo es la tuya.'}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-(--espacio-3) md:grid-cols-4">
        {campo('prefijos', 'Empieza con', 'Del 20 al 29, o sólo 2.')}
        {campo('digitosArticulo', 'Dígitos del artículo', 'El código del producto en la báscula.')}
        {campo('digitosValor', 'Dígitos del valor', 'Lo que pesa, o lo que cuesta.')}
        {campo('decimales', 'Decimales', 'Tres para kilos: 00560 es 0.560 kg.')}
      </div>

      <div className="flex flex-wrap items-center gap-(--espacio-2)">
        <div
          role="group"
          aria-label="Qué lleva dentro la etiqueta"
          className="flex gap-(--espacio-1)"
        >
          {(['peso', 'importe'] as const).map((contenido) => (
            <Button
              key={contenido}
              type="button"
              size="sm"
              variant={formulario.contenido === contenido ? 'default' : 'outline'}
              aria-pressed={formulario.contenido === contenido}
              onClick={() => {
                setEstado('quieto');
                setFormulario({ ...formulario, contenido });
              }}
            >
              {contenido === 'peso' ? 'Lleva el peso' : 'Lleva el importe'}
            </Button>
          ))}
        </div>
        <div className="inline-flex items-center gap-(--espacio-2)">
          <Checkbox
            id="bascula-verificador"
            checked={formulario.verificadorInterno}
            onCheckedChange={(marcado) => {
              setEstado('quieto');
              setFormulario({ ...formulario, verificadorInterno: marcado === true });
            }}
          />
          <Label htmlFor="bascula-verificador">
            Mete un dígito de control entre el artículo y el valor
          </Label>
        </div>
      </div>

      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="bascula-prueba">Pega una etiqueta para probar</Label>
        <Input
          id="bascula-prueba"
          inputMode="numeric"
          className="font-numeros tabular-nums"
          value={prueba}
          placeholder="2001230005608"
          onChange={(evento) => {
            setPrueba(evento.target.value);
          }}
        />
        {lectura === null ? null : (
          <p role="status" className="text-sm">
            {lectura}
          </p>
        )}
      </div>

      {layout === null ? (
        <Aviso tono="atencion" titulo="Así no cabe en una etiqueta.">
          El prefijo, el artículo y el valor tienen que sumar doce dígitos; el trece es el de
          control.
        </Aviso>
      ) : null}
      {error === null ? null : <Aviso tono="peligro" titulo={error} />}

      <div className="flex flex-wrap gap-(--espacio-2)">
        <Button
          type="button"
          disabled={layout === null || estado === 'guardando'}
          onClick={() => {
            void guardar(layout);
          }}
        >
          {estado === 'guardado' ? <Check aria-hidden="true" /> : null}
          {estado === 'guardando'
            ? 'Guardando…'
            : estado === 'guardado'
              ? 'Guardada'
              : 'Guardar la báscula'}
        </Button>
        {activa ? (
          <Button
            type="button"
            variant="ghost"
            disabled={estado === 'guardando'}
            onClick={() => {
              void guardar(null);
            }}
          >
            Apagar la lectura de etiquetas
          </Button>
        ) : null}
      </div>
    </Superficie>
  );
}
