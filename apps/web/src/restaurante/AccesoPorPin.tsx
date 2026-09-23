'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@morphiqpos/ui/primitivas/avatar';
import { Button } from '@morphiqpos/ui/primitivas/button';
import {
  Aviso,
  ErrorDePantalla,
  Esqueleto,
  Superficie,
  VIAJE,
  Vacio,
  conTransicion,
  viaje,
} from '@morphiqpos/ui/sistema';
import { Circle, Delete, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

import { ErrorApi, invocarComando, obtenerApi } from '~/cliente/api';

/**
 * PANTALLA · restaurante · acceso-por-pin
 *
 * Identificar quién está operando, en dos segundos. 30-80 veces al día, todos
 * los roles. Primero las tarjetas; el teclado aparece DONDE estaban ellas.
 * Jerarquía: tarjetas, teclado y nada más. El dispositivo que manda es la
 * tableta del mesero; la PC de caja y el teléfono se derivan de ella.
 *
 * ── Por qué tarjetas con cara y no un campo de usuario ──────────
 * Porque el mesero no va a teclear su nombre ocho veces al día, y porque la
 * cara elimina el error de entrar con la sesión de otro — que es lo que rompe
 * la atribución de propinas.
 *
 * ── Por qué una rejilla de tarjetas iguales, y no filas ─────────
 * Porque en un restaurante son diez o quince personas —meseros, cajero,
 * cocina—, no dos o tres como en la cafetería. Reconocer una cara entre quince
 * pide verlas todas a la vez y del mismo tamaño: dos columnas en el teléfono,
 * tres en la tableta —las más grandes, porque es donde más se entra— y cuatro
 * en la PC, centradas.
 *
 * ── El color de la persona va en su CARA ────────────────────────
 * Es el mismo que después pinta el punto de las mesas que atiende. Va en el
 * anillo de sus iniciales y no en el borde de la tarjeta: la tarjeta es una
 * `Superficie` como todas, así el foco y el pulsado se leen igual que en
 * cualquier otra tesela del sistema.
 *
 * ── La tarjeta SE CONVIERTE en el teclado ───────────────────────
 * La tarjeta tocada crece hasta ser el panel del PIN (`VIAJE.fila`) y «No soy
 * yo» la devuelve a su sitio. En una tableta que pasa de mano en mano el
 * movimiento dice, sin leer, de QUIÉN es el PIN que se va a teclear. Dura lo que
 * la perilla de movimiento diga, y cero con la preferencia del sistema.
 *
 * ── Por qué el PIN no se manda solo al cuarto dígito ────────────
 * Porque un dedo que resbala mandaría un PIN equivocado sin que nadie lo
 * pidiera, y cada envío gasta uno de los intentos. Gastarlos lleva al bloqueo,
 * y un bloqueo a media comida deja la caja sin quién la opere.
 *
 * ── Por qué lee por `obtenerApi` y no por el puente ─────────────
 * Porque el puente resuelve el ámbito de UNA SESIÓN y aquí la sesión todavía no
 * existe. `GET /api/auth/empleados` es una de las dos rutas sin ámbito previo y
 * devuelve nombre, puesto y color, nunca el hash: el PIN se verifica en el
 * servidor, con Argon2id, en `POST /api/auth/entrar`.
 *
 * ── Lo que NO va ────────────────────────────────────────────────
 * Ni recuperación de PIN, ni registro, ni «recordarme»: el documento los
 * prohíbe. Tampoco el nombre del negocio en la cabecera —el documento pide
 * «tarjetas, teclado y nada más»—. El endpoint no manda fotografías todavía: la
 * tarjeta enseña las iniciales sobre el color de la persona y el campo `foto`
 * ya está aceptado.
 */

const LARGO_PIN = 4;
const INTENTOS = 4;
const SEGUNDOS_DE_BLOQUEO = 60;
/**
 * El 429 del servidor, que es quien MANDA sobre el bloqueo.
 *
 * No hay un código de comando para esto y no debe haberlo: el límite de
 * intentos lo aplica la capa HTTP antes de que exista comando alguno. El
 * contador de esta pantalla sólo hace visible la espera que el servidor ya
 * impuso; si se creyera a sí mismo, recargar la página borraría el bloqueo.
 */
const HTTP_DEMASIADOS_INTENTOS = 429;
const SIN_PLANTILLA = 'No se pudo leer la plantilla.';
/** Lo que se reserva mientras llega la plantilla: una sala típica, no una rueda. */
const TARJETAS_DE_ESPERA = 8;
const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const CLASES_REJILLA =
  'mx-auto grid w-full max-w-4xl grid-cols-2 gap-(--espacio-3) md:grid-cols-3 md:gap-(--espacio-6) xl:grid-cols-4';
const CLASES_TARJETA =
  'flex h-full w-full flex-col items-center gap-(--espacio-2) text-center md:gap-(--espacio-3) md:p-(--espacio-6)';
/**
 * En teléfono el teclado ES la pantalla: sin caja alrededor. De tableta para
 * arriba es un panel levantado en el hueco que dejaron las tarjetas.
 */
const CLASES_TECLADO =
  'mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-(--espacio-5) rounded-none border-0 bg-fondo p-0 shadow-0 ' +
  'md:max-w-md md:flex-none md:rounded-lg md:border md:bg-superficie md:p-(--espacio-6) md:shadow-2';

export interface EmpleadoDeAcceso {
  readonly id: string;
  readonly nombre: string;
  /** El puesto en palabras de la casa: «Mesero», «Cajera». */
  readonly etiqueta: string;
  /** Color estable de la persona, el mismo que pinta sus mesas en el mapa. */
  readonly color: string;
  readonly foto?: string | null;
}

export interface AccesoPorPinProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly empleadosIniciales?: readonly EmpleadoDeAcceso[];
  readonly onEntro?: (empleoId: string) => void;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const letras = (partes[0]?.charAt(0) ?? '') + (partes[1]?.charAt(0) ?? '');
  return letras === '' ? '·' : letras.toUpperCase();
}

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof Error ? fallo.message : porDefecto;
}

