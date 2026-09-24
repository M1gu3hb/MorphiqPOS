'use client';

import { useId, useState } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Dinero, Superficie } from '@morphiqpos/ui/sistema';
import { CLAVES_ESTILO, ESTILOS, PERILLAS, atributosDeEstilo } from '@morphiqpos/ui/tokens';
import { Check, Palette } from 'lucide-react';

import { useAparienciaEnVivo } from '~/proveedores/Apariencia';

/**
 * EL SELECTOR DE ESTILO VISUAL · donde Miguel lo pidió.
 *
 * Vive en Configuración → Modo Presentación, que es la pantalla desde la que se
 * cambia de modelo de negocio delante de un prospecto. Aquí se cambia de PIEL.
 *
 * ── Las cuatro decisiones que lo hacen útil y no un adorno ────────────────
 *
 *   1 · **Vista previa DE VERDAD.** No un cuadrito de color: una tarjeta, un botón,
 *       una cifra de dinero y una línea de tabla, pintados con los tokens de ESE
 *       estilo. Un cuadrito de color no dice si la tabla densa sigue leyéndose.
 *   2 · **Las cuatro perillas**, además del estilo. Con ellas, de ocho estilos salen
 *       decenas de combinaciones y cada cliente tiene la suya.
 *   3 · **Cambia EN VIVO**, sin recargar: son cinco atributos del `<html>`. Es lo
 *       que hace que se sienta mágico cuando se lo enseñas a alguien.
 *   4 · **Se guarda por ORGANIZACIÓN**, no por navegador. Es la marca del negocio,
 *       no una preferencia de quien está en la caja: si la cambiara un cajero, el
 *       siguiente turno encontraría otro sistema.
 *
 * ── Cómo se lee, de arriba abajo ──────────────────────────────────────────
 * Lo grande son las ocho teselas: es lo que se toca delante del prospecto, y cada
 * una es la vista previa de su estilo. La elegida lleva el anillo del primario Y una
 * palomita, porque el color solo no dice cuál es. Debajo, para qué sirve el elegido;
 * luego las cuatro perillas en su propia bandeja —son el ajuste fino, no la
 * decisión—, y al final el único botón que escribe.
 *
 * ── Los tres estados, y los dos que no tiene ──────────────────────────────
 * Esta pantalla no LEE nada de la red: el catálogo de estilos es una constante del
 * sistema de diseño y la apariencia actual llega del contexto, que el servidor ya
 * escribió en el `<html>` antes de la primera pintura. Así que no hay «cargando» ni
 * «vacío» que pintar sin inventarlos. Lo que sí puede fallar es GUARDAR, y eso es
 * un `Aviso` de peligro que dice lo que no pasó: el negocio sigue como estaba.
 *
 * ── Por qué está aquí y no dentro de `heredado/` ──────────────────────────
 * `verify:aspecto` compara cada archivo del heredado contra el commit en que Miguel
 * lo entregó, clase por clase y texto por texto. Escribir esta sección ahí dentro
 * haría fallar esa puerta por decenas de testigos nuevos — y esa puerta existe para
 * que nadie le rompa su diseño sin querer. Se monta desde allí con una línea.
 */

const PERILLAS_EN_ORDEN = ['densidad', 'redondeo', 'elevacion', 'movimiento'] as const;

/**
 * El nombre de cada perilla como se lee. La clave del contrato va sin acento
 * («elevacion»); la etiqueta que ve el prospecto, no.
 */
const NOMBRE_DE_PERILLA: Readonly<Record<(typeof PERILLAS_EN_ORDEN)[number], string>> = {
  densidad: 'Densidad',
  redondeo: 'Redondeo',
  elevacion: 'Elevación',
  movimiento: 'Movimiento',
};

/** Lo que dijo el último guardado. El texto es el del servidor cuando lo hay. */
type Resultado = { readonly tono: 'exito' | 'peligro'; readonly texto: string } | null;

/**
 * Lo que se ve de cada estilo antes de elegirlo.
 *
 * Todo en `<span>`: va DENTRO de un botón, y un botón sólo admite contenido de
 * frase. Y `aria-hidden`: es una muestra, no información; sin él, el lector de
 * pantalla leía «Total, cuatrocientos treinta y nueve pesos» antes del nombre de
 * cada uno de los ocho estilos.
 */
function VistaPrevia({ estilo }: { readonly estilo: string }) {
  return (
    <span
      {...atributosDeEstilo(estilo)}
      aria-hidden="true"
      className="pointer-events-none block rounded-md bg-fondo p-(--espacio-3) text-texto"
    >
      <Superficie como="span" nivel={2} relleno={3} className="flex flex-col gap-(--espacio-2)">
        <span className="flex items-baseline justify-between gap-(--espacio-2)">
          <span className="text-xs text-texto-sutil">Total</span>
          <Dinero centavos={43900} tamano="lg" />
        </span>
        <span className="flex items-center gap-(--espacio-2)">
          <span className="h-(--altura-control) flex-1 rounded-md bg-primario" />
          <span className="h-(--altura-control) w-10 rounded-md border border-borde-fuerte" />
        </span>
        <span className="flex flex-col gap-px">
          <span className="h-1.5 w-full rounded-sm bg-fondo-sutil" />
          <span className="h-1.5 w-4/5 rounded-sm bg-fondo-sutil" />
        </span>
      </Superficie>
    </span>
  );
}

