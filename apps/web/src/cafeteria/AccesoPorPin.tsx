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
 * PANTALLA · cafeteria · acceso-por-pin
 *
 * Identificar quién está operando y arrancar su presencia en el turno. 6-12
 * veces al día, entre dos o tres personas. Primero las tarjetas; el teclado
 * aparece DONDE estaban ellas. Jerarquía: tarjetas, teclado y nada más.
 *
 * ── Idéntica en comportamiento a la de `restaurante` ─────────────────────
 * Mismo hash —Argon2id, en el servidor—, mismo bloqueo por intentos, mismas
 * tarjetas con cara y color. El documento lo cita y no lo vuelve a describir;
 * aquí tampoco se repite el porqué: está en `restaurante/04-INTERFAZ.md`.
 *
 * ── Y aun así es un archivo aparte, no una reutilización ─────────────────
 * Porque los dos deltas son ESTRUCTURA, no configuración: ni el tamaño de las
 * tarjetas ni la presencia del turno caben en las props de la pantalla del
 * restaurante, y editarla para que cupieran tocaría algo ya entregado. Cuando
 * el armazón común se extraiga, esto conserva su rejilla y su presencia y el
 * teclado pasa a ser de los dos: eso es una línea del `FILE-MAP.md`.
 *
 * ── Delta 1 · las tarjetas son el doble de grandes ───────────────────────
 * Porque son dos o tres, no doce. Una rejilla de doce tarjetitas para tres
 * personas es una pantalla diseñada para otro negocio. En la terminal van
 * centradas —dos o tres, no una columna vacía a la derecha— y en teléfono cada
 * tarjeta es una fila de ancho completo —cara a la izquierda, nombre a la
 * derecha—, no media pantalla encogida.
 *
 * ── El color de la persona va en su CARA, no en la tarjeta ───────────────
 * La tarjeta es una `Superficie` como todas; lo que la hace de alguien es el
 * anillo de su color alrededor de las iniciales, el mismo que la identifica en
 * el resto. Así el anillo del foco y la sombra al pasar encima siguen leyéndose
 * igual que en cualquier otra tesela del sistema.
 *
 * ── La tarjeta SE CONVIERTE en el teclado ────────────────────────────────
 * «El teclado aparece donde estaban ellas»: la tarjeta tocada crece hasta ser
 * el panel (`VIAJE.fila`), y «No soy yo» la devuelve a su sitio. No es adorno:
 * en una barra compartida el movimiento dice, sin leer, de QUIÉN es el PIN que
 * se va a teclear. Dura lo que la perilla de movimiento diga, y cero con la
 * preferencia del sistema.
 *
 * ── Delta 2 · al entrar se abre la presencia del turno (F-248) ───────────
 * La hora de entrada es lo que después reparte el bote por horas. Es
 * invisible: nadie checa, nadie ve un reloj. Se dice en una línea —«Turno
 * iniciado, 7:28»— y desaparece. Y si esa escritura falla NO impide entrar:
 * quedarse fuera de la caja por un registro de propina sería cambiar una
 * molestia de reparto por un negocio parado. La línea lo dice, y el ajuste a
 * mano existe: `presencias_turno.origen` separa el PIN de la corrección.
 *
 * ── Por qué lee por `obtenerApi` y no por el puente ──────────────────────
 * Porque el puente resuelve el ámbito de UNA SESIÓN y aquí la sesión todavía
 * no existe. `GET /api/auth/empleados` devuelve nombre, puesto y color, nunca
 * el hash: el PIN se verifica en el servidor.
 *
 * ── Lo que NO va aquí, y lo que se recortó para caber ────────────────────
 * Ni registro, ni recuperación, ni «recordarme»: el documento los prohíbe.
 * Quedó fuera la fotografía real —el endpoint no la manda todavía y el campo
 * ya está aceptado—.
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
/** Lo que la línea del turno dura en pantalla antes de entregar el control. */
const PAUSA_DEL_SALUDO = 1200;
const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
/** Centradas y del mismo ancho: dos o tres tarjetas no dejan una columna vacía. */
const CLASES_REJILLA =
  'mx-auto flex w-full max-w-5xl flex-col gap-(--espacio-4) md:flex-row md:flex-wrap md:justify-center md:gap-(--espacio-6)';
const CLASES_CELDA = 'md:w-72 xl:w-80';
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
  /** El puesto en palabras de la casa: «Barista», «Encargada». */
  readonly etiqueta: string;
  /** Color estable de la persona, el mismo que la identifica en el resto. */
  readonly color: string;
  readonly foto?: string | null;
}

export interface AccesoPorPinProps {
  /** Cuando llega, la pantalla no consulta: es lo que usan las pruebas. */
  readonly empleadosIniciales?: readonly EmpleadoDeAcceso[];
  readonly onEntro?: (empleoId: string) => void;
}

/** La línea del turno: a qué hora se entró y si esa hora quedó escrita. */
interface Presencia {
  readonly hora: string;
  readonly registrada: boolean;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const letras = (partes[0]?.charAt(0) ?? '') + (partes[1]?.charAt(0) ?? '');
  return letras === '' ? '·' : letras.toUpperCase();
}

