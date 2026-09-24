'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  ListaDeTarjetas,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
  type TamanoDeDinero,
  type TonoDeFila,
} from '@morphiqpos/ui/sistema';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Minus,
  OctagonX,
  PackageOpen,
  Plus,
  Search,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

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
 * ── Por qué el semáforo lleva palabra y figura, y no sólo color ──────────
 * Porque la bodega tiene mala luz, porque uno de cada doce hombres no separa
 * el rojo del verde, y porque aquí el color es la diferencia entre «pide hoy»
 * y «ya no hay». Cada nivel tiene su figura —octágono, triángulo, círculo con
 * aviso, círculo punteado, círculo con palomita— y su palabra escrita.
 *
 * ── Tres formatos, y se pinta UNO ────────────────────────────────────────
 * PC: una `Tabla` densa, con la fila teñida por urgencia y la palabra en su
 * celda; se lee sentado y de un vistazo. Tableta: `ListaDeTarjetas` en dos
 * columnas, para leerse caminando la bodega. Teléfono: una columna. En las dos
 * últimas la existencia va grande y el `+`/`−` también, junto al pulgar. El
 * formato se decide en JS: pintar los dos y esconder uno con CSS dejaba cada
 * ingrediente dos veces para el lector de pantalla y dos botones iguales para
 * una prueba.
 *
 * ── Por qué el ajuste es `+` y `−` y no un campo de texto ────────────────
 * Quien ajusta lo hace de pie, con una mano, contando con la otra. Un teclado
 * numérico en esa postura produce el error de mil: 1000 donde iban 100. Dos
 * botones grandes producen, como mucho, un paso de más, y el paso se ve antes
 * de guardar —con la existencia en que queda—. Y el paso no es 1 para todo: en
 * gramos y mililitros es 50, porque un gramo de diferencia no se lo cree nadie
 * y cincuenta sí.
 *
 * ── El motivo no es opcional ─────────────────────────────────────────────
 * Un ajuste sin motivo es un descuadre sin autor. El ledger es inmutable y no
 * se edita jamás, así que lo único que quedará para entender el número del mes
 * que viene es lo que alguien escriba hoy en ese renglón.
 *
 * ── Los tres estados ─────────────────────────────────────────────────────
 * Si no se leyó nada, `ErrorDePantalla` con su reintento: no hay último dato
 * que enseñar. Si lo que falla es un AJUSTE, la lista se queda y el `Aviso` sale
 * en el mismo renglón donde se pulsó «Guardar ajuste», con lo contado intacto
 * para volver a intentarlo. Mientras se lee, la forma de lo que viene.
 *
 * ── Lo que NO va aquí, y quién lo decide ─────────────────────────────────
 * El valor y el costo del ingrediente cuando el rol es cocina. No lo decide esta
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

const ORDEN = ['agotado', 'critico', 'bajo', 'medio', 'suficiente'] as const;
type Nivel = (typeof ORDEN)[number];

interface MarcaDeNivel {
  readonly etiqueta: string;
  readonly Icono: LucideIcon;
  readonly clase: string;
}

/** Los cinco niveles del semáforo, del más urgente al que ya no preocupa. */
const NIVELES: Readonly<Record<Nivel, MarcaDeNivel>> = {
  agotado: {
    etiqueta: 'Agotado',
    Icono: OctagonX,
    clase: 'border-peligro bg-peligro text-peligro-texto',
  },
  critico: {
    etiqueta: 'Crítico',
    Icono: TriangleAlert,
    clase: 'border-peligro/50 bg-peligro/15 text-peligro',
  },
  bajo: {
    etiqueta: 'Bajo',
    Icono: CircleAlert,
    clase: 'border-advertencia/60 bg-advertencia/25 text-texto',
  },
  medio: {
    etiqueta: 'Medio',
    Icono: CircleDashed,
    clase: 'border-borde bg-fondo-sutil text-texto-sutil',
  },
  suficiente: {
    etiqueta: 'Suficiente',
    Icono: CircleCheck,
    clase: 'border-exito/40 bg-exito/10 text-texto',
  },
};

