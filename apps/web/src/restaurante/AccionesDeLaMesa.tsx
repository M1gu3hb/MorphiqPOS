'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso, Esqueleto, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { ArrowRightLeft, Combine, ReceiptText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * LO QUE EL MESERO HACE CON LA MESA ENTERA, no con un platillo (día completo del
 * restaurante, 2.4): pedir la cuenta, pasarse a otra mesa y juntar mesas.
 *
 * ── Por qué faltaban, si los comandos existían ───────────────────────────
 * `restaurante.cambiar_mesa` (F-303) y `restaurante.unir_mesas` (F-302) estaban escritos,
 * probados y con su ruta, y NINGUNA pantalla los llamaba: «nos pasamos a la terraza» y
 * «juntamos la 4 y la 5» —frases de todos los días, `01-FUNCIONES` §F-302/F-303— no se
 * podían decir desde el sistema. Y la mesa no podía PEDIR LA CUENTA desde las pantallas
 * del modelo: `MesaActiva` decía que eso era trabajo de Precuenta, Precuenta sólo imprime
 * (`imprimir_precuenta` no cambia el estado) y nadie le pasaba `?cuenta=`; su vacío
 * mandaba a «pedir la precuenta desde el mapa», donde no había con qué. La caja sólo lista
 * las mesas que pidieron la cuenta, así que lo comandado aquí no llegaba a cobrarse.
 *
 * ── Pedir la cuenta: la propina se decide en caja ────────────────────────
 * Es el momento «diferido» de `02-DINERO-Y-CAJA` §4.3 —el mesero pide la cuenta sin
 * preguntar— y por eso viaja `decidir_en_caja`: la caja pone el muro de la propina y
 * «Sin propina» pesa lo mismo que los porcentajes. Después se abre la precuenta DE ESA
 * cuenta, que es la hoja que el mesero lleva a la mesa.
 *
 * ── Las tres son de sala ─────────────────────────────────────────────────
 * Ninguna mueve dinero fuera del negocio —el consumo es el mismo, cambia de sitio o de
 * cuenta—, y por eso el mesero puede las tres (`cambio-de-mesa.ts`, `union-de-mesas.ts`).
 * Dividir, anular y cancelar sí hacen desaparecer importes y siguen siendo de caja.
 */

/** Lo que el puente sirve de una mesa, lo que aquí se usa para elegir. */
interface MesaElegible {
  readonly id: string;
  readonly numero: number;
  readonly estado: string;
  readonly zona: string | null;
  readonly venta_activa_id: string | null;
}

type Modo = 'cambiar' | 'unir';

/** Las mesas a las que se puede ir (libres) o que se pueden juntar (con su cuenta viva). */
export function mesasElegibles(
  mesas: readonly MesaElegible[],
  propiaId: string,
  modo: Modo,
): readonly MesaElegible[] {
  const otras = mesas.filter((m) => m.id !== propiaId);
  const elegibles =
    modo === 'cambiar'
      ? otras.filter((m) => m.estado === 'libre' && m.venta_activa_id === null)
      : otras.filter(
          (m) =>
            m.venta_activa_id !== null &&
            m.estado !== 'cuenta_solicitada' &&
            m.estado !== 'limpieza',
        );
  return [...elegibles].sort((a, b) => a.numero - b.numero);
}

function mensajeDe(fallo: unknown, porOmision: string): string {
  return fallo instanceof ErrorApi ? fallo.message : porOmision;
}

export interface AccionesDeLaMesaProps {
  readonly mesaId: string;
  readonly ordenId: string;
  /** Sin nada enviado no hay cuenta que pedir: `solicitar_cuenta` la rechaza. */
  readonly hayEnviado: boolean;
  /** La cuenta se fue a otra mesa: la pantalla abre ésa. */
  readonly alCambiarDeMesa: (mesaDestinoId: string) => void;
  /** Llegaron las líneas de las mesas unidas: la pantalla relee lo enviado. */
  readonly alUnir: () => void;
}

export function AccionesDeLaMesa(props: AccionesDeLaMesaProps) {
  const voc = useVocabulario();
  const router = useRouter();
  const [modo, setModo] = useState<Modo | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function pedirLaCuenta(): Promise<void> {
    setPidiendo(true);
    setFallo(null);
    try {
      await invocarComando('/api/restaurante/solicitar-cuenta', {
        ordenId: props.ordenId,
        propinaTipo: 'decidir_en_caja',
      });
      router.push(`/restaurante/precuenta?cuenta=${encodeURIComponent(props.ordenId)}`);
    } catch (error: unknown) {
      setFallo(mensajeDe(error, `No se pudo pedir ${voc.enFrase('orden')}.`));
      setPidiendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-(--espacio-2)">
      <div
        role="group"
        aria-label={`Acciones de ${voc.enFrase('unidad_servicio')}`}
        className="flex flex-wrap gap-(--espacio-2)"
      >
        <Button
          size="sm"
          variant="outline"
          disabled={!props.hayEnviado || pidiendo}
          cargando={pidiendo}
          onClick={() => {
            void pedirLaCuenta();
          }}
        >
          <ReceiptText aria-hidden="true" />
          Pedir {voc.enFrase('orden')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setModo('cambiar');
          }}
        >
          <ArrowRightLeft aria-hidden="true" />
          Cambiar de {voc.singular('unidad_servicio')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setModo('unir');
          }}
        >
          <Combine aria-hidden="true" />
          Unir {voc.plural('unidad_servicio')}
        </Button>
      </div>
      {fallo === null ? null : (
        <Aviso tono="peligro" titulo={fallo}>
          No se pidió nada: {voc.enFrase('orden')} sigue abierta.
        </Aviso>
      )}
      {modo === null ? null : (
        <ElegirMesasDialog
          key={modo}
          modo={modo}
          mesaId={props.mesaId}
          ordenId={props.ordenId}
          alCerrar={() => {
            setModo(null);
          }}
          alHecho={(destinoId) => {
            setModo(null);
            if (modo === 'cambiar') props.alCambiarDeMesa(destinoId);
            else props.alUnir();
          }}
        />
      )}
    </div>
  );
}