function mensajeDe(fallo: unknown, porDefecto: string): string {
  return fallo instanceof Error ? fallo.message : porDefecto;
}

/**
 * Abre la presencia del turno y devuelve la línea que se dice al entrar.
 *
 * El documento no nombra la ruta de escritura: se usa la convención
 * `/api/<dominio>/<verbo>`, al lado de la que ya existe para corregirla,
 * `/api/turno/presencia/ajustar`. No lanza nunca, a propósito: lo que decide
 * si se entra o no es el PIN, no este registro.
 */
async function abrirPresencia(empleoId: string): Promise<Presencia> {
  const hora = new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  try {
    // `quienEntraId` y no `empleoId`: un comando no acepta en su entrada un campo
    // que se llame como uno del ámbito —el ámbito sale de la sesión del servidor,
    // nunca del cliente— y aquí el dato es de quién son las horas, que no siempre
    // es quien teclea.
    await invocarComando('/api/turno/presencia/abrir', { quienEntraId: empleoId });
    return { hora, registrada: true };
  } catch {
    return { hora, registrada: false };
  }
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
  readonly presencia: Presencia | null;
  readonly className: string;
}

/**
 * Lo que impide entrar, y la línea del turno. Una sola banda: lo que impide
 * entrar AHORA manda sobre lo anterior. Y no vacía la pantalla: debajo sigue
 * habiendo con quién entrar.
 */
