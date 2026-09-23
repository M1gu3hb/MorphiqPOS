'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  BarraFija,
  Dinero,
  ErrorDePantalla,
  Esqueleto,
  EsqueletoDeLista,
  Superficie,
  Tabla,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { BellRing, QrCode, ReceiptText, UtensilsCrossed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useVocabulario } from '~/cliente/vocabulario';

/**
 * PANTALLA · restaurante · portal-del-comensal
 *
 * Lo que ve quien escanea el código de la mesa: el menú y su cuenta.
 *
 * ── Por qué es UNA petición y no cinco ──────────────────────────────────
 * Antes eran cinco consultas anónimas desde el navegador, una de ellas la
 * configuración COMPLETA del negocio dos veces. En el teléfono de alguien
 * sentado en una terraza con una raya de señal, cinco peticiones es una pantalla
 * en blanco. El portal se pinta entero con `GET /api/publico/qr/:token`.
 *
 * ── Por qué el token dice QUÉ MESA y no de qué negocio ──────────────────
 * La organización sale del despliegue. Si viniera en la petición, el token de
 * una mesa serviría para leer el menú —y la cuenta— de otra.
 *
 * ── Por qué la cuenta no se puede pagar desde aquí ──────────────────────
 * Pagar en línea mete una pasarela y una obligación de devolución que no decide
 * esta pantalla. Lo que sí resuelve es la espera: ver la cuenta y PEDIRLA sin
 * levantar la mano quita los quince minutos que separan «ya terminamos» de «ya
 * nos vamos».
 *
 * ── Por qué el estado de la mesa manda sobre todo ───────────────────────
 * Una mesa libre no enseña cuenta: enseña el menú. Una mesa que ya pidió la
 * cuenta no ofrece pedir más. Enseñar todo siempre es cómo alguien pide un café
 * después de que el mesero ya cerró la caja.
 *
 * ── Una pantalla de teléfono, y sólo de teléfono ────────────────────────
 * Nadie escanea un QR desde una PC: se diseña a 375 px, en una columna, y no se
 * deriva a nada más (04-INTERFAZ, «Portal del comensal»). Arriba, el nombre del
 * restaurante y la mesa; debajo, las secciones de la carta en una franja que se
 * queda pegada al hacer scroll, porque una carta de cuarenta platillos se recorre
 * saltando de sección, no leyéndola entera.
 *
 * ── Por qué la atención va ABAJO, fija, y el aviso con ella ─────────────
 * El teléfono se sostiene con una mano y el pulgar llega al borde de abajo: ahí
 * viven «pedir la cuenta» y «llamar al mesero», alcanzables en cualquier punto de
 * la carta. Y la respuesta —«ya va la cuenta», «levanta la mano»— sale en esa misma
 * barra, donde está el dedo: arriba de una carta ya recorrida no la ve nadie.
 *
 * ── Por qué la carta es una tabla por sección ───────────────────────────
 * Lo que se compara en una carta es el precio, y un precio se compara en una
 * columna a la derecha, en cifras tabulares. Una tarjeta por platillo sin foto es
 * aire; una fila es la carta impresa que el comensal ya sabe leer.
 *
 * ── Nunca en blanco, nunca técnico ──────────────────────────────────────
 * Quien lee esto es un cliente, no un operador. Sin conexión se queda lo último
 * que llegó y se dice «llama a tu mesero»; si el servidor contesta que el código
 * no sirve, se enseña SU mensaje, que está escrito para el comensal. Antes, las dos
 * cosas eran un esqueleto que no terminaba nunca.
 *
 * ── Alcance recortado, dicho aquí ───────────────────────────────────────
 * Caben el menú, la cuenta, pedir la cuenta y llamar al mesero. Queda fuera el
 * pedido desde el portal cuando el negocio lo tiene apagado, y la valoración al
 * final del consumo.
 */

/** Cada cuánto se refresca. Diez segundos: la cuenta cambia mientras se come. */
const MS_REFRESCO = 10_000;

export interface ProductoDelMenu {
  readonly id: string;
  readonly nombre: string;
  readonly precioCentavos: string;
  readonly seccion: string;
}

