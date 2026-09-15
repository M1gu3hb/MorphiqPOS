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
 * ── Por qué tarjetas con cara y no un campo de usuario ───────────────────
 * Porque el mesero no va a teclear su nombre ocho veces al día, y porque la
 * cara elimina el error de entrar con la sesión de otro — que es lo que rompe
 * la atribución de propinas. El color del aro es el mismo que después pinta el
 * punto de las mesas que atiende.
 *
 * ── Por qué el PIN no se manda solo al cuarto dígito ─────────────────────
 * Porque un dedo que resbala mandaría un PIN equivocado sin que nadie lo
 * pidiera, y cada envío gasta uno de los tres intentos. Gastarlos lleva al
 * bloqueo, y un bloqueo a media comida deja la caja sin quién la opere.
 *
 * ── Por qué lee por `obtenerApi` y no por el puente ──────────────────────
 * Porque el puente resuelve el ámbito de UNA SESIÓN y aquí la sesión todavía no
 * existe. `GET /api/auth/empleados` es una de las dos rutas sin ámbito previo y
 * devuelve nombre, puesto y color, nunca el hash: el PIN se verifica en el
 * servidor, con Argon2id, en `POST /api/auth/entrar`.
 *
 * ── Lo que NO va aquí, y lo que se recortó para caber ────────────────────
 * Ni recuperación de PIN, ni registro, ni «recordarme»: el documento los
 * prohíbe. Por el límite de 300 líneas quedaron fuera el nombre del negocio en
 * la cabecera —el documento pide «tarjetas, teclado y nada más»— y el botón de
 * reintentar la lectura de la plantilla, que hoy se reintenta recargando. El
 * endpoint tampoco manda fotografías todavía: la tarjeta enseña las iniciales
 * sobre el color de la persona y ya acepta el campo `foto` para cuando lleguen.
 */

const LARGO_PIN = 4;
const INTENTOS = 4;
const SEGUNDOS_DE_BLOQUEO = 60;
const DIGITOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
const CLASES_REJILLA =
  'mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 xl:grid-cols-4';
const CLASES_TARJETA =
  'flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 ' +
  'text-card-foreground shadow-1 transition-colors hover:bg-accent hover:text-accent-foreground ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:gap-3 md:p-6';

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
    ...DIGITOS.map((digito) => ({ texto: digito, valor: digito, tipo: 'outline', apagada: false })),
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
        'md:flex-none md:rounded-xl md:border md:border-border md:bg-card md:p-6 md:shadow-2'
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

      {/* Puntos, nunca números: la pantalla está de cara al comedor. Quien no
          puede verlos recibe la cuenta en palabras. */}
      <p aria-live="polite" className="flex justify-center gap-4">
        <span className="sr-only">
          {digitos} de {LARGO_PIN} dígitos tecleados
        </span>
        {Array.from({ length: LARGO_PIN }, (_, indice) => (
          <span
            key={indice}
            aria-hidden
            className={
              'h-5 w-5 rounded-full border border-border ' +
              (indice < digitos ? 'bg-primary' : 'bg-muted')
            }
          />
        ))}
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
        setPin('');
        setError(null);
        setIntentos(INTENTOS);
        // A dónde va cada rol después de entrar lo decide el armazón de la
        // aplicación: esta pantalla sólo resuelve QUIÉN entró.
        if (onEntro === undefined) window.location.assign('/');
        else onEntro(empleoId);
      } catch (fallo: unknown) {
        setPin('');
        // El bloqueo que manda es el del servidor; el contador de aquí sólo
        // hace visible la espera que él impuso.
        const bloqueado = fallo instanceof ErrorApi && fallo.error.codigo === 'LIMITE_DE_TASA';
        const restantes = bloqueado ? 0 : intentos - 1;
        setIntentos(restantes <= 0 ? INTENTOS : restantes);
        if (restantes <= 0) setSegundosBloqueo(SEGUNDOS_DE_BLOQUEO);
        const cuantos = restantes === 1 ? 'Queda 1 intento.' : `Quedan ${restantes} intentos.`;
        setError(
          restantes > 0 ? `PIN incorrecto. ${cuantos}` : mensajeDe(fallo, 'Demasiados intentos.'),
        );
      } finally {
        setEnviando(false);
      }
    },
    [intentos, onEntro],
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

  // Atajo de PC: los dígitos del teclado físico son el teclado de la pantalla.
  // El efecto se remonta con cada dígito a propósito, para que `Enter` lea el
  // PIN de ESTE render y no el de cuando se eligió a la persona.
  useEffect(() => {
    if (seleccionado === null || deshabilitado) return;
    function alTeclear(evento: KeyboardEvent): void {
      if (seleccionado === null) return;
      if (evento.key === 'Escape') setSeleccionado(null);
      else if (evento.key === 'Backspace') setPin((previo) => previo.slice(0, -1));
      else if (evento.key === 'Enter' && pin.length === LARGO_PIN)
        void entrar(seleccionado.id, pin);
      else if (evento.key.length === 1 && evento.key >= '0' && evento.key <= '9') {
        setPin((previo) => (previo.length >= LARGO_PIN ? previo : previo + evento.key));
      }
    }
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [seleccionado, pin, deshabilitado, entrar]);

  // Una sola banda: lo que impide entrar ahora mismo manda sobre lo anterior.
  const banda = sinConexion
    ? 'Sin conexión con el servidor. No se puede entrar hasta que vuelva la red.'
    : hayBloqueo
      ? `${error ?? 'Demasiados intentos.'} Vuelve a intentar en ${segundosBloqueo ?? 0} s.`
      : error;

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-background p-4 text-foreground md:p-8">
      <h1 className="mx-auto text-2xl font-bold md:text-3xl">¿Quién está operando?</h1>

      {/* La banda no vacía la pantalla: debajo sigue habiendo con quién entrar. */}
      {banda !== null && (
        <p
          role="alert"
          className="mx-auto w-full max-w-4xl rounded-md border border-destructive bg-destructive/15 p-3 text-sm"
        >
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
          aparece no es un vacío, es un despliegue sin plantilla — y hace falta
          decir qué son estas tarjetas y dónde se crean. */}
      {empleados?.length === 0 && (
        <section className="mx-auto flex max-w-lg flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold">Todavía no hay nadie dado de alta.</p>
          <p className="text-sm text-muted-foreground">
            Estas tarjetas son la plantilla del negocio: cada persona con un puesto activo y un PIN
            asignado aparece aquí. Sin nadie en ella no hay a quién atribuir una venta ni una
            propina.
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
              <button
                type="button"
                className={CLASES_TARJETA}
                onClick={() => {
                  setSeleccionado(empleado);
                  setPin('');
                  setError(null);
                }}
              >
                {/* El aro lleva el color; el nombre y el puesto van en letra. */}
                <Avatar
                  className="size-20 border-2 text-2xl md:size-28 md:text-3xl"
                  style={{ borderColor: empleado.color }}
                >
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
