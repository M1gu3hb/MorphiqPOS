'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Aviso,
  CampoDeDinero,
  Cifra,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  IndicadorDeGuardado,
  Superficie,
  Tabla,
  VIAJE,
  Vacio,
  conTransicion,
  type ColumnaDeTabla,
  type EstadoDeGuardado,
} from '@morphiqpos/ui/sistema';
import { CalendarPlus, Eye, Plus, Scissors } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, consultarPuente, invocarComando } from '~/cliente/api';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · estetica-salon · catalogo-de-servicios
 *
 * Los servicios con su DURACIÓN COMO SECUENCIA, que es lo que hace que la
 * agenda de este modelo valga algo.
 *
 * ── Por qué la duración son cuatro campos y no uno ──────────────────────
 * Un tinte no dura 110 minutos: dura 40 de aplicación, 45 de PROCESADO —en los
 * que la clienta está sentada y la estilista libre—, 15 de terminado y 10 de
 * limpieza. Con un solo número, esos 45 minutos desaparecen de la agenda y con
 * ellos el 25 %–40 % de capacidad que nadie más aprovecha.
 *
 * ── Por qué el procesado se marca como intercalable ─────────────────────
 * Porque no siempre lo es. Un tratamiento que exige vigilancia constante ocupa
 * igual aunque el reloj corra. Suponerlo siempre libre haría que la agenda
 * prometiera huecos que no existen, y eso se paga con una clienta esperando.
 *
 * ── Por qué el cierre ocupa la ESTACIÓN y no a la persona ───────────────
 * Limpiar el lavabo lo hace quien esté libre; lo que no se puede es sentar a la
 * siguiente clienta en un lavabo sucio. Contarlo como tiempo del profesional le
 * quita diez minutos por servicio: seis servicios al día son una hora perdida.
 *
 * ── Y por qué el precio puede ser POR PERSONA ───────────────────────────
 * Karla cobra el tinte más caro que Dany y lo hace en menos tiempo. Un precio
 * único por servicio obliga a elegir entre cobrar de menos a una o de más por
 * la otra.
 *
 * ── Dónde se usa, y por qué eso decide la forma (04-INTERFAZ §4.3.10) ───
 * Una vez al mes, la dueña, en la PC: es la pantalla más de PC del modelo y está
 * bien que lo sea. Por eso en la PC la lista y el formulario van lado a lado, y el
 * formulario mismo en dos columnas —qué se vende a la izquierda, cuánto dura a la
 * derecha—, con GUARDAR, la acción principal, pegado abajo del panel. En la tableta
 * todo va en una columna, y en el teléfono la tabla se queda con nombre y precio.
 *
 * La lista es una TABLA y no una lista de botones: aquí se compara —cuánto ocupa la
 * estación, cuánto la estilista, cuánto cuesta— y comparar es leer una columna.
 * Tocar una fila la abre en el panel, y la fila VIAJA hasta él (`VIAJE.fila`): con
 * la lista y el panel lado a lado, el movimiento dice cuál es la que se está
 * editando sin tener que buscarla.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el catálogo, la secuencia de duración y el precio base. Queda fuera la
 * asignación por profesional con su factor, que vive en la ficha de cada una.
 */

const RUTA_CREAR = '/api/catalogo/productos/crear';
const RUTA_ACTUALIZAR = '/api/catalogo/productos/actualizar';

/** Los cuatro tramos, con el nombre que se usa en el salón. */
const TRAMOS = [
  { clave: 'activa1', etiqueta: 'Aplicación', ayuda: 'la estilista está ocupada' },
  { clave: 'pasiva', etiqueta: 'Procesado', ayuda: 'la clienta espera, la estilista no' },
  { clave: 'activa2', etiqueta: 'Terminado', ayuda: 'enjuagar y secar' },
  { clave: 'cierre', etiqueta: 'Limpieza', ayuda: 'ocupa la estación, no a la persona' },
] as const;

type Tramo = (typeof TRAMOS)[number]['clave'];