/** El tinte de la fila en la PC. Nunca va solo: la celda «Estado» dice por qué. */
const TONO_DE_FILA: Partial<Readonly<Record<Nivel, TonoDeFila>>> = {
  agotado: 'peligro',
  critico: 'advertencia',
};

const RUTA_AJUSTE = '/api/inventario/ajustar';

/** Desde este ancho la lista es tabla densa: el `xl` del sistema. */
const CONSULTA_PC = '(min-width: 1280px)';

const PAGINA = 'flex min-h-dvh flex-col gap-(--espacio-4) bg-fondo p-(--espacio-4) text-texto';

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
 * El puente sirve el valor en PESOS y `<Dinero>` pide centavos. Se cuentan los
 * dígitos en vez de multiplicar: `58.995 * 100` pierde medio centavo.
 */
function aCentavos(valor: number): number {
  const [entero = '0', decimal = '00'] = Math.abs(valor).toFixed(2).split('.');
  return (valor < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Los decimales que de verdad trae una cantidad, hasta tres: 2.5 kg no es «2.500 kg». */
function decimalesDe(valor: number): number {
  const [, decimal = ''] = String(valor).split('.');
  return Math.min(decimal.length, 3);
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

function useEsPC(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const medio = window.matchMedia(CONSULTA_PC);
      medio.addEventListener('change', avisar);
      return () => {
        medio.removeEventListener('change', avisar);
      };
    },
    () => window.matchMedia(CONSULTA_PC).matches,
    () => true,
  );
}

/** Una existencia o un umbral: `<Cifra>` si hay dato, «—» si no. */
function Cantidad({
  valor,
  unidad,
  tamano = 'sm',
  className,
}: {
  readonly valor: number | null;
  readonly unidad: string | null;
  readonly tamano?: TamanoDeDinero;
  readonly className?: string;
}) {
  if (valor === null || !Number.isFinite(valor)) {
    return <span className="text-texto-tenue">—</span>;
  }
  const redondeado = Math.round(valor * 1000) / 1000;
  return (
    <Cifra
      valor={redondeado}
      decimales={decimalesDe(redondeado)}
      tamano={tamano}
      {...(unidad === null ? {} : { unidad })}
      {...(className === undefined ? {} : { className })}
    />
  );
}

/**
 * Cocina lo recibe en `null` y aquí se pinta «—»: el rol lo recorta el puente,
 * campo por campo, no la pantalla.
 */
function ValorDelIngrediente({ valor }: { readonly valor: number | null }) {
  if (valor === null) return <span className="text-texto-tenue">—</span>;
  return <Dinero centavos={aCentavos(valor)} tamano="sm" />;
}

function Semaforo({
  nivel,
  nombre,
  className = '',
}: {
  readonly nivel: Nivel;
  /** En la franja de lo urgente la insignia lleva además el ingrediente. */
  readonly nombre?: string;
  readonly className?: string;
}) {
  const { etiqueta, Icono, clase } = NIVELES[nivel];
  return (
    <Badge variant="outline" className={`gap-(--espacio-1) ${clase} ${className}`}>
      <Icono aria-hidden="true" />
      {nombre === undefined ? null : (
        <>
          <span className="font-semibold">{nombre}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      {etiqueta}
    </Badge>
  );
}

function NombreDelIngrediente({ fila }: { readonly fila: IngredienteDeInventario }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-semibold leading-tight">{fila.nombre}</span>
      {fila.categoria_nombre === null ? null : (
        <span className="text-xs font-normal text-texto-sutil">{fila.categoria_nombre}</span>
      )}
    </span>
  );
}

interface PasosProps {
  readonly fila: IngredienteDeInventario;
  readonly delta: number;
  readonly grande: boolean;
  readonly onPaso: (fila: IngredienteDeInventario, signo: number) => void;
}

/**
 * El `−` y el `+`. En tableta y teléfono son grandes —se tocan de pie, con una
 * mano—; en la PC se encogen al alto de un control, porque ahí manda la tabla.
 */
function Pasos({ fila, delta, grande, onPaso }: PasosProps) {
  const salto = pasoDe(fila.unidad_base);
  const boton = grande ? 'size-[calc(var(--altura-control)*1.3)]' : '';
  const icono = grande ? 'size-[calc(var(--altura-control)*0.55)]' : 'size-4';
  return (
    <span className="flex shrink-0 items-center gap-(--espacio-2)">
      <Button
        type="button"
        variant="outline"
        size={grande ? 'icon-lg' : 'icon'}
        className={boton}
        aria-label={`Quitar ${String(salto)} a ${fila.nombre}`}
        onClick={() => {
          onPaso(fila, -1);
        }}
      >
        <Minus aria-hidden="true" className={icono} />
      </Button>
      <span
        aria-live="polite"
        className={`min-w-16 text-center font-numeros tabular-nums ${grande ? 'text-lg' : 'text-base'} ${delta === 0 ? 'text-texto-tenue' : 'font-bold'}`}
      >
        {delta > 0 ? '+' : ''}
        {delta}
      </span>
      <Button
        type="button"
        variant="outline"
        size={grande ? 'icon-lg' : 'icon'}
        className={boton}
        aria-label={`Agregar ${String(salto)} a ${fila.nombre}`}
        onClick={() => {
          onPaso(fila, 1);
        }}
      >
        <Plus aria-hidden="true" className={icono} />
      </Button>
    </span>
  );
}

interface MotivoProps {
  readonly fila: IngredienteDeInventario;
  readonly ajuste: AjusteEnCurso;
  readonly grande: boolean;
  readonly guardando: boolean;
  readonly hayAlmacen: boolean;
  readonly error: string | null;
  readonly onMotivo: (texto: string) => void;
  readonly onGuardar: () => void;
  readonly onCancelar: () => void;
}

/**
 * Lo que aparece al primer paso, en el MISMO renglón: en qué queda la existencia,
 * el motivo y guardar. El número de después se ve antes de guardar; si baja de
 * cero, en rojo y con su signo.
 */
function Motivo(props: MotivoProps) {
  const { fila, ajuste, grande, guardando, hayAlmacen, error } = props;
  const despues = (fila.stock_actual ?? 0) + ajuste.delta;
  return (
    <span className="flex flex-col gap-(--espacio-2) border-t border-borde pt-(--espacio-2) text-base font-normal">
      <span className="flex items-baseline justify-between gap-(--espacio-2) text-sm">
        <span className="text-texto-sutil">Queda en</span>
        <Cantidad
          valor={despues}
          unidad={fila.unidad_base}
          tamano="base"
          className={despues < 0 ? 'font-semibold text-peligro' : 'font-semibold'}
        />
      </span>
      <Label htmlFor={`motivo-${fila.id}`} className="text-xs">
        Motivo del ajuste
      </Label>
      <Input
        id={`motivo-${fila.id}`}
        value={ajuste.motivo}
        placeholder="Merma, conteo físico, rotura…"
        onChange={(evento) => {
          props.onMotivo(evento.target.value);
        }}
      />
      {hayAlmacen ? null : (
        <Aviso tono="atencion" titulo="Falta el almacén.">
          Esta pantalla todavía no lo resuelve sola: el ajuste se cuenta, pero no se puede guardar.
        </Aviso>
      )}
      {error === null ? null : (
        <Aviso tono="peligro" titulo={error}>
          El ajuste no se guardó. Lo contado sigue aquí para volver a intentarlo.
        </Aviso>
      )}
      <span className="flex gap-(--espacio-2)">
        <Button
          type="button"
          size={grande ? 'lg' : 'default'}
          className={grande ? 'flex-1' : ''}
          disabled={guardando || !hayAlmacen}
          cargando={guardando}
          onClick={() => {
            props.onGuardar();
          }}
        >
          Guardar ajuste
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={grande ? 'lg' : 'default'}
          onClick={() => {
            props.onCancelar();
          }}
        >
          Cancelar
        </Button>
      </span>
    </span>
  );
}

/** Cómo pinta cada formato el ajuste de una fila; lo arma la pantalla, que tiene el estado. */
interface Pintores {
  readonly pasos: (fila: IngredienteDeInventario, grande: boolean) => ReactNode;
  readonly motivo: (fila: IngredienteDeInventario, grande: boolean) => ReactNode;
}

/** PC: la tabla densa. La existencia manda; mínimo y crítico, un escalón abajo. */
function columnasDePC(pintar: Pintores): readonly ColumnaDeTabla<IngredienteDeInventario>[] {
  return [
    {
      clave: 'ingrediente',
      titulo: 'Ingrediente',
      celda: (fila) => <NombreDelIngrediente fila={fila} />,
    },
    { clave: 'estado', titulo: 'Estado', celda: (fila) => <Semaforo nivel={nivelDe(fila)} /> },
    {
      clave: 'existencia',
      titulo: 'Existencia',
      numerica: true,
      celda: (fila) => (
        <Cantidad
          valor={fila.stock_actual}
          unidad={fila.unidad_base}
          tamano="base"
          className="font-semibold"
        />
      ),
    },
    // Mínimo y crítico son DATOS, no notas al margen: iban en `text-texto-sutil`, y sobre el
    // tinte de una fila en «bajo» o «crítico» el rastreador midió el «0» en 4.06:1 en
    // `noche`. La jerarquía ya la pone «Hay», en seminegritas.
    {
      clave: 'minimo',
      titulo: 'Mínimo',
      numerica: true,
      celda: (fila) => <Cantidad valor={fila.stock_minimo} unidad={fila.unidad_base} />,
    },
    {
      clave: 'critico',
      titulo: 'Crítico',
      numerica: true,
      celda: (fila) => <Cantidad valor={fila.stock_critico} unidad={fila.unidad_base} />,
    },
    {
      clave: 'valor',
      titulo: 'Valor',
      numerica: true,
      celda: (fila) => <ValorDelIngrediente valor={fila.valor_inventario} />,
    },
    {
      clave: 'ajustar',
      titulo: 'Ajustar',
      // Ancho fijo: al abrirse el motivo la columna no crece y la tabla no salta.
      celda: (fila) => (
        <span className="flex w-64 flex-col gap-(--espacio-2)">
          {pintar.pasos(fila, false)}
          {pintar.motivo(fila, false)}
        </span>
      ),
    },
  ];
}

/**
 * Tableta y teléfono: la cabeza de la tarjeta lleva lo que se lee caminando —el
 * nombre, el semáforo, cuánto hay— y el `+`/`−` grande; debajo, los umbrales y el
 * valor en pares.
 */
function columnasDeTarjeta(pintar: Pintores): readonly ColumnaDeTabla<IngredienteDeInventario>[] {
  return [
    {
      clave: 'ingrediente',
      titulo: 'Ingrediente',
      celda: (fila) => (
        <span className="flex flex-col gap-(--espacio-3)">
          <span className="flex items-start justify-between gap-(--espacio-2)">
            <NombreDelIngrediente fila={fila} />
            <Semaforo nivel={nivelDe(fila)} />
          </span>
          <span className="flex items-end justify-between gap-(--espacio-3)">
            <span className="flex flex-col">
              <span className="text-xs font-normal text-texto-sutil">Hay</span>
              <Cantidad
                valor={fila.stock_actual}
                unidad={fila.unidad_base}
                tamano="lg"
                className="font-bold"
              />
            </span>
            {pintar.pasos(fila, true)}
          </span>
          {pintar.motivo(fila, true)}
        </span>
      ),
    },
    {
      clave: 'minimo',
      titulo: 'Mínimo',
      numerica: true,
      celda: (fila) => <Cantidad valor={fila.stock_minimo} unidad={fila.unidad_base} />,
    },
    {
      clave: 'critico',
      titulo: 'Crítico',
      numerica: true,
      celda: (fila) => <Cantidad valor={fila.stock_critico} unidad={fila.unidad_base} />,
    },
    {
      clave: 'valor',
      titulo: 'Valor',
      numerica: true,
      celda: (fila) => <ValorDelIngrediente valor={fila.valor_inventario} />,
    },
  ];
}

/**
 * Lo urgente, arriba de todo y antes del buscador: son los renglones por los que
 * se abrió esta pantalla. Cada uno con su figura y su palabra, no sólo en rojo.
 */
function LoUrgente({ urgentes }: { readonly urgentes: readonly IngredienteDeInventario[] }) {
  return (
    <Superficie
      como="section"
      relleno={3}
      aria-label="Lo que hay que atender hoy"
      className="flex flex-col gap-(--espacio-2) border-peligro/40 bg-peligro/5"
    >
      <h2 className="flex items-center gap-(--espacio-2) text-sm font-bold uppercase">
        <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-peligro" />
        Hay que atender hoy
        <span className="font-normal text-texto-sutil">({urgentes.length})</span>
      </h2>
      <ul className="flex flex-wrap gap-(--espacio-2)">
        {urgentes.map((fila) => (
          <li key={fila.id}>
            <Semaforo nivel={nivelDe(fila)} nombre={fila.nombre} className="text-sm" />
          </li>
        ))}
      </ul>
    </Superficie>
  );
}

/** Tercero en la jerarquía: se busca cuando ya se sabe qué, no para enterarse. */
function Buscador({
  valor,
  alCambiar,
}: {
  readonly valor: string;
  readonly alCambiar: (valor: string) => void;
}) {
  return (
    <div className="relative sm:max-w-sm">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
      />
      <Input
        type="search"
        value={valor}
        aria-label="Buscar ingrediente"
        placeholder="Buscar ingrediente…"
        className="pl-(--espacio-10)"
        onChange={(evento) => {
          alCambiar(evento.target.value);
        }}
      />
    </div>
  );
}

export function Inventario({ filasIniciales, almacenId }: InventarioProps) {
  const esPC = useEsPC();
  const [filas, setFilas] = useState<readonly IngredienteDeInventario[] | null>(
    filasIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: «Volver a leer» lo sube y el efecto lee otra vez.
  // El estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
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
        if (!control.signal.aborted)
          setFalloDeCarga(fallo instanceof Error ? fallo.message : 'No se pudo leer la alacena.');
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  const ordenadas = useMemo(() => porUrgencia(filas ?? []), [filas]);
  const aguja = normalizar(busqueda.trim());
  const visibles =
    aguja === '' ? ordenadas : ordenadas.filter((f) => normalizar(f.nombre).includes(aguja));
  const urgentes = ordenadas.filter((f) => {
    const nivel = nivelDe(f);
    return nivel === 'agotado' || nivel === 'critico';
  });
  const hayAlmacen = almacenId !== undefined;

  const paso = (fila: IngredienteDeInventario, signo: number): void => {
    const salto = pasoDe(fila.unidad_base) * signo;
    // El aviso de un ajuste que falló es de ESE renglón: al pasar a otro, se va.
    if (ajuste?.id !== fila.id) setError(null);
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
    setError(null);
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

  if (falloDeCarga !== null) {
    return (
      <main className={PAGINA}>
        <h1 className="text-2xl font-bold">Inventario</h1>
        <ErrorDePantalla
          className="max-w-lg"
          titulo="No se pudo leer la alacena"
          queHacer="Sin la lista no se sabe qué falta ni se puede ajustar nada. Revisa la conexión y vuelve a leerla."
          detalle={falloDeCarga}
          reintentar={
            <Button
              type="button"
              onClick={() => {
                setFalloDeCarga(null);
                setIntento((previo) => previo + 1);
              }}
            >
              Volver a leer
            </Button>
          }
        />
      </main>
    );
  }

  if (filas === null) {
    return (
      <main className={PAGINA}>
        <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-3)">
          <h1 className="text-2xl font-bold">Inventario</h1>
          <Esqueleto className="h-4 w-48" />
        </header>
        {/* La forma de lo que viene —lo urgente, el buscador, la lista—, no una
            rueda: al llegar los datos nada salta de sitio. */}
        <Esqueleto className="h-20 w-full rounded-lg" />
        <Esqueleto className="h-(--altura-control) w-full sm:max-w-sm" />
        <EsqueletoDeLista filas={8} />
      </main>
    );
  }

  if (ordenadas.length === 0) {
    return (
      <main className={PAGINA}>
        <h1 className="text-2xl font-bold">Inventario</h1>
        {/* El vacío ENSEÑA: dice qué pasó y qué va a vivir aquí. */}
        <Vacio
          className="flex-1"
          icono={<PackageOpen />}
          titulo="La alacena está vacía."
          explicacion="Da de alta ingredientes para empezar a medir el consumo: aquí aparecen ordenados por lo que se acaba primero, lo agotado y lo crítico arriba de todo."
        />
      </main>
    );
  }

  const ajusteDe = (fila: IngredienteDeInventario): AjusteEnCurso | null =>
    ajuste !== null && ajuste.id === fila.id ? ajuste : null;

  const pintar: Pintores = {
    pasos: (fila, grande) => (
      <Pasos fila={fila} delta={ajusteDe(fila)?.delta ?? 0} grande={grande} onPaso={paso} />
    ),
    motivo: (fila, grande) => {
      const activo = ajusteDe(fila);
      if (activo === null || activo.delta === 0) return null;
      return (
        <Motivo
          fila={fila}
          ajuste={activo}
          grande={grande}
          guardando={guardando}
          hayAlmacen={hayAlmacen}
          error={error}
          onMotivo={escribirMotivo}
          onGuardar={guardar}
          onCancelar={cancelar}
        />
      );
    },
  };

  /* Otro vacío, y no un problema del negocio: un filtro que no encuentra. Por eso
     lleva otro icono, y la salida es borrar la búsqueda. */
  const sinResultados = (
    <Vacio
      icono={<SearchX />}
      titulo="Ningún ingrediente se llama así."
      explicacion="Busca por otra palabra o borra la búsqueda."
      className="py-(--espacio-8)"
      accion={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setBusqueda('');
          }}
        >
          Borrar la búsqueda
        </Button>
      }
    />
  );

  return (
    <main className={PAGINA}>
      <header className="flex flex-wrap items-baseline justify-between gap-(--espacio-3)">
        <h1 className="text-2xl font-bold">Inventario</h1>
        <p className="text-sm text-texto-sutil">
          <Cifra valor={ordenadas.length} tamano="sm" className="font-semibold text-texto" />{' '}
          {ordenadas.length === 1 ? 'ingrediente' : 'ingredientes'} ·{' '}
          <Cifra valor={urgentes.length} tamano="sm" className="font-semibold text-texto" /> por
          atender
        </p>
      </header>

      {urgentes.length > 0 && <LoUrgente urgentes={urgentes} />}

      <Buscador valor={busqueda} alCambiar={setBusqueda} />

      {esPC ? (
        <Tabla
          etiqueta="Ingredientes, del más urgente al suficiente"
          columnas={columnasDePC(pintar)}
          filas={visibles}
          claveDe={(fila) => fila.id}
          {...(ajuste === null ? {} : { activa: ajuste.id })}
          tonoDeFila={(fila) => TONO_DE_FILA[nivelDe(fila)]}
          alto="max-h-[70dvh]"
          vacio={sinResultados}
        />
      ) : (
        <ListaDeTarjetas
          columnas={columnasDeTarjeta(pintar)}
          filas={visibles}
          claveDe={(fila) => fila.id}
          principal="ingrediente"
          vacio={sinResultados}
          className="md:grid md:grid-cols-2"
        />
      )}
    </main>
  );
}