export interface LineaDeLaCuenta {
  readonly id: string;
  readonly nombre: string;
  readonly cantidad: string;
  readonly totalCentavos: string;
}

export interface PayloadDelPortal {
  readonly negocio: { readonly nombre: string };
  readonly mesa: { readonly numero: string; readonly estado: string };
  readonly menu: readonly ProductoDelMenu[];
  readonly cuenta: {
    readonly lineas: readonly LineaDeLaCuenta[];
    readonly totalCentavos: string;
  } | null;
  readonly puedePedir: boolean;
}

export interface PortalProps {
  readonly token: string;
  readonly datosIniciales?: PayloadDelPortal;
}

/** Una mesa libre no enseña cuenta: enseña el menú. */
export function enseñaCuenta(datos: PayloadDelPortal): boolean {
  return datos.cuenta !== null && datos.cuenta.lineas.length > 0;
}

/** Ya pedida la cuenta, ofrecer pedir más es cómo alguien pide tras el cierre. */
export function puedeSeguirPidiendo(datos: PayloadDelPortal): boolean {
  return datos.puedePedir && datos.mesa.estado !== 'cuenta_solicitada';
}

interface Respuesta {
  readonly ok: boolean;
  readonly datos?: PayloadDelPortal;
  readonly error?: { readonly mensaje?: unknown };
}

/** Lo mínimo para creerle a la respuesta: que diga si salió bien. */
function esRespuesta(valor: unknown): valor is Respuesta {
  return typeof valor === 'object' && valor !== null && 'ok' in valor;
}

/**
 * El mensaje que el servidor escribió para el comensal, si lo escribió. Los
 * errores del portal que se escapan al envoltorio llevan el suyo —«Este código QR
 * ya no es válido»— y los internos uno que no enseña nada del servidor.
 */
function mensajeDe(cuerpo: Respuesta): string | null {
  const mensaje = cuerpo.error?.mensaje;
  return typeof mensaje === 'string' && mensaje !== '' ? mensaje : null;
}

type Solicitud = 'cuenta' | 'mesero';

interface AvisoDeSolicitud {
  readonly tono: 'exito' | 'peligro';
  readonly texto: string;
}

/** El id del ancla de cada sección: su posición, porque el nombre es texto libre. */
function anclaDe(indice: number): string {
  return `portal-seccion-${String(indice)}`;
}

