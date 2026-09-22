'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { PackageOpen, SearchX } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@morphiqpos/ui/primitivas/table';
import { useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';

/**
 * PANTALLA · restaurante · inventario
 *
 * Saber qué hay, qué falta y qué se consumió. Dos a cinco veces al día, y casi
 * siempre de pie: encargado, almacén, dueño.
 *
 * ── Por qué el orden es la URGENCIA y no el abecedario ───────────────────
 * Un inventario alfabético obliga a leer ciento cincuenta renglones para dar
 * con los seis que importan. Ordenado por semáforo —agotado, crítico, bajo,
 * medio, suficiente— esos seis salen arriba y el resto es consulta. El
 * buscador va tercero a propósito: sólo se usa cuando ya sabes qué buscas.
 *
 * ── Por qué el semáforo lleva palabra y glifo, y no sólo color ───────────
 * Porque la bodega tiene mala luz, porque uno de cada doce hombres no separa
 * el rojo del verde, y porque aquí el color es la diferencia entre «pide hoy»
 * y «ya no hay».
 *
 * ── Por qué el ajuste es `+` y `−` y no un campo de texto ────────────────
 * Quien ajusta lo hace de pie, con una mano, contando con la otra. Un teclado
 * numérico en esa postura produce el error de mil: 1000 donde iban 100. Dos
 * botones grandes producen, como mucho, un paso de más, y el paso se ve antes
 * de guardar. Y el paso no es 1 para todo: en gramos y mililitros es 50,
 * porque un gramo de diferencia no se lo cree nadie y cincuenta sí.
 *
 * ── El motivo no es opcional ─────────────────────────────────────────────
 * Un ajuste sin motivo es un descuadre sin autor. El ledger es inmutable y no
 * se edita jamás, así que lo único que quedará para entender el número del mes
 * que viene es lo que alguien escriba hoy en ese renglón.
 *
 * ── Lo que NO va aquí, y quién lo decide ─────────────────────────────────
 * El valor y el costo del insumo cuando el rol es cocina. No lo decide esta
 * pantalla: el puente recorta el campo y llega `null`. Por eso el valor se
 * pinta «—» sin disculparse y sin preguntarle el rol a nadie.
 *
 * ── Lo que hoy no se puede hacer, y por qué ──────────────────────────────
 * La escritura es `/api/inventario/ajustar` —la convención `/api/<dominio>/
 * <verbo>`, y la ruta real del comando `inventario.ajustar_stock`— y pide el
 * almacén, pero el puente todavía no expone la entidad `Almacen`: la pantalla
 * no puede resolverlo sola, así que llega por la prop `almacenId`. Sin ella el
 * `+`/`−` sigue contando y lo dice en su sitio, en vez de fallar al confirmar.
 * Fuera de alcance por tamaño: el kardex y el filtro por categoría.
 */

/** Los cinco niveles del semáforo, del más urgente al que ya no preocupa. */
const NIVELES = {
  agotado: {
    etiqueta: 'Agotado',
    glifo: '■',
    clase: 'bg-destructive text-destructive-foreground border-destructive',
  },
  critico: {
    etiqueta: 'Crítico',
    glifo: '▲',
    clase: 'bg-destructive/20 text-foreground border-destructive',
  },
  bajo: { etiqueta: 'Bajo', glifo: '●', clase: 'bg-warning/30 text-foreground border-border' },
  medio: { etiqueta: 'Medio', glifo: '◐', clase: 'bg-muted text-muted-foreground border-border' },
  suficiente: {
    etiqueta: 'Suficiente',
    glifo: '○',
    clase: 'bg-success/20 text-foreground border-border',
  },
} as const;

const ORDEN = ['agotado', 'critico', 'bajo', 'medio', 'suficiente'] as const;
type Nivel = (typeof ORDEN)[number];

const RUTA_AJUSTE = '/api/inventario/ajustar';

/** Los nombres son los del PUENTE, en snake_case: no se traducen al entrar. */
export interface IngredienteDeInventario {
  readonly id: string;
  readonly nombre: string;
  readonly unidad_base: string | null;
  readonly stock_actual: number | null;
  readonly stock_minimo: number | null;
  readonly stock_critico: number | null;
  readonly valor_inventario: number | null;
  readonly categoria_nombre: string | null;
}

export interface InventarioProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly IngredienteDeInventario[];
  /** El almacén sobre el que se ajusta. Sin él, el ajuste sólo cuenta. */
  readonly almacenId?: string;
}