function AvisosDeAcceso({
  sinConexion,
  segundosBloqueo,
  error,
  presencia,
  className,
}: AvisosDeAccesoProps) {
  const banda = sinConexion ? (
    <Aviso tono="atencion" titulo="Sin conexión con el servidor.">
      No se puede entrar hasta que vuelva la red.
    </Aviso>
  ) : segundosBloqueo !== null ? (
    <Aviso tono="peligro" titulo={error ?? 'Demasiados intentos.'}>
      Vuelve a intentar en {segundosBloqueo} s.
    </Aviso>
  ) : error !== null ? (
    <Aviso tono="peligro" titulo={error} />
  ) : null;

  if (banda === null && presencia === null) return null;
  return (
    <div className={`flex w-full flex-col gap-(--espacio-3) ${className}`}>
      {banda}
      {presencia === null ? null : (
        <Aviso
          tono={presencia.registrada ? 'exito' : 'atencion'}
          titulo={`Turno iniciado, ${presencia.hora}`}
        >
          {presencia.registrada ? undefined : 'La hora no quedó registrada; se ajusta en el corte.'}
        </Aviso>
      )}
    </div>
  );
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

      {/* Puntos, nunca números: la pantalla mira a la fila. Quien no puede
          verlos recibe la cuenta en palabras. */}
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

export function AccesoPorPin({ empleadosIniciales, onEntro }: AccesoPorPinProps) {
  const [empleados, setEmpleados] = useState<readonly EmpleadoDeAcceso[] | null>(
    empleadosIniciales ?? null,
  );
  const [falloDeCarga, setFalloDeCarga] = useState<string | null>(null);
  // Cada lectura es un número: reintentar lo sube y el efecto lee otra vez. El
  // estado se limpia EN EL CLIC, no dentro del efecto.
  const [intento, setIntento] = useState(0);
  const [seleccionado, setSeleccionado] = useState<EmpleadoDeAcceso | null>(null);
  /** La tarjeta a la que vuelve el panel al decir «No soy yo». */
  const [deVuelta, setDeVuelta] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [intentos, setIntentos] = useState(INTENTOS);
  const [segundosBloqueo, setSegundosBloqueo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turno, setTurno] = useState<Presencia | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [sinConexion, setSinConexion] = useState(false);

  const hayBloqueo = segundosBloqueo !== null;
  const deshabilitado = enviando || hayBloqueo || sinConexion || turno !== null;

  useEffect(() => {
    if (empleadosIniciales !== undefined) return;
    const control = new AbortController();
    obtenerApi<{ usuarios: readonly EmpleadoDeAcceso[] }>('/api/auth/empleados', control.signal)
      .then((datos) => {
        setEmpleados(datos.usuarios);
      })
      .catch((fallo: unknown) => {
        if (!control.signal.aborted)
          setFalloDeCarga(mensajeDe(fallo, 'No se pudo leer la plantilla.'));
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

  // La línea del turno se dice y se va. Entregar el control en el mismo tick la
  // dejaría invisible, y es el único aviso de si la hora quedó registrada.
  useEffect(() => {
    if (turno === null || seleccionado === null) return;
    const id = setTimeout(() => {
      // Se RECARGA en vez de navegar con el enrutador, a propósito: el servidor
      // acaba de poner una cookie de sesión nueva, y una navegación de cliente
      // conservaría el árbol de React del turno anterior. La barra es una
      // terminal compartida: lo que dejó quien se va no puede seguir en
      // pantalla con el nombre de quien entra.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (onEntro === undefined) window.location.assign('/');
      else onEntro(seleccionado.id);
    }, PAUSA_DEL_SALUDO);
    return () => {
      clearTimeout(id);
    };
  }, [turno, seleccionado, onEntro]);

  const entrar = useCallback(
    async (empleoId: string, tecleado: string): Promise<void> => {
      setEnviando(true);
      try {
        await invocarComando('/api/auth/entrar', { empleoId, pin: tecleado });
        setPin('');
        setError(null);
        setIntentos(INTENTOS);
        setTurno(await abrirPresencia(empleoId));
      } catch (fallo: unknown) {
        setPin('');
        // El bloqueo que manda es el del servidor; el contador de aquí sólo
        // hace visible la espera que él impuso.
        const bloqueado = fallo instanceof ErrorApi && fallo.estado === HTTP_DEMASIADOS_INTENTOS;
        const restantes = bloqueado ? 0 : intentos - 1;
        setIntentos(restantes <= 0 ? INTENTOS : restantes);
        if (restantes <= 0) setSegundosBloqueo(SEGUNDOS_DE_BLOQUEO);
        const cuantos =
          restantes === 1 ? 'Te queda 1 intento.' : `Te quedan ${restantes} intentos.`;
        setError(
          restantes > 0 ? `PIN incorrecto. ${cuantos}` : mensajeDe(fallo, 'Demasiados intentos.'),
        );
      } finally {
        setEnviando(false);
      }
    },
    [intentos],
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
        setPin('');
        setError(null);
      });
    });
  }

  /** «No soy yo» y `Esc`: el panel vuelve a ser la tarjeta de donde salió. */
  const volver = useCallback((): void => {
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
  }, [seleccionado]);

  function pulsar(tecla: string): void {
    if (seleccionado === null) return;
    if (tecla === 'entrar') void entrar(seleccionado.id, pin);
    else if (tecla === 'borrar') setPin((previo) => previo.slice(0, -1));
    else {
      setError(null);
      setPin((previo) => (previo.length >= LARGO_PIN ? previo : previo + tecla));
    }
  }

  // Atajo de terminal. El efecto se remonta con cada dígito a propósito, para
  // que `Enter` lea el PIN de ESTE render y no el de cuando se eligió persona.
  useEffect(() => {
    if (seleccionado === null || deshabilitado) return;
    const alTeclear = (evento: KeyboardEvent) => {
      const tecla = evento.key;
      if (tecla === 'Escape') volver();
      else if (tecla === 'Enter' && pin.length === LARGO_PIN) void entrar(seleccionado.id, pin);
      else if (tecla === 'Backspace') setPin((previo) => previo.slice(0, -1));
      else if (tecla.length === 1 && tecla >= '0' && tecla <= '9') {
        setPin((previo) => (previo.length >= LARGO_PIN ? previo : previo + tecla));
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [seleccionado, pin, deshabilitado, entrar, volver]);

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
      presencia={turno}
      className={seleccionado === null ? 'mx-auto max-w-5xl' : ''}
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
          detalle={falloDeCarga}
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
          {Array.from({ length: 3 }, (_, indice) => (
            <Esqueleto key={indice} className={`h-32 w-full rounded-lg md:h-80 ${CLASES_CELDA}`} />
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
          explicacion="Estas tarjetas son la plantilla del negocio. Quien entra por aquí abre su presencia en el turno, y esas horas son las que reparten el bote de propina al cerrar. Sin nadie en ella no hay a quién atribuir una venta ni una hora."
          accion={
            <Button asChild>
              <a href="/configuracion">Dar de alta a la primera persona</a>
            </Button>
          }
          className="mx-auto max-w-lg"
        />
      );
    }
    return (
      <ul className={CLASES_REJILLA}>
        {empleados.map((empleado) => (
          <li key={empleado.id} className={CLASES_CELDA}>
            <Superficie
              como="button"
              type="button"
              interactiva
              relleno={4}
              style={deVuelta === empleado.id ? viaje(VIAJE.fila(empleado.id)) : undefined}
              onClick={(evento) => {
                elegir(empleado, evento.currentTarget);
              }}
              className="flex h-full w-full items-center gap-(--espacio-4) md:flex-col md:justify-center md:gap-(--espacio-3) md:p-(--espacio-8) md:text-center"
            >
              <Cara empleado={empleado} className="size-24 text-3xl md:size-40 md:text-display" />
              <span className="flex min-w-0 flex-col gap-(--espacio-1)">
                <span className="text-2xl font-semibold md:text-3xl">{empleado.nombre}</span>
                <span className="text-sm text-texto-sutil md:text-base">{empleado.etiqueta}</span>
              </span>
            </Superficie>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col gap-(--espacio-6) bg-fondo p-(--espacio-4) text-texto md:justify-center md:p-(--espacio-8)">
      <h1 className="text-center text-2xl font-bold md:text-3xl">¿Quién está operando?</h1>
      {seleccionado === null ? avisos : null}
      {cuerpo()}
    </main>
  );
}
