'use client';

import { Alert, AlertDescription } from '@morphiqpos/ui/primitivas/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@morphiqpos/ui/primitivas/avatar';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useCallback, useEffect, useState } from 'react';

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
 * personas es una pantalla diseñada para otro negocio. En teléfono cada
 * tarjeta es una fila de ancho completo —cara a la izquierda, nombre a la
 * derecha—, no media pantalla encogida.
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
 * ya está aceptado— y el botón de reintentar la lectura de la plantilla, que
 * hoy se reintenta recargando.
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
const CLASES_REJILLA =
  'mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 xl:grid-cols-3';
const CLASES_TARJETA =
  'flex w-full items-center gap-4 rounded-2xl border-2 bg-card p-4 text-left ' +
  'text-card-foreground shadow-1 transition-colors hover:bg-accent hover:text-accent-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'md:flex-col md:justify-center md:gap-3 md:p-8 md:text-center';

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
async function abrirPresencia(empleoId: string): Promise<string> {
  const hora = new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  try {
    await invocarComando('/api/turno/presencia/abrir', { empleoId });
    return `Turno iniciado, ${hora}`;
  } catch {
    return `Turno iniciado, ${hora} · la hora no quedó registrada; se ajusta en el corte.`;
  }
}

interface TecladoNumericoProps {
  readonly empleado: EmpleadoDeAcceso;
  readonly digitos: number;
  readonly deshabilitado: boolean;
  /** Un dígito, `borrar` o `entrar`: qué hacer con la tecla lo sabe el padre. */
  readonly onTecla: (tecla: string) => void;
  readonly onVolver: () => void;
}

function TecladoNumerico({
  empleado,
  digitos,
  deshabilitado,
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

  // En teléfono ocupa la pantalla entera; de tablet para arriba es un panel
  // centrado en el hueco que dejaron las tarjetas.
  return (
    <section
      aria-label={`Teclear el PIN de ${empleado.nombre}`}
      className={
        'mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 md:max-w-md ' +
        'md:flex-none md:rounded-2xl md:border md:border-border md:bg-card md:p-6 md:shadow-2'
      }
    >
      <div className="flex items-center gap-3">
        <Avatar className="size-20 border-2 text-xl" style={{ borderColor: empleado.color }}>
          {typeof empleado.foto === 'string' && <AvatarImage src={empleado.foto} alt="" />}
          <AvatarFallback className="font-bold">{iniciales(empleado.nombre)}</AvatarFallback>
        </Avatar>
        <p className="flex-1 text-lg font-semibold">
          {empleado.nombre}
          <span className="block text-sm font-normal text-muted-foreground">
            {empleado.etiqueta}
          </span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onVolver}>
          No soy yo
        </Button>
      </div>

      {/* Puntos, nunca números: la pantalla mira a la fila. Quien no puede
          verlos recibe la cuenta en palabras. */}
      <p aria-live="polite" className="text-center text-4xl tracking-[0.4em] text-primary">
        <span className="sr-only">{digitos} de 4 dígitos tecleados</span>
        <span aria-hidden>{'•'.repeat(digitos) + '◦'.repeat(LARGO_PIN - digitos)}</span>
      </p>

      <div className="grid grid-cols-3 gap-3">
        {teclas.map((tecla) => (
          <Button
            key={tecla.valor}
            type="button"
            variant={tecla.tipo}
            disabled={deshabilitado || tecla.apagada}
            className={`h-20 md:h-24 ${tecla.valor.length === 1 ? 'text-2xl font-semibold' : ''}`}
            onClick={() => {
              onTecla(tecla.valor);
            }}
          >
            {tecla.texto}
          </Button>
        ))}
      </div>
    </section>
  );
}

