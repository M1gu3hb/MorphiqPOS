'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, EsqueletoDeLista, Vacio } from '@morphiqpos/ui/sistema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChefHat, Check, Flame, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { unlockAudio } from '@/lib/sounds';
import { fraseNuevoPedidoCocina, speak, speakSample } from '@/lib/voiceAlert';
import { haceCuanto } from '~/restaurante/vista-de-solicitudes';

import { ComandaEnElTelefono } from './ComandaEnElTelefono';
import {
  FalloDelTelefono,
  leerPantalla,
  moverDesdeElTelefono,
  type ComandaDelTelefono,
} from './pantalla-del-telefono';
import {
  accionDeLaTecla,
  accionesPosibles,
  porAnunciar,
  type AccionDelTelefono,
} from './telefono-de-cocina';
import { usePantallaEncendida } from './use-pantalla-encendida';

/** Cada cuánto pregunta: la cocina quiere enterarse al momento, sin Realtime. */
const SONDEO_MS = 2500;

function fraseDe(comanda: ComandaDelTelefono): string {
  return fraseNuevoPedidoCocina(
    // Sin mesa la voz dice «mostrador», como en la pantalla grande.
    comanda.mesaNumero ?? '',
    comanda.platillos.map((p) => ({
      producto_nombre: p.nombre,
      cantidad: p.cantidad,
      notas: p.notas,
    })),
    comanda.notas ?? '',
    {
      notas_alergias: comanda.alergias,
      celebracion: comanda.celebracion,
      tipo_celebracion: comanda.tipoCelebracion,
    },
  );
}

/**
 * EL TELÉFONO DE UNA ESTACIÓN DE COCINA (DP-9.4). Sin PIN: el token del QR. Enseña la comanda
 * pendiente MÁS RECIENTE de la estación, la lee en voz al llegar, y tiene tres botones grandes
 * —Repetir voz, Preparar, Listo— que también responden a una botonera Bluetooth. Al marcar
 * Listo aparece la siguiente. La pantalla no se apaga mientras está abierta.
 */
export function TelefonoDeCocina({ token }: { readonly token: string }) {
  const clienteDeConsultas = useQueryClient();
  const [sonidoActivo, setSonidoActivo] = useState(false);
  const [enCurso, setEnCurso] = useState<AccionDelTelefono | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const anunciadas = useRef<ReadonlySet<string> | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  usePantallaEncendida(sonidoActivo);

  const pantalla = useQuery({
    queryKey: ['telefono-de-cocina', token],
    queryFn: () => leerPantalla(token),
    refetchInterval: (consulta) =>
      consulta.state.error instanceof FalloDelTelefono && consulta.state.error.codigoInvalido
        ? false
        : SONDEO_MS,
    retry: false,
  });
  const comanda = pantalla.data?.comanda ?? null;

  useEffect(() => {
    const reloj = setInterval(() => {
      setAhora(Date.now());
    }, 30_000);
    return () => {
      clearInterval(reloj);
    };
  }, []);

  // La voz: cada comanda nueva una vez; las que ya estaban al entrar, no.
  useEffect(() => {
    if (pantalla.data === undefined) return;
    const id = comanda?.id ?? null;
    if (anunciadas.current === null) {
      anunciadas.current = new Set(id === null ? [] : [id]);
      return;
    }
    const nueva = porAnunciar(id, anunciadas.current);
    if (nueva === null || comanda === null) return;
    anunciadas.current = new Set([...anunciadas.current, nueva]);
    if (sonidoActivo) speak(fraseDe(comanda), { cocina: true });
  }, [pantalla.data, comanda, sonidoActivo]);

  const hacer = useCallback(
    async (accion: AccionDelTelefono): Promise<void> => {
      if (comanda === null || enCurso !== null || !accionesPosibles(comanda.estado).has(accion))
        return;
      if (accion === 'repetir') {
        speakSample(fraseDe(comanda));
        return;
      }
      setEnCurso(accion);
      setFallo(null);
      try {
        await moverDesdeElTelefono(
          token,
          comanda.id,
          accion === 'preparar' ? 'en_preparacion' : 'listo',
        );
      } catch (error: unknown) {
        setFallo(error instanceof Error ? error.message : 'No se pudo.');
      } finally {
        setEnCurso(null);
        await clienteDeConsultas.invalidateQueries({ queryKey: ['telefono-de-cocina', token] });
      }
    },
    [comanda, enCurso, token, clienteDeConsultas],
  );

  // La botonera física llega como teclas.
  useEffect(() => {
    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.repeat || evento.ctrlKey || evento.metaKey || evento.altKey) return;
      const accion = accionDeLaTecla(evento.key);
      if (accion === null) return;
      evento.preventDefault();
      void hacer(accion);
    };
    window.addEventListener('keydown', alTeclear);
    return () => {
      window.removeEventListener('keydown', alTeclear);
    };
  }, [hacer]);

  if (!sonidoActivo) {
    return (
      <Button
        type="button"
        className="h-dvh w-full flex-col gap-(--espacio-3) rounded-none text-2xl"
        onClick={() => {
          unlockAudio();
          speakSample('Sonido activado');
          setSonidoActivo(true);
        }}
      >
        <Volume2 aria-hidden className="size-[calc(var(--altura-control)*1.1)]" />
        Toca para activar el sonido
      </Button>
    );
  }
  if (pantalla.error instanceof FalloDelTelefono && pantalla.error.codigoInvalido) {
    return (
      <Vacio
        icono={<ChefHat aria-hidden />}
        titulo="Este código ya no sirve"
        explicacion="Pide uno nuevo en la pantalla de Cocina: «Conectar teléfono»."
        nivelDeTitulo={2}
      />
    );
  }
  if (pantalla.data === undefined) return <EsqueletoDeLista filas={4} />;

  const posibles = accionesPosibles(comanda?.estado ?? null);
  return (
    <main className="flex min-h-dvh flex-col gap-(--espacio-3) p-(--espacio-3)">
      <p className="text-lg font-semibold">{pantalla.data.estacion.nombre}</p>
      {pantalla.error === null ? null : <Aviso tono="atencion" titulo={pantalla.error.message} />}
      {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} />}
      {comanda === null ? (
        <Vacio
          icono={<ChefHat aria-hidden />}
          titulo="Sin comandas pendientes"
          explicacion="Cuando llegue una, se lee en voz y aparece aquí."
          nivelDeTitulo={2}
        />
      ) : (
        <ComandaEnElTelefono
          comanda={comanda}
          pendientes={pantalla.data.pendientes}
          haceCuanto={haceCuanto(comanda.creadaEn, ahora)}
        />
      )}
      <nav
        aria-label="Acciones de la comanda"
        className="mt-auto grid grid-cols-3 gap-(--espacio-2)"
      >
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={!posibles.has('repetir')}
          onClick={() => void hacer('repetir')}
        >
          <Volume2 aria-hidden /> Repetir voz
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          disabled={!posibles.has('preparar')}
          cargando={enCurso === 'preparar'}
          onClick={() => void hacer('preparar')}
        >
          <Flame aria-hidden /> Preparar
        </Button>
        <Button
          type="button"
          size="lg"
          variant="success"
          disabled={!posibles.has('listo')}
          cargando={enCurso === 'listo'}
          onClick={() => void hacer('listo')}
        >
          <Check aria-hidden /> Listo
        </Button>
      </nav>
    </main>
  );
}