interface AjusteEnCurso {
  readonly id: string;
  readonly delta: number;
  readonly motivo: string;
}

/** Los cinco niveles, con los dos umbrales que el negocio ya usaba. */
export function nivelDe(fila: IngredienteDeInventario): Nivel {
  const actual = fila.stock_actual ?? 0;
  const critico = fila.stock_critico ?? 0;
  const minimo = fila.stock_minimo ?? 0;
  if (actual <= 0) return 'agotado';
  if (critico > 0 && actual <= critico) return 'critico';
  if (minimo > 0 && actual <= minimo) return 'bajo';
  // El 1.5 no es adorno: es el aviso que llega ANTES del mínimo, y es lo único
  // que permite comprar sin prisa y sin pagar el precio de la urgencia.
  if (minimo > 0 && actual <= minimo * 1.5) return 'medio';
  return 'suficiente';
}

/** Urgencia primero; dentro del mismo nivel, por nombre. */
export function porUrgencia(
  filas: readonly IngredienteDeInventario[],
): readonly IngredienteDeInventario[] {
  return [...filas].sort((a, b) => {
    const diferencia = ORDEN.indexOf(nivelDe(a)) - ORDEN.indexOf(nivelDe(b));
    return diferencia === 0 ? a.nombre.localeCompare(b.nombre, 'es-MX') : diferencia;
  });
}

/** Sin acentos y en minúsculas: en bodega nadie teclea «piña» con tilde. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Determinista a propósito: `toLocaleString` no da lo mismo en Node que en el
 * navegador, y esa diferencia es un desajuste de hidratación por renglón.
 */
function cifra(valor: number | null, unidad: string | null): string {
  if (valor === null) return '—';
  const redondeado = Math.round(valor * 1000) / 1000;
  return unidad === null ? `${redondeado}` : `${redondeado} ${unidad}`;
}

function pesos(valor: number | null): string {
  return valor === null ? '—' : `$${valor.toFixed(2)}`;
}

/** En gramos y mililitros el paso es 50; en piezas, una pieza. */
function pasoDe(unidad: string | null): number {
  return unidad === 'g' || unidad === 'ml' ? 50 : 1;
}

