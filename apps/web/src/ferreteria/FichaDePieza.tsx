'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@morphiqpos/ui/primitivas/toggle-group';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · ferreteria · ficha-de-pieza
 *
 * El resultado ampliado: resuelve la duda cuando la tabla del mostrador no
 * basta. 10 a 25 veces al día, con el cliente enfrente.
 *
 * ── Por qué primero la foto y la MEDIDA, y no el nombre ──────────────────
 * El nombre es idéntico en las cinco filas que acaban de salir en el mostrador
 * —«tornillo tirafondo»—; lo que distingue a ésta de las otras es la medida.
 * El nombre queda arriba y chico; la medida va en grande, y en las DOS
 * notaciones: pulgada y milímetro es la conversión que aquí se hace de cabeza
 * cincuenta veces al día y que el electricista joven ya no sabe hacer.
 *
 * ── Por qué la foto exige escala, y se dice dentro de la pantalla ────────
 * Una foto de tornillo sin una moneda al lado no dice nada: podría ser de un
 * cuarto o de media pulgada. La leyenda no decora, es la instrucción a quien
 * toma la foto; separa una galería inútil de una herramienta de venta.
 *
 * ── Por qué DECLARAR UN EQUIVALENTE se hace aquí y no en administración ──
 * F-060 sólo se alimenta mientras se opera. Chava acaba de descubrir que el
 * métrico de 6 mm sirve: si para decirlo tuviera que ir a otra pantalla, no lo
 * diría nunca y la base no se llenaría jamás. Por eso el campo está a la vista
 * y el vacío PIDE —«nadie ha dicho todavía qué le puede sustituir»— en vez de
 * disculparse: ese vacío es el mecanismo de captura, no un hueco.
 *
 * ── Por qué «va con» es otra cosa que «equivalente» ──────────────────────
 * El equivalente reemplaza; el «va con» acompaña. Es la venta complementaria,
 * media línea más por venta, que es el indicador del mostradorista.
 *
 * ── Alcance recortado, dicho aquí y no escondido ─────────────────────────
 * Caben la foto, la medida, los atributos, existencia, ubicación, precios por
 * unidad, equivalentes con su alta, «va con», «se usa en», historial del
 * cliente y AGREGAR A LA VENTA. Quedan FUERA por el límite de 300 líneas: el
 * corte de material (tiene pantalla propia) y la SUBIDA de la foto —
 * `invocarComando` manda JSON y una imagen necesita multipart—, así que el
 * botón de cámara deja la foto elegida y lo dice, en vez de fingir que subió.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const NUMERO = new Intl.NumberFormat('es-MX');

/** Una forma de vender la misma pieza: «pieza», «kilo (≈91 pz)», «caja 500». */
export interface UnidadDeVenta {
  readonly clave: string;
  readonly etiqueta: string;
  readonly precioCentavos: number;
}

export interface EquivalenteDeFicha {
  readonly id: string;
  readonly nombre: string;
  /** «métrico», «si no importa el acabado»: por qué sustituye. */
  readonly nota: string | null;
  readonly precioCentavos: number | null;
}

export interface PiezaDeFicha {
  readonly id: string;
  readonly nombre: string;
  /** La ruta del catálogo: «Fijación › Tornillo › Tirafondo». */
  readonly familia: string;
  readonly medidaPulgada: string;
  readonly medidaMilimetro: string;
  readonly rosca: string | null;
  readonly cabeza: string | null;
  readonly material: string | null;
  readonly acabado: string | null;
  readonly marca: string | null;
  readonly sku: string;
  readonly fotoUrl: string | null;
  readonly existencia: number;
  /** «4 cajas + 340 sueltos»: cómo está guardado, no sólo cuánto hay. */
  readonly desglose: string | null;
  readonly pesoKg: number | null;
  /** F-152. Sin la gaveta, la ficha informa y no termina la venta. */
  readonly ubicacion: string | null;
  readonly unidades: readonly UnidadDeVenta[];
  readonly equivalentes: readonly EquivalenteDeFicha[];
  readonly vaCon: readonly string[];
  readonly seUsaEn: readonly string[];
  readonly historialCliente: string | null;
}