interface ElegirMesasProps {
  readonly modo: Modo;
  readonly mesaId: string;
  readonly ordenId: string;
  readonly alCerrar: () => void;
  readonly alHecho: (mesaDestinoId: string) => void;
}

/** Lee el salón al abrirse: lo libre y lo ocupado cambia cada minuto. */
function useSalon(): {
  readonly mesas: readonly MesaElegible[] | null;
  readonly fallo: string | null;
} {
  const [mesas, setMesas] = useState<readonly MesaElegible[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  useEffect(() => {
    const control = new AbortController();
    consultarPuente<MesaElegible>('Mesa', { limite: 200, signal: control.signal })
      .then((filas) => {
        if (!control.signal.aborted) setMesas(filas);
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) setFallo(mensajeDe(error, 'No se pudo leer el salón.'));
      });
    return () => {
      control.abort();
    };
  }, []);
  return { mesas, fallo };
}

function ElegirMesasDialog({ modo, mesaId, ordenId, alCerrar, alHecho }: ElegirMesasProps) {
  const voc = useVocabulario();
  const { mesas, fallo: falloDeLectura } = useSalon();
  const [elegidas, setElegidas] = useState<readonly string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const opciones = mesas === null ? null : mesasElegibles(mesas, mesaId, modo);
  const titulo =
    modo === 'cambiar'
      ? `Cambiar de ${voc.singular('unidad_servicio')}`
      : `Unir ${voc.plural('unidad_servicio')}`;

  async function confirmar(ids: readonly string[]): Promise<void> {
    const [primera] = ids;
    if (primera === undefined) return;
    setEnviando(true);
    setFallo(null);
    try {
      if (modo === 'cambiar') {
        await invocarComando('/api/restaurante/cambiar-mesa', { ordenId, mesaDestinoId: primera });
      } else {
        await invocarComando('/api/restaurante/unir-mesas', {
          mesaPrincipalId: mesaId,
          mesaIds: ids,
        });
      }
      alHecho(primera);
    } catch (error: unknown) {
      setFallo(mensajeDe(error, `No se pudo. ${voc.conArticulo('orden')} sigue como estaba.`));
      setEnviando(false);
    }
  }

  const alTocar = (id: string): void => {
    if (modo === 'cambiar') {
      void confirmar([id]);
      return;
    }
    setElegidas((antes) => (antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id]));
  };

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) alCerrar();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {modo === 'cambiar'
              ? `${voc.conArticulo('orden')}, lo comandado y la cocina se van con ustedes.`
              : `Lo comandado en las que elijas pasa a ${voc.enFraseCon('este', 'orden')}.`}
          </DialogDescription>
        </DialogHeader>
        <ListaDeMesas
          opciones={opciones}
          falloDeLectura={falloDeLectura}
          elegidas={elegidas}
          enviando={enviando}
          modo={modo}
          alTocar={alTocar}
        />
        {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
        {modo === 'unir' ? (
          <DialogFooter>
            <Button
              disabled={elegidas.length === 0 || enviando}
              cargando={enviando}
              onClick={() => {
                void confirmar(elegidas);
              }}
            >
              <Combine aria-hidden="true" />
              {`Unir ${voc.conNumero('unidad_servicio', elegidas.length)}`}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface ListaDeMesasProps {
  readonly opciones: readonly MesaElegible[] | null;
  readonly falloDeLectura: string | null;
  readonly elegidas: readonly string[];
  readonly enviando: boolean;
  readonly modo: Modo;
  readonly alTocar: (id: string) => void;
}

/** Las mesas, como teselas que se tocan con el pulgar: el número grande y su zona. */
function ListaDeMesas(props: ListaDeMesasProps) {
  const voc = useVocabulario();
  if (props.falloDeLectura !== null) {
    return <Aviso tono="peligro" titulo={props.falloDeLectura} />;
  }
  if (props.opciones === null) {
    return <Esqueleto className="h-32 w-full rounded-lg" />;
  }
  if (props.opciones.length === 0) {
    return (
      <Vacio
        titulo={
          props.modo === 'cambiar'
            ? `No hay ${voc.plural('unidad_servicio')} libres ahora.`
            : `No hay otra ${voc.singular('unidad_servicio')} con ${voc.singular('orden')} abierta.`
        }
      />
    );
  }
  return (
    <ul className="grid grid-cols-3 gap-(--espacio-2) sm:grid-cols-4">
      {props.opciones.map((mesa) => (
        <li key={mesa.id}>
          <Superficie
            como="button"
            type="button"
            interactiva
            relleno={3}
            activa={props.elegidas.includes(mesa.id)}
            aria-pressed={props.modo === 'unir' ? props.elegidas.includes(mesa.id) : undefined}
            disabled={props.enviando}
            onClick={() => {
              props.alTocar(mesa.id);
            }}
            className="flex min-h-20 w-full flex-col items-center justify-center gap-(--espacio-1)"
          >
            <span className="text-xs text-texto-sutil">{voc.titulo('unidad_servicio')}</span>
            <span className="font-numeros text-2xl font-bold tabular-nums">
              {String(mesa.numero)}
            </span>
            <span className="text-xs text-texto-sutil">{mesa.zona ?? ''}</span>
          </Superficie>
        </li>
      ))}
    </ul>
  );
}
