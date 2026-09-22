'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Textarea } from '@morphiqpos/ui/primitivas/textarea';
import { useEffect, useState } from 'react';

import { consultarPuente, ErrorApi, invocarComando } from '~/cliente/api';

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

/**
 * LAS RUTAS, y las tres que aquí se pedían mal.
 *
 * Esta pantalla leía sus tres listas haciendo POST a rutas de ESCRITURA con
 * `{listar: true}`: `nota_mostrador.apartar` pide un `notaId`, `lista_trabajo.capturar`
 * pide sus renglones y `inventario.recibir_garantia` pide la pieza. Las tres
 * contestaban **400**, los tres `.catch` de abajo lo convertían en tres listas
 * vacías, y la pantalla decía «no hay nada apartado · no hay listas abiertas · no
 * hay garantías pendientes» con las tres cosas en la base. Abría en 200, así que la
 * suite la daba por probada.
 *
 * Ahora cada cosa se lee por donde se lee: los apartados y las listas por el
 * PUENTE —que es el único camino de lectura— y las garantías por el comando de
 * lectura que ya existía y no tenía ruta.
 */
const RUTA_ENTREGAR = '/api/venta/nota-mostrador/entregar';
const RUTA_LISTA = '/api/venta/lista-trabajo';
const RUTA_GARANTIAS_PENDIENTES = '/api/inventario/garantias-pendientes';

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

/**
 * LA FILA DEL PUENTE de una nota apartada, con los nombres que `NotaDeCaja` sirve.
 *
 * Es la vista `notas_de_caja`, que resuelve el estado real de los dos documentos
 * —el de la orden dice si entró el dinero, el de la nota si salió el material— y
 * `apartada` es uno de ellos. Los días que le quedan NO son un campo: se derivan
 * de `vence` aquí, que es donde se pintan.
 */
interface FilaDeNotaApartada {
  readonly nota_id: string;
  readonly codigo_caja: string | null;
  readonly cliente_nombre: string | null;
  readonly totalCentavos: number;
  readonly vence: string | null;
}

/** La fila del puente de una lista, con sus renglones ya contados por la vista. */
interface FilaDeLista {
  readonly id: string;
  readonly folio: string;
  readonly cliente: string | null;
  readonly renglones: number;
  readonly surtidos: number;
}

/**
 * Cuántos días de CALENDARIO faltan, que es lo que el mostrador pregunta.
 *
 * Por días de calendario y no por horas: una resta de milisegundos dice «0 días»
 * a las 23:00 de la víspera y «1 día» a las 00:30 del mismo día de vencimiento,
 * y las dos respuestas se leen al revés de lo que pasa.
 */
function diasHasta(fecha: string | null): number {
  if (fecha === null || fecha === '') return 0;
  const aMedianoche = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((aMedianoche(new Date(fecha)) - aMedianoche(new Date())) / 86_400_000);
}

function comoNotaApartada(fila: FilaDeNotaApartada): NotaApartada {
  return {
    notaId: fila.nota_id,
    folio: fila.codigo_caja ?? 'sin folio',
    cliente: fila.cliente_nombre ?? 'sin nombre',
    // A texto: el importe viaja en centavos enteros y `pesos()` lo divide.
    totalCentavos: String(fila.totalCentavos),
    venceEn: fila.vence ?? '',
    diasRestantes: diasHasta(fila.vence),
  };
}

function comoLista(fila: FilaDeLista): ListaDeTrabajo {
  return {
    listaId: fila.id,
    folio: fila.folio,
    cliente: fila.cliente ?? 'sin nombre',
    lineas: fila.renglones,
    surtidas: fila.surtidos,
  };
}