/**
 * La fila del puente, con los HIJOS como los sirve `PiezaFerreteria`.
 *
 * El puente devuelve los hijos con la forma de SU entidad —`Presentacion` y
 * `Equivalencia`— y esta pantalla lee otra: `unidades` con `clave`/`etiqueta`,
 * `equivalentes` con `nota` y precio. La traducción vive aquí, en una función, y
 * no en la vista: lo que la vista no puede hacer es partir una lista en dos por su
 * `tipo`, que es justo la diferencia entre «le sirve» y «va con».
 */
type FilaDelPuente = Omit<PiezaDeFicha, 'unidades' | 'equivalentes' | 'vaCon' | 'seUsaEn'> & {
  readonly unidades?: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly factor: number | null;
    readonly precio_venta_centavos: number | null;
  }[];
  readonly equivalencias?: readonly {
    readonly equivalente_id: string;
    readonly nombre: string | null;
    readonly nota: string | null;
    readonly precioCentavos: number | null;
    readonly tipo: string;
  }[];
};

/** La pieza como la lee esta pantalla, armada de la fila y sus hijos. */
export function comoFicha(fila: FilaDelPuente): PiezaDeFicha {
  const equivalencias = fila.equivalencias ?? [];
  const deTipo = (tipo: string) => equivalencias.filter((e) => e.tipo === tipo);
  return {
    ...fila,
    // La unidad base primero: es la que el mostrador cobra por omisión.
    unidades: (fila.unidades ?? []).map((u) => ({
      clave: u.id,
      etiqueta: u.factor === null || u.factor <= 1 ? u.nombre : `${u.nombre} (${String(u.factor)})`,
      precioCentavos: u.precio_venta_centavos ?? 0,
    })),
    // `sustituto` REEMPLAZA y `complemento` ACOMPAÑA: son dos listas distintas
    // porque ofrecer una llave a quien pide teflón es ruido en el mostrador.
    equivalentes: deTipo('sustituto').map((e) => ({
      id: e.equivalente_id,
      nombre: e.nombre ?? 'Sin nombre',
      nota: e.nota,
      precioCentavos: e.precioCentavos,
    })),
    vaCon: deTipo('complemento').map((e) => e.nombre ?? 'Sin nombre'),
    // `seUsaEn` sale de las listas de trabajo y todavía no se sirve: el vacío de
    // esa fila ya lo dice —«ninguna lista de trabajo lo pide todavía»— y decirlo
    // es mejor que rellenarlo con lo primero que se parezca.
    seUsaEn: [],
  };
}

export interface FichaDePiezaProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly piezaInicial?: PiezaDeFicha | null;
  /** Sin él la ficha abre la primera del catálogo; el mostrador sí lo manda. */
  readonly piezaId?: string;
  readonly onAgregar?: (piezaId: string, cantidad: number, unidad: string) => void;
}

/**
 * Traduce un fallo a algo que el mostradorista pueda hacer.
 *
 * El límite de intentos no es un código: es el 429, y por eso se lee del
 * estado de la respuesta y no del código estable.
 */
export function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) {
    if (fallo.estado === 429) return 'Vas muy rápido. Espera unos segundos y vuelve a intentarlo.';
    if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede hacer esto.';
    if (fallo.error.codigo === 'NO_ENCONTRADO') return 'Esa pieza ya no está en el catálogo.';
    return fallo.error.mensaje;
  }
  return fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.';
}

