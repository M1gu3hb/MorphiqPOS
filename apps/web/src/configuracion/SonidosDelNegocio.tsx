'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Switch } from '@morphiqpos/ui/primitivas/switch';
import { ToggleGroup, ToggleGroupItem } from '@morphiqpos/ui/primitivas/toggle-group';
import { Aviso, Superficie, TablaAdaptable, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import { Play } from 'lucide-react';

import { invocarComando } from '~/cliente/api';
import { useTextoDelAparato } from '~/cliente/texto-del-aparato';
import { useExperiencia, type ExperienciaDelNegocio } from '~/proveedores/Experiencia';
import { oir } from '~/sonidos/gestor';
import {
  EVENTOS,
  MAPA,
  TECLAS_A_ELEGIR,
  recetaDe,
  type EventoDeSonido,
  type NombreDeReceta,
} from '~/sonidos/mapa';
import {
  CLAVE_DEL_SONIDO,
  SONIDO_DE_OMISION,
  gananciaDe,
  leerPreferenciaDeSonido,
} from '~/sonidos/perfil-del-aparato';

const nombreDe = (receta: NombreDeReceta): string =>
  `${receta.charAt(0).toUpperCase()}${receta.slice(1)}`;

/**
 * LOS SONIDOS DEL SISTEMA (DP-11.3), en Configuración → Sonidos: cada momento con su sonido y un
 * botón para oírlo; Miguel aprueba aquí el mapa. Lo del NEGOCIO: con qué suena el teclado y si el
 * portal del comensal suena. Lo de cada aparato (Apagado, Suave, Normal) está en Este aparato.
 */
export function SonidosDelNegocio() {
  const { experiencia, cambiar } = useExperiencia();
  const consultas = useQueryClient();
  const texto = useTextoDelAparato(CLAVE_DEL_SONIDO);
  const preferencia = leerPreferenciaDeSonido({ getItem: () => texto });
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const portal = useId();
  const teclado = useId();

  // «Oír» suena aunque el aparato esté en Apagado: quien pulsa quiere oírlo.
  const ganancia =
    gananciaDe(preferencia) > 0 ? gananciaDe(preferencia) : gananciaDe(SONIDO_DE_OMISION);

  async function guardar(parte: Partial<ExperienciaDelNegocio>): Promise<void> {
    if (guardando) return;
    const antes = experiencia;
    const nueva = { ...experiencia, ...parte };
    cambiar(nueva);
    setGuardando(true);
    setFallo(null);
    try {
      await invocarComando('/api/datos/escribir', {
        entidad: 'ConfiguracionNegocio',
        operacion: 'update',
        // Sólo lo que cambió: el servidor lo mezcla con lo guardado y no pisa lo de otro aparato.
        datos: { experiencia: parte },
      });
      await consultas.invalidateQueries({ queryKey: ['config'] });
    } catch (error: unknown) {
      cambiar(antes);
      setFallo(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  const columnas: readonly ColumnaDeTabla<EventoDeSonido>[] = [
    { clave: 'momento', titulo: 'Momento', celda: (evento) => MAPA[evento].titulo },
    {
      clave: 'sonido',
      titulo: 'Sonido',
      celda: (evento) => nombreDe(recetaDe(evento, experiencia.tecla)),
    },
    {
      clave: 'nota',
      titulo: 'Nota',
      desde: 'md',
      celda: (evento) => (
        <span className="text-sm text-texto-sutil">{MAPA[evento].nota ?? ''}</span>
      ),
    },
    {
      clave: 'oir',
      titulo: 'Oír',
      celda: (evento) => (
        <Button
          variant="ghost"
          size="sm"
          data-sonido="ninguno"
          aria-label={`Oír: ${MAPA[evento].titulo}`}
          onClick={() => {
            oir(recetaDe(evento, experiencia.tecla), ganancia);
          }}
        >
          <Play aria-hidden />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-(--espacio-6)">
      <Superficie
        como="section"
        relleno={0}
        aria-label="El teclado y el portal"
        className="flex flex-col gap-(--espacio-5) p-(--espacio-4) sm:p-(--espacio-6)"
      >
        <div className="flex flex-col gap-(--espacio-2)">
          <h3 id={teclado} className="text-lg font-semibold">
            El sonido del teclado
          </h3>
          <p className="max-w-prose text-sm text-texto-sutil">
            Para el PIN y los teclados de números. Oye los cuatro y quédate con uno.
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby={teclado}
            disabled={guardando}
            value={experiencia.tecla}
            onValueChange={(valor) => {
              const elegida = TECLAS_A_ELEGIR.find((t) => t === valor);
              if (elegida !== undefined) void guardar({ tecla: elegida });
            }}
          >
            {TECLAS_A_ELEGIR.map((tecla) => (
              <ToggleGroupItem key={tecla} value={tecla} className="px-(--espacio-4)">
                {nombreDe(tecla)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-wrap gap-(--espacio-2)">
            {TECLAS_A_ELEGIR.map((tecla) => (
              <Button
                key={tecla}
                variant="ghost"
                size="sm"
                data-sonido="ninguno"
                onClick={() => {
                  oir(tecla, ganancia);
                }}
              >
                <Play aria-hidden />
                Oír {nombreDe(tecla)}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-start justify-between gap-(--espacio-4)">
          <div className="flex flex-col gap-(--espacio-1)">
            <h3 id={portal} className="text-lg font-semibold">
              Sonidos en el portal del comensal
            </h3>
            <p className="max-w-prose text-sm text-texto-sutil">
              Apagado, el teléfono del comensal no suena al pedir desde el QR. Es para todo el
              negocio.
            </p>
          </div>
          <Switch
            checked={experiencia.sonidos_en_el_portal}
            disabled={guardando}
            aria-labelledby={portal}
            onCheckedChange={(sonidos_en_el_portal) => {
              void guardar({ sonidos_en_el_portal });
            }}
          />
        </div>
        {fallo === null ? null : (
          <Aviso tono="peligro" titulo={fallo}>
            Se queda como estaba guardado para el negocio.
          </Aviso>
        )}
      </Superficie>
      <TablaAdaptable
        etiqueta="Cada momento y su sonido"
        principal="momento"
        columnas={columnas}
        filas={EVENTOS}
        claveDe={(evento) => evento}
      />
    </div>
  );
}