export interface ServicioDelCatalogo {
  readonly id: string;
  readonly nombre: string;
  /**
   * EN PESOS, como lo sirve el puente.
   *
   * Aquí decía `precio_venta_centavos`, que la entidad NO sirve: lo expone como
   * `precio_venta`, ya convertido por `dinero`. Llegaba `undefined` y la pantalla
   * enseñaba `$NaN`.
   */
  readonly precio_venta: number | null;
  readonly duracion_activa_1_min: number;
  readonly duracion_pasiva_min: number;
  readonly duracion_activa_2_min: number;
  readonly duracion_cierre_min: number;
  readonly pasivo_intercalable: boolean;
}

export interface CatalogoDeServiciosProps {
  readonly serviciosIniciales?: readonly ServicioDelCatalogo[];
}

/**
 * Los pesos del puente a centavos, CONTANDO DÍGITOS: `58.995 * 100` pierde medio
 * centavo. Sin precio es cero, que es lo que el formulario enseñaba al abrirlo.
 */
function aCentavos(pesos: number | null | undefined): number {
  if (pesos === null || pesos === undefined || !Number.isFinite(pesos)) return 0;
  const [entero = '0', decimal = '00'] = Math.abs(pesos).toFixed(2).split('.');
  return (pesos < 0 ? -1 : 1) * (Number(entero) * 100 + Number(decimal));
}

/** Lo que ocupa a la PERSONA. No es la duración total, y ahí está el negocio. */
export function minutosDeProfesional(servicio: ServicioDelCatalogo): number {
  return servicio.duracion_activa_1_min + servicio.duracion_activa_2_min;
}

/** Lo que ocupa la ESTACIÓN, de principio a fin. */
export function minutosDeEstacion(servicio: ServicioDelCatalogo): number {
  return (
    servicio.duracion_activa_1_min +
    servicio.duracion_pasiva_min +
    servicio.duracion_activa_2_min +
    servicio.duracion_cierre_min
  );
}

/** Los minutos que se pueden vender a OTRA clienta mientras ésta procesa. */
export function minutosIntercalables(servicio: ServicioDelCatalogo): number {
  return servicio.pasivo_intercalable ? servicio.duracion_pasiva_min : 0;
}

function mensajeDe(fallo: unknown): string {
  if (fallo instanceof ErrorApi) return fallo.message;
  return 'No se pudo guardar.';
}

/**
 * Quién lleva el nombre de viaje, y cuándo. Antes del cambio lo lleva la FILA;
 * dentro del cambio, el PANEL. Nunca los dos a la vez: con dos elementos del mismo
 * nombre montados, el navegador no sabe cuál es cuál y no anima ninguno.
 */
interface Viaje {
  readonly id: string;
  readonly en: 'fila' | 'panel';
}

