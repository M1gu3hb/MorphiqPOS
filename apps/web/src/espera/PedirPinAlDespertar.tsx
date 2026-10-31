'use client';

import { useState } from 'react';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Aviso, Superficie } from '@morphiqpos/ui/sistema';
import { Delete } from 'lucide-react';

import { invocarComando } from '~/cliente/api';
import { negocioParaEntrar } from '~/cliente/entrada';

import { CapaModal } from './CapaModal';
import { mensajeDelPin } from './mensaje-del-pin';

const LARGO_DEL_PIN = 4;
const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
/**
 * «PEDIR PIN AL DESPERTAR» (DP-11.2): quien tiene la sesión teclea su PIN para volver.
 *
 * Usa la entrada de siempre (`/api/auth/entrar`, con su límite de intentos y su bloqueo) con el
 * empleo de la sesión, SIN recargar: la pantalla de abajo sigue montada y lo tecleado no se pierde.
 * Va en la capa superior (`CapaModal`) con el fondo opaco: nada de la pantalla de abajo se ve ni
 * se alcanza, ni con el teclado. Acepta los dígitos del teclado físico. «Cambiar de persona»
 * cierra la sesión y lleva a la entrada.
 */
export function PedirPinAlDespertar({
  empleoId,
  nombre,
  alVolver,
  alCambiarDePersona,
}: {
  readonly empleoId: string;
  readonly nombre: string;
  readonly alVolver: () => void;
  readonly alCambiarDePersona: () => Promise<void>;
}) {
  const [pin, setPin] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function comprobar(completo: string): Promise<void> {
    setOcupado(true);
    try {
      await invocarComando('/api/auth/entrar', {
        empleoId,
        pin: completo,
        ...negocioParaEntrar(),
      });
      alVolver();
    } catch (error: unknown) {
      setPin('');
      setFallo(mensajeDelPin(error));
    } finally {
      setOcupado(false);
    }
  }

  const teclear = (digito: string): void => {
    if (ocupado) return;
    const nuevo = `${pin}${digito}`.slice(0, LARGO_DEL_PIN);
    setPin(nuevo);
    setFallo(null);
    if (nuevo.length === LARGO_DEL_PIN) void comprobar(nuevo);
  };

  const borrar = (): void => {
    if (!ocupado) setPin(pin.slice(0, -1));
  };

  const cambiarDePersona = async (): Promise<void> => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await alCambiarDePersona();
    } catch {
      setFallo('No se pudo cerrar la sesión. Revisa la conexión y vuelve a intentarlo.');
      setOcupado(false);
    }
  };

  // Lo da la capa, que oye el teclado antes que nadie: si el Tab dejó el foco en el navegador,
  // los dígitos del teclado físico siguen llegando.
  const alTeclear = (evento: KeyboardEvent): void => {
    // Una tecla mantenida no rellena el PIN, y Ctrl+1 (cambiar de pestaña) no es un dígito.
    if (evento.repeat || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (/^\d$/.test(evento.key)) {
      evento.preventDefault();
      teclear(evento.key);
    } else if (evento.key === 'Backspace') {
      evento.preventDefault();
      borrar();
    }
  };

  return (
    <CapaModal etiqueta="Escribe tu PIN para volver" alTeclear={alTeclear}>
      <div className="grid size-full place-items-center p-(--espacio-4)">
        <Superficie
          nivel={4}
          relleno={6}
          className="flex w-full max-w-xs flex-col gap-(--espacio-4) text-texto"
        >
          <div className="text-center">
            <p className="text-lg font-semibold">Hola, {nombre}</p>
            <p className="text-sm text-texto-sutil">Escribe tu PIN para volver</p>
          </div>
          <p aria-hidden="true" className="flex justify-center gap-(--espacio-3)">
            {Array.from({ length: LARGO_DEL_PIN }, (_, i) => (
              <span
                key={i}
                className={`size-(--espacio-3) rounded-full ${i < pin.length ? 'bg-primario' : 'bg-fondo-sutil'}`}
              />
            ))}
          </p>
          {/* Las teclas no se deshabilitan mientras comprueba (`aria-disabled` y se ignoran):
              un botón deshabilitado suelta el foco y el teclado físico dejaría de llegar. */}
          <p className="sr-only" aria-live="polite">
            {pin.length} de {LARGO_DEL_PIN} dígitos
          </p>
          {fallo === null ? null : <Aviso tono="peligro" titulo={fallo} anuncio="alerta" />}
          <div className="grid grid-cols-3 gap-(--espacio-2)">
            {TECLAS.map((digito) => (
              <Button
                key={digito}
                variant="outline"
                size="lg"
                aria-disabled={ocupado}
                onClick={() => {
                  teclear(digito);
                }}
              >
                {digito}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="lg"
              aria-label="Borrar"
              aria-disabled={ocupado || pin === ''}
              onClick={borrar}
            >
              <Delete aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="lg"
              aria-disabled={ocupado}
              onClick={() => {
                teclear('0');
              }}
            >
              0
            </Button>
          </div>
          <Button
            variant="ghost"
            aria-disabled={ocupado}
            onClick={() => {
              void cambiarDePersona();
            }}
          >
            Cambiar de persona
          </Button>
        </Superficie>
      </div>
    </CapaModal>
  );
}
