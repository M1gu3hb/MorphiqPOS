'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import { Separator } from '@morphiqpos/ui/primitivas/separator';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useEffect, useRef, useState } from 'react';

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
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el catálogo, la secuencia de duración y el precio base. Queda fuera la
 * asignación por profesional con su factor, que vive en la ficha de cada una.
 */

const RUTA_CREAR = '/api/catalogo/productos/crear';
const RUTA_ACTUALIZAR = '/api/catalogo/productos/actualizar';

const IMPORTE_CON_FORMA = /^\d{1,7}(?:[.,]\d{1,2})?$/;
const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

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

function pesos(centavos: number): string {
  return PESOS.format(centavos / 100);
}

function aCentavos(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !IMPORTE_CON_FORMA.test(limpio)) return null;
  const [enteros = '0', decimales = ''] = limpio.split('.');
  return Number(enteros) * 100 + Number(decimales.padEnd(2, '0'));
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
  return 'No se pudo guardar. Lo capturado sigue aquí.';
}

export function CatalogoDeServicios({ serviciosIniciales }: CatalogoDeServiciosProps) {
  const voc = useVocabulario();
  const [servicios, setServicios] = useState<readonly ServicioDelCatalogo[] | null>(
    serviciosIniciales ?? null,
  );
  const [elegido, setElegido] = useState<ServicioDelCatalogo | null>(null);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [minutos, setMinutos] = useState<Record<Tramo, string>>({
    activa1: '',
    pasiva: '',
    activa2: '',
    cierre: '',
  });
  const [intercalable, setIntercalable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);

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
        .catch(() => {
          if (sigueMontada()) setServicios([]);
        });
    };
    const arranque = setTimeout(cargar);
    return () => {
      clearTimeout(arranque);
      control.abort();
    };
  }, [serviciosIniciales]);

  function abrir(servicio: ServicioDelCatalogo): void {
    setElegido(servicio);
    setNombre(servicio.nombre);
    setPrecio((servicio.precio_venta ?? 0).toFixed(2));
    setMinutos({
      activa1: String(servicio.duracion_activa_1_min),
      pasiva: String(servicio.duracion_pasiva_min),
      activa2: String(servicio.duracion_activa_2_min),
      cierre: String(servicio.duracion_cierre_min),
    });
    setIntercalable(servicio.pasivo_intercalable);
    setError(null);
  }

  function nuevo(): void {
    setElegido(null);
    setNombre('');
    setPrecio('');
    setMinutos({ activa1: '', pasiva: '0', activa2: '0', cierre: '0' });
    setIntercalable(true);
    setError(null);
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
    const centavos = aCentavos(precio);
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
      .then((guardado) => {
        setServicios(
          elegido === null
            ? [...(servicios ?? []), guardado]
            : (servicios ?? []).map((s) => (s.id === elegido.id ? guardado : s)),
        );
        setElegido(guardado);
      })
      .catch((fallo: unknown) => {
        setError(mensajeDe(fallo));
      })
      .finally(() => {
        setOcupado(false);
      });
  }

  if (servicios === null) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-[calc(var(--altura-control)*0.9)] w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <main className="mx-auto grid max-w-5xl gap-6 p-6 md:grid-cols-[20rem_1fr]">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">{voc.titulo('linea_orden', true)}</h1>
        <Button variant="outline" className="w-full" onClick={nuevo}>
          Nuevo {voc.singular('linea_orden')}
        </Button>
        <ul className="divide-y">
          {servicios.map((servicio) => (
            <li key={servicio.id}>
              <button
                type="button"
                className={`w-full py-2 text-left ${elegido?.id === servicio.id ? 'font-medium' : ''}`}
                onClick={() => {
                  abrir(servicio);
                }}
              >
                {servicio.nombre}
                <span className="text-muted-foreground ml-2 text-xs">
                  {minutosDeEstacion(servicio)} min ·{' '}
                  {pesos(Math.round((servicio.precio_venta ?? 0) * 100))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        <div>
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
        <div>
          <Label htmlFor="precio">Precio base</Label>
          <Input
            id="precio"
            inputMode="decimal"
            className="h-[calc(var(--altura-control)*1.2)] w-40 text-right"
            value={precio}
            onChange={(evento) => {
              setPrecio(evento.target.value);
            }}
          />
          <p className="text-muted-foreground mt-1 text-sm">
            Cada profesional puede tener el suyo: Karla cobra más y tarda menos.
          </p>
        </div>

        <Separator />

        <div>
          <h2 className="font-medium">La duración, por tramos</h2>
          <p className="text-muted-foreground text-sm">
            Un tinte no dura 110 minutos: dura 40, 45, 15 y 10. Con un solo número, los 45 del
            procesado desaparecen de la agenda.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TRAMOS.map((tramo) => (
            <div key={tramo.clave}>
              <Label htmlFor={`t-${tramo.clave}`}>{tramo.etiqueta}</Label>
              <Input
                id={`t-${tramo.clave}`}
                inputMode="numeric"
                className="h-[calc(var(--altura-control)*1.2)] text-right"
                value={minutos[tramo.clave]}
                onChange={(evento) => {
                  setMinutos({ ...minutos, [tramo.clave]: evento.target.value });
                }}
              />
              <p className="text-muted-foreground mt-1 text-xs">{tramo.ayuda}</p>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant={intercalable ? 'default' : 'outline'}
          className="h-[calc(var(--altura-control)*1.2)]"
          onClick={() => {
            setIntercalable(!intercalable);
          }}
        >
          {intercalable
            ? `El procesado libera a la ${voc.singular('responsable')}`
            : 'El procesado exige vigilancia'}
        </Button>
        <p className="text-muted-foreground text-sm">
          Suponerlo siempre libre haría que la agenda prometiera huecos que no existen, y eso se
          paga con una clienta esperando.
        </p>

        {elegido !== null && (
          <div className="rounded border p-3 text-sm">
            <p>Ocupa a la persona: {minutosDeProfesional(elegido)} min</p>
            <p>Ocupa la estación: {minutosDeEstacion(elegido)} min</p>
            <p>Se pueden vender a otra clienta: {minutosIntercalables(elegido)} min</p>
          </div>
        )}

        <Button
          className="h-[calc(var(--altura-control)*1.4)] w-full text-base"
          disabled={ocupado}
          onClick={guardar}
        >
          Guardar {voc.singular('linea_orden')}
        </Button>
      </section>
    </main>
  );
}
