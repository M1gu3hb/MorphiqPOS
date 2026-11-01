'use client';

import { atraer, grupoDe, revisarUnion, type MesaEnPlano } from '@morphiqpos/domain/sala';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { Combine, Split } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';

import { invocarComando } from '~/cliente/api';

import { EligeElNumero } from './EligeElNumero';
import { MesasQueSeFunden } from './MesasQueSeFunden';
import { SepararMesasDialog } from './SepararMesasDialog';
import {
  escalaDelPlano,
  juntarAlGrupo,
  mesasEnPlano,
  sinAbsorbidas,
  type MesaDelPlanoDeUnion,
} from './plano-de-union';
import { useUnionDeLaMesa } from './use-union-de-la-mesa';

/**
 * «UNIR MESAS» EN EL MAPA (DP-9.6). Las mesas tiemblan: se arrastran con el dedo o el mouse, al
 * acercarse se atraen (imán) y al tocarse se funden (un filtro SVG, sin librerías). También con
 * toques —una mesa, luego las que se le juntan—, para quien no puede o no quiere arrastrar. Al
 * unir se elige qué número queda. Nada se guarda hasta «Unir»: «Cancelar» deja el mapa igual.
 * Tocar la principal de una unión ofrece «Separar mesas»: así se separa una que quedó libre.
 */

/** El alto del mapa del mesero, en puntos del plano. */
const ALTO_DEL_PLANO = 600;
/** Menos que esto entre que se pisa y se suelta es un toque, no un arrastre. */
const TOQUE = 6;

interface Arrastre {
  readonly id: string;
  readonly dx: number;
  readonly dy: number;
  readonly x0: number;
  readonly y0: number;
}

