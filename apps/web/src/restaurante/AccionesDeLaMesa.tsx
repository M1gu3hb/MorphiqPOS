'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@morphiqpos/ui/primitivas/dialog';
import { Aviso, Esqueleto, Superficie, Vacio } from '@morphiqpos/ui/sistema';
import { ArrowRightLeft, Combine, ReceiptText, Split } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

import { mesasElegibles, type MesaElegible } from './mesas-elegibles';
import { PedirLaCuentaDialog } from './PedirLaCuentaDialog';
import { SepararMesasDialog } from './unir-mesas/SepararMesasDialog';

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
 * ── Pedir la cuenta: el mesero PREGUNTA la propina ───────────────────────
 * Es el primer momento de `02-DINERO-Y-CAJA` §4.3 —el mesero, en la mesa, preguntándole al
 * comensal—: «Pedir la cuenta» abre las opciones (10 %, 12.5 %, 15 %, sin propina, o «la
 * decide la caja» para quien no preguntó), `PedirLaCuentaDialog`. Esta pantalla pedía la
 * cuenta siempre con `decidir_en_caja`, sin preguntar, y la mesa que decía «déjale el diez
 * por ciento» llegaba a caja sin su propina. Después se abre la precuenta DE ESA cuenta, que
 * es la hoja que el mesero lleva a la mesa.
 *
 * ── DP-9.6: unir es en el MAPA, y aquí se separa ─────────────────────────
 * Sólo se unen mesas que quedan físicamente juntas, y eso se ve en el plano: «Unir mesas» lleva
 * al mapa del mesero con esta mesa ya elegida (`/mesero?unir=`), donde se arrastran o se juntan
 * con un toque. En la principal de un grupo vivo está «Separar mesas» (D-2): cada mesa vuelve a
 * su lugar y la cuenta se queda en ésta.
 *
 * ── Las tres son de sala ─────────────────────────────────────────────────
 * Ninguna mueve dinero fuera del negocio —el consumo es el mismo, cambia de sitio o de
 * cuenta—, y por eso el mesero puede las tres (`cambio-de-mesa.ts`, `union-de-mesas.ts`).
 * Dividir, anular y cancelar sí hacen desaparecer importes y siguen siendo de caja.
 */

function mensajeDe(fallo: unknown, porOmision: string): string {
  return fallo instanceof ErrorApi ? fallo.message : porOmision;
}

export interface AccionesDeLaMesaProps {
  readonly mesaId: string;
  readonly ordenId: string;
  /** Sin nada enviado no hay cuenta que pedir: `solicitar_cuenta` la rechaza. */
  readonly hayEnviado: boolean;
  /** Lo ya enviado, en centavos, para decirle a la mesa cuánto sería su propina; `null` si no se sabe. */
  readonly totalCentavos: number | null;
  /** La cuenta se fue a otra mesa: la pantalla abre ésa. */
  readonly alCambiarDeMesa: (mesaDestinoId: string) => void;
  /** DP-9.6 · El grupo vivo del que esta mesa es la principal; `null` si no encabeza uno. */
  readonly unionId: string | null;
  /** Se separó el grupo: la pantalla relee la mesa. */
  readonly alSeparar: () => void;
}

export function AccionesDeLaMesa(props: AccionesDeLaMesaProps) {
  const voc = useVocabulario();
  const router = useRouter();
  const [cambiando, setCambiando] = useState(false);
  const [preguntandoLaPropina, setPreguntandoLaPropina] = useState(false);
  const [separando, setSeparando] = useState(false);

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
          disabled={!props.hayEnviado}
          onClick={() => {
            setPreguntandoLaPropina(true);
          }}
        >
          <ReceiptText aria-hidden="true" />
          Pedir {voc.enFrase('orden')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCambiando(true);
          }}
        >
          <ArrowRightLeft aria-hidden="true" />
          Cambiar de {voc.singular('unidad_servicio')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            router.push(`/mesero?unir=${encodeURIComponent(props.mesaId)}`);
          }}
        >
          <Combine aria-hidden="true" />
          Unir {voc.plural('unidad_servicio')}
        </Button>
        {props.unionId === null ? null : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSeparando(true);
            }}
          >
            <Split aria-hidden="true" />
            Separar {voc.plural('unidad_servicio')}
          </Button>
        )}
      </div>
      {props.unionId === null || !separando ? null : (
        <SepararMesasDialog
          unionId={props.unionId}
          alCerrar={() => {
            setSeparando(false);
          }}
          alHecho={() => {
            setSeparando(false);
            props.alSeparar();
          }}
        />
      )}
      {preguntandoLaPropina ? (
        <PedirLaCuentaDialog
          ordenId={props.ordenId}
          totalCentavos={props.totalCentavos}
          alCerrar={() => {
            setPreguntandoLaPropina(false);
          }}
        />
      ) : null}
      {cambiando ? (
        <ElegirMesasDialog
          mesaId={props.mesaId}
          ordenId={props.ordenId}
          alCerrar={() => {
            setCambiando(false);
          }}
          alHecho={(destinoId) => {
            setCambiando(false);
            props.alCambiarDeMesa(destinoId);
          }}
        />
      ) : null}
    </div>
  );
}

interface ElegirMesasProps {
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
    // Sólo el salón EN SERVICIO: una mesa dada de baja sigue «libre», y sin el filtro se
    // ofrecía como destino de «Cambiar de mesa» una mesa que ya no existe para el mesero.
    consultarPuente<MesaElegible>('Mesa', {
      filtro: { activo: true },
      limite: 200,
      signal: control.signal,
    })
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

function ElegirMesasDialog({ mesaId, ordenId, alCerrar, alHecho }: ElegirMesasProps) {
  const voc = useVocabulario();
  const { mesas, fallo: falloDeLectura } = useSalon();
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const opciones = mesas === null ? null : mesasElegibles(mesas, mesaId);
  const titulo = `Cambiar de ${voc.singular('unidad_servicio')}`;

  async function confirmar(destinoId: string): Promise<void> {
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando('/api/restaurante/cambiar-mesa', { ordenId, mesaDestinoId: destinoId });
      alHecho(destinoId);
    } catch (error: unknown) {
      setFallo(mensajeDe(error, `No se pudo. ${voc.conArticulo('orden')} sigue como estaba.`));
      setEnviando(false);
    }
  }

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
            {`${voc.conArticulo('orden')}, lo comandado y la cocina se van con ustedes.`}
          </DialogDescription>
        </DialogHeader>
        <ListaDeMesas
          opciones={opciones}
          falloDeLectura={falloDeLectura}
          enviando={enviando}
          alTocar={(id) => void confirmar(id)}
        />
        {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      </DialogContent>
    </Dialog>
  );
}

interface ListaDeMesasProps {
  readonly opciones: readonly MesaElegible[] | null;
  readonly falloDeLectura: string | null;
  readonly enviando: boolean;
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
    return <Vacio titulo={`No hay ${voc.plural('unidad_servicio')} libres ahora.`} />;
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
