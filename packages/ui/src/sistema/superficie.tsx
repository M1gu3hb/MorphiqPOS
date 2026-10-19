import type { AllHTMLAttributes, ElementType, ReactElement, ReactNode, Ref } from 'react';

import { cn } from '../utilidades/cn';

/**
 * SUPERFICIES · profundidad con una sola lógica de luz.
 *
 * ── Por qué una escala y no sombras sueltas ───────────────────────────────
 * Lo que hace que una interfaz se vea *hecha* y no *armada* es que todas sus
 * sombras obedezcan a la MISMA fuente de luz. Si una tarjeta proyecta hacia abajo y
 * un diálogo hacia arriba, el ojo lo nota aunque nadie sepa decir qué está mal: son
 * dos soles en la misma habitación.
 *
 * Aquí hay una sola luz —arriba y ligeramente al frente— y cinco niveles. Al subir
 * de nivel la sombra **crece y se difumina a la vez**, que es lo que hace una sombra
 * real cuando el objeto se separa de la pared. Una sombra que sólo crece sin
 * difuminarse se lee como un objeto plano flotando, no como un objeto con volumen.
 *
 * Los valores no están aquí: están en `--sombra-0..4`, que dependen de la perilla
 * `data-elevacion`. Por eso un estilo puede cambiar el sistema entero de profundidad
 * —de sombras suaves a doble bisel, a línea dura, o a nada— sin tocar un componente.
 *
 * ── Los siete usos, que no son siete componentes ──────────────────────────
 * Tarjeta, panel, hoja lateral, diálogo, menú flotante, barra fija e isla flotante
 * son la misma superficie a distinta altura y con distinto anclaje. Se distinguen
 * por `nivel` y por dónde se montan, no por una implementación cada uno.
 */

/** A qué altura está la superficie respecto del fondo de la página. */
export type NivelDeElevacion = 0 | 1 | 2 | 3 | 4;

const ELEVACION: Readonly<Record<NivelDeElevacion, string>> = {
  // 0 · pegada al fondo. Para bloques que agrupan sin separarse: una sección.
  0: 'shadow-0',
  // 1 · una tarjeta en reposo. Es el nivel por omisión y el más frecuente.
  1: 'shadow-1',
  // 2 · una tarjeta levantada: la que tiene el ratón encima, la fila activa.
  2: 'shadow-2',
  // 3 · lo que flota sobre la página: menú, popover, tooltip, isla.
  3: 'shadow-3',
  // 4 · lo que se pone DELANTE de todo y bloquea: diálogo y hoja lateral.
  4: 'shadow-4',
};

/**
 * Lo demás que una superficie tiene que poder llevar.
 *
 * Una superficie es un CONTENEDOR: la pantalla que la usa necesita ponerle su
 * `aria-label` —una `<section>` sin nombre no aparece en el índice de un lector de
 * pantalla—, su `role`, su `id` o un `data-*` para una prueba. Sin esto había que
 * envolverla en un `div` sólo para colgarle un atributo, y ese `div` de más es
 * exactamente lo que convierte un sistema en un andamio.
 *
 * Se excluye `className` porque ya es una prop propia —con `cn`, que resuelve los
 * conflictos de Tailwind— y dejarla pasar dos veces haría que una ganara por orden.
 *
 * Y TODOS los atributos de HTML, no sólo los comunes: una superficie también es la
 * tesela que se toca (`como="button"`, con su `type` y su `disabled`), la opción
 * de un grupo (`como="label"`, con su `htmlFor`) o el formulario entero
 * (`como="form"`, con su `onSubmit`). Con sólo los comunes, esas pantallas
 * volvían a escribir la superficie a mano para poder poner un `type`.
 */
type AtributosDeSuperficie = Omit<
  AllHTMLAttributes<HTMLElement>,
  'className' | 'children' | 'color' | 'size' | 'wrap' | 'as'
>;

export interface SuperficieProps extends AtributosDeSuperficie {
  readonly children: ReactNode;
  readonly nivel?: NivelDeElevacion;
  /** El borde: en los estilos planos es lo único que separa una superficie de otra. */
  readonly conBorde?: boolean;
  /** El radio: `lg` para tarjetas y diálogos, `md` para piezas pequeñas. */
  readonly radio?: 'sm' | 'md' | 'lg' | 'completo';
  /** El relleno, de la escala de espacio. `0` para tablas y listas a sangre. */
  readonly relleno?: 0 | 3 | 4 | 6;
  /** Qué etiqueta se pinta. `section`, `article`, `aside`… no todo es un `div`. */
  readonly como?: ElementType;
  readonly className?: string;
  /** Para medirla o llevarle el foco. En React 19 `ref` es una prop más. */
  readonly ref?: Ref<HTMLElement>;
  /**
   * INTERACTIVA: la tesela que se toca —un producto en la rejilla del cobro, una mesa,
   * una opción de un grupo—. Sube un nivel al pasar encima, se hunde al pulsarla
   * —`scale(0.98)`: la interfaz oyó—, y el foco se ve en dos capas. Cada pantalla lo
   * escribía a su manera y cada una respondía distinto al mismo dedo.
   */
  readonly interactiva?: boolean;
  /**
   * La elegida de un grupo: el anillo del primario, y la pantalla le pone además su
   * `aria-pressed` o su `aria-current`. El anillo no es lo único que la marca: la
   * pantalla dice con texto o con icono por qué está elegida.
   */
  readonly activa?: boolean;
}

