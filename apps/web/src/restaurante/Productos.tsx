'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import {
  Aviso,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  ListaDeTarjetas,
  Superficie,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { Eye, EyeOff, ImageOff, Plus, Search, SearchX, UtensilsCrossed } from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · productos
 *
 * Pantalla de FONDO: se abre unas cuantas veces por semana y se toca con calma.
 * Aquí no se optimiza el segundo que se ahorra —eso es el mapa de mesas—: se
 * optimiza no equivocarse, porque un precio mal capturado se cobra mal durante
 * meses y nadie lo nota hasta el corte.
 *
 * ── Tarjetas con foto, no una tabla ──────────────────────────────────────
 * Quien mantiene el catálogo reconoce el platillo por la foto, y esa misma
 * imagen es la que verá el comensal en el menú QR. Una tabla de nombres esconde
 * justo el error que más duele —la foto que no corresponde— hasta publicarlo.
 * Por eso es `ListaDeTarjetas` y no `Tabla`: la foto va en la cabeza de cada
 * tarjeta, y la que falta se DICE («Sin foto»), no se deja en un gris mudo.
 *
 * ── La tarjeta es una ficha: etiqueta a la izquierda, dato a la derecha ──
 * Precio, costo, margen y si está en el POS, alineados: es como se revisa una
 * carta, comparando el precio con lo que cuesta. En el teléfono va un renglón cada
 * uno —el del POS lleva un botón, y a media tarjeta no cabe junto a su etiqueta—
 * y desde tableta de dos en dos (`columnasDeTarjeta="adaptable"`). El precio va
 * grande porque es lo que se cobra; el costo, en pequeño, porque sólo sirve para
 * leer el margen.
 *
 * ── El ÁREA DE PREPARACIÓN manda en la tarjeta ───────────────────────────
 * Es el campo que casi ningún sistema tiene y el que decide a qué pantalla de
 * cocina llega el platillo: un postre marcado «barra» no aparece nunca en la
 * comanda de cocina, y la mesa espera un plato que nadie está haciendo. Por eso
 * no es un dato del pie: es marca con palabra propia junto al nombre, y es el
 * filtro principal —con cuántos hay en cada área, que es la pregunta real—.
 *
 * ── El margen, con los mismos cortes que la receta ───────────────────────
 * Verde arriba de 60 %, ámbar de 40 a 60, rojo debajo de 40. Son los cortes que
 * el documento fijó en recetas; unos propios harían que el mismo platillo se
 * viera sano en una pantalla y enfermo en la otra. El porcentaje va SIEMPRE
 * escrito junto al color, porque el color solo no es un dato y el daltónico no
 * lo recibe. Sin receta no hay costo: se dice «sin receta», no un cero falso.
 *
 * ── Una lista de una columna, en todos los anchos ────────────────────────
 * La cabeza de la tarjeta va acostada —miniatura a la izquierda, nombre completo a
 * la derecha—, y la lista no pasa de un ancho en el que etiqueta y dato se leen
 * juntos. La rejilla de dos a cuatro columnas que pide `04-INTERFAZ` necesita que
 * `ListaDeTarjetas` reparta sus tarjetas en rejilla, y no lo hace: forzarla desde
 * aquí era meterle la mano a su marcado (`[&_dl]`, `[&>li>*]`), que se rompe sin
 * aviso en cuanto la pieza cambia. Queda pedida a la biblioteca.
 *
 * ── Fuera de alcance ─────────────────────────────────────────────────────
 * El alta y la edición son formulario propio, y la receta es otra pantalla:
 * aquí se ENCUENTRA un producto, se ve si gana dinero y se hace lo único que
 * urge en servicio —sacarlo del POS cuando se acabó—, por `/api/datos/escribir`,
 * el puente de catálogo que ya existe. Quedan fuera el filtro por categoría —se
 * lee en la tarjeta, no filtra— y el orden: llega por nombre desde el puente.
 */

/** Las cuatro áreas que acepta la base (migración 045), con su palabra. */
const AREAS = {
  cocina: 'Cocina',
  barra: 'Barra',
  ambos: 'Cocina y barra',
  ninguno: 'Sin comanda',
} as const;

type ClaveArea = keyof typeof AREAS;

/** `null` es «todas»: así el filtro es UNA lista y no dos bloques de botones. */
const FILTROS: readonly (ClaveArea | null)[] = [null, 'cocina', 'barra', 'ambos', 'ninguno'];