function textoDeFallo(fallo: unknown, porOmision: string): string {
  if (fallo instanceof ErrorApi) {
    // El límite de intentos no es un código de error: es el 429.
    if (fallo.estado === 429) return 'Demasiados ajustes seguidos. Espera unos segundos.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu rol no puede ajustar existencias.';
    if (fallo.error.codigo === 'PAQUETE_NO_INCLUYE') return 'Tu paquete no incluye inventario.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : porOmision;
}

function Semaforo({ nivel }: { readonly nivel: Nivel }) {
  const marca = NIVELES[nivel];
  return (
    <Badge variant="outline" className={`border ${marca.clase}`}>
      <span aria-hidden>{marca.glifo}</span>
      {marca.etiqueta}
    </Badge>
  );
}

interface AjustadorProps {
  readonly fila: IngredienteDeInventario;
  readonly activo: AjusteEnCurso | null;
  readonly guardando: boolean;
  readonly hayAlmacen: boolean;
  readonly onPaso: (fila: IngredienteDeInventario, signo: number) => void;
  readonly onMotivo: (texto: string) => void;
  readonly onGuardar: () => void;
  readonly onCancelar: () => void;
}

function Ajustador(props: AjustadorProps) {
  const { fila, activo, guardando, hayAlmacen } = props;
  const salto = pasoDe(fila.unidad_base);
  const delta = activo === null ? 0 : activo.delta;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={`Quitar ${salto} a ${fila.nombre}`}
          onClick={() => {
            props.onPaso(fila, -1);
          }}
        >
          −
        </Button>
        <span className="min-w-20 text-center text-base font-bold tabular-nums">
          {delta > 0 ? `+${delta}` : delta}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          aria-label={`Agregar ${salto} a ${fila.nombre}`}
          onClick={() => {
            props.onPaso(fila, 1);
          }}
        >
          +
        </Button>
      </div>
      {delta !== 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`motivo-${fila.id}`} className="text-xs">
            Motivo del ajuste
          </Label>
          <Input
            id={`motivo-${fila.id}`}
            value={activo === null ? '' : activo.motivo}
            placeholder="Merma, conteo físico, rotura…"
            onChange={(evento) => {
              props.onMotivo(evento.target.value);
            }}
          />
          {!hayAlmacen && (
            <p role="alert" className="text-xs text-muted-foreground">
              Falta el almacén: esta pantalla todavía no lo resuelve sola.
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={guardando || !hayAlmacen}
              onClick={() => {
                props.onGuardar();
              }}
            >
              Guardar ajuste
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                props.onCancelar();
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Inventario({ filasIniciales, almacenId }: InventarioProps) {
  const [filas, setFilas] = useState<readonly IngredienteDeInventario[] | null>(
    filasIniciales ?? null,
  );
  const [busqueda, setBusqueda] = useState('');
  const [ajuste, setAjuste] = useState<AjusteEnCurso | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // El centinela es la señal de aborto: dice si la pantalla sigue montada y
    // además cancela la lectura en vuelo.
    const control = new AbortController();
    // `Ingrediente` y no `Insumo`, que es como se llamaba aquí.
    //
    // Esa entidad NO EXISTE en el puente —la tabla `insumos` se expone como
    // `Ingrediente`— así que cada apertura de esta pantalla contestaba
    // `PUENTE_ENTIDAD_DESCONOCIDA`, el `catch` ponía el aviso y `filas` se quedaba
    // en `null`: la alacena de un restaurante llevaba EN BLANCO desde que existe.
    // La suite la daba por probada porque el HTML respondía 200.
    consultarPuente<IngredienteDeInventario>('Ingrediente', {
      limite: 300,
      signal: control.signal,
    })
      .then((leidas) => {
        if (!control.signal.aborted) setFilas(leidas);
      })
      .catch((fallo: unknown) => {
        // La bodega NUNCA se queda en blanco por la red: el encargado prefiere
        // la lista de hace diez segundos a no tener ninguna.
        if (!control.signal.aborted) setError(textoDeFallo(fallo, 'No se pudo leer la alacena.'));
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales]);

  const ordenadas = useMemo(() => porUrgencia(filas ?? []), [filas]);
  const aguja = normalizar(busqueda.trim());
  const visibles =
    aguja === '' ? ordenadas : ordenadas.filter((f) => normalizar(f.nombre).includes(aguja));
  const urgentes = ordenadas.filter((f) => nivelDe(f) === 'agotado' || nivelDe(f) === 'critico');
  const hayAlmacen = almacenId !== undefined;

  const paso = (fila: IngredienteDeInventario, signo: number): void => {
    const salto = pasoDe(fila.unidad_base) * signo;
    setAjuste((actual) =>
      actual !== null && actual.id === fila.id
        ? { ...actual, delta: actual.delta + salto }
        : { id: fila.id, delta: salto, motivo: '' },
    );
  };
  const escribirMotivo = (texto: string): void => {
    setAjuste((actual) => (actual === null ? null : { ...actual, motivo: texto }));
  };
  const cancelar = (): void => {
    setAjuste(null);
  };

  async function guardarAjuste(): Promise<void> {
    if (ajuste === null || almacenId === undefined) return;
    const enCurso = ajuste;
    setGuardando(true);
    setError(null);
    try {
      await invocarComando(RUTA_AJUSTE, {
        almacenId,
        insumoId: enCurso.id,
        // La cantidad viaja como TEXTO: `numeric(14,4)` no cabe en un `number`
        // sin perder el cuarto decimal, y ese decimal es la merma del mes.
        //
        // Y se llama `cantidad`, no `delta`: así lo pide `entradaAjustarStock`. Con
        // `delta` faltaba un campo obligatorio y sobraba uno desconocido, así que
        // TODO ajuste de esta pantalla contestaba `ENTRADA_INVALIDA`.
        cantidad: String(enCurso.delta),
        // `motivo` es una CLAVE de `motivos_merma` y desde la 062
        // `movimientos_stock.motivo` apunta a esa tabla: lo que el operador escribe
        // —y esta pantalla EXIGE que escriba algo— va en `nota`, que es su sitio.
        motivo: 'ajuste_conteo',
        nota: enCurso.motivo.trim(),
      });
      // Lo ajustado se refleja al vuelo; el valor definitivo llega con la
      // siguiente lectura. Pintar el número viejo haría dudar de si se guardó.
      setFilas((actuales) =>
        (actuales ?? []).map((f) =>
          f.id === enCurso.id ? { ...f, stock_actual: (f.stock_actual ?? 0) + enCurso.delta } : f,
        ),
      );
      setAjuste(null);
    } catch (fallo: unknown) {
      // Nunca se traga: un ajuste perdido en silencio es un descuadre que se
      // descubre en el conteo del mes.
      setError(textoDeFallo(fallo, 'No se pudo guardar el ajuste.'));
    } finally {
      setGuardando(false);
    }
  }

  const guardar = (): void => {
    void guardarAjuste();
  };

  if (filas === null) {
    // Esqueletos con la forma de la tabla, no un giro en el centro.
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const ajusteDe = (fila: IngredienteDeInventario): AjusteEnCurso | null =>
    ajuste !== null && ajuste.id === fila.id ? ajuste : null;

  const ajustador = (fila: IngredienteDeInventario) => (
    <Ajustador
      fila={fila}
      activo={ajusteDe(fila)}
      guardando={guardando}
      hayAlmacen={hayAlmacen}
      onPaso={paso}
      onMotivo={escribirMotivo}
      onGuardar={guardar}
      onCancelar={cancelar}
    />
  );

  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-background p-4 text-foreground">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold uppercase tracking-wide">Inventario</h1>
        <p className="text-sm tabular-nums text-muted-foreground">
          {ordenadas.length} insumos · {urgentes.length} por atender
        </p>
      </header>

      {/* La banda avisa, pero NO vacía la pantalla: debajo sigue la alacena. */}
      {error !== null && (
        <p role="alert" className="rounded-md border border-destructive p-2 text-sm">
          {error} · Se muestra el último dato conocido.
        </p>
      )}

      {/* Lo urgente, arriba de todo y antes del buscador: son los seis
          renglones por los que se abrió esta pantalla. */}
      {urgentes.length > 0 && (
        <section aria-label="Lo que hay que atender hoy" className="rounded-lg border p-3">
          <h2 className="text-xs font-bold uppercase text-muted-foreground">
            Hay que atender hoy ({urgentes.length})
          </h2>
          <p className="mt-1 text-sm">{urgentes.map((f) => f.nombre).join(' · ')}</p>
        </section>
      )}

      <Input
        value={busqueda}
        aria-label="Buscar insumo"
        placeholder="Buscar insumo…"
        onChange={(evento) => {
          setBusqueda(evento.target.value);
        }}
      />

      {visibles.length === 0 ? (
        /* El vacío ENSEÑA: dice qué pasó y qué se puede hacer. Son DOS vacíos
           distintos —la alacena sin nada y un filtro que no encuentra— y por eso
           llevan icono distinto: el segundo no es un problema del negocio. */
        <div className="rounded-lg border border-dashed">
          <Vacio
            icono={ordenadas.length === 0 ? <PackageOpen /> : <SearchX />}
            titulo={
              ordenadas.length === 0 ? 'La alacena está vacía.' : 'Ningún insumo se llama así.'
            }
            explicacion={
              ordenadas.length === 0
                ? 'Da de alta insumos para empezar a medir el consumo.'
                : 'Busca por otra palabra o borra el filtro.'
            }
          />
        </div>
      ) : (
        <>
          {/* PC · tabla densa: se lee sentado y de un vistazo. */}
          <div className="hidden overflow-x-auto xl:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Existencia</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ajustar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((fila) => (
                  <TableRow key={fila.id}>
                    <TableCell className="font-medium">{fila.nombre}</TableCell>
                    <TableCell>
                      <Semaforo nivel={nivelDe(fila)} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {cifra(fila.stock_actual, fila.unidad_base)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {cifra(fila.stock_minimo, fila.unidad_base)}
                    </TableCell>
                    {/* Cocina lo recibe en `null` y aquí se pinta «—»: el rol
                        lo recorta el puente, campo por campo, no la pantalla. */}
                    <TableCell className="tabular-nums">{pesos(fila.valor_inventario)}</TableCell>
                    <TableCell>{ajustador(fila)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Tablet y teléfono · tarjetas: se leen caminando la bodega, y el
              ajuste queda donde alcanza el pulgar. */}
          <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
            {visibles.map((fila) => (
              <li key={fila.id} className="rounded-lg border bg-card p-3 text-card-foreground">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-tight">{fila.nombre}</p>
                  <Semaforo nivel={nivelDe(fila)} />
                </div>
                <p className="mt-1 text-sm tabular-nums">
                  {cifra(fila.stock_actual, fila.unidad_base)}
                  <span className="text-muted-foreground">
                    {' '}
                    · mín. {cifra(fila.stock_minimo, fila.unidad_base)} ·{' '}
                    {pesos(fila.valor_inventario)}
                  </span>
                </p>
                <div className="mt-3">{ajustador(fila)}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
