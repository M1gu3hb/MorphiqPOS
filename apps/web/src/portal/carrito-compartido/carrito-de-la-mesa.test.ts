import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  avisoDelEnvio,
  dispositivoDelTelefono,
  envioDeOtroTelefono,
  personasConectadas,
  subtotalAproximadoCentavos,
  type EstadoDelCarrito,
} from './carrito-de-la-mesa';

const estado = (parte: Partial<EstadoDelCarrito> = {}): EstadoDelCarrito => ({
  lineas: [],
  conectados: 1,
  personas: 1,
  esperarATodos: false,
  ronda: 0,
  ultimoEnvio: null,
  ...parte,
});

describe('el id del teléfono', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('se inventa una vez y se recuerda en el navegador', () => {
    const guardado = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => guardado.get(k) ?? null,
        setItem: (k: string, v: string) => guardado.set(k, v),
      },
    });
    const primero = dispositivoDelTelefono();
    expect(primero).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(dispositivoDelTelefono()).toBe(primero);
    expect([...guardado.values()]).toEqual([primero]);
  });

  it('sin almacenamiento (navegación privada estricta) sigue funcionando en la pestaña', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado');
        },
        setItem: () => {
          throw new Error('bloqueado');
        },
      },
    });
    const uno = dispositivoDelTelefono();
    expect(uno).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(dispositivoDelTelefono()).toBe(uno);
  });
});

describe('lo que enseña el carrito de la mesa', () => {
  it('el subtotal es aproximado y en centavos: precio × cantidad, también con decimales', () => {
    const lineas = [
      {
        id: '1',
        productoId: 'a',
        nombre: 'Taco',
        cantidad: '2',
        notas: '',
        precioCentavos: '3500',
        esMia: true,
      },
      {
        id: '2',
        productoId: 'b',
        nombre: 'Barbacoa',
        cantidad: '0.25',
        notas: '',
        precioCentavos: '42000',
        esMia: false,
      },
    ];
    expect(subtotalAproximadoCentavos(lineas)).toBe(7_000 + 10_500);
    // Lo que el negocio ya no ofrece no se va a enviar: no cuenta.
    const sinTaco = lineas.map((l) => (l.id === '1' ? { ...l, disponible: false } : l));
    expect(subtotalAproximadoCentavos(sinTaco)).toBe(10_500);
  });

  it('«personas conectadas» en singular y plural', () => {
    expect(personasConectadas(1)).toBe('1 persona conectada');
    expect(personasConectadas(3)).toBe('3 personas conectadas');
  });

  it('avisa «Pedido enviado» sólo cuando sube la ronda por OTRO teléfono', () => {
    const enviadoPorOtro = estado({
      ronda: 2,
      ultimoEnvio: { en: '2026-10-26T20:00:00Z', porEsteTelefono: false },
    });
    expect(envioDeOtroTelefono(1, enviadoPorOtro)).toBe(true);
    expect(envioDeOtroTelefono(2, enviadoPorOtro)).toBe(false);
    expect(envioDeOtroTelefono(null, enviadoPorOtro)).toBe(false);
    expect(
      envioDeOtroTelefono(
        1,
        estado({ ronda: 2, ultimoEnvio: { en: '2026-10-26T20:00:00Z', porEsteTelefono: true } }),
      ),
    ).toBe(false);
  });

  it('el aviso del envío dice lo que se quitó porque ya no está disponible', () => {
    const envio = (enviado: boolean, noDisponibles: readonly string[]) => ({
      enviado,
      ronda: 1,
      noDisponibles,
    });
    expect(avisoDelEnvio(envio(true, []))).toEqual({
      tono: 'exito',
      texto: '¡Pedido enviado a cocina!',
    });
    // Vacío al llegar: lo mandó otro teléfono, o el envío de otro quitó lo que ya no había.
    expect(avisoDelEnvio(envio(false, []))).toEqual({
      tono: 'exito',
      texto: 'Ya no había nada que enviar: lo mandó otro teléfono o se quitó del pedido.',
    });
    // Un servidor anterior (o un reintento guardado antes del despliegue) no trae la lista.
    expect(avisoDelEnvio({ enviado: true, ronda: 2 })).toEqual({
      tono: 'exito',
      texto: '¡Pedido enviado a cocina!',
    });
    expect(avisoDelEnvio(envio(true, ['Taco']))).toEqual({
      tono: 'aviso',
      texto: 'Pedido enviado sin Taco: ya no está disponible y se quitó del pedido.',
    });
    expect(avisoDelEnvio(envio(true, ['Taco', 'Flan', 'Café']))).toEqual({
      tono: 'aviso',
      texto:
        'Pedido enviado sin Taco, Flan y Café: ya no están disponibles y se quitaron del pedido.',
    });
    expect(avisoDelEnvio(envio(false, ['Taco']))).toEqual({
      tono: 'aviso',
      texto: 'No se envió nada: Taco ya no está disponible y se quitó del pedido.',
    });
  });
});
