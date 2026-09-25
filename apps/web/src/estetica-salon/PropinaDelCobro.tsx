'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@morphiqpos/ui/primitivas/select';
import { CampoDeDinero, Dinero } from '@morphiqpos/ui/sistema';
import { HandCoins, Plus, X } from 'lucide-react';
import type { Ref } from 'react';

import { repartirProporcional, type Camino, type ParteDelEquipo } from './cobro-de-cita';

/**
 * PIEZA · estetica-salon · la propina de un cobro
 *
 * Un toque con destinataria, en la pantalla principal y no en un paso posterior
 * (`04-INTERFAZ §4.3.4`, decisión 2). Y ahora QUEDA ANOTADA: antes se capturaba, se
 * pintaba en el botón y se tiraba, con un aviso de «todavía no queda anotada».
 *
 * ── El camino, porque cambia qué es ese dinero ───────────────────────────
 * A la MANO no pasa por el salón; al CAJÓN entra al arqueo y queda debida a la
 * profesional; en la TERMINAL entra al banco del salón y es una deuda con ella
 * (`02-DINERO-Y-CAJA §4.2`). Los tres dejan su renglón a nombre de quien la recibió,
 * y ninguno toca la venta ni el IVA. Un camino que el pago no admite —la terminal sin
 * tarjeta— sale apagado, porque el servidor lo rechazaría.
 *
 * ── La de apoyo ──────────────────────────────────────────────────────────
 * «$200 para Karla y $50 para la que me lavó»: un segundo importe con otra
 * destinataria. No se reparte nada por algoritmo; se anota lo que dijo la clienta.
 */

/** Los tres toques de propina del documento, en puntos porcentuales. */
const PORCENTAJES = [12, 15, 18];

const CAMINOS: readonly { readonly clave: Camino; readonly etiqueta: string }[] = [
  { clave: 'mano', etiqueta: 'A la mano' },
  { clave: 'cajon', etiqueta: 'Al cajón' },
  { clave: 'terminal', etiqueta: 'En la terminal' },
];

export interface PersonaDeLaPropina {
  readonly id: string;
  readonly nombre: string;
}

export interface PropinaDelCobroProps {
  readonly centavos: number;
  readonly puntos: number | null;
  readonly otra: number | null;
  /** La `key` del campo «otro»: un porcentaje lo vacía remontándolo. */
  readonly reinicioDeOtra: number;
  readonly destinatario: string;
  readonly camino: Camino;
  readonly caminosPosibles: readonly Camino[];
  /** Quienes atendieron, con lo que suma su servicio: el peso de su parte. */
  readonly equipo: readonly ParteDelEquipo[];
  /** Todo el equipo del salón: la de apoyo puede ser para quien no tiene línea. */
  readonly todas: readonly PersonaDeLaPropina[];
  readonly nombreDe: (id: string) => string;
  readonly apoyo: { readonly profesionalId: string; readonly centavos: number | null } | null;
  readonly refPrimerToque?: Ref<HTMLButtonElement>;
  readonly alElegirPorcentaje: (puntos: number) => void;
  readonly alEscribirOtra: (centavos: number | null) => void;
  readonly alElegirDestinatario: (destinatario: string) => void;
  readonly alElegirCamino: (camino: Camino) => void;
  readonly alCambiarApoyo: (
    apoyo: { readonly profesionalId: string; readonly centavos: number | null } | null,
  ) => void;
}