/** La cara: sus iniciales sobre un velo de su color, y el anillo del color entero. */
function Cara({
  empleado,
  className,
}: {
  readonly empleado: EmpleadoDeAcceso;
  readonly className: string;
}) {
  return (
    <Avatar aria-hidden className={`border-4 ${className}`} style={{ borderColor: empleado.color }}>
      {typeof empleado.foto === 'string' && <AvatarImage src={empleado.foto} alt="" />}
      <AvatarFallback
        className="font-bold text-texto"
        style={{ backgroundColor: `color-mix(in oklab, ${empleado.color} 16%, transparent)` }}
      >
        {iniciales(empleado.nombre)}
      </AvatarFallback>
    </Avatar>
  );
}

interface AvisosDeAccesoProps {
  readonly sinConexion: boolean;
  readonly segundosBloqueo: number | null;
  readonly error: string | null;
  /** Fuera del panel se alinea con la rejilla; dentro, ocupa el ancho del panel. */
  readonly className: string;
}

/**
 * Una sola banda: lo que impide entrar AHORA manda sobre lo anterior. Y no
 * vacía la pantalla: debajo sigue habiendo con quién entrar.
 */
function AvisosDeAcceso({ sinConexion, segundosBloqueo, error, className }: AvisosDeAccesoProps) {
  if (sinConexion) {
    return (
      <Aviso tono="atencion" titulo="Sin conexión con el servidor." className={className}>
        No se puede entrar hasta que vuelva la red.
      </Aviso>
    );
  }
  if (segundosBloqueo !== null) {
    return (
      <Aviso tono="peligro" titulo={error ?? 'Demasiados intentos.'} className={className}>
        Vuelve a intentar en {segundosBloqueo} s.
      </Aviso>
    );
  }
  if (error !== null) return <Aviso tono="peligro" titulo={error} className={className} />;
  return null;
}

interface TecladoNumericoProps {
  readonly empleado: EmpleadoDeAcceso;
  readonly digitos: number;
  readonly deshabilitado: boolean;
  readonly enviando: boolean;
  /** Los avisos van DENTRO del panel: es donde están los ojos al teclear. */
  readonly avisos: ReactNode;
  /** Un dígito, `borrar` o `entrar`: qué hacer con la tecla lo sabe el padre. */
  readonly onTecla: (tecla: string) => void;
  readonly onVolver: () => void;
}