export function PortalDelComensal({ token, datosIniciales }: PortalProps) {
  // F-017 · Cómo llama este negocio a la unidad de servicio. Lo resuelve el
  // envoltorio de servidor, así que en la primera pintada ya está.
  const voc = useVocabulario();
  const [datos, setDatos] = useState<PayloadDelPortal | null>(datosIniciales ?? null);
  const [sinConexion, setSinConexion] = useState(false);
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<Solicitud | null>(null);
  const [aviso, setAviso] = useState<AvisoDeSolicitud | null>(null);
  // Cada intento es un número: el botón de reintentar lo sube y el efecto vuelve
  // a latir en ese instante, sin esperar los diez segundos.
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (datosIniciales !== undefined) return;
    /**
     * SIN TOKEN NO SE LATE, y esto era un defecto de verdad.
     *
     * Abajo hay un estado vacío para cuando alguien llega aquí sin escanear nada, y
     * está bien escrito. Pero un efecto corre ANTES de que el componente decida qué
     * pinta: con el token vacío, esta pantalla pedía `/api/publico/qr/` —sin token—
     * cada cuatro segundos, PARA SIEMPRE, y el servidor contestaba 404 cada vez.
     *
     * No lo vio nadie porque la pantalla se ve perfecta: el vacío se pinta igual y el
     * 404 sólo existe en la consola y en el registro del servidor. Lo cazó el
     * rastreador, que es exactamente para lo que mira la consola.
     */
    if (token === '') return;
    const control = new AbortController();
    const sigueMontada = (): boolean => !control.signal.aborted;

    const latir = (): void => {
      fetch(`/api/publico/qr/${token}`, { signal: control.signal })
        // `json()` devuelve `any`: se estrecha AQUÍ, en el borde, y no más
        // adentro. Un `any` que viaja dos líneas más ya contagió todo lo que
        // toca, y el compilador deja de avisar de lo que de verdad importa.
        .then(async (respuesta): Promise<Respuesta> => {
          const cuerpo: unknown = await respuesta.json();
          return esRespuesta(cuerpo) ? cuerpo : { ok: false };
        })
        .then((cuerpo) => {
          if (!sigueMontada()) return;
          if (cuerpo.ok && cuerpo.datos !== undefined) {
            setDatos(cuerpo.datos);
            setSinConexion(false);
            setRechazo(null);
            return;
          }
          // Contestó, y dijo que no. No es la red: se dice lo que dijo.
          if (!cuerpo.ok) {
            setSinConexion(false);
            setRechazo(mensajeDe(cuerpo) ?? 'Este código ya no está activo.');
          }
        })
        .catch(() => {
          // Ni se vacía ni enseña el fallo técnico: se queda lo último y se
          // avisa. Una pantalla en blanco en una terraza es una pantalla que se
          // cierra.
          if (sigueMontada()) setSinConexion(true);
        });
    };

    const arranque = setTimeout(latir);
    const latido = setInterval(latir, MS_REFRESCO);
    return () => {
      clearTimeout(arranque);
      clearInterval(latido);
      control.abort();
    };
  }, [token, datosIniciales, intento]);

  function reintentar(): void {
    setSinConexion(false);
    setRechazo(null);
    setIntento((previo) => previo + 1);
  }

  function solicitar(tipo: Solicitud): void {
    setEnviando(tipo);
    fetch(`/api/publico/qr/${token}/solicitud`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-morphiqpos-request': '1' },
      body: JSON.stringify({ tipo }),
    })
      .then(() => {
        setAviso({
          tono: 'exito',
          texto: tipo === 'cuenta' ? `Ya va ${voc.enFrase('orden')}.` : 'Ya viene alguien.',
        });
      })
      .catch(() => {
        setAviso({ tono: 'peligro', texto: 'No se pudo avisar. Levanta la mano.' });
      })
      .finally(() => {
        setEnviando(null);
      });
  }

  // El VACÍO QUE ENSEÑA: este portal se abre con el QR de la mesa.
  //
  // `page.tsx` lo monta con el token vacío —no hay forma de saber en qué mesa está
  // un navegador que no viene del QR— y sin esto la pantalla se quedaba en su
  // esqueleto, en blanco, para siempre.
  if (token === '' && datosIniciales === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center p-(--espacio-4)">
        {/* El estado vacío habla el giro igual que el resto: una cafetería con
            barra lee «el QR de la barra», no «de la mesa». Con la palabra
            tecleada, el día que la dueña la cambie esta pantalla se queda atrás
            —y es la primera que ve un cliente—. */}
        <Vacio
          icono={<QrCode />}
          titulo={`Este portal se abre con el QR de ${voc.enFrase('unidad_servicio')}`}
          explicacion={`${voc.conDeterminante('cada', 'unidad_servicio')} tiene su código: al escanearlo, ${voc.enFrase('cliente')} ve la carta de este negocio, pide y pide ${voc.enFrase('orden')} desde su teléfono. El código lleva ${voc.enFrase('unidad_servicio')} dentro, así que sin él esta pantalla no sabe a cuál pertenece — y adivinarla sería mandarle ${voc.enFrase('orden')} a otro.`}
          accion={
            <Button asChild>
              <a href="/restaurante/mapa-de-mesas">
                Ver el mapa de {voc.plural('unidad_servicio')}
              </a>
            </Button>
          }
        />
      </main>
    );
  }

  const mesero = voc.singular('responsable');

  if (datos === null && (rechazo !== null || sinConexion)) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center p-(--espacio-4)">
        <ErrorDePantalla
          titulo={rechazo ?? `Sin internet. Llama a tu ${mesero}.`}
          queHacer={
            rechazo === null
              ? 'La carta se vuelve a pedir sola: en cuanto haya señal, aparece aquí.'
              : `Pídele a tu ${mesero} que te atienda en ${voc.enFrase('unidad_servicio')}.`
          }
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
        />
      </main>
    );
  }

  if (datos === null) {
    return (
      <main
        aria-busy="true"
        className="mx-auto flex w-full max-w-lg flex-col gap-(--espacio-4) p-(--espacio-4) pt-(--espacio-6)"
      >
        {/* La forma de lo que viene —nombre, mesa, secciones y la carta—, no una
            rueda: al llegar nada salta de sitio. */}
        <div className="flex flex-col gap-(--espacio-2)">
          <Esqueleto className="h-(--altura-control) w-2/3" />
          <Esqueleto className="h-4 w-24" />
        </div>
        <div className="flex gap-(--espacio-2)">
          <Esqueleto redondo className="h-[calc(var(--altura-control)*0.85)] w-24" />
          <Esqueleto redondo className="h-[calc(var(--altura-control)*0.85)] w-24" />
          <Esqueleto redondo className="h-[calc(var(--altura-control)*0.85)] w-24" />
        </div>
        <EsqueletoDeLista filas={8} />
      </main>
    );
  }

  const secciones = [...new Set(datos.menu.map((p) => p.seccion))];
  const unidad = voc.enFrase('unidad_servicio');

  const columnasDelMenu: readonly ColumnaDeTabla<ProductoDelMenu>[] = [
    { clave: 'platillo', titulo: voc.titulo('producto'), celda: (p) => p.nombre },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      celda: (p) => <Dinero centavos={Number(p.precioCentavos)} tamano="sm" />,
    },
  ];

  const columnasDeLaCuenta: readonly ColumnaDeTabla<LineaDeLaCuenta>[] = [
    {
      clave: 'platillo',
      titulo: voc.titulo('linea_orden'),
      celda: (linea) => (
        <span>
          <span className="font-numeros tabular-nums">{linea.cantidad} ×</span> {linea.nombre}
        </span>
      ),
    },
    {
      clave: 'importe',
      titulo: 'Importe',
      numerica: true,
      celda: (linea) => <Dinero centavos={Number(linea.totalCentavos)} tamano="sm" />,
    },
  ];

  // Lo que la pantalla no pudo refrescar: se queda lo último y se dice.
  const problema = rechazo ?? (sinConexion ? `Sin internet. Llama a tu ${mesero}.` : null);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col pb-[calc(var(--espacio-16)*3)]">
      <header className="flex flex-col gap-(--espacio-1) px-(--espacio-4) pt-(--espacio-6) pb-(--espacio-3)">
        <h1 className="text-2xl font-semibold text-balance">{datos.negocio.nombre}</h1>
        {/* «Mesa» en un restaurante, «estación» en una estética, «bahía» en un
            taller. El sustantivo sale del giro del negocio, no de esta línea. */}
        <p className="text-sm text-texto-sutil">
          {voc.conArticulo('unidad_servicio')}{' '}
          <span className="font-numeros font-semibold text-texto">{datos.mesa.numero}</span>
        </p>
      </header>

      {/* Las secciones, pegadas arriba: la carta se recorre saltando. */}
      {secciones.length > 1 && (
        <BarraFija className="px-(--espacio-4) py-(--espacio-2)">
          <nav
            aria-label="Secciones de la carta"
            className="flex gap-(--espacio-2) overflow-x-auto"
          >
            {secciones.map((seccion, indice) => (
              <Button
                key={seccion}
                asChild
                variant="outline"
                size="sm"
                className="rounded-full capitalize"
              >
                <a href={`#${anclaDe(indice)}`}>{seccion}</a>
              </Button>
            ))}
          </nav>
        </BarraFija>
      )}

      <div className="flex flex-col gap-(--espacio-6) px-(--espacio-4) pt-(--espacio-3)">
        {problema !== null && (
          <Aviso tono="atencion" titulo={problema}>
            Lo que ves es lo último que llegó.
          </Aviso>
        )}

        {!puedeSeguirPidiendo(datos) &&
          (datos.mesa.estado === 'cuenta_solicitada' ? (
            <Aviso tono="info" titulo={`Ya pediste ${voc.enFrase('orden')}.`}>
              Si falta algo, llama al {mesero}.
            </Aviso>
          ) : (
            <Aviso tono="info" titulo="Hoy no se pide desde aquí: pídele a quien te atiende." />
          ))}

        {enseñaCuenta(datos) && datos.cuenta !== null && (
          <section aria-labelledby="portal-cuenta" className="flex flex-col gap-(--espacio-2)">
            <h2 id="portal-cuenta" className="text-lg font-semibold">
              Tu {voc.singular('orden')}
            </h2>
            {/* Un recibo: el importe a la derecha y el total pegado abajo, bajo
                su columna, aunque la cuenta sea larga. */}
            <Tabla
              etiqueta={`${voc.titulo('linea_orden', true)} de ${voc.enFrase('orden')}`}
              columnas={columnasDeLaCuenta}
              filas={datos.cuenta.lineas}
              claveDe={(linea) => linea.id}
              alto="max-h-[50dvh]"
              pie={{
                platillo: 'Total',
                importe: <Dinero centavos={Number(datos.cuenta.totalCentavos)} tamano="lg" />,
              }}
            />
            <p className="text-sm text-texto-sutil">
              Se paga en {unidad}. Desde aquí sólo se pide.
            </p>
          </section>
        )}

        {datos.menu.length === 0 ? (
          <Vacio
            icono={<UtensilsCrossed />}
            titulo={`Todavía no hay ${voc.plural('producto')} en la carta.`}
            explicacion={`Pídele la carta a tu ${mesero}: desde aquí se le avisa con el botón de abajo.`}
          />
        ) : (
          secciones.map((seccion, indice) => (
            <section
              key={seccion}
              id={anclaDe(indice)}
              aria-labelledby={`${anclaDe(indice)}-titulo`}
              className="flex scroll-mt-(--espacio-16) flex-col gap-(--espacio-2)"
            >
              <h2 id={`${anclaDe(indice)}-titulo`} className="text-lg font-semibold capitalize">
                {seccion}
              </h2>
              <Tabla
                etiqueta={seccion}
                columnas={columnasDelMenu}
                filas={datos.menu.filter((producto) => producto.seccion === seccion)}
                claveDe={(producto) => producto.id}
                alto="max-h-none"
              />
            </section>
          ))
        )}
      </div>

      {/* LA ATENCIÓN · abajo y fija, al alcance del pulgar en cualquier punto de la
          carta. La respuesta sale aquí mismo, donde está el dedo. */}
      <Superficie
        como="aside"
        nivel={3}
        relleno={3}
        aria-label={`Atención en ${unidad}`}
        className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg flex-col gap-(--espacio-2) rounded-b-none pb-[max(var(--espacio-3),env(safe-area-inset-bottom))]"
      >
        {aviso !== null && <Aviso tono={aviso.tono} titulo={aviso.texto} />}
        <div className="grid grid-cols-2 gap-(--espacio-2)">
          <Button
            size="lg"
            className="h-auto min-h-[calc(var(--altura-control)*1.6)] flex-col gap-(--espacio-1) py-(--espacio-2) text-base whitespace-normal"
            disabled={enviando !== null}
            cargando={enviando === 'cuenta'}
            onClick={() => {
              solicitar('cuenta');
            }}
          >
            {enviando === 'cuenta' ? null : <ReceiptText aria-hidden="true" />}
            Pedir {voc.enFrase('orden')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-auto min-h-[calc(var(--altura-control)*1.6)] flex-col gap-(--espacio-1) py-(--espacio-2) text-base whitespace-normal"
            disabled={enviando !== null}
            cargando={enviando === 'mesero'}
            onClick={() => {
              solicitar('mesero');
            }}
          >
            {enviando === 'mesero' ? null : <BellRing aria-hidden="true" />}
            Llamar al {mesero}
          </Button>
        </div>
      </Superficie>
    </main>
  );
}