const MARGEN_SANO = 60;
const MARGEN_JUSTO = 40;
const HTTP_DEMASIADOS_INTENTOS = 429;
const TARJETAS_AL_CARGAR = 8;

/** El ancho de la lista: el de una ficha cuya etiqueta y dato se leen juntos. */
const ANCHO_DE_LA_LISTA = 'max-w-4xl';
/** La foto, en miniatura junto al nombre. Sin borde: no es una caja. */
const FOTO =
  'flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md bg-fondo-sutil bg-cover bg-center text-xs text-texto-sutil';

interface Semaforo {
  readonly texto: string;
  readonly clase: string;
}

/**
 * El margen con su palabra y su color, en ese orden de importancia. El texto va
 * en el renglón «Margen» de la ficha, así que no repite la palabra.
 */
export function semaforoDeMargen(margen: number | null): Semaforo {
  if (margen === null) return { texto: 'Sin receta', clase: 'bg-fondo-sutil' };
  const cifra = `${Math.round(margen)} %`;
  if (margen >= MARGEN_SANO) return { texto: `${cifra} · sano`, clase: 'bg-exito/25' };
  if (margen >= MARGEN_JUSTO) return { texto: `${cifra} · justo`, clase: 'bg-advertencia/30' };
  return { texto: `${cifra} · bajo`, clase: 'bg-peligro/25' };
}

/**
 * Los nombres de los campos son los del PUENTE, no unos propios: renombrarlos
 * costaría un mapeo entero para no ganar nada. `precio_venta` y
 * `costo_calculado_actual` llegan en PESOS —el puente ya dividió los centavos— y se
 * leen sólo por `centavosDe`; `margen_bruto_actual` llega en porcentaje, no en puntos base.
 */
export interface FilaDeProducto {
  readonly id: string;
  readonly nombre: string;
  readonly imagen_url: string | null;
  readonly categoria_nombre: string | null;
  readonly precio_venta: number | null;
  readonly costo_calculado_actual: number | null;
  readonly margen_bruto_actual: number | null;
  readonly area_preparacion: string | null;
  readonly visible_en_pos: boolean | null;
}

export interface ProductosProps {
  /** Cuando llegan, la pantalla no consulta: es lo que usan las pruebas. */
  readonly filasIniciales?: readonly FilaDeProducto[];
}

/**
 * ── EL NOMBRE DEL PLATILLO ERA UN BOTÓN QUE NO ABRÍA NADA ─────────────
 * Había un `onEditarProducto?: (productoId: string) => void` y el nombre de cada
 * platillo era un `<button>` con `hover:underline` que llamaba `onEditarProducto?.()`.
 * **Ninguna página pasaba ese callback**, así que los 27 platillos del catálogo eran
 * 27 botones que se subrayaban al pasar el ratón y no hacían nada. El rastreador los
 * contó uno por uno.
 *
 * Y no se arregla pasándolo: no hay a dónde ir. El editor completo del catálogo es
 * la pantalla HEREDADA —que no se toca, y que no admite un producto en la URL— y esta
 * pantalla ya edita lo que le toca en el sitio: el interruptor «Mostrar/Quitar del
 * POS» de cada tarjeta. Un control que no puede cumplir lo que promete se quita: el
 * nombre vuelve a ser lo que es, un nombre. Por lo mismo la tarjeta NO se activa al
 * tocarla (`ListaDeTarjetas` sin `alActivar`): no hay ficha que abrir.
 */

/** Un área desconocida cuenta como «sin comanda»: es el valor por omisión. */
export function claveArea(valor: string | null): ClaveArea {
  return valor !== null && valor in AREAS ? (valor as ClaveArea) : 'ninguno';
}

/** El precio, en centavos por la conversión del campo. Sin precio se pinta cero, como antes. */
function precioDe(producto: FilaDeProducto): number {
  return centavosDe('ProductoTerminado', 'precio_venta', producto.precio_venta) ?? 0;
}

/** El costo, en centavos. `null` es «sin calcular»: no hay receta, y cero mentiría. */
function costoDe(producto: FilaDeProducto): number | null {
  return centavosDe('ProductoTerminado', 'costo_calculado_actual', producto.costo_calculado_actual);
}