function TecladoNumerico({
  empleado,
  digitos,
  deshabilitado,
  enviando,
  avisos,
  onTecla,
  onVolver,
}: TecladoNumericoProps) {
  const teclas = [
    ...DIGITOS.map((digito) => ({
      texto: digito,
      valor: digito,
      tipo: 'outline' as const,
      apagada: false,
    })),
    { texto: 'Borrar', valor: 'borrar', tipo: 'ghost', apagada: digitos === 0 },
    { texto: '0', valor: '0', tipo: 'outline', apagada: false },
    { texto: 'Entrar', valor: 'entrar', tipo: 'default', apagada: digitos < LARGO_PIN },
  ] as const;

  return (
    <Superficie
      como="section"
      nivel={2}
      relleno={6}
      aria-label={`Teclear el PIN de ${empleado.nombre}`}
      style={viaje(VIAJE.fila(empleado.id))}
      className={CLASES_TECLADO}
    >
      <div className="flex items-center gap-(--espacio-3)">
        <Cara empleado={empleado} className="size-20 text-xl" />
        <p className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xl font-semibold">{empleado.nombre}</span>
          <span className="text-sm text-texto-sutil">{empleado.etiqueta}</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onVolver}>
          No soy yo
        </Button>
      </div>

      {avisos}

      {/* Puntos, nunca números: la pantalla está de cara al comedor. Quien
          no puede verlos recibe la cuenta en palabras. */}
      <p aria-live="polite" className="flex justify-center gap-(--espacio-4) py-(--espacio-2)">
        <span className="sr-only">
          {digitos} de {LARGO_PIN} dígitos tecleados
        </span>
        {Array.from({ length: LARGO_PIN }, (_, indice) => (
          <Circle
            key={indice}
            aria-hidden
            className={
              indice < digitos ? 'size-5 fill-primario text-primario' : 'size-5 text-borde-fuerte'
            }
          />
        ))}
      </p>

      <div className="grid grid-cols-3 gap-(--espacio-3)">
        {teclas.map((tecla) => (
          <Button
            key={tecla.valor}
            type="button"
            variant={tecla.tipo}
            disabled={deshabilitado || tecla.apagada}
            cargando={tecla.valor === 'entrar' && enviando}
            className={`h-20 md:h-24 ${tecla.valor.length === 1 ? 'font-numeros text-2xl font-semibold' : 'text-base'}`}
            onClick={() => {
              onTecla(tecla.valor);
            }}
          >
            {tecla.valor === 'borrar' ? <Delete aria-hidden /> : null}
            {tecla.texto}
          </Button>
        ))}
      </div>
    </Superficie>
  );
}

interface RejillaDeTarjetasProps {
  readonly empleados: readonly EmpleadoDeAcceso[];
  /** La tarjeta a la que vuelve el panel: lleva el nombre del viaje de regreso. */
  readonly deVuelta: string | null;
  readonly onElegir: (empleado: EmpleadoDeAcceso, tarjeta: HTMLElement) => void;
}

/** Foto redonda, nombre y puesto debajo; todas del mismo tamaño. */
function RejillaDeTarjetas({ empleados, deVuelta, onElegir }: RejillaDeTarjetasProps) {
  return (
    <ul className={CLASES_REJILLA}>
      {empleados.map((empleado) => (
        <li key={empleado.id}>
          <Superficie
            como="button"
            type="button"
            interactiva
            relleno={4}
            style={deVuelta === empleado.id ? viaje(VIAJE.fila(empleado.id)) : undefined}
            onClick={(evento) => {
              onElegir(empleado, evento.currentTarget);
            }}
            className={CLASES_TARJETA}
          >
            <Cara empleado={empleado} className="size-20 text-2xl md:size-28 md:text-3xl" />
            <span className="flex w-full min-w-0 flex-col gap-(--espacio-1)">
              <span className="text-base leading-tight font-semibold text-balance md:text-lg">
                {empleado.nombre}
              </span>
              <span className="text-xs text-texto-sutil md:text-sm">{empleado.etiqueta}</span>
            </span>
          </Superficie>
        </li>
      ))}
    </ul>
  );
}

