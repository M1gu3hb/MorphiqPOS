'use client';

import { Badge } from '@morphiqpos/ui/primitivas/badge';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { Vacio } from '@morphiqpos/ui/sistema';
import { UtensilsCrossed } from 'lucide-react';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
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
 *
 * ── El ÁREA DE PREPARACIÓN manda en la tarjeta ───────────────────────────
 * Es el campo que casi ningún sistema tiene y el que decide a qué pantalla de
 * cocina llega el platillo: un postre marcado «barra» no aparece nunca en la
 * comanda de cocina, y la mesa espera un plato que nadie está haciendo. Por eso
 * no es un dato del pie: es marca con palabra propia y es el filtro principal.
 *
 * ── El margen, con los mismos cortes que la receta ───────────────────────
 * Verde arriba de 60 %, ámbar de 40 a 60, rojo debajo de 40. Son los cortes que
 * el documento fijó en recetas; unos propios harían que el mismo platillo se
 * viera sano en una pantalla y enfermo en la otra. El porcentaje va SIEMPRE
 * escrito junto al color, porque el color solo no es un dato y el daltónico no
 * lo recibe. Sin receta no hay costo: se dice «sin receta», no un cero falso.
 *
 * ── Teléfono: una columna ────────────────────────────────────────────────
 * La tarjeta se acuesta —miniatura a la izquierda, datos a la derecha— y sólo
 * desde tablet hay de dos a cuatro columnas. Un marcado que se reacomoda, no
 * dos: dos serían dos sitios donde equivocarse.
 *
 * ── Fuera de alcance, para caber en 300 líneas ───────────────────────────
 * El alta y la edición son formulario propio, y la receta es otra pantalla:
 * aquí se ENCUENTRA un producto, se ve si gana dinero y se hace lo único que
 * urge en servicio —sacarlo del POS cuando se acabó—, por `/api/datos/escribir`,
 * el puente de catálogo que ya existe. Quedan fuera el filtro por categoría —se
 * lee en la tarjeta, no filtra— y el orden: llega por nombre desde el puente.
 */

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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

// Las clases largas viven arriba para que cada elemento quepa en una línea.
const BANDA =
  'mb-(--espacio-3) rounded-md border border-destructive bg-destructive/15 p-(--espacio-3) text-sm';
const REJILLA = 'grid grid-cols-1 gap-(--espacio-3) md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
const TARJETA =
  'flex h-full gap-(--espacio-3) rounded-lg border border-border bg-card p-(--espacio-3) text-card-foreground shadow-1 md:flex-col';
const FOTO =
  'h-20 w-20 shrink-0 rounded-md border border-border bg-muted bg-cover bg-center md:h-32 md:w-full';
const DATOS = 'flex min-w-0 flex-1 flex-col gap-1';
const CHIP = 'w-fit rounded-full px-2 py-0.5 text-xs';
const VACIO =
  'flex flex-col items-center gap-(--espacio-4) rounded-lg border border-border p-(--espacio-8) text-center';

interface Semaforo {
  readonly texto: string;
  readonly clase: string;
}

/** El margen con su palabra y su color, en ese orden de importancia. */
export function semaforoDeMargen(margen: number | null): Semaforo {
  if (margen === null) return { texto: 'Sin receta · sin costo', clase: 'bg-muted' };
  const cifra = `${Math.round(margen)} %`;
  if (margen >= MARGEN_SANO) return { texto: `Margen ${cifra} · sano`, clase: 'bg-success/25' };
  if (margen >= MARGEN_JUSTO) return { texto: `Margen ${cifra} · justo`, clase: 'bg-warning/30' };
  return { texto: `Margen ${cifra} · bajo`, clase: 'bg-destructive/25' };
}

/**
 * Los nombres de los campos son los del PUENTE, no unos propios: renombrarlos
 * costaría un mapeo entero para no ganar nada. `precio_venta` y
 * `costo_calculado_actual` llegan en PESOS —el puente ya dividió los centavos— y
 * `margen_bruto_actual` llega en porcentaje, no en puntos base.
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
 * nombre vuelve a ser lo que es, un nombre.
 */

