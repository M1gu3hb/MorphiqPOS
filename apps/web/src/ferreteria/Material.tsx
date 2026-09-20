'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · material
 *
 * El material continuo: los rollos abiertos, lo que queda y el corte.
 *
 * ── Por qué se recomienda LA MÁS CHICA QUE ALCANZA ──────────────────────
 * Cortar del rollo grande deja tres retazos del mismo cable, y el trabajo de una
 * ferretería es acabarse los abiertos, no abrir otro. Ofrecer «el primero de la
 * lista» es exactamente cómo se acumulan pedazos que después se rematan a
 * pérdida.
 *
 * ── Por qué la pieza abierta NO es el inventario ────────────────────────
 * El inventario sigue siendo el movimiento de stock en unidad base. Esto dice
 * cómo está repartido lo que ya está contado, y por eso abrir una pieza no mueve
 * existencia: moverla la descontaría dos veces, al abrir y al cortar.
 *
 * ── Por qué el folio se rotula a mano ───────────────────────────────────
 * «R-114» va con plumón en la cinta. Nadie copia un uuid a un rollo de cable, y
 * un identificador que no se puede escribir en el material físico es un
 * identificador que no se usa.
 *
 * ── Por qué la merma del corte tiene valor por omisión ──────────────────
 * Sin él se teclea cero, y el cero es mentira: cortar cable deja puntas. Un
 * inventario que no cuenta la merma del corte se desvía siempre en la misma
 * dirección hasta que el conteo anual lo descubre.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben ver lo abierto, abrir una pieza, cortar y marcar retazo. Queda fuera el
 * remate del retazo en venta, que pasa en la pantalla de cobro.
 */

const RUTA_PIEZAS = '/api/inventario/pieza-abierta';
const RUTA_CORTAR = '/api/inventario/cortar';

const MEDIDA_CON_FORMA = /^\d{1,9}$/;

/** Micrómetros por metro. Todo lo continuo vive en la unidad base entera. */
const MICRAS_POR_METRO = 1_000_000;

export interface PiezaViva {
  readonly piezaId: string;
  readonly folio: string;
  readonly medidaRestanteBase: string;
  readonly estado: string;
  readonly precioRemateCentavos: string | null;
  readonly diasAbierta: number;
  readonly alcanza: boolean;
}

export interface MaterialProps {
  readonly productoId: string;
  /**
   * YA NO SE USA, y se queda declarado para que nadie lo vuelva a pasar.
   *
   * El almacén es ámbito: lo resuelve el servidor. Cuando esta pantalla lo exigía,
   * `page.tsx` la montaba con la cadena vacía.
   */
  readonly almacenId?: never;
  readonly piezasIniciales?: readonly PiezaViva[];
}

/** Metros con dos decimales: es como se dice en el mostrador. */
export function enMetros(base: string): string {
  return (Number(base) / MICRAS_POR_METRO).toFixed(2);
}