export function AccesoPorPin({ empleadosIniciales, onEntro }: AccesoPorPinProps) {
  const [empleados, setEmpleados] = useState<readonly EmpleadoDeAcceso[] | null>(
    empleadosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [seleccionado, setSeleccionado] = useState<EmpleadoDeAcceso | null>(null);
  const [deVuelta, setDeVuelta] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [intentos, setIntentos] = useState(INTENTOS);
  const [segundosBloqueo, setSegundosBloqueo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);

  const hayBloqueo = segundosBloqueo !== null;
  const deshabilitado = enviando || hayBloqueo || sinConexion;

  useEffect(() => {
    if (empleadosIniciales !== undefined) return;
    const control = new AbortController();
    obtenerApi<{ usuarios: readonly EmpleadoDeAcceso[] }>('/api/auth/empleados', control.signal)
      .then((datos) => {
        setEmpleados(datos.usuarios);
      })
      .catch((fallo: unknown) => {
        if (!control.signal.aborted) setFalloDeCarga(mensajeDe(fallo, SIN_PLANTILLA));
      });
    return () => {
      control.abort();
    };
  }, [empleadosIniciales, intento]);

  useEffect(() => {
    const actualizar = () => {
      setSinConexion(!navigator.onLine);
    };
    actualizar();
    for (const evento of ['online', 'offline']) window.addEventListener(evento, actualizar);
    return () => {
      for (const evento of ['online', 'offline']) window.removeEventListener(evento, actualizar);
    };
  }, []);

  useEffect(() => {
    if (!hayBloqueo) return;
    const id = setInterval(() => {
      setSegundosBloqueo((quedan) => (quedan === null || quedan <= 1 ? null : quedan - 1));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [hayBloqueo]);

  const entrar = useCallback(
    async (empleoId: string, tecleado: string): Promise<void> => {
      setEnviando(true);
      try {
        await invocarComando('/api/auth/entrar', { empleoId, pin: tecleado });
        setIntentos(INTENTOS);
        setError(null);
        // A dónde va cada rol lo decide el armazón: aquí sólo se resuelve QUIÉN.
        //
        // Y se RECARGA la página en vez de navegar con el enrutador, a
        // propósito: el servidor acaba de poner una cookie de sesión nueva, y
        // una navegación de cliente conservaría el árbol de React del turno
        // anterior. En una terminal compartida eso significa que lo tecleado
        // por quien se acaba de ir sigue en pantalla con el nombre del que
        // entra. La recarga es lo que garantiza que no quede nada suyo.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (onEntro === undefined) window.location.assign('/');
        else onEntro(empleoId);
      } catch (fallo: unknown) {
        // El bloqueo que manda es el del servidor; el contador de aquí sólo
        // hace visible la espera que él impuso.
        const limite = fallo instanceof ErrorApi && fallo.estado === HTTP_DEMASIADOS_INTENTOS;
        const restantes = limite ? 0 : intentos - 1;
        setIntentos(restantes <= 0 ? INTENTOS : restantes);
        if (restantes <= 0) setSegundosBloqueo(SEGUNDOS_DE_BLOQUEO);
        const cuantos =
          restantes === 1 ? 'Te queda 1 intento.' : `Te quedan ${restantes} intentos.`;
        setError(
          restantes > 0 ? `PIN incorrecto. ${cuantos}` : mensajeDe(fallo, 'Demasiados intentos.'),
        );
      } finally {
        setPin('');
        setEnviando(false);
      }
    },
    [intentos, onEntro],
  );

  /**
   * La tarjeta crece hasta ser el teclado. Antes del cambio la TARJETA lleva el
   * nombre del viaje; dentro del cambio se lo quita y lo lleva el PANEL, y
   * `flushSync` hace que el navegador fotografíe el estado nuevo ya pintado.
   */
  function elegir(empleado: EmpleadoDeAcceso, tarjeta: HTMLElement): void {
    tarjeta.style.viewTransitionName = VIAJE.fila(empleado.id);
    void conTransicion(() => {
      flushSync(() => {
        tarjeta.style.viewTransitionName = '';
        setSeleccionado(empleado);
        setError(null);
      });
    });
  }

  /** «No soy yo» y `Esc`: el panel vuelve a ser la tarjeta de donde salió. */
  function volver(): void {
    const deQuien = seleccionado?.id ?? null;
    void conTransicion(() => {
      flushSync(() => {
        setDeVuelta(deQuien);
        setSeleccionado(null);
        setPin('');
      });
    }).finally(() => {
      setDeVuelta(null);
    });
  }

  function pulsar(tecla: string): void {
    if (seleccionado === null || deshabilitado) return;
    if (tecla === 'entrar' && pin.length === LARGO_PIN) void entrar(seleccionado.id, pin);
    else if (tecla === 'borrar') setPin((previo) => previo.slice(0, -1));
    else if (tecla.length === 1 && tecla >= '0' && tecla <= '9') {
      setError(null);
      setPin((previo) => (previo.length >= LARGO_PIN ? previo : previo + tecla));
    }
  }

  // Atajo de PC: el teclado físico pulsa las mismas teclas de la pantalla. Sin
  // arreglo de dependencias a propósito: así lee el PIN de ESTE render.
  useEffect(() => {
    if (seleccionado === null) return;
    const alTeclear = (evento: KeyboardEvent) => {
      // Con el foco en una tecla de la pantalla, `Enter` ya la pulsa: atenderlo
      // otra vez aquí mandaría dos peticiones con el mismo PIN.
      const enTecla = document.activeElement?.tagName === 'BUTTON';
      if (evento.key === 'Escape') volver();
      else if (evento.key === 'Enter' && !enTecla) pulsar('entrar');
      else if (evento.key === 'Backspace') pulsar('borrar');
      else pulsar(evento.key);
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  });

  function reintentar(): void {
    setFalloDeCarga(null);
    setEmpleados(null);
    setIntento((previo) => previo + 1);
  }

  const avisos = (
    <AvisosDeAcceso
      sinConexion={sinConexion}
      segundosBloqueo={segundosBloqueo}
      error={error}
      className="w-full"
    />
  );

  function cuerpo(): ReactNode {
    if (seleccionado !== null) {
      return (
        <TecladoNumerico
          empleado={seleccionado}
          digitos={pin.length}
          deshabilitado={deshabilitado}
          enviando={enviando}
          avisos={avisos}
          onTecla={pulsar}
          onVolver={volver}
        />
      );
    }
    if (falloDeCarga !== null) {
      return (
        <ErrorDePantalla
          titulo="No se pudo leer la plantilla"
          queHacer="Sin saber quién trabaja aquí no hay tarjeta que tocar ni PIN que teclear. Revisa la conexión y vuelve a intentarlo."
          {...(falloDeCarga === SIN_PLANTILLA ? {} : { detalle: falloDeCarga })}
          reintentar={<Button onClick={reintentar}>Volver a intentar</Button>}
          className="mx-auto w-full max-w-lg"
        />
      );
    }
    if (empleados === null) {
      // La forma de las tarjetas, no una rueda: al llegar nadie salta de sitio.
      return (
        <div
          role="status"
          aria-busy="true"
          aria-label="Leyendo quién puede entrar"
          className={CLASES_REJILLA}
        >
          {Array.from({ length: TARJETAS_DE_ESPERA }, (_, indice) => (
            <Esqueleto key={indice} className="h-44 w-full rounded-lg md:h-60" />
          ))}
        </div>
      );
    }
    if (empleados.length === 0) {
      // El documento dice que este estado no existe: siempre hay alguien. Si
      // aparece no es un vacío, es un despliegue sin plantilla.
      return (
        <Vacio
          icono={<UsersRound />}
          titulo="Todavía no hay nadie dado de alta."
          explicacion="Estas tarjetas son la plantilla del negocio: cada persona con un puesto activo y un PIN aparece aquí. Sin nadie en ella no hay a quién atribuir una venta ni una propina."
          accion={
            <Button asChild>
              <a href="/configuracion">Dar de alta a la primera persona</a>
            </Button>
          }
          className="mx-auto max-w-lg"
        />
      );
    }
    return <RejillaDeTarjetas empleados={empleados} deVuelta={deVuelta} onElegir={elegir} />;
  }

  return (
    <main className="flex min-h-dvh flex-col gap-(--espacio-6) bg-fondo p-(--espacio-4) text-texto md:p-(--espacio-8)">
      <h1 className="text-center text-2xl font-bold md:text-3xl">¿Quién está operando?</h1>
      {seleccionado === null ? (
        <AvisosDeAcceso
          sinConexion={sinConexion}
          segundosBloqueo={segundosBloqueo}
          error={error}
          className="mx-auto w-full max-w-4xl"
        />
      ) : null}
      {cuerpo()}
    </main>
  );
}