export function PropinaDelCobro({
  centavos,
  puntos,
  otra,
  reinicioDeOtra,
  destinatario,
  camino,
  caminosPosibles,
  equipo,
  todas,
  nombreDe,
  apoyo,
  refPrimerToque,
  alElegirPorcentaje,
  alEscribirOtra,
  alElegirDestinatario,
  alElegirCamino,
  alCambiarApoyo,
}: PropinaDelCobroProps) {
  // La parte de cada quien cuando se reparte: «se reparte en la proporción del
  // servicio y SE MUESTRA» (decisión 3). Sin enseñarla, la estilista cree que el
  // sistema se quedó con algo.
  const partes =
    destinatario === 'repartir' && equipo.length > 1 && centavos > 0
      ? repartirProporcional(
          centavos,
          equipo.map((p) => p.centavos),
        )
      : null;

  return (
    <div className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-4)">
      <p className="flex items-baseline justify-between gap-(--espacio-2)">
        <span className="text-xs font-medium tracking-wide text-texto-sutil uppercase">
          Propina
        </span>
        {centavos > 0 && <Dinero centavos={centavos} tamano="sm" />}
      </p>
      <div className="grid grid-cols-4 gap-(--espacio-2)">
        {PORCENTAJES.map((porcentaje, indice) => (
          <Button
            key={porcentaje}
            ref={indice === 0 ? refPrimerToque : undefined}
            type="button"
            variant={puntos === porcentaje ? ('default' as const) : ('outline' as const)}
            aria-pressed={puntos === porcentaje}
            className="font-numeros tabular-nums"
            onClick={() => {
              alElegirPorcentaje(porcentaje);
            }}
          >
            {porcentaje}%
          </Button>
        ))}
        <CampoDeDinero
          key={reinicioDeOtra}
          aria-label="Otra propina, en pesos"
          placeholder="otro"
          centavos={otra}
          alCambiar={(valor) => {
            alEscribirOtra(valor);
          }}
        />
      </div>

      <Select value={destinatario} onValueChange={alElegirDestinatario}>
        <SelectTrigger className="w-full" aria-label="Destinataria de la propina">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {equipo.length > 1 && (
            <SelectItem value="repartir">Repartir en proporción del servicio</SelectItem>
          )}
          {equipo.map((parte) => (
            <SelectItem key={parte.profesionalId} value={parte.profesionalId}>
              Para {nombreDe(parte.profesionalId)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {partes !== null && (
        <p className="flex flex-wrap gap-x-(--espacio-3) text-sm text-texto-sutil">
          {equipo.map((parte, indice) => (
            <span key={parte.profesionalId}>
              {nombreDe(parte.profesionalId)} <Dinero centavos={partes[indice] ?? 0} tamano="sm" />
            </span>
          ))}
        </p>
      )}

      <div
        role="group"
        aria-label="Por dónde entra la propina"
        className="grid grid-cols-3 gap-(--espacio-2)"
      >
        {CAMINOS.map(({ clave, etiqueta }) => (
          <Button
            key={clave}
            type="button"
            size="sm"
            variant={camino === clave ? 'default' : 'outline'}
            aria-pressed={camino === clave}
            disabled={!caminosPosibles.includes(clave)}
            onClick={() => {
              alElegirCamino(clave);
            }}
          >
            {etiqueta}
          </Button>
        ))}
      </div>

      {apoyo === null ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => {
            alCambiarApoyo({ profesionalId: todas[0]?.id ?? '', centavos: null });
          }}
          disabled={todas.length === 0}
        >
          <Plus aria-hidden="true" />
          Propina para otra persona
        </Button>
      ) : (
        <div className="grid grid-cols-[1fr_8rem_auto] items-center gap-(--espacio-2)">
          <Select
            value={apoyo.profesionalId}
            onValueChange={(profesionalId) => {
              alCambiarApoyo({ ...apoyo, profesionalId });
            }}
          >
            <SelectTrigger aria-label="Para quién es la propina de apoyo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {todas.map((persona) => (
                <SelectItem key={persona.id} value={persona.id}>
                  <HandCoins aria-hidden="true" /> Para {persona.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CampoDeDinero
            aria-label="Propina de apoyo, en pesos"
            placeholder="0.00"
            centavos={apoyo.centavos}
            alCambiar={(valor) => {
              alCambiarApoyo({ ...apoyo, centavos: valor });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar la propina de apoyo"
            onClick={() => {
              alCambiarApoyo(null);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