export function aBase(metros: string): string | null {
  const limpio = metros.trim().replace(',', '.');
  if (limpio === '') return null;
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return String(Math.round(valor * MICRAS_POR_METRO));
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

export function Material({ productoId, piezasIniciales }: MaterialProps) {
  const voc = useVocabulario();
  const [piezas, setPiezas] = useState<readonly PiezaViva[] | null>(piezasIniciales ?? null);
  const [recomendada, setRecomendada] = useState<string | null>(null);
  const [necesita, setNecesita] = useState('');
  const [nueva, setNueva] = useState({ folio: '', metros: '' });
  const [corte, setCorte] = useState({ piezaId: '', metros: '', merma: '0.10' });
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function consultar(necesitaBase: string | null): void {
    invocarComando<{ readonly piezas: readonly PiezaViva[]; readonly recomendada: string | null }>(
      RUTA_PIEZAS,
      { productoId, necesitaBase },
    )
      .then((salida) => {
        setPiezas(salida.piezas);
        setRecomendada(salida.recomendada);
      })
      .catch(() => {
        setPiezas([]);
      });
  }

  useEffect(() => {
    if (piezasIniciales !== undefined) return;
    // Sin id no se consulta.
    //
    // Esta pantalla se abre SIN nada seleccionado —`page.tsx` la monta con la
    // cadena vacía— y consultar con ella manda un `where … = ''` a una columna
    // uuid: Postgres contesta 22P02 y la pantalla se lleva un 500 en cada
    // apertura. El estado de «elige algo» ya está escrito debajo.
    if (productoId === '') return;
    const arranque = setTimeout(() => {
      consultar(null);
    });
    return () => {
      clearTimeout(arranque);
    };
    // `consultar` cierra sobre `productoId`, que es lo único que la cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productoId, piezasIniciales]);

  function buscar(): void {
    const base = aBase(necesita);
    if (base === null) {
      setError('Pon cuántos metros hacen falta.');
      return;
    }
    setError(null);
    consultar(base);
  }

  function abrirPieza(): void {
    const base = aBase(nueva.metros);
    if (base === null || !MEDIDA_CON_FORMA.test(base)) {
      setError('Pon cuánto trae el rollo.');
      return;
    }
    if (nueva.folio.trim() === '') {
      setError('El rollo lleva rótulo: es como se vuelve a encontrar.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando(RUTA_PIEZAS, {
      productoId,
      // El almacén NO se manda: sale de la sesión del servidor (R16).
      medidaBase: base,
      folio: nueva.folio.trim(),
      ubicacionId: null,
    })
      .then(() => {
        setNueva({ folio: '', metros: '' });
        setAviso('Pieza abierta. No se movió existencia: el rollo ya estaba contado.');
        consultar(null);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function cortar(): void {
    const entregada = aBase(corte.metros);
    const merma = aBase(corte.merma) ?? '0';
    if (corte.piezaId === '' || entregada === null) {
      setError('Elige de qué pieza y cuántos metros.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando(RUTA_CORTAR, {
      productoId,
      piezaAbiertaId: corte.piezaId,
      medidaEntregadaBase: entregada,
      mermaBase: merma,
    })
      .then(() => {
        setCorte({ piezaId: '', metros: '', merma: '0.10' });
        setAviso('Cortado.');
        consultar(null);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  // El VACÍO QUE ENSEÑA: esta pantalla es la ficha de UN material continuo.
  //
  // `page.tsx` la monta sin material elegido y el efecto, con razón, no consulta con
  // un id vacío. Sin esto se quedaba en su esqueleto, en blanco, para siempre.
  if (productoId === '' && piezasIniciales === undefined) {
    return (
      <main className="mx-auto max-w-prose space-y-3 p-8 text-center">
        {/* Con el sustantivo del giro: una ferretería lee «material» y una
            tiendita «producto». Tecleado, el diccionario deja de mandar justo en
            el estado que más se ve —esta pantalla se monta sin material
            elegido—. */}
        <h1 className="text-xl font-semibold">
          Aquí se abre {voc.enFraseCon('un', 'producto')} que se corta
        </h1>
        <p className="text-sm text-muted-foreground">
          Los rollos abiertos con su etiqueta, lo que queda en cada uno y de cuál conviene cortar.
          Se llega desde el mostrador: busca {voc.enFrase('producto')} y toca su renglón.
        </p>
        <Button asChild>
          <a href="/ferreteria/mostrador">Ir al mostrador</a>
        </Button>
      </main>
    );
  }

  if (piezas === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">{voc.titulo('producto')}</h1>
        <p className="text-muted-foreground text-sm">
          Lo que hay abierto. El trabajo es acabarse los abiertos, no abrir otro.
        </p>
      </header>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {aviso !== null && <p className="text-sm">{aviso}</p>}

      <section className="flex items-end gap-3">
        <div>
          <Label htmlFor="necesita">Hacen falta (m)</Label>
          <Input
            id="necesita"
            inputMode="decimal"
            className="h-[calc(var(--altura-control)*1.4)] w-40 text-right text-lg"
            value={necesita}
            onChange={(evento) => {
              setNecesita(evento.target.value);
            }}
          />
        </div>
        <Button className="h-[calc(var(--altura-control)*1.4)]" onClick={buscar}>
          ¿De cuál corto?
        </Button>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Piezas abiertas</h2>
        {piezas.length === 0 && (
          <p className="text-muted-foreground text-sm">No hay ninguna abierta.</p>
        )}
        <ul className="divide-y">
          {piezas.map((pieza) => (
            <li key={pieza.piezaId} className="flex items-center gap-3 py-2">
              <span className="w-20 font-medium">{pieza.folio}</span>
              <span className="flex-1 tabular-nums">{enMetros(pieza.medidaRestanteBase)} m</span>
              <span className="text-muted-foreground text-sm">
                {pieza.diasAbierta} d abierta
                {pieza.estado === 'retazo' ? ' · retazo' : ''}
              </span>
              {recomendada === pieza.piezaId && (
                <span className="text-sm font-medium">corta de ésta</span>
              )}
              {!pieza.alcanza && <span className="text-muted-foreground text-sm">no alcanza</span>}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCorte({ ...corte, piezaId: pieza.piezaId });
                }}
              >
                Cortar
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <Separator />

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Cortar</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label htmlFor="corte-pieza">Pieza</Label>
            <Input
              id="corte-pieza"
              className="h-[calc(var(--altura-control)*1.2)]"
              placeholder="elígela arriba"
              readOnly
              value={piezas.find((p) => p.piezaId === corte.piezaId)?.folio ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="corte-metros">Metros</Label>
            <Input
              id="corte-metros"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.2)] text-right"
              value={corte.metros}
              onChange={(evento) => {
                setCorte({ ...corte, metros: evento.target.value });
              }}
            />
          </div>
          <div>
            <Label htmlFor="corte-merma">Merma (m)</Label>
            <Input
              id="corte-merma"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.2)] text-right"
              value={corte.merma}
              onChange={(evento) => {
                setCorte({ ...corte, merma: evento.target.value });
              }}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Viene puesta: el cero es mentira, cortar cable deja puntas.
            </p>
          </div>
        </div>
        <Button
          className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
          disabled={ocupado}
          onClick={cortar}
        >
          Registrar el corte
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Abrir un rollo</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="nueva-folio">Rótulo</Label>
            <Input
              id="nueva-folio"
              className="h-[calc(var(--altura-control)*1.2)]"
              placeholder="R-115"
              value={nueva.folio}
              onChange={(evento) => {
                setNueva({ ...nueva, folio: evento.target.value });
              }}
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Corto, porque se escribe con plumón en la cinta.
            </p>
          </div>
          <div>
            <Label htmlFor="nueva-metros">Trae (m)</Label>
            <Input
              id="nueva-metros"
              inputMode="decimal"
              className="h-[calc(var(--altura-control)*1.2)] text-right"
              value={nueva.metros}
              onChange={(evento) => {
                setNueva({ ...nueva, metros: evento.target.value });
              }}
            />
          </div>
        </div>
        <Button variant="outline" disabled={ocupado} onClick={abrirPieza}>
          Abrir
        </Button>
      </section>
    </main>
  );
}