export function SelectorDeApariencia() {
  const { apariencia, cambiarEstilo, ajustar } = useAparienciaEnVivo();
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<Resultado>(null);
  const idTitulo = useId();

  async function guardar(): Promise<void> {
    setGuardando(true);
    setResultado(null);
    try {
      const respuesta = await fetch('/api/configuracion/apariencia', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          estilo: apariencia.estilo,
          densidad: apariencia.densidad,
          redondeo: apariencia.redondeo,
          elevacion: apariencia.elevacion,
          movimiento: apariencia.movimiento,
        }),
      });
      const cuerpo = (await respuesta.json()) as {
        ok?: boolean;
        error?: { mensaje?: string };
      };
      setResultado(
        cuerpo.ok === true
          ? { tono: 'exito', texto: 'Guardado. Todo el negocio lo verá así.' }
          : {
              tono: 'peligro',
              texto: cuerpo.error?.mensaje ?? 'No se pudo guardar la apariencia.',
            },
      );
    } catch {
      setResultado({ tono: 'peligro', texto: 'No se pudo guardar: revisa la conexión.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Superficie
      como="section"
      relleno={0}
      aria-labelledby={idTitulo}
      className="flex flex-col gap-(--espacio-4) p-(--espacio-4) sm:p-(--espacio-6)"
    >
      <header className="flex flex-col gap-(--espacio-1)">
        <h3 id={idTitulo} className="flex items-center gap-(--espacio-2) text-lg font-semibold">
          <Palette aria-hidden className="size-5 shrink-0 text-primario" />
          Estilo visual
        </h3>
        <p className="text-sm text-texto-sutil">
          Cambia al instante en toda la aplicación. Se guarda para el negocio entero, no sólo para
          esta computadora.
        </p>
      </header>

      {/* Dos por renglón en teléfono, cuatro desde tableta: los ocho caben en dos
          filas y se comparan de un vistazo, que es lo que pide la conversación. */}
      <ul className="grid grid-cols-2 gap-(--espacio-3) sm:grid-cols-4">
        {CLAVES_ESTILO.map((clave) => {
          const definicion = ESTILOS[clave];
          const elegido = apariencia.estilo === clave;
          return (
            <li key={clave} className="flex">
              <Superficie
                como="button"
                type="button"
                interactiva
                activa={elegido}
                relleno={0}
                aria-pressed={elegido}
                onClick={() => {
                  cambiarEstilo(clave);
                  setResultado(null);
                }}
                className="flex w-full flex-col gap-(--espacio-2) p-(--espacio-2)"
              >
                <VistaPrevia estilo={clave} />
                <span className="flex items-start justify-between gap-(--espacio-2) px-(--espacio-1)">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{definicion?.nombre ?? clave}</span>
                    <span className="block text-xs text-texto-sutil">
                      {definicion?.referencia ?? ''}
                    </span>
                  </span>
                  {/* El anillo no es lo único que marca la elegida: la palomita
                      también, para quien no distingue el color del primario. */}
                  {elegido ? <Check aria-hidden className="size-4 shrink-0 text-primario" /> : null}
                </span>
              </Superficie>
            </li>
          );
        })}
      </ul>

      <p className="max-w-prose text-sm text-texto-sutil">
        {ESTILOS[apariencia.estilo]?.para ?? ''}
      </p>

      {/* LA BANDEJA DE PERILLAS · hundida respecto de las teselas: es el ajuste
          fino sobre el estilo elegido, no una segunda decisión del mismo peso. */}
      <Superficie
        nivel={0}
        relleno={3}
        radio="md"
        className="grid grid-cols-2 gap-(--espacio-3) bg-fondo-sutil sm:grid-cols-4"
      >
        {PERILLAS_EN_ORDEN.map((perilla) => (
          <label
            key={perilla}
            className="flex flex-col gap-(--espacio-1) text-xs font-medium text-texto-sutil"
          >
            <span>{NOMBRE_DE_PERILLA[perilla]}</span>
            <select
              value={apariencia[perilla]}
              onChange={(evento) => {
                // El valor viene del catálogo de la perilla, así que es uno de los
                // suyos: lo garantiza la lista que pinta las opciones.
                ajustar(perilla, evento.target.value as never);
                setResultado(null);
              }}
              className="h-(--altura-control) w-full rounded-md border border-borde-fuerte bg-superficie px-(--espacio-2) text-sm font-normal text-texto outline-none focus-visible:ring-[3px] focus-visible:ring-anillo/60"
            >
              {PERILLAS[perilla].map((valor) => (
                <option key={valor} value={valor}>
                  {valor}
                </option>
              ))}
            </select>
          </label>
        ))}
      </Superficie>

      <footer className="flex flex-col gap-(--espacio-3)">
        <Button
          className="self-start"
          cargando={guardando}
          onClick={() => {
            void guardar();
          }}
        >
          Guardar para el negocio
        </Button>
        {resultado === null ? null : resultado.tono === 'exito' ? (
          <Aviso tono="exito" titulo={resultado.texto} />
        ) : (
          // Leyó bien y lo que falló fue ESCRIBIR: un aviso, no una pantalla de
          // error, y dice lo que NO pasó.
          <Aviso tono="peligro" titulo={resultado.texto}>
            El negocio sigue con la apariencia que tenía guardada: lo que ves aquí se pierde al
            recargar.
          </Aviso>
        )}
      </footer>
    </Superficie>
  );
}