export function CatalogoDeServicios({ serviciosIniciales }: CatalogoDeServiciosProps) {
  const voc = useVocabulario();
  const [servicios, setServicios] = useState<readonly ServicioDelCatalogo[] | null>(
    serviciosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState<ServicioDelCatalogo | null>(null);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState<number | null>(null);
  const [minutos, setMinutos] = useState<Record<Tramo, string>>({
    activa1: '',
    pasiva: '',
    activa2: '',
    cierre: '',
  });
  const [intercalable, setIntercalable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState<EstadoDeGuardado>('quieto');
  const [viaje, setViaje] = useState<Viaje | null>(null);
  /**
   * El formulario que se está llenando. Sube al abrir un servicio o empezar uno
   * nuevo, y es la `key` del campo de dinero: su texto se rehace desde los centavos
   * y no se queda con lo que se tecleó para el servicio anterior.
   */
  const [formulario, setFormulario] = useState(0);
  const nombreRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (serviciosIniciales !== undefined) return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;
    const cargar = (): void => {
      consultarPuente<ServicioDelCatalogo>('ProductoTerminado', {
        // `tipo_venta`, que es la columna. Aquí decía `tipo`, que no es campo de
        // `ProductoTerminado`: el puente contestaba 400 y el `.catch` de abajo lo
        // volvía una lista vacía, así que el catálogo de servicios de un salón —lo
        // único que esta pantalla enseña— salía en blanco con los servicios
        // sembrados. `estetica-salon/Agendar` ya filtraba por el nombre correcto.
        filtro: { tipo_venta: 'servicio' },
        limite: 200,
        signal: control.signal,
      })
        .then((filas) => {
          if (sigueMontada()) setServicios(filas);
        })
        .catch((fallo: unknown) => {
          // Un fallo de lectura ya NO se disfraza de catálogo vacío: «todavía no hay
          // servicios» con los servicios sembrados es justo el defecto de arriba.
          if (sigueMontada())
            setFalloDeCarga(
              fallo instanceof Error ? fallo.message : 'No se pudo leer el catálogo.',
            );
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [serviciosIniciales, intento]);

  function reintentar(): void {
    setFalloDeCarga(null);
    setServicios(null);
    setIntento((previo) => previo + 1);
  }

  function llenarCon(servicio: ServicioDelCatalogo): void {
    setElegido(servicio);
    setNombre(servicio.nombre);
    setPrecio(aCentavos(servicio.precio_venta));
    setMinutos({
      activa1: String(servicio.duracion_activa_1_min),
      pasiva: String(servicio.duracion_pasiva_min),
      activa2: String(servicio.duracion_activa_2_min),
      cierre: String(servicio.duracion_cierre_min),
    });
    setIntercalable(servicio.pasivo_intercalable);
    setError(null);
    setGuardado('quieto');
    setFormulario((previo) => previo + 1);
  }

  /**
   * LA FILA SE CONVIERTE EN PANEL. Antes del cambio la fila lleva el nombre de viaje;
   * dentro del cambio se lo pasa al panel, y `flushSync` hace que el navegador
   * fotografíe el estado nuevo ya pintado. En una columna —la tableta— el panel queda
   * debajo de la lista, así que además se trae a la vista.
   */
  function abrir(servicio: ServicioDelCatalogo): void {
    flushSync(() => {
      setViaje({ id: servicio.id, en: 'fila' });
    });
    void conTransicion(() => {
      flushSync(() => {
        setViaje({ id: servicio.id, en: 'panel' });
        llenarCon(servicio);
      });
      panelRef.current?.scrollIntoView({ block: 'nearest' });
    }).finally(() => {
      setViaje(null);
    });
  }

  function nuevo(): void {
    setElegido(null);
    setNombre('');
    setPrecio(null);
    setMinutos({ activa1: '', pasiva: '0', activa2: '0', cierre: '0' });
    setIntercalable(true);
    setError(null);
    setGuardado('quieto');
    setFormulario((previo) => previo + 1);
    /**
     * Y EL FOCO AL NOMBRE, que es lo que faltaba para que el botón haga algo.
     *
     * Con el formulario ya vacío —al abrir la pantalla, sin nada elegido— este botón
     * limpiaba lo que ya estaba limpio: cero efecto, y el rastreador lo contó como
     * botón muerto con razón. Dejar el cursor donde se va a escribir es lo que
     * cualquiera espera de «Nuevo», y además se nota.
     */
    nombreRef.current?.focus();
  }

  function guardar(): void {
    const centavos = precio;
    const activa1 = Number(minutos.activa1);
    const pasiva = Number(minutos.pasiva);
    const activa2 = Number(minutos.activa2);
    if (nombre.trim() === '' || centavos === null) {
      setError(`${voc.conArticulo('linea_orden')} necesita nombre y precio.`);
      return;
    }
    if (!Number.isInteger(activa1) || activa1 <= 0) {
      setError(
        `${voc.conDeterminante('un', 'linea_orden')} sin aplicación no se agenda: la primera parte dura algo.`,
      );
      return;
    }
    if (pasiva > 0 && activa2 <= 0) {
      // Un procesado sin terminado no existe: el tinte se enjuaga y se seca.
      setError('Si hay procesado, tiene que haber terminado: alguien enjuaga.');
      return;
    }

    setOcupado(true);
    setError(null);
    setGuardado('guardando');
    const cuerpo = {
      nombre: nombre.trim(),
      precioVentaCentavos: centavos,
      duracionActiva1Min: activa1,
      duracionPasivaMin: pasiva,
      duracionActiva2Min: activa2,
      duracionCierreMin: Number(minutos.cierre) || 0,
      pasivoIntercalable: intercalable,
    };
    const promesa =
      elegido === null
        ? invocarComando<ServicioDelCatalogo>(RUTA_CREAR, { ...cuerpo, tipo: 'servicio' })
        : invocarComando<ServicioDelCatalogo>(RUTA_ACTUALIZAR, {
            productoId: elegido.id,
            ...cuerpo,
          });

    promesa
      .then((recibido) => {
        setServicios(
          elegido === null
            ? [...(servicios ?? []), recibido]
            : (servicios ?? []).map((s) => (s.id === elegido.id ? recibido : s)),
        );
        setElegido(recibido);
        setGuardado('guardado');
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
        setGuardado('quieto');
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  // ── CARGANDO · la forma de la pantalla, no una rueda ─────────────────────
  if (servicios === null && falloDeCarga === null) {
    return (
      <main className="mx-auto max-w-7xl p-(--espacio-4) md:p-(--espacio-6)">
        <div
          role="status"
          aria-busy="true"
          aria-label={`Cargando ${voc.enFrase('linea_orden', true)}`}
          className="flex flex-col gap-(--espacio-4)"
        >
          <div className="flex items-end justify-between gap-(--espacio-3)">
            <Esqueleto className="h-[calc(var(--altura-control)*0.9)] w-48" />
            <Esqueleto className="h-(--altura-control) w-44" />
          </div>
          <div className="grid gap-(--espacio-4) xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:items-start xl:gap-(--espacio-6)">
            <Esqueleto className="h-64 w-full rounded-lg xl:h-96" />
            <Esqueleto className="h-96 w-full rounded-lg" />
          </div>
        </div>
      </main>
    );
  }

  const columnas: readonly ColumnaDeTabla<ServicioDelCatalogo>[] = [
    {
      clave: 'nombre',
      titulo: voc.titulo('linea_orden'),
      orden: (s) => s.nombre,
      celda: (s) => <span className="font-medium">{s.nombre}</span>,
    },
    {
      // Lo que la agenda aparta en la estación, de principio a fin.
      clave: 'estacion',
      titulo: voc.titulo('unidad_servicio'),
      numerica: true,
      desde: 'sm',
      orden: minutosDeEstacion,
      celda: (s) => <Cifra valor={minutosDeEstacion(s)} unidad="min" tamano="sm" />,
    },
    {
      // Lo que ocupa a la persona: la columna que ningún otro catálogo tiene.
      clave: 'profesional',
      titulo: voc.titulo('responsable'),
      numerica: true,
      desde: 'md',
      orden: minutosDeProfesional,
      celda: (s) => <Cifra valor={minutosDeProfesional(s)} unidad="min" tamano="sm" />,
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (s) => aCentavos(s.precio_venta),
      celda: (s) => <Dinero centavos={aCentavos(s.precio_venta)} tamano="sm" />,
    },
  ];

  const lista =
    falloDeCarga === null ? (
      <Tabla
        etiqueta={voc.titulo('linea_orden', true)}
        columnas={columnas}
        filas={servicios ?? []}
        claveDe={(s) => s.id}
        {...(elegido === null ? {} : { activa: elegido.id })}
        alActivar={(id) => {
          const servicio = servicios?.find((s) => s.id === id);
          if (servicio !== undefined) abrir(servicio);
        }}
        viajeDeFila={(s) =>
          viaje?.en === 'fila' && viaje.id === s.id ? VIAJE.fila(s.id) : undefined
        }
        alto="max-h-[45vh] xl:max-h-[calc(100dvh-12rem)]"
        vacio={
          <Superficie nivel={0} relleno={0}>
            <Vacio
              icono={<Scissors />}
              titulo={`Todavía no hay ${voc.plural('linea_orden')} en el catálogo`}
              explicacion={`Cada uno lleva su precio base y su duración por tramos: es lo que la agenda usa para acomodar ${voc.enFrase('orden', true)}.`}
              accion={
                <Button type="button" variant="outline" onClick={nuevo}>
                  Capturar {voc.enFraseCon('un', 'linea_orden')}
                </Button>
              }
            />
          </Superficie>
        }
      />
    ) : (
      <ErrorDePantalla
        titulo={`No se pudo leer el catálogo de ${voc.plural('linea_orden')}`}
        queHacer={`Revisa la conexión y vuelve a intentarlo. Sin la lista no se ve qué ${voc.plural('linea_orden')} ya existen; lo que captures en el formulario no se pierde.`}
        detalle={falloDeCarga}
        reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
      />
    );

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-(--espacio-4) p-(--espacio-4) md:p-(--espacio-6)">
      <header className="flex flex-wrap items-end justify-between gap-(--espacio-3)">
        <div className="flex flex-col gap-(--espacio-1)">
          <h1 className="text-2xl font-semibold">{voc.titulo('linea_orden', true)}</h1>
          {/* Sólo con el catálogo LEÍDO: tras un fallo de lectura, guardar uno deja
              `servicios` en ese uno y la cuenta diría «1 servicio» junto al error. */}
          {servicios === null || falloDeCarga !== null ? null : (
            <p className="text-sm text-texto-sutil">
              {voc.conNumero('linea_orden', servicios.length)}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={nuevo}>
          <Plus aria-hidden="true" />
          Nuevo {voc.singular('linea_orden')}
        </Button>
      </header>

      <div className="grid gap-(--espacio-4) xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:items-start xl:gap-(--espacio-6)">
        <div className="min-w-0">{lista}</div>

        <Superficie
          como="section"
          ref={panelRef}
          relleno={0}
          aria-labelledby="catalogo-editor-titulo"
          style={viaje?.en === 'panel' ? { viewTransitionName: VIAJE.fila(viaje.id) } : undefined}
          className="flex min-w-0 scroll-mt-(--espacio-4) flex-col overflow-clip"
        >
          <header className="border-b border-borde px-(--espacio-4) py-(--espacio-4) md:px-(--espacio-6)">
            <h2 id="catalogo-editor-titulo" className="text-xl font-semibold">
              {elegido === null ? `Nuevo ${voc.singular('linea_orden')}` : elegido.nombre}
            </h2>
          </header>

          <div className="grid gap-(--espacio-6) p-(--espacio-4) md:p-(--espacio-6) xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] xl:gap-(--espacio-8)">
            {/* QUÉ SE VENDE · el nombre y el precio. En el teléfono es lo único que
                hace falta tocar: el precio es lo que cambia en el mostrador. */}
            <div className="flex flex-col gap-(--espacio-4)">
              <div className="flex flex-col gap-(--espacio-1)">
                <Label htmlFor="nombre">Nombre</Label>
                <Input
                  id="nombre"
                  ref={nombreRef}
                  className="h-[calc(var(--altura-control)*1.2)]"
                  value={nombre}
                  onChange={(evento) => {
                    setNombre(evento.target.value);
                  }}
                />
              </div>
              <div className="flex flex-col gap-(--espacio-1)">
                <Label htmlFor="precio">Precio base</Label>
                <CampoDeDinero
                  key={formulario}
                  id="precio"
                  className="w-48"
                  centavos={precio}
                  alCambiar={setPrecio}
                />
                <p className="text-sm text-texto-sutil">
                  Cada profesional puede tener el suyo: Karla cobra más y tarda menos.
                </p>
              </div>
            </div>

            {/* CUÁNTO DURA · la secuencia, en el orden en que pasa en la silla. */}
            <section
              aria-labelledby="catalogo-duracion-titulo"
              className="flex flex-col gap-(--espacio-3)"
            >
              <div className="flex flex-col gap-(--espacio-1)">
                <h3 id="catalogo-duracion-titulo" className="font-medium">
                  La duración, por tramos
                </h3>
                <p className="max-w-prose text-sm text-texto-sutil">
                  Un tinte no dura 110 minutos: dura 40, 45, 15 y 10. Con un solo número, los 45 del
                  procesado desaparecen de la agenda.
                </p>
              </div>

              <ol className="flex flex-col">
                {TRAMOS.map((tramo, indice) => (
                  <li
                    key={tramo.clave}
                    className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-(--espacio-3) gap-y-(--espacio-2) border-t border-borde py-(--espacio-3) first:border-t-0"
                  >
                    <span
                      aria-hidden="true"
                      className="font-numeros text-sm text-texto-sutil tabular-nums"
                    >
                      {indice + 1}
                    </span>
                    <div className="flex flex-col">
                      <Label htmlFor={`t-${tramo.clave}`}>{tramo.etiqueta}</Label>
                      <span className="text-xs text-texto-sutil">{tramo.ayuda}</span>
                    </div>
                    <div className="flex items-center gap-(--espacio-2)">
                      <Input
                        id={`t-${tramo.clave}`}
                        inputMode="numeric"
                        className="h-[calc(var(--altura-control)*1.2)] w-20 text-right font-numeros tabular-nums"
                        value={minutos[tramo.clave]}
                        onChange={(evento) => {
                          setMinutos({ ...minutos, [tramo.clave]: evento.target.value });
                        }}
                      />
                      <span className="text-sm text-texto-sutil">min</span>
                    </div>

                    {/* La decisión va PEGADA al procesado, que es de lo único que habla.
                        Sin `aria-pressed`: la etiqueta ya dice el estado y cambia con él,
                        y con los dos se oía «exige vigilancia, no presionado», que se
                        entiende al revés. */}
                    {tramo.clave === 'pasiva' ? (
                      <div className="col-span-2 col-start-2 flex flex-col gap-(--espacio-1)">
                        <Button
                          type="button"
                          variant={intercalable ? 'secondary' : 'outline'}
                          className="h-[calc(var(--altura-control)*1.2)] justify-start self-start"
                          onClick={() => {
                            setIntercalable(!intercalable);
                          }}
                        >
                          {intercalable ? (
                            <CalendarPlus aria-hidden="true" />
                          ) : (
                            <Eye aria-hidden="true" />
                          )}
                          {intercalable
                            ? `El procesado libera a la ${voc.singular('responsable')}`
                            : 'El procesado exige vigilancia'}
                        </Button>
                        <p className="text-xs text-texto-sutil">
                          Suponerlo siempre libre haría que la agenda prometiera huecos que no
                          existen, y eso se paga con una clienta esperando.
                        </p>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>

              {/* Lo que la agenda hace con el servicio guardado: tres números, no uno. */}
              {elegido === null ? null : (
                <Superficie
                  como="dl"
                  nivel={0}
                  conBorde={false}
                  radio="md"
                  relleno={4}
                  className="grid grid-cols-1 gap-(--espacio-3) bg-fondo-sutil sm:grid-cols-3"
                >
                  <div className="flex flex-col gap-(--espacio-1)">
                    <dt className="text-xs text-texto-sutil">Ocupa a la persona</dt>
                    <dd>
                      <Cifra valor={minutosDeProfesional(elegido)} unidad="min" tamano="lg" />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-(--espacio-1)">
                    <dt className="text-xs text-texto-sutil">
                      Ocupa {voc.enFraseCon('un', 'unidad_servicio')}
                    </dt>
                    <dd>
                      <Cifra valor={minutosDeEstacion(elegido)} unidad="min" tamano="lg" />
                    </dd>
                  </div>
                  <div className="flex flex-col gap-(--espacio-1)">
                    <dt className="text-xs text-texto-sutil">
                      Se pueden vender a {voc.enFraseCon('otro', 'cliente')}
                    </dt>
                    <dd>
                      <Cifra valor={minutosIntercalables(elegido)} unidad="min" tamano="lg" />
                    </dd>
                  </div>
                </Superficie>
              )}
            </section>
          </div>

          {/* GUARDAR, la acción principal, siempre a la vista: en la tableta el
              formulario es más alto que la pantalla. El fallo se dice AQUÍ, junto al
              botón que se acaba de tocar, y no arriba donde nadie está mirando. */}
          <footer className="sticky bottom-0 z-10 flex flex-col gap-(--espacio-3) border-t border-borde bg-superficie px-(--espacio-4) py-(--espacio-4) md:px-(--espacio-6)">
            {error === null ? null : (
              <Aviso tono="peligro" titulo={error}>
                Lo capturado sigue aquí.
              </Aviso>
            )}
            <div className="flex flex-col-reverse items-stretch gap-(--espacio-3) sm:flex-row sm:items-center sm:justify-end">
              <IndicadorDeGuardado estado={guardado} className="sm:mr-auto" />
              <Button
                size="lg"
                className="h-[calc(var(--altura-control)*1.4)] text-base sm:min-w-64"
                disabled={ocupado}
                cargando={ocupado}
                onClick={guardar}
              >
                Guardar {voc.singular('linea_orden')}
              </Button>
            </div>
          </footer>
        </Superficie>
      </div>
    </main>
  );
}