/** El catálogo vivo. El borrado es suave, así que lo inactivo no se pide. */
async function leerCatalogo(signal: AbortSignal): Promise<readonly FilaDeProducto[]> {
  return consultarPuente<FilaDeProducto>('ProductoTerminado', {
    filtro: { activo: true },
    orden: 'nombre',
    limite: 400,
    signal,
  });
}

/**
 * El fallo en palabras del negocio. El límite de intentos NO es un código de
 * error: es el 429, y viaja en `estado`.
 */
function mensajeDe(fallo: unknown, porOmision: string): string {
  if (!(fallo instanceof ErrorApi)) return porOmision;
  if (fallo.estado === HTTP_DEMASIADOS_INTENTOS) return 'Demasiados cambios seguidos. Espera.';
  if (fallo.error.codigo === 'NO_AUTENTICADO') return 'Tu sesión terminó. Vuelve a entrar.';
  if (fallo.error.codigo === 'SIN_PERMISO') return 'Tu usuario no puede cambiar el catálogo.';
  if (fallo.error.codigo === 'PAQUETE_NO_INCLUYE') return 'Tu paquete no incluye el catálogo.';
  return fallo.error.mensaje;
}

/** Cuántos hay en cada área: la cuenta que cuelga de cada filtro. */
function cuentaPorArea(filas: readonly FilaDeProducto[]): Readonly<Record<ClaveArea, number>> {
  const cuenta = { cocina: 0, barra: 0, ambos: 0, ninguno: 0 };
  for (const fila of filas) cuenta[claveArea(fila.area_preparacion)] += 1;
  return cuenta;
}

