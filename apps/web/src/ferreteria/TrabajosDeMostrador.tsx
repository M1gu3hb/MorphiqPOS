'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useEffect, useState } from 'react';

import { ErrorApi, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · ferreteria · trabajos-de-mostrador
 *
 * Las notas apartadas, las listas del albañil y las garantías: las tres cosas
 * que hoy viven en papel detrás del mostrador.
 *
 * ── Por qué las tres en una pantalla ────────────────────────────────────
 * Porque son el mismo mueble: el clavo donde se pinchan los papeles. Quien
 * llega a preguntar «¿ya llegó mi taladro?» y quien llega a recoger lo apartado
 * son la misma persona en la misma barra, y separarlas en tres pantallas obliga
 * a buscar en tres.
 *
 * ── Por qué la nota apartada CADUCA y se dice cuándo ────────────────────
 * Material apartado es material que no se vende. Sin fecha, el anaquel se llena
 * de cosas de alguien que no volvió, y la existencia miente hacia arriba.
 *
 * ── Por qué la lista se captura TAL CUAL la dijo el albañil ─────────────
 * «Diez de varilla del tres» no es una clave del catálogo, y traducirla al
 * capturar pierde lo que de verdad pidió. Se guarda el texto y se empareja
 * después: si nadie lo empareja, al menos queda qué se pidió.
 *
 * ── Y por qué la garantía enseña los DÍAS esperando ─────────────────────
 * «Lleva 90 días» es lo que hace que alguien llame al proveedor. «Pendiente» no.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben las tres listas, apartar, entregar, capturar una lista y recibir una
 * garantía. Queda fuera el surtido línea por línea de la lista, que pasa en la
 * pantalla de venta.
 */

const RUTA_NOTA = '/api/venta/nota-mostrador';
const RUTA_ENTREGAR = '/api/venta/nota-mostrador/entregar';
const RUTA_LISTA = '/api/venta/lista-trabajo';
const RUTA_GARANTIA = '/api/inventario/garantia';

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

const PESTANAS = [
  { clave: 'apartados', etiqueta: 'Apartado' },
  { clave: 'listas', etiqueta: 'Listas' },
  { clave: 'garantias', etiqueta: 'Garantías' },
] as const;

type Pestana = (typeof PESTANAS)[number]['clave'];

export interface NotaApartada {
  readonly notaId: string;
  readonly folio: string;
  readonly cliente: string;
  readonly totalCentavos: string;
  readonly venceEn: string;
  readonly diasRestantes: number;
}

export interface ListaDeTrabajo {
  readonly listaId: string;
  readonly folio: string;
  readonly cliente: string;
  readonly lineas: number;
  readonly surtidas: number;
}

export interface GarantiaPendiente {
  readonly garantiaId: string;
  readonly productoId: string;
  readonly piezas: number;
  readonly estado: string;
  readonly valorCentavos: string;
  readonly diasEsperando: number;
}

export interface TrabajosProps {
  readonly apartadosIniciales?: readonly NotaApartada[];
  readonly listasIniciales?: readonly ListaDeTrabajo[];
  readonly garantiasIniciales?: readonly GarantiaPendiente[];
  readonly almacenId: string;
}

function pesos(centavos: string): string {
  return PESOS.format(Number(centavos) / 100);
}

/** «Vence hoy» y «le quedan 3 días» no se leen igual, y no se atienden igual. */
export function leerVencimiento(dias: number): string {
  if (dias < 0) return `Venció hace ${String(-dias)} d`;
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Le queda 1 día';
  return `Le quedan ${String(dias)} días`;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo. Vuelve a intentarlo.';
}

export function TrabajosDeMostrador({
  apartadosIniciales,
  listasIniciales,
  garantiasIniciales,
  almacenId,
}: TrabajosProps) {
  const [pestana, setPestana] = useState<Pestana>('apartados');
  const [apartados, setApartados] = useState<readonly NotaApartada[] | null>(
    apartadosIniciales ?? null,
  );
  const [listas, setListas] = useState<readonly ListaDeTrabajo[] | null>(listasIniciales ?? null);
  const [garantias, setGarantias] = useState<readonly GarantiaPendiente[] | null>(
    garantiasIniciales ?? null,
  );
  const [textoLista, setTextoLista] = useState('');
  const [nombreLista, setNombreLista] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (
      apartadosIniciales !== undefined &&
      listasIniciales !== undefined &&
      garantiasIniciales !== undefined
    ) {
      return;
    }
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      if (apartadosIniciales === undefined) {
        invocarComando<{ readonly notas: readonly NotaApartada[] }>(RUTA_NOTA, { listar: true })
          .then((salida) => {
            if (sigueMontada()) setApartados(salida.notas);
          })
          .catch(() => {
            if (sigueMontada()) setApartados([]);
          });
      }
      if (listasIniciales === undefined) {
        invocarComando<{ readonly listas: readonly ListaDeTrabajo[] }>(RUTA_LISTA, {
          listar: true,
        })
          .then((salida) => {
            if (sigueMontada()) setListas(salida.listas);
          })
          .catch(() => {
            if (sigueMontada()) setListas([]);
          });
      }
      if (garantiasIniciales === undefined) {
        invocarComando<{ readonly pendientes: readonly GarantiaPendiente[] }>(RUTA_GARANTIA, {
          listar: true,
          proveedorId: null,
        })
          .then((salida) => {
            if (sigueMontada()) setGarantias(salida.pendientes);
          })
          .catch(() => {
            if (sigueMontada()) setGarantias([]);
          });
      }
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [apartadosIniciales, listasIniciales, garantiasIniciales]);

  function entregar(nota: NotaApartada): void {
    setOcupado(true);
    setError(null);
    invocarComando(RUTA_ENTREGAR, { notaId: nota.notaId })
      .then(() => {
        setApartados((apartados ?? []).filter((n) => n.notaId !== nota.notaId));
        setAviso(`Entregada la ${nota.folio}.`);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  function capturarLista(): void {
    const renglones = textoLista
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter((t) => t !== '');
    if (nombreLista.trim() === '' || renglones.length === 0) {
      setError('La lista lleva nombre y al menos un renglón.');
      return;
    }
    setOcupado(true);
    setError(null);
    invocarComando<ListaDeTrabajo>(RUTA_LISTA, {
      nombreLibre: nombreLista.trim(),
      // Tal cual lo dijo: traducirlo al capturar pierde lo que de verdad pidió.
      lineas: renglones.map((texto) => ({ textoPedido: texto })),
    })
      .then((creada) => {
        setListas([creada, ...(listas ?? [])]);
        setTextoLista('');
        setNombreLista('');
        setAviso('Lista capturada tal cual la dictó.');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  const cargando = apartados === null || listas === null || garantias === null;
  if (cargando) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Trabajos de mostrador</h1>
        <p className="text-muted-foreground text-sm">
          El clavo donde se pinchan los papeles, sin papeles.
        </p>
      </header>

      <div className="flex gap-2">
        {PESTANAS.map((opcion) => (
          <Button
            key={opcion.clave}
            type="button"
            variant={pestana === opcion.clave ? 'default' : 'outline'}
            onClick={() => {
              setPestana(opcion.clave);
            }}
          >
            {opcion.etiqueta}
          </Button>
        ))}
      </div>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {aviso !== null && <p className="text-sm">{aviso}</p>}

      {pestana === 'apartados' && (
        <section>
          {apartados.length === 0 && (
            <p className="text-muted-foreground text-sm">No hay nada apartado.</p>
          )}
          <ul className="divide-y">
            {apartados.map((nota) => (
              <li key={nota.notaId} className="flex items-center gap-3 py-3">
                <span className="w-24 font-medium">{nota.folio}</span>
                <span className="flex-1">{nota.cliente}</span>
                <span className="tabular-nums">{pesos(nota.totalCentavos)}</span>
                <span
                  className={
                    nota.diasRestantes <= 0
                      ? 'text-destructive text-sm'
                      : 'text-muted-foreground text-sm'
                  }
                >
                  {leerVencimiento(nota.diasRestantes)}
                </span>
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={() => {
                    entregar(nota);
                  }}
                >
                  Entregar
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-3 text-sm">
            Material apartado es material que no se vende: por eso caduca y por eso se ve cuándo.
          </p>
        </section>
      )}

      {pestana === 'listas' && (
        <section className="space-y-4">
          {listas.length === 0 && (
            <p className="text-muted-foreground text-sm">No hay listas abiertas.</p>
          )}
          <ul className="divide-y">
            {listas.map((lista) => (
              <li key={lista.listaId} className="flex items-center gap-3 py-3">
                <span className="w-24 font-medium">{lista.folio}</span>
                <span className="flex-1">{lista.cliente}</span>
                <span className="tabular-nums">
                  {lista.surtidas} de {lista.lineas}
                </span>
              </li>
            ))}
          </ul>

          <Separator />

          <div className="space-y-3">
            <h2 className="font-medium">Capturar una lista</h2>
            <div>
              <Label htmlFor="quien">De quién</Label>
              <Input
                id="quien"
                className="h-[calc(var(--altura-control)*1.2)]"
                placeholder="Don Beto, obra de la esquina"
                value={nombreLista}
                onChange={(evento) => {
                  setNombreLista(evento.target.value);
                }}
              />
            </div>
            <div>
              <Label htmlFor="lista">Lo que pidió, tal cual</Label>
              <Textarea
                id="lista"
                rows={6}
                placeholder={'diez de varilla del tres\nun bulto de cemento\ndos kilos de clavo'}
                value={textoLista}
                onChange={(evento) => {
                  setTextoLista(evento.target.value);
                }}
              />
              <p className="text-muted-foreground mt-1 text-sm">
                Un renglón por línea. No se traduce al capturar: se empareja después.
              </p>
            </div>
            <Button disabled={ocupado} onClick={capturarLista}>
              Guardar la lista
            </Button>
          </div>
        </section>
      )}

      {pestana === 'garantias' && (
        <section>
          {garantias.length === 0 && (
            <p className="text-muted-foreground text-sm">No hay nada en el proveedor.</p>
          )}
          <ul className="divide-y">
            {garantias.map((garantia) => (
              <li key={garantia.garantiaId} className="flex items-center gap-3 py-3">
                <span className="flex-1">
                  {garantia.piezas} pz · {garantia.estado}
                </span>
                <span className="tabular-nums">{pesos(garantia.valorCentavos)}</span>
                {/* «Lleva 90 días» es lo que hace que alguien llame al
                    proveedor. «Pendiente» no. */}
                <span
                  className={
                    garantia.diasEsperando > 30
                      ? 'text-destructive text-sm'
                      : 'text-muted-foreground text-sm'
                  }
                >
                  {garantia.diasEsperando} d esperando
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-3 text-sm">
            Almacén {almacenId === '' ? 'sin elegir' : almacenId}. Un negocio mediano pierde entre
            $20,000 y $60,000 al año porque nadie lleva esta cuenta.
          </p>
        </section>
      )}
    </main>
  );
}
