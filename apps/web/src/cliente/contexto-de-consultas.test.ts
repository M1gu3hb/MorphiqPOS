import { createRequire } from 'node:module';

import type { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  CONTEXTO_INICIAL,
  cambioDePlantilla,
  claveDeContexto,
  siguienteContexto,
  sobreviveAlCambioDePlantilla,
  type EstadoDeContexto,
} from './contexto-de-consultas.ts';

// `query-core` se resuelve desde react-query por la misma razón que en `claves-de-consulta.test.ts`.
const desdeReactQuery = createRequire(createRequire(import.meta.url).resolve('@tanstack/react-query'));
const { QueryClient: ClienteReal } = desdeReactQuery('@tanstack/query-core') as {
  readonly QueryClient: new () => QueryClient;
};

const MESERA = { id: 'emp-1', organizacionId: 'org-1', paquete: 'restaurante' };
const CAJERA = { id: 'emp-2', organizacionId: 'org-1', paquete: 'restaurante' };
const MESERA_DE_OTRO_NEGOCIO = { id: 'emp-1', organizacionId: 'org-2', paquete: 'restaurante' };
const MESERA_DE_OTRA_PLANTILLA = { id: 'emp-1', organizacionId: 'org-1', paquete: 'cafeteria' };

describe('claveDeContexto', () => {
  it('distingue empleo, negocio y plantilla: cualquiera que cambie, cambia el contexto', () => {
    const base = claveDeContexto(MESERA);
    expect(base).not.toBeNull();
    expect(claveDeContexto(CAJERA)).not.toBe(base);
    expect(claveDeContexto(MESERA_DE_OTRO_NEGOCIO)).not.toBe(base);
    expect(claveDeContexto(MESERA_DE_OTRA_PLANTILLA)).not.toBe(base);
  });

  it('es estable: la misma identidad da la misma clave aunque sea otro objeto', () => {
    expect(claveDeContexto({ ...MESERA })).toBe(claveDeContexto(MESERA));
  });

  it('sin nadie dentro, o con una sesión sin empleo, no hay contexto', () => {
    expect(claveDeContexto(null)).toBeNull();
    expect(claveDeContexto(undefined)).toBeNull();
    expect(claveDeContexto({ organizacionId: 'org-1' })).toBeNull();
    expect(claveDeContexto({ id: '' })).toBeNull();
  });
});

describe('siguienteContexto', () => {
  const dentro = (identidad: Parameters<typeof claveDeContexto>[0], sesion = 0): EstadoDeContexto =>
    siguienteContexto(CONTEXTO_INICIAL, claveDeContexto(identidad), sesion).estado;

  it('al arrancar, saber quién es NO reinicia: las consultas que ya salieron viajaron con la cookie', () => {
    const paso = siguienteContexto(CONTEXTO_INICIAL, claveDeContexto(MESERA), 0);
    expect(paso.reiniciar).toBe(false);
    expect(paso.estado.clave).toBe(claveDeContexto(MESERA));
    expect(paso.estado.generacion).toBe(CONTEXTO_INICIAL.generacion);
  });

  it('la misma sesión pintada otra vez no cambia nada (ni crea otro estado)', () => {
    const previo = dentro(MESERA);
    const paso = siguienteContexto(previo, claveDeContexto(MESERA), 0);
    expect(paso.reiniciar).toBe(false);
    expect(paso.estado).toBe(previo);
  });

  it('otro empleo, otro negocio u otra plantilla reinician y remontan el árbol', () => {
    for (const otra of [CAJERA, MESERA_DE_OTRO_NEGOCIO, MESERA_DE_OTRA_PLANTILLA]) {
      const previo = dentro(MESERA);
      const paso = siguienteContexto(previo, claveDeContexto(otra), 0);
      expect(paso.reiniciar).toBe(true);
      expect(paso.estado.clave).toBe(claveDeContexto(otra));
      expect(paso.estado.generacion).toBe(previo.generacion + 1);
    }
  });

  it('salir (o que la sesión venza o se revoque) reinicia: nadie hereda el caché de quien se fue', () => {
    const paso = siguienteContexto(dentro(MESERA), null, 0);
    expect(paso.reiniciar).toBe(true);
    expect(paso.estado.clave).toBeNull();
  });

  it('lo guardado en sessionStorage que el servidor desmiente es un cambio, no una confirmación', () => {
    // Se pintó la persona guardada (A) y el servidor contesta que quien está dentro es B.
    const pintadaLaGuardada = dentro(CAJERA);
    const paso = siguienteContexto(pintadaLaGuardada, claveDeContexto(MESERA), 0);
    expect(paso.reiniciar).toBe(true);
  });

  it('una entrada o salida explícita reinicia aunque vuelva el mismo empleo', () => {
    const previo = dentro(MESERA, 0);
    const paso = siguienteContexto(previo, claveDeContexto(MESERA), 1);
    expect(paso.reiniciar).toBe(true);
    expect(paso.estado.sesion).toBe(1);
  });

  it('tras salir, entrar adopta el contexto sin reiniciar otra vez: el caché ya está vacío', () => {
    const salido = siguienteContexto(dentro(MESERA), null, 1).estado;
    const paso = siguienteContexto(salido, claveDeContexto(CAJERA), 1);
    expect(paso.reiniciar).toBe(false);
    expect(paso.estado.clave).toBe(claveDeContexto(CAJERA));
  });
});