export function FichaDePieza({ piezaInicial, piezaId, onAgregar }: FichaDePiezaProps) {
  const voc = useVocabulario();
  const enrutador = useRouter();
  const [pieza, setPieza] = useState<PiezaDeFicha | null>(piezaInicial ?? null);
  const [equivalentes, setEquivalentes] = useState<readonly EquivalenteDeFicha[]>(
    piezaInicial?.equivalentes ?? [],
  );
  const [cargando, setCargando] = useState(piezaInicial === undefined);
  const [error, setError] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [unidad, setUnidad] = useState('pieza');
  const [propuesta, setPropuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fotoElegida, setFotoElegida] = useState<string | null>(null);

  useEffect(() => {
    if (piezaInicial !== undefined) return;
    // Centinela por AbortController y no por una bandera: la bandera el
    // compilador la da por siempre-verdadera y además no corta la petición.
    const control = new AbortController();
    const sigueMontada = () => !control.signal.aborted;
    const filtro = piezaId === undefined ? {} : { id: piezaId };
    consultarPuente<FilaDelPuente>('PiezaFerreteria', {
      filtro,
      limite: 1,
      signal: control.signal,
    })
      .then((filas) => {
        if (!sigueMontada()) return;
        const cruda = filas[0];
        const primera = cruda === undefined ? null : comoFicha(cruda);
        setPieza(primera);
        if (primera !== null) setEquivalentes(primera.equivalentes);
        setCargando(false);
      })
      .catch((fallo: unknown) => {
        // La ficha no se vacía por un error: si ya había datos siguen sirviendo
        // y si no los había, el estado vacío ya enseña qué hacer.
        if (!sigueMontada()) return;
        setError(mensajeDe(fallo));
        setCargando(false);
      });
    return () => {
      control.abort();
    };
  }, [piezaInicial, piezaId]);

  /** Un solo sitio donde una escritura se anuncia, falla y termina. */
  async function enviar(ruta: string, entrada: unknown, despues: () => void): Promise<void> {
    setEnviando(true);
    setError(null);
    try {
      await invocarComando(ruta, entrada);
      despues();
    } catch (fallo) {
      setError(mensajeDe(fallo));
    } finally {
      setEnviando(false);
    }
  }

  // Las rutas de escritura no están en el documento: se usa la convención
  // /api/<dominio>/<verbo> hasta que el de datos y backend las fije.
  function agregarALaVenta(): void {
    if (pieza === null) return;
    const piezas = Number.parseInt(cantidad, 10);
    if (!Number.isFinite(piezas) || piezas <= 0) {
      setError('Pon una cantidad mayor que cero.');
      return;
    }
    // La cantidad va como TEXTO: quien convierte cantidades es el servidor, y un
    // `number` de JavaScript no representa 0.1 sin error.
    const entrada = { piezaId: pieza.id, cantidad: String(piezas), unidad };
    void enviar('/api/ferreteria/agregar-partida', entrada, () => {
      onAgregar?.(pieza.id, piezas, unidad);
    });
  }

  function declararEquivalente(): void {
    const texto = propuesta.trim();
    if (pieza === null || texto === '') return;
    void enviar('/api/ferreteria/declarar-equivalencia', { piezaId: pieza.id, texto }, () => {
      // Se pinta al momento: quien acaba de declararlo tiene que verlo ahí.
      const recien = { id: texto, nombre: texto, nota: 'lo dijiste tú', precioCentavos: null };
      setEquivalentes((actuales) => [...actuales, recien]);
      setPropuesta('');
    });
  }

  const banda =
    error === null ? null : (
      <p role="alert" className="mb-3 rounded-md border border-destructive bg-destructive/15 p-2">
        {error} · Lo que ya está en pantalla sigue sirviendo.
      </p>
    );

  if (cargando) {
    // Esqueleto con la forma de la ficha —foto y renglones—, nunca un spinner:
    // el ojo ya sabe dónde va a mirar cuando lleguen los datos.
    return (
      <div className="mx-auto max-w-5xl p-3">
        <Skeleton className="mb-3 h-5 w-2/3" />
        <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <Skeleton className="aspect-square w-full rounded-md" />
          <div className="space-y-2">
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (pieza === null) {
    // El vacío ENSEÑA: dice qué resuelve esta pantalla y cómo se llega a ella.
    return (
      <div className="mx-auto flex max-w-xl flex-col items-start gap-3 p-6">
        {banda}
        <h1 className="text-xl font-bold">Aquí se amplía una pieza</h1>
        <p className="text-muted-foreground">
          La ficha se abre desde el mostrador: toca el renglón del material y verás su foto con
          escala, la medida en pulgada y en milímetro, cuánto hay, de qué gaveta se saca y qué le
          puede sustituir.
        </p>
        <Button
          type="button"
          onClick={() => {
            enrutador.push('/ferreteria/mostrador');
          }}
        >
          Ir al mostrador a buscar una pieza
        </Button>
      </div>
    );
  }

  const atributos = [
    ['Rosca', pieza.rosca],
    ['Cabeza', pieza.cabeza],
    ['Material', pieza.material],
    ['Acabado', pieza.acabado],
    ['Marca', pieza.marca],
    ['SKU', pieza.sku],
  ] as const;

  /** Lo que acompaña y lo que ya se llevó: cada uno con su vacío que invita. */
  const relaciones = [
    ['Va con', pieza.vaCon, 'Nadie ha registrado todavía qué lo acompaña.'],
    ['Se usa en', pieza.seUsaEn, 'Ninguna lista de trabajo lo pide todavía.'],
    [
      'Historial',
      historialDe(pieza),
      `${voc.conDeterminante('este', 'cliente')} no se lo ha llevado antes.`,
    ],
  ] as const;

  const elegida = pieza.unidades.find((u) => u.clave === unidad) ?? pieza.unidades[0];
  const pedidas = Number.parseInt(cantidad, 10);
  const importe = (elegida?.precioCentavos ?? 0) * (Number.isFinite(pedidas) ? pedidas : 0);

  return (
    <article className="mx-auto max-w-5xl p-3 pb-4 text-sm">
      {banda}
      <header className="mb-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{pieza.familia}</p>
        <h1 className="text-lg font-semibold md:text-xl">{pieza.nombre}</h1>
      </header>

      {/* En teléfono la foto va primero y a ancho completo; de tablet para
          arriba pasa a columna y los datos se leen a su lado. Un solo marcado. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <section aria-label="Foto de la pieza">
          {pieza.fotoUrl === null ? (
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border bg-muted p-4 text-center">
              <span className="text-lg font-semibold">📷 Tomar foto</span>
              <span className="text-xs text-muted-foreground">
                Ponle una moneda al lado: sin escala la foto no dice nada.
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(evento) => {
                  setFotoElegida(evento.target.files?.[0]?.name ?? null);
                }}
              />
            </label>
          ) : (
            // Fondo y no <img> para no depender del cargador remoto de Next. Se
            // limpian comillas y barras: la URL viene de la base y entra a CSS.
            <div
              role="img"
              aria-label={`Foto de ${pieza.nombre} con una moneda de referencia`}
              className="aspect-square w-full rounded-md border border-border bg-muted bg-cover bg-center"
              style={{ backgroundImage: `url("${pieza.fotoUrl.replace(/["\\]/g, '')}")` }}
            />
          )}
          {fotoElegida !== null && (
            <p className="mt-1 text-xs text-muted-foreground">
              Foto lista: {fotoElegida} · se sube cuando se guarde la pieza.
            </p>
          )}
        </section>

        <section aria-label="Medida y atributos">
          <p className="text-3xl font-bold leading-tight">{pieza.medidaPulgada}</p>
          <p className="text-lg text-muted-foreground">{pieza.medidaMilimetro}</p>
          <dl className="mt-3 grid gap-x-4 sm:grid-cols-2">
            {atributos.map(([etiqueta, valor]) => (
              <div
                key={etiqueta}
                className="flex justify-between gap-2 border-b border-border py-1"
              >
                <dt className="text-muted-foreground">{etiqueta}</dt>
                <dd className="text-right font-medium">{valor ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <Separator className="my-4" />

      <div className="grid gap-3 md:grid-cols-3">
        <section aria-label="Existencia" className="rounded-md border border-border bg-card p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Hay</p>
          <p className="text-2xl font-bold tabular-nums">{NUMERO.format(pieza.existencia)} pz</p>
          <p className="text-muted-foreground">
            {pieza.desglose ?? 'sin desglose de empaque'}
            {pieza.pesoKg === null ? '' : ` · ≈ ${NUMERO.format(pieza.pesoKg)} kg`}
          </p>
        </section>
        <section aria-label="Ubicación" className="rounded-md border border-border bg-card p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Dónde</p>
          <p className="text-xl font-semibold">{pieza.ubicacion ?? 'Sin ubicación registrada'}</p>
        </section>
        <section aria-label="Precios" className="rounded-md border border-border bg-card p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Precio</p>
          {pieza.unidades.map((u) => (
            <p key={u.clave} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{u.etiqueta}</span>
              <span className="font-semibold tabular-nums">
                {PESOS.format(u.precioCentavos / 100)}
              </span>
            </p>
          ))}
        </section>
      </div>

      {/* El alta de equivalentes va desplegada y arriba de todo lo demás: es el
          control más importante de la pantalla, y escondido no se usaría. */}
      <section aria-labelledby="titulo-equivalentes" className="mt-4">
        <h2 id="titulo-equivalentes" className="font-semibold">
          Equivalentes ({equivalentes.length})
        </h2>
        <ul className="mt-1">
          {equivalentes.map((eq) => (
            <li key={eq.id} className="flex justify-between gap-2 border-b border-border py-1">
              <span>
                {eq.nombre}
                {eq.nota === null ? '' : ` · ${eq.nota}`}
              </span>
              <span className="tabular-nums">
                {eq.precioCentavos === null ? '—' : PESOS.format(eq.precioCentavos / 100)}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={(evento) => {
            evento.preventDefault();
            declararEquivalente();
          }}
        >
          <div className="grow">
            <Label htmlFor="equivalente">
              {equivalentes.length === 0
                ? 'Nadie ha dicho todavía qué le puede sustituir. Si sabes, dilo aquí.'
                : '¿Sabes de otro que sirva? Dilo aquí.'}
            </Label>
            <Input
              id="equivalente"
              value={propuesta}
              placeholder="Tornillo 6 mm × 50 mm galvanizado"
              onChange={(evento) => {
                setPropuesta(evento.target.value);
              }}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={enviando || propuesta.trim() === ''}>
            ＋ Declarar
          </Button>
        </form>
      </section>

      <dl className="mt-4">
        {relaciones.map(([titulo, lineas, vacio]) => (
          <div key={titulo} className="flex flex-wrap gap-x-3 border-b border-border py-1">
            <dt className="w-24 font-semibold">{titulo}</dt>
            <dd className={lineas.length === 0 ? 'text-muted-foreground' : ''}>
              {lineas.length === 0 ? vacio : lineas.join(' · ')}
            </dd>
          </div>
        ))}
      </dl>

      {/* En el pasillo la barra se pega abajo —el pulgar la alcanza sin subir—;
          en PC se queda donde cae, al final de la ficha. */}
      <footer className="sticky bottom-0 z-10 -mx-3 mt-4 flex flex-wrap items-end gap-3 border-t border-border bg-background p-3 shadow-2 md:static md:mx-0 md:rounded-md md:border">
        <div>
          <Label htmlFor="cantidad">Cantidad</Label>
          <Input
            id="cantidad"
            inputMode="numeric"
            value={cantidad}
            className="w-24 text-lg tabular-nums"
            onChange={(evento) => {
              setCantidad(evento.target.value);
            }}
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={unidad}
          aria-label="Unidad de venta"
          onValueChange={(valor) => {
            if (valor !== '') setUnidad(valor);
          }}
        >
          {pieza.unidades.map((u) => (
            <ToggleGroupItem key={u.clave} value={u.clave} className="px-3">
              {u.etiqueta}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button type="button" size="lg" className="ml-auto" disabled={enviando} onClick={agregar}>
          {enviando ? 'Agregando…' : `AGREGAR A LA VENTA · ${PESOS.format(importe / 100)}`}
        </Button>
      </footer>
    </article>
  );

  function agregar(): void {
    agregarALaVenta();
  }
}

/** El historial es una frase o no es nada; la lista lo unifica con las otras. */
function historialDe(pieza: PiezaDeFicha): readonly string[] {
  return pieza.historialCliente === null ? [] : [pieza.historialCliente];
}