const RADIOS = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  completo: 'rounded-full',
} as const;

const RELLENOS = {
  0: '',
  3: 'p-(--espacio-3)',
  4: 'p-(--espacio-4)',
  6: 'p-(--espacio-6)',
} as const;

export function Superficie({
  children,
  nivel = 1,
  conBorde = true,
  radio = 'lg',
  relleno = 4,
  como: Como = 'div',
  interactiva = false,
  activa = false,
  className,
  ...resto
}: SuperficieProps): ReactElement {
  return (
    <Como
      data-nivel={nivel}
      data-activa={activa ? '' : undefined}
      className={cn(
        'bg-superficie text-texto',
        RADIOS[radio],
        RELLENOS[relleno],
        ELEVACION[nivel],
        conBorde ? 'border border-borde' : '',
        interactiva
          ? 'cursor-pointer text-left transition-[box-shadow,transform] duration-(--duracion-rapida) ease-(--curva-entrada) outline-none hover:shadow-2 focus-visible:ring-[3px] focus-visible:ring-anillo/60 focus-visible:ring-offset-2 focus-visible:ring-offset-fondo active:scale-[0.98] active:shadow-0 disabled:cursor-not-allowed disabled:opacity-50'
          : '',
        activa ? 'border-primario ring-2 ring-primario' : '',
        className,
      )}
      {...resto}
    >
      {children}
    </Como>
  );
}

/**
 * ISLA FLOTANTE · lo que se queda a mano mientras el contenido se va.
 *
 * Es el patrón del carrito en una tableta y del total en un teléfono: una superficie
 * de nivel 3 anclada a un borde, por encima del contenido y por debajo de los
 * diálogos. Lleva su propio respiro contra el área segura del teléfono, porque una
 * isla pegada al borde inferior queda debajo de la barra de gestos.
 *
 * ── Y POR ENCIMA DEL ABANICO, que es lo que faltaba ───────────────────────
 * `AbanicoInferior` también vive en `bottom-0` y también en `z-40`. Los dos son
 * patrones DE TELÉFONO, así que la pantalla que los pide a la vez es justo la que
 * importa: el carrito de un pedido en la mesa, con su navegación debajo. Puestos los
 * dos, la isla caía ENCIMA de la barra y tapaba sus destinos — y dos botones
 * superpuestos son un botón muerto y un toque equivocado.
 *
 * Lo mide el abanico y lo publica en `--alto-abanico`; aquí sólo se suma. No se
 * calcula la altura aquí porque depende de la densidad, del área segura y de si algún
 * destino lleva insignia: medirla es lo único que no miente.
 */
export function Isla({
  children,
  posicion = 'abajo',
  className,
}: {
  readonly children: ReactNode;
  readonly posicion?: 'abajo' | 'arriba';
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 z-40 flex justify-center px-(--espacio-4)',
        posicion === 'abajo'
          ? 'bottom-0 pb-[calc(var(--alto-abanico,0px)+max(var(--espacio-4),env(safe-area-inset-bottom)))]'
          : 'top-0 pt-[max(var(--espacio-4),env(safe-area-inset-top))]',
        className,
      )}
    >
      <Superficie nivel={3} radio="completo" relleno={3} className="pointer-events-auto">
        {children}
      </Superficie>
    </div>
  );
}

/**
 * BARRA FIJA · la cabecera de una pantalla, que no se va al hacer scroll.
 *
 * `sticky` y no `fixed`: una barra fija de verdad se sale de su contenedor y obliga
 * a compensar con relleno en cada pantalla que la use; una pegajosa se queda dentro
 * del flujo y no hay nada que compensar. La sombra sólo aparece cuando hay algo
 * debajo —`data-pegada`—, porque una barra que proyecta sombra sobre nada se lee
 * como un objeto flotando sin razón.
 */
export function BarraFija({
  children,
  pegada = false,
  className,
}: {
  readonly children: ReactNode;
  readonly pegada?: boolean;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-pegada={pegada ? '' : undefined}
      className={cn(
        'sticky top-0 z-30 bg-fondo/95 backdrop-blur-sm transition-shadow duration-(--duracion-normal)',
        pegada ? 'shadow-2' : 'shadow-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