export function UnirMesasEnElMapa({
  mesas,
  anclaInicial = null,
  alTerminar,
}: {
  readonly mesas: readonly MesaDelPlanoDeUnion[];
  readonly anclaInicial?: string | null;
  readonly alTerminar: (unidas: boolean) => void;
}) {
  // Sólo se guarda lo que el mesero MOVIÓ; el resto sale de las mesas que llegan. Así una mesa
  // que llega tarde —el mapa todavía cargaba al tocar «Unir mesas»— también aparece, y releer
  // el salón no deshace lo que ya se arrastró.
  const [movidas, setMovidas] = useState<ReadonlyMap<string, { x: number; y: number }>>(
    () => new Map(),
  );
  const plano: MesaEnPlano[] = mesasEnPlano(sinAbsorbidas(mesas)).map((m) => {
    const movida = movidas.get(m.id);
    return movida === undefined ? m : { ...m, ...movida };
  });
  const [ancla, setAncla] = useState<string | null>(anclaInicial);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [principal, setPrincipal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [ancho, setAncho] = useState(1000);
  const [separando, setSeparando] = useState(false);
  const contenedor = useRef<HTMLElement>(null);
  const seArrastro = useRef(false);

  useEffect(() => {
    const nodo = contenedor.current;
    if (nodo === null) return undefined;
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada !== undefined) setAncho(entrada.contentRect.width);
    });
    observador.observe(nodo);
    return () => {
      observador.disconnect();
    };
  }, []);

  const encabezaUnion = ancla !== null && mesas.some((m) => m.unida_a_mesa_id === ancla);
  const unionDelAncla = useUnionDeLaMesa(encabezaUnion ? ancla : null, 0)?.unionId ?? null;
  const escala = escalaDelPlano(ancho, plano);
  const grupo = ancla === null ? [] : grupoDe(ancla, plano);
  const delGrupo = plano.filter((m) => grupo.includes(m.id));
  const problema = grupo.length < 2 ? null : revisarUnion(delGrupo);
  const numeroDe = (id: string) => mesas.find((m) => m.id === id)?.numero ?? 0;
  const formaDe = (id: string) => mesas.find((m) => m.id === id)?.forma ?? 'redonda';
  const mover = (id: string, x: number, y: number) => {
    setMovidas((actual) => new Map(actual).set(id, { x, y }));
  };

  const tocar = (id: string) => {
    if (ancla === null || ancla === id) {
      setAncla(ancla === id ? null : id);
      return;
    }
    if (grupo.includes(id)) return;
    const destino = juntarAlGrupo(id, grupo, plano);
    mover(id, destino.x, destino.y);
  };

  const alPisar = (e: PointerEvent<HTMLButtonElement>, m: MesaEnPlano) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seArrastro.current = false;
    setArrastre({
      id: m.id,
      dx: e.clientX / escala - m.x,
      dy: e.clientY / escala - m.y,
      x0: e.clientX,
      y0: e.clientY,
    });
  };
  const alMover = (e: PointerEvent<HTMLButtonElement>, m: MesaEnPlano) => {
    if (arrastre?.id !== m.id) return;
    if (Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) < TOQUE) return;
    seArrastro.current = true;
    const suelta = {
      ...m,
      x: Math.max(0, e.clientX / escala - arrastre.dx),
      y: Math.max(0, Math.min(ALTO_DEL_PLANO - m.alto, e.clientY / escala - arrastre.dy)),
    };
    // El imán: cerca de otra, se pega a ella mientras se arrastra.
    const pegada = atraer(suelta, plano);
    mover(m.id, pegada.x, pegada.y);
  };
  const alSoltar = (m: MesaEnPlano) => {
    setArrastre(null);
    if (seArrastro.current && ancla === null) setAncla(m.id);
  };

  const unir = async () => {
    if (principal === null) return;
    setEnviando(true);
    setFallo(null);
    try {
      await invocarComando('/api/restaurante/unir-mesas', {
        mesaPrincipalId: principal,
        mesaIds: grupo.filter((id) => id !== principal),
        posiciones: delGrupo.map((m) => ({
          mesaId: m.id,
          x: Math.round(m.x),
          y: Math.round(m.y),
        })),
      });
      toast.success(`Mesas unidas: queda la ${String(numeroDe(principal))}.`);
      alTerminar(true);
    } catch (error: unknown) {
      setPrincipal(null);
      setFallo(error instanceof Error ? error.message : 'No se pudieron unir las mesas.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section aria-label="Unir mesas" className="flex flex-col gap-(--espacio-3)">
      <Aviso
        tono="info"
        titulo="Arrastra las mesas para juntarlas, o toca una y luego las que se le unen."
      >
        Al acercarse se atraen y al tocarse se funden. Nada se guarda hasta «Unir».
      </Aviso>
      <Superficie
        ref={contenedor}
        nivel={0}
        relleno={0}
        className="relative w-full overflow-hidden bg-fondo-sutil"
        style={{ height: ALTO_DEL_PLANO * escala }}
      >
        <MesasQueSeFunden plano={plano} escala={escala} grupo={grupo} formaDe={formaDe} />
        {plano.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-label={`Mesa ${String(numeroDe(m.id))}`}
            aria-pressed={grupo.includes(m.id)}
            className="absolute flex touch-none select-none items-center justify-center rounded-full text-lg font-bold text-texto outline-none animate-temblar focus-visible:ring-2 focus-visible:ring-primario motion-reduce:animate-none aria-pressed:text-primario-texto"
            style={{
              left: m.x * escala,
              top: m.y * escala,
              width: m.ancho * escala,
              height: m.alto * escala,
            }}
            onPointerDown={(e) => {
              alPisar(e, m);
            }}
            onPointerMove={(e) => {
              alMover(e, m);
            }}
            onPointerUp={() => {
              alSoltar(m);
            }}
            onClick={() => {
              if (seArrastro.current) seArrastro.current = false;
              else tocar(m.id);
            }}
          >
            {numeroDe(m.id)}
          </button>
        ))}
      </Superficie>
      {problema === null ? null : <Aviso tono="atencion" titulo={problema} />}
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      <div className="flex flex-wrap justify-end gap-(--espacio-2)">
        <Button
          variant="outline"
          onClick={() => {
            alTerminar(false);
          }}
        >
          Cancelar
        </Button>
        {unionDelAncla === null ? null : (
          <Button
            variant="outline"
            className="gap-(--espacio-2)"
            onClick={() => {
              setSeparando(true);
            }}
          >
            <Split className="size-4" aria-hidden="true" />
            Separar mesas
          </Button>
        )}
        <Button
          className="gap-(--espacio-2)"
          disabled={grupo.length < 2 || problema !== null || enviando}
          onClick={() => {
            setPrincipal(ancla);
          }}
        >
          <Combine className="size-4" aria-hidden="true" />
          {grupo.length < 2 ? 'Unir mesas' : `Unir ${String(grupo.length)} mesas`}
        </Button>
      </div>
      <EligeElNumero
        abierto={principal !== null}
        opciones={grupo.map((id) => ({ id, numero: numeroDe(id) }))}
        elegida={principal}
        enviando={enviando}
        alElegir={setPrincipal}
        alCerrar={() => {
          setPrincipal(null);
        }}
        alUnir={() => void unir()}
      />
      {unionDelAncla === null || !separando ? null : (
        <SepararMesasDialog
          unionId={unionDelAncla}
          alCerrar={() => {
            setSeparando(false);
          }}
          alHecho={() => {
            toast.success('Mesas separadas: cada una volvió a su lugar.');
            alTerminar(true);
          }}
        />
      )}
    </section>
  );
}