export function AccesoPorPin({ empleadosIniciales, onEntro }: AccesoPorPinProps) {
  const [empleados, setEmpleados] = useState<readonly EmpleadoDeAcceso[] | null>(
    empleadosIniciales ?? null,
  );
  const [seleccionado, setSeleccionado] = useState<EmpleadoDeAcceso | null>(null);
  const [pin, setPin] = useState('');
  const [intentos, setIntentos] = useState(INTENTOS);
  const [segundosBloqueo, setSegundosBloqueo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turno, setTurno] = useState<string | null>(null);
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
        if (!control.signal.aborted) setError(mensajeDe(fallo, 'No se pudo leer la plantilla.'));
      });
    return () => {
      control.abort();
    };
  }, [empleadosIniciales]);

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
      if (tecla === 'Escape') setSeleccionado(null);
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
  }, [seleccionado, pin, deshabilitado, entrar]);

  // Una sola banda: lo que impide entrar AHORA manda sobre lo anterior.
  const banda = sinConexion
    ? 'Sin conexión con el servidor. No se puede entrar hasta que vuelva la red.'
    : hayBloqueo
      ? `${error ?? 'Demasiados intentos.'} Vuelve a intentar en ${segundosBloqueo} s.`
      : error;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-background p-4 text-foreground md:p-8">
      <h1 className="mx-auto text-xl font-bold md:text-2xl">¿Quién está operando?</h1>

      {/* La banda no vacía la pantalla: debajo sigue habiendo con quién entrar. */}
      {banda !== null && (
        <Alert variant="destructive" className="mx-auto max-w-5xl border-destructive">
          <AlertDescription className="text-foreground">{banda}</AlertDescription>
        </Alert>
      )}

      {turno !== null && (
        <p
          aria-live="polite"
          className="mx-auto max-w-5xl rounded-md border border-border bg-success/15 px-4 py-2"
        >
          {turno}
        </p>
      )}

      {empleados === null && error === null && (
        <div className={CLASES_REJILLA} aria-hidden>
          {Array.from({ length: 3 }, (_, indice) => (
            <Skeleton key={indice} className="h-32 w-full rounded-2xl md:h-80" />
          ))}
        </div>
      )}

      {/* El documento dice que este estado no existe: siempre hay alguien. Si
          aparece no es un vacío, es un despliegue sin plantilla. */}
      {empleados?.length === 0 && (
        <section className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold">Todavía no hay nadie dado de alta.</p>
          <p className="text-sm text-muted-foreground">
            Estas tarjetas son la plantilla del negocio. Quien entra por aquí abre su presencia en
            el turno, y esas horas son las que reparten el bote de propina al cerrar. Sin nadie en
            ella no hay a quién atribuir una venta ni una hora.
          </p>
          <Button asChild>
            <a href="/configuracion">Dar de alta a la primera persona</a>
          </Button>
        </section>
      )}

      {seleccionado === null && empleados !== null && empleados.length > 0 && (
        <ul className={CLASES_REJILLA}>
          {empleados.map((empleado) => (
            <li key={empleado.id}>
              {/* El borde lleva el color; el nombre y el puesto van en letra. */}
              <button
                type="button"
                className={CLASES_TARJETA}
                style={{ borderColor: empleado.color }}
                onClick={() => {
                  setSeleccionado(empleado);
                  setPin('');
                  setError(null);
                }}
              >
                <Avatar className="size-24 text-3xl md:size-40 md:text-5xl">
                  {typeof empleado.foto === 'string' && <AvatarImage src={empleado.foto} alt="" />}
                  <AvatarFallback className="font-bold">
                    {iniciales(empleado.nombre)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex flex-col gap-1">
                  <span className="text-2xl font-semibold md:text-3xl">{empleado.nombre}</span>
                  <span className="text-sm text-muted-foreground md:text-base">
                    {empleado.etiqueta}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {seleccionado !== null && (
        <TecladoNumerico
          empleado={seleccionado}
          digitos={pin.length}
          deshabilitado={deshabilitado}
          onTecla={pulsar}
          onVolver={() => {
            setSeleccionado(null);
            setPin('');
          }}
        />
      )}
    </main>
  );
}