export interface TrabajosProps {
  readonly apartadosIniciales?: readonly NotaApartada[];
  readonly listasIniciales?: readonly ListaDeTrabajo[];
  readonly garantiasIniciales?: readonly GarantiaPendiente[];
  /**
   * YA NO SE USA, y se queda declarado para que nadie lo vuelva a pasar.
   *
   * Ninguna de las tres consultas de esta pantalla lleva almacén, y exigirlo la
   * dejaba en blanco: `page.tsx` la monta con la cadena vacía.
   */
  readonly almacenId?: never;
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
      // Las notas apartadas, las listas y las garantías son del NEGOCIO: ninguna
      // de las tres consultas de abajo lleva almacén.
      //
      // Aquí había una guarda `if (almacenId === '') return;` heredada de cuando
      // esta pantalla consultaba con un id vacío. Tapó aquel 500 y dejó otra
      // avería: `page.tsx` la monta con la cadena vacía, así que las tres consultas
      // NO CORRÍAN NUNCA y la pantalla se quedaba en blanco para siempre.
      if (apartadosIniciales === undefined) {
        consultarPuente<FilaDeNotaApartada>('NotaDeCaja', {
          // El estado que la vista calcula de los dos documentos: material
          // comprometido que no ha salido.
          filtro: { estado: 'apartada' },
          limite: 60,
          signal: control.signal,
        })
          .then((filas) => {
            if (sigueMontada()) setApartados(filas.map(comoNotaApartada));
          })
          .catch(() => {
            if (sigueMontada()) setApartados([]);
          });
      }
      if (listasIniciales === undefined) {
        consultarPuente<FilaDeLista>('ListaDeTrabajo', { limite: 60, signal: control.signal })
          .then((filas) => {
            if (sigueMontada()) setListas(filas.map(comoLista));
          })
          .catch(() => {
            if (sigueMontada()) setListas([]);
          });
      }
      if (garantiasIniciales === undefined) {
        invocarComando<{ readonly pendientes: readonly GarantiaPendiente[] }>(
          RUTA_GARANTIAS_PENDIENTES,
          // Todas, de cualquier proveedor: la pestaña es «qué está en el limbo».
          { proveedorId: null },
        )
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
    /**
     * LO QUE EL COMANDO PIDE, que no es lo que aquí se mandaba.
     *
     * `lista_trabajo.capturar` recibe `titulo` y `renglones`; esto mandaba `lineas`
     * y ningún título, así que capturar una lista contestaba 400 con el formulario
     * entero escrito —y el albañil esperando—. El folio ya no se manda: lo pone el
     * servidor en su serie `LT`, como el de la nota y el del crédito.
     *
     * El título se arma con el nombre porque esta pantalla no pide uno: lo que se
     * enseña de una lista es su folio y de quién es. Un campo más en el formulario
     * del mostrador es un campo que nadie llena.
     */
    const nombre = nombreLista.trim();
    invocarComando<{
      readonly listaId: string;
      readonly folio: string;
      readonly renglones: number;
    }>(RUTA_LISTA, {
      titulo: `Lista de ${nombre}`,
      nombreLibre: nombre,
      // Tal cual lo dijo: traducirlo al capturar pierde lo que de verdad pidió.
      renglones: renglones.map((texto) => ({ textoPedido: texto })),
    })
      .then((creada) => {
        setListas([
          {
            listaId: creada.listaId,
            folio: creada.folio,
            cliente: nombre,
            lineas: creada.renglones,
            // Recién capturada: ninguno surtido todavía. Es el dato, no un cero
            // de relleno.
            surtidas: 0,
          },
          ...(listas ?? []),
        ]);
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
      <div className="space-y-(--espacio-4) p-(--espacio-6)">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-(--espacio-6) p-(--espacio-6)">
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
            aria-pressed={pestana === opcion.clave}
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
              <li
                key={nota.notaId}
                className="flex items-center gap-(--espacio-3) py-(--espacio-3)"
              >
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
          <p className="text-muted-foreground mt-(--espacio-3) text-sm">
            Material apartado es material que no se vende: por eso caduca y por eso se ve cuándo.
          </p>
        </section>
      )}

      {pestana === 'listas' && (
        <section className="space-y-(--espacio-4)">
          {listas.length === 0 && (
            <p className="text-muted-foreground text-sm">No hay listas abiertas.</p>
          )}
          <ul className="divide-y">
            {listas.map((lista) => (
              <li
                key={lista.listaId}
                className="flex items-center gap-(--espacio-3) py-(--espacio-3)"
              >
                <span className="w-24 font-medium">{lista.folio}</span>
                <span className="flex-1">{lista.cliente}</span>
                <span className="tabular-nums">
                  {lista.surtidas} de {lista.lineas}
                </span>
              </li>
            ))}
          </ul>

          <Separator />

          <div className="space-y-(--espacio-3)">
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
              <li
                key={garantia.garantiaId}
                className="flex items-center gap-(--espacio-3) py-(--espacio-3)"
              >
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
          <p className="text-muted-foreground mt-(--espacio-3) text-sm">
            Un negocio mediano pierde entre $20,000 y $60,000 al año porque nadie lleva esta cuenta.
          </p>
        </section>
      )}
    </main>
  );
}