/** Un área desconocida cuenta como «sin comanda»: es el valor por omisión. */
export function claveArea(valor: string | null): ClaveArea {
  return valor !== null && valor in AREAS ? (valor as ClaveArea) : 'ninguno';
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

  /**
   * EL SUSTANTIVO DEL GIRO, en las seis veces que esta pantalla lo dice.
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
      <a href="/productos">Nuevo {voc.singular('producto')}</a>
    </Button>
  );

  if (cargando) {
    // Esqueletos con la forma de las tarjetas, no un spinner: la pantalla no
    // salta al cargar y el ojo ya sabe dónde va a mirar.
    return (
      <div className="p-(--espacio-4)">
        <h1 className="mb-(--espacio-4) text-2xl font-bold">{voc.titulo('producto', true)}</h1>
        <div className={REJILLA}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-(--espacio-4)">
      <header className="mb-(--espacio-4) flex flex-wrap items-center justify-between gap-(--espacio-3)">
        <div>
          <h1 className="text-2xl font-bold">{voc.titulo('producto', true)}</h1>
          {/* La leyenda enseña el semáforo una vez, para que el chip de cada
              tarjeta se lea sin adivinar qué significa el color. */}
          <p className="text-xs text-muted-foreground">
            {visibles.length} de {filas.length} · margen sano 60 % o más · justo 40 a 60 · bajo
            menos de 40
          </p>
        </div>
        {nuevo}
      </header>

      <div className="mb-(--espacio-4) flex flex-col gap-2 md:flex-row md:items-center">
        <Input
          type="search"
          value={busqueda}
          aria-label={`Buscar ${voc.enFraseCon('un', 'producto')} por nombre`}
          placeholder={`Buscar ${voc.enFraseCon('un', 'producto')}…`}
          className="md:max-w-xs"
          onChange={(evento: ChangeEvent<HTMLInputElement>) => {
            setBusqueda(evento.target.value);
          }}
        />
        {/* «Enséñame todo lo que sale de la barra» es la pregunta real de quien
            revisa el catálogo: el área es el filtro de primera fila. */}
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
            </Button>
          ))}
        </nav>
      </div>

      {error !== null && (
        <p role="alert" className={BANDA}>
          {error}{' '}
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              setCargando(filas.length === 0);
              setIntento((n) => n + 1);
            }}
          >
            Reintentar
          </Button>
        </p>
      )}

      {filas.length === 0 && error === null ? (
        // El vacío ENSEÑA la consecuencia, no se disculpa.
        <div className={VACIO}>
          <Vacio
            className="py-0"
            icono={<UtensilsCrossed />}
            titulo={`Todavía no hay ${voc.plural('producto')}.`}
            explicacion={`Sin catálogo no hay nada que cobrar ni nada que llegue a ${voc.enFrase('preparacion')}: cada ${voc.singular('producto')} lleva su precio, su área de preparación y, cuando tiene receta, su costo y su margen.`}
            accion={nuevo}
          />
        </div>
      ) : (
        <ul className={REJILLA}>
          {visibles.map((producto) => {
            const margen = semaforoDeMargen(producto.margen_bruto_actual);
            const enPos = producto.visible_en_pos ?? false;
            const foto = producto.imagen_url;
            const costo = producto.costo_calculado_actual;
            return (
              <li key={producto.id} className={TARJETA}>
                <div
                  role="img"
                  className={FOTO}
                  aria-label={foto === null ? `${producto.nombre}, sin foto` : producto.nombre}
                  style={foto === null ? undefined : { backgroundImage: `url("${foto}")` }}
                />
                <div className={DATOS}>
                  <p className="text-left text-base font-semibold">{producto.nombre}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary">{AREAS[claveArea(producto.area_preparacion)]}</Badge>
                    {producto.categoria_nombre !== null && (
                      <Badge variant="outline">{producto.categoria_nombre}</Badge>
                    )}
                    {/* El estado se dice con palabras: el botón de abajo cambia
                        de texto, pero la marca la lee quien sólo mira. */}
                    {!enPos && <Badge variant="destructive">Oculto en el POS</Badge>}
                  </div>
                  <p className="text-xl font-bold tabular-nums md:text-2xl">
                    {PESOS.format(producto.precio_venta ?? 0)}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {costo === null ? 'Costo sin calcular' : `Costo ${PESOS.format(costo)}`}
                  </p>
                  <span className={`${CHIP} ${margen.clase}`}>{margen.texto}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={enPos ? 'outline' : 'secondary'}
                    disabled={guardando === producto.id}
                    className="mt-auto w-full"
                    onClick={() => {
                      void alternarEnPos(producto);
                    }}
                  >
                    {enPos ? 'Quitar del POS' : 'Mostrar en el POS'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {filas.length > 0 && visibles.length === 0 && (
        <p className="mt-(--espacio-4) text-center text-muted-foreground">
          {voc.conDeterminante('ningun', 'producto')} coincide con la búsqueda ni con el área
          elegida.
        </p>
      )}
    </div>
  );
}