describe('cambioDePlantilla', () => {
  it('mientras la configuración carga no se decide nada', () => {
    expect(cambioDePlantilla(null, null)).toEqual({ asentada: null, reiniciar: false });
    expect(cambioDePlantilla('restaurante', null)).toEqual({
      asentada: 'restaurante',
      reiniciar: false,
    });
  });

  it('la primera plantilla que llega se asienta sin reiniciar', () => {
    expect(cambioDePlantilla(null, 'restaurante')).toEqual({
      asentada: 'restaurante',
      reiniciar: false,
    });
  });

  it('la misma plantilla no reinicia; otra sí', () => {
    expect(cambioDePlantilla('restaurante', 'restaurante').reiniciar).toBe(false);
    expect(cambioDePlantilla('restaurante', 'cafeteria')).toEqual({
      asentada: 'cafeteria',
      reiniciar: true,
    });
  });
});

describe('qué sobrevive a un cambio de plantilla', () => {
  it('sólo la configuración: de ella depende cada pantalla para saber dónde está', () => {
    expect(sobreviveAlCambioDePlantilla(['config'])).toBe(true);
    expect(sobreviveAlCambioDePlantilla(['mesas', { activo: true }])).toBe(false);
    expect(sobreviveAlCambioDePlantilla(['pedidos_cocina'])).toBe(false);
    expect(sobreviveAlCambioDePlantilla([])).toBe(false);
  });

  it('reiniciar con ese filtro vacía lo demás y conserva la configuración', async () => {
    const cliente = new ClienteReal();
    cliente.setQueryData(['config'], [{ paquete_modo: 'cafeteria' }]);
    cliente.setQueryData(['mesas', { activo: true }], [{ id: 'm1' }]);
    cliente.setQueryData(['pedidos_cocina'], [{ id: 'p1' }]);

    await cliente.resetQueries({
      predicate: (consulta) => !sobreviveAlCambioDePlantilla(consulta.queryKey),
    });

    expect(cliente.getQueryData(['config'])).toEqual([{ paquete_modo: 'cafeteria' }]);
    expect(cliente.getQueryData(['mesas', { activo: true }])).toBeUndefined();
    expect(cliente.getQueryData(['pedidos_cocina'])).toBeUndefined();
  });
});

describe('una respuesta que llega tarde', () => {
  it('cae en el caché del contexto anterior y no repinta el nuevo', async () => {
    // Quien estaba dentro (A) pidió las mesas; antes de que lleguen, cambia el contexto: se
    // descarta su cliente y se monta uno vacío (B). Cuando la respuesta de A llega, B no la ve.
    const clienteDeA = new ClienteReal();
    let responderTarde: (filas: readonly string[]) => void = () => undefined;
    const enVuelo = clienteDeA.fetchQuery({
      queryKey: ['mesas', { activo: true }],
      queryFn: () =>
        new Promise<readonly string[]>((resolver) => {
          responderTarde = resolver;
        }),
    });

    const clienteDeB = new ClienteReal();
    await clienteDeA.cancelQueries();
    clienteDeA.clear();

    responderTarde(['mesa de A']);
    await enVuelo.catch(() => undefined);

    expect(clienteDeB.getQueryData(['mesas', { activo: true }])).toBeUndefined();
    expect(clienteDeA.getQueryData(['mesas', { activo: true }])).toBeUndefined();
  });
});