export function Productos({ filasIniciales }: ProductosProps) {
  const voc = useVocabulario();
  const [filas, setFilas] = useState<readonly FilaDeProducto[]>(filasIniciales ?? []);
  const [cargando, setCargando] = useState(filasIniciales === undefined);
  const [intento, setIntento] = useState(0);
  const [area, setArea] = useState<ClaveArea | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);

  useEffect(() => {
    if (filasIniciales !== undefined) return;
    // El centinela es la señal de aborto y no un `let vivo`: además de decir si
    // la pantalla sigue montada, CANCELA la consulta en vuelo.
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    leerCatalogo(control.signal)
      .then((catalogo) => {
        if (!sigueMontada()) return;
        setFilas(catalogo);
        setError(null);
        setCargando(false);
      })
      .catch((fallo: unknown) => {
        // La pantalla NUNCA se vacía por un error: lo ya leído se queda y el
        // aviso va encima. Un aborto no es un error: es esta pantalla, que ya
        // no está.
        if (!sigueMontada()) return;
        setError(mensajeDe(fallo, 'No se pudo leer el catálogo.'));
        setCargando(false);
      });
    return () => {
      control.abort();
    };
  }, [filasIniciales, intento]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es-MX');
    return filas.filter((p) => {
      const porNombre = texto === '' || p.nombre.toLocaleLowerCase('es-MX').includes(texto);
      return porNombre && (area === null || claveArea(p.area_preparacion) === area);
    });
  }, [filas, busqueda, area]);

  const porArea = useMemo(() => cuentaPorArea(filas), [filas]);

  /** Lo único que se cambia sin salir: se acabó el pescado, fuera del POS. */
  const alternarEnPos = async (producto: FilaDeProducto): Promise<void> => {
    const valor = !(producto.visible_en_pos ?? false);
    setGuardando(producto.id);
    try {
      const datos = { visible_en_pos: valor };
      const peticion = {
        entidad: 'ProductoTerminado',
        operacion: 'update',
        id: producto.id,
        datos,
      };
      await invocarComando<unknown>('/api/datos/escribir', peticion);
      // Se reemplaza la fila, no se muta: la lista anterior no cambia debajo.
      setFilas((antes) => antes.map((p) => (p.id === producto.id ? { ...p, ...datos } : p)));
      setError(null);
    } catch (fallo: unknown) {
      setError(mensajeDe(fallo, 'No se pudo cambiar la visibilidad.'));
    } finally {
      setGuardando(null);
    }
  };

  /** Vuelve a leer el catálogo. Con algo ya leído, se queda en pantalla mientras. */
  const reintentar = (): void => {
    setCargando(filas.length === 0);
    setIntento((n) => n + 1);
  };

  /**
   * EL SUSTANTIVO DEL GIRO, en las veces que esta pantalla lo dice.
   *
   * Decía «Productos» seis veces, y en un restaurante el catálogo es de
   * PLATILLOS: es la palabra que usa quien lo mantiene y la que la carta lleva
   * impresa. «Producto» no es neutro aquí, es de otro giro —de la tiendita y de
   * la cafetería—, y en la pantalla que más mira quien pone los precios se lee
   * como software prestado.
   *
   * El diccionario ya lo sabía decir y esta pantalla no le preguntaba: era una de
   * las dieciséis que no consumían F-017.
   */
  const nuevo = (
    <Button asChild>
      <a href="/productos">
        <Plus aria-hidden="true" />
        Nuevo {voc.singular('producto')}
      </a>
    </Button>
  );

  const titulo = <h1 className="text-2xl font-bold">{voc.titulo('producto', true)}</h1>;

  if (cargando) {
    // Esqueletos con la forma de las tarjetas —miniatura y nombre, ficha—, no una
    // rueda: la pantalla no salta al cargar y el ojo ya sabe dónde va a mirar.
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        {titulo}
        <div
          role="status"
          aria-busy="true"
          aria-label={`Cargando ${voc.plural('producto')}`}
          className={`flex flex-col gap-(--espacio-2) ${ANCHO_DE_LA_LISTA}`}
        >
          {Array.from({ length: TARJETAS_AL_CARGAR }, (_, i) => (
            <Superficie key={i} className="flex flex-col gap-(--espacio-3)">
              <div className="flex items-center gap-(--espacio-3)">
                <Esqueleto className="size-20 shrink-0" />
                <div className="flex flex-1 flex-col gap-(--espacio-2)">
                  <Esqueleto className="h-5 w-3/4" />
                  <Esqueleto className="h-4 w-1/2" />
                </div>
              </div>
              <Esqueleto className="h-(--altura-control) w-full" />
            </Superficie>
          ))}
        </div>
      </div>
    );
  }

  if (error !== null && filas.length === 0) {
    // No leyó nada: no hay catálogo que enseñar, y un vacío aquí mentiría
    // diciendo «todavía no hay» cuando lo que no hay es conexión.
    return (
      <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
        {titulo}
        <ErrorDePantalla
          className="max-w-lg"
          titulo={error}
          queHacer={`Sin el catálogo no se ve qué cobra cada ${voc.singular('producto')} ni a qué área de preparación llega. Aquí no se cambió nada: vuelve a intentarlo.`}
          reintentar={
            <Button type="button" onClick={reintentar}>
              Reintentar
            </Button>
          }
        />
      </div>
    );
  }

  const columnas: readonly ColumnaDeTabla<FilaDeProducto>[] = [
    {
      clave: 'producto',
      titulo: voc.titulo('producto'),
      celda: (producto) => {
        const foto = producto.imagen_url;
        const enPos = producto.visible_en_pos ?? false;
        return (
          <span className="flex items-center gap-(--espacio-3)">
            <span
              role="img"
              className={FOTO}
              aria-label={foto === null ? `${producto.nombre}, sin foto` : producto.nombre}
              style={foto === null ? undefined : { backgroundImage: `url("${foto}")` }}
            >
              {/* La foto que falta se dice: es la que el comensal no va a ver. */}
              {foto === null && (
                <>
                  <ImageOff aria-hidden="true" className="size-5" />
                  <span aria-hidden="true">Sin foto</span>
                </>
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-(--espacio-1)">
              {/* Completo, sin recortar: es lo que identifica la tarjeta, y dos variantes
                  largas de un mismo platillo cortadas en el mismo sitio se leen iguales. */}
              <span className="text-base font-semibold">{producto.nombre}</span>
              <span className="flex flex-wrap items-center gap-1">
                <Badge variant="secondary">{AREAS[claveArea(producto.area_preparacion)]}</Badge>
                {producto.categoria_nombre !== null && (
                  <Badge variant="outline">{producto.categoria_nombre}</Badge>
                )}
                {/* El estado se dice con palabras: el botón de abajo cambia
                    de texto, pero la marca la lee quien sólo mira. */}
                {!enPos && <Badge variant="destructive">Oculto en el POS</Badge>}
              </span>
            </span>
          </span>
        );
      },
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      celda: (producto) => <Dinero centavos={precioDe(producto)} tamano="lg" />,
    },
    {
      clave: 'costo',
      titulo: 'Costo',
      numerica: true,
      celda: (producto) => {
        const costo = costoDe(producto);
        return costo === null ? (
          <span className="text-texto-sutil">Sin calcular</span>
        ) : (
          <Dinero centavos={costo} tamano="sm" />
        );
      },
    },
    {
      clave: 'margen',
      titulo: 'Margen',
      celda: (producto) => {
        const margen = semaforoDeMargen(producto.margen_bruto_actual);
        return (
          <span
            className={`rounded-full px-(--espacio-2) py-0.5 text-xs font-medium tabular-nums ${margen.clase}`}
          >
            {margen.texto}
          </span>
        );
      },
    },
    {
      clave: 'pos',
      titulo: 'En el POS',
      celda: (producto) => {
        const enPos = producto.visible_en_pos ?? false;
        return (
          <Button
            type="button"
            size="sm"
            variant={enPos ? 'outline' : 'secondary'}
            cargando={guardando === producto.id}
            onClick={() => {
              void alternarEnPos(producto);
            }}
          >
            {enPos ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            {enPos ? 'Quitar del POS' : 'Mostrar en el POS'}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-(--espacio-4) p-(--espacio-4)">
      <header className="flex flex-wrap items-end justify-between gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          {titulo}
          {/* La leyenda enseña el semáforo una vez, para que el margen de cada
              tarjeta se lea sin adivinar qué significa el color. */}
          <p className="text-xs text-texto-sutil">
            {visibles.length} de {filas.length} · margen sano 60 % o más · justo 40 a 60 · bajo
            menos de 40
          </p>
        </div>
        {nuevo}
      </header>

      <div className="flex flex-col gap-(--espacio-2) md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            type="search"
            value={busqueda}
            aria-label={`Buscar ${voc.enFraseCon('un', 'producto')} por nombre`}
            placeholder={`Buscar ${voc.enFraseCon('un', 'producto')}…`}
            className="pl-(--espacio-8)"
            onChange={(evento: ChangeEvent<HTMLInputElement>) => {
              setBusqueda(evento.target.value);
            }}
          />
        </div>
        {/* «Enséñame todo lo que sale de la barra» es la pregunta real de quien
            revisa el catálogo: el área es el filtro de primera fila, y cada
            botón dice cuántos hay antes de tocarlo. */}
        <nav aria-label="Filtrar por área de preparación" className="flex flex-wrap gap-1">
          {FILTROS.map((clave) => (
            <Button
              key={clave ?? 'todas'}
              type="button"
              size="sm"
              aria-pressed={area === clave}
              variant={area === clave ? 'default' : 'outline'}
              onClick={() => {
                setArea(clave);
              }}
            >
              {clave === null ? 'Todas' : AREAS[clave]}
              <span className="font-numeros font-normal tabular-nums">
                {clave === null ? filas.length : porArea[clave]}
              </span>
            </Button>
          ))}
        </nav>
      </div>

      {error !== null && (
        <Aviso
          tono="peligro"
          titulo={error}
          accion={
            <Button type="button" size="sm" variant="outline" onClick={reintentar}>
              Reintentar
            </Button>
          }
        >
          El POS sigue como estaba.
        </Aviso>
      )}

      {filas.length === 0 ? (
        // El vacío ENSEÑA la consecuencia, no se disculpa.
        <Superficie nivel={0} relleno={0} className="border-dashed">
          <Vacio
            icono={<UtensilsCrossed />}
            titulo={`Todavía no hay ${voc.plural('producto')}.`}
            explicacion={`Sin catálogo no hay nada que cobrar ni nada que llegue a ${voc.enFrase('preparacion')}: cada ${voc.singular('producto')} lleva su precio, su área de preparación y, cuando tiene receta, su costo y su margen.`}
            accion={nuevo}
          />
        </Superficie>
      ) : (
        <ListaDeTarjetas
          columnas={columnas}
          filas={visibles}
          claveDe={(producto) => producto.id}
          principal="producto"
          columnasDeTarjeta="adaptable"
          className={ANCHO_DE_LA_LISTA}
          vacio={
            <Vacio
              icono={<SearchX />}
              titulo={`${voc.conDeterminante('ningun', 'producto')} coincide con la búsqueda ni con el área elegida.`}
              explicacion="Borra la búsqueda o elige «Todas» para volver a ver el catálogo completo."
            />
          }
        />
      )}
    </div>
  );
}
