'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@morphiqpos/ui/primitivas/avatar';
import { Button } from '@morphiqpos/ui/primitivas/button';
import { Skeleton } from '@morphiqpos/ui/primitivas/skeleton';
import { useCallback, useEffect, useState } from 'react';

import { ErrorApi, invocarComando, obtenerApi } from '~/cliente/api';

/**
 * PANTALLA · restaurante · acceso-por-pin
 *
 * Identificar quién está operando, en dos segundos. 30-80 veces al día, todos
 * los roles. Primero las tarjetas; el teclado aparece DONDE estaban ellas.
 *
 * ── Por qué tarjetas con cara y no un campo de usuario ──────────
 * Porque el mesero no va a teclear su nombre ocho veces al día, y porque la
 * cara elimina el error de entrar con la sesión de otro — que es lo que rompe
 * la atribución de propinas. El color de la tarjeta es el mismo que después
 * pinta el punto de las mesas que atiende.
 *
 * ── Por qué el PIN no se manda solo al cuarto dígito ────────────
 * Porque un dedo que resbala mandaría un PIN equivocado sin que nadie lo
 * pidiera, y cada envío gasta uno de los tres intentos. Gastarlos lleva al
 * bloqueo, y un bloqueo a media comida deja la caja sin quién la opere.
 *
 * ── Por qué lee por `obtenerApi` y no por el puente ─────────────
 * Porque el puente resuelve el ámbito de UNA SESIÓN y aquí la sesión todavía no
 * existe. `GET /api/auth/empleados` es una de las dos rutas sin ámbito previo y
 * devuelve nombre, puesto y color, nunca el hash: el PIN se verifica en el
 * servidor, con Argon2id, en `POST /api/auth/entrar`.
 *
 * ── Lo que NO va, y lo que se recortó para caber en 300 líneas ──
 * Ni recuperación de PIN, ni registro, ni «recordarme»: el documento los
 * prohíbe. Quedaron fuera el nombre del negocio en la cabecera —el documento
 * pide «tarjetas, teclado y nada más»—, el botón de reintentar la lectura de la
 * plantilla —hoy se reintenta recargando— y partir el teclado en su propio
 * componente. El endpoint tampoco manda fotografías todavía: la tarjeta enseña
 * las iniciales sobre el color de la persona y el campo `foto` ya está aceptado.
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
const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const CLASES_REJILLA =
  'mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 xl:grid-cols-4';
const CLASES_TARJETA =
  'flex w-full flex-col items-center gap-2 rounded-xl border-2 bg-card p-4 text-card-foreground ' +
  'shadow-1 transition-colors hover:bg-accent hover:text-accent-foreground md:gap-3 md:p-6 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const CLASES_TECLADO =
  'mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 md:max-w-md md:flex-none ' +
  'md:rounded-xl md:border md:border-border md:bg-card md:p-6 md:shadow-2';
const CLASES_BANDA =
  'mx-auto w-full max-w-4xl rounded-md border border-destructive bg-destructive/15 p-3 text-sm';

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

export function AccesoPorPin({ empleadosIniciales, onEntro }: AccesoPorPinProps) {
  const [empleados, setEmpleados] = useState<readonly EmpleadoDeAcceso[] | null>(
    empleadosIniciales ?? null,
  );
  const [seleccionado, setSeleccionado] = useState<EmpleadoDeAcceso | null>(null);
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
        const cuantos = restantes === 1 ? 'Queda 1 intento.' : `Quedan ${restantes} intentos.`;
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

  function volver(): void {
    setSeleccionado(null);
    setPin('');
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

  // Una sola banda: lo que impide entrar AHORA manda sobre lo anterior.
  const banda = sinConexion
    ? 'Sin conexión con el servidor. No se puede entrar hasta que vuelva la red.'
    : hayBloqueo
      ? `${error ?? 'Demasiados intentos.'} Vuelve a intentar en ${segundosBloqueo} s.`
      : error;

  const teclas = [
    ...DIGITOS.map((digito) => ({
      texto: digito,
      valor: digito,
      tipo: 'outline' as const,
      apagada: false,
    })),
    { texto: 'Borrar', valor: 'borrar', tipo: 'ghost', apagada: pin === '' },
    { texto: '0', valor: '0', tipo: 'outline', apagada: false },
    { texto: 'Entrar', valor: 'entrar', tipo: 'default', apagada: pin.length < LARGO_PIN },
  ] as const;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-background p-4 text-foreground md:p-8">
      <h1 className="mx-auto text-2xl font-bold md:text-3xl">¿Quién está operando?</h1>

      {/* La banda no vacía la pantalla: debajo sigue habiendo con quién entrar. */}
      {banda !== null && (
        <p role="alert" className={CLASES_BANDA}>
          {banda}
        </p>
      )}

      {empleados === null && error === null && (
        <div className={CLASES_REJILLA} aria-hidden>
          {Array.from({ length: 8 }, (_, indice) => (
            <Skeleton key={indice} className="h-40 w-full rounded-xl md:h-52" />
          ))}
        </div>
      )}

      {/* El documento dice que este estado no existe: siempre hay alguien. Si
          aparece no es un vacío, es un despliegue sin plantilla. */}
      {empleados?.length === 0 && (
        <section className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold">Todavía no hay nadie dado de alta.</p>
          <p className="text-sm text-muted-foreground">
            Estas tarjetas son la plantilla del negocio: cada persona con un puesto activo y un PIN
            aparece aquí. Sin nadie en ella no hay a quién atribuir una venta ni una propina.
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
                  setError(null);
                }}
              >
                <Avatar className="size-20 text-2xl md:size-28 md:text-3xl">
                  {typeof empleado.foto === 'string' && <AvatarImage src={empleado.foto} alt="" />}
                  <AvatarFallback className="font-bold">
                    {iniciales(empleado.nombre)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-base font-semibold md:text-lg">{empleado.nombre}</span>
                <span className="text-xs text-muted-foreground md:text-sm">
                  {empleado.etiqueta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* En teléfono el teclado ocupa la pantalla entera; de tablet para arriba
          es un panel centrado en el hueco que dejaron las tarjetas. */}
      {seleccionado !== null && (
        <section aria-label={`Teclear el PIN de ${seleccionado.nombre}`} className={CLASES_TECLADO}>
          <div
            className="flex items-center gap-3 border-b-4 pb-3"
            style={{ borderColor: seleccionado.color }}
          >
            <p className="flex-1 text-xl font-semibold">
              {seleccionado.nombre}
              <span className="block text-sm font-normal text-muted-foreground">
                {seleccionado.etiqueta}
              </span>
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={volver}>
              No soy yo
            </Button>
          </div>

          {/* Puntos, nunca números: la pantalla está de cara al comedor. Quien
              no puede verlos recibe la cuenta en palabras. */}
          <p
            aria-live="polite"
            className="font-numeros text-center text-3xl tracking-[0.4em] text-primary"
          >
            <span className="sr-only">{pin.length} de 4 dígitos tecleados</span>
            <span aria-hidden>{'•'.repeat(pin.length) + '◦'.repeat(LARGO_PIN - pin.length)}</span>
          </p>

          <div className="grid grid-cols-3 gap-3">
            {teclas.map((tecla) => (
              <Button
                key={tecla.valor}
                type="button"
                variant={tecla.tipo}
                disabled={deshabilitado || tecla.apagada}
                className={`h-20 md:h-24 ${tecla.valor.length === 1 ? 'text-2xl font-bold' : ''}`}
                onClick={() => {
                  pulsar(tecla.valor);
                }}
              >
                {tecla.texto}
              </Button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
