import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Paquete } from '@morphiqpos/contracts';

import { crearComando, definirComando } from './comando.ts';
import { solicitarCuenta } from './restaurante/cuenta.ts';
import {
  ambitoDeCajero,
  crearFabrica,
  ejecutorDeProduccion,
  type TxFalsa,
} from './pruebas/dobles.ts';

/**
 * Autorización y validación del envoltorio.
 *
 * Las tres comprobaciones que corren ANTES de abrir la transacción —rol,
 * paquete y forma de la entrada— y, sobre todo, el orden entre ellas.
 */

const CLAVE = 'clave-de-idempotencia-0001';

/** Un comando de juguete que registra si su cuerpo llegó a correr. */
function comandoDeJuguete(opciones: {
  roles?: readonly ('cajero' | 'gerente' | 'dueno')[];
  paquetes?: readonly ('tienda' | 'restaurante')[];
}) {
  const corridas: string[] = [];
  const definicion = definirComando({
    nombre: 'venta.cobrar',
    entidad: 'orden',
    escribe: true,
    roles: opciones.roles ?? ['cajero', 'gerente', 'dueno'],
    paquetes: opciones.paquetes ?? ['tienda', 'restaurante'],
    entrada: z.object({ ordenId: z.uuid(), propinaCentavos: z.number().int().nonnegative() }),
    async ejecutar(ctx, entrada) {
      corridas.push(entrada.ordenId);
      ctx.auditar({ entidadId: entrada.ordenId, payload: { folio: 1 } });
      return { folio: 1 };
    },
  });
  return { definicion, corridas };
}

const ENTRADA_BUENA = {
  ordenId: '66666666-6666-4666-8666-666666666666',
  propinaCentavos: 0,
};

describe('comando() · validación de la entrada', () => {
  it('rechaza una entrada que no cumple el esquema y NO ejecuta el cuerpo', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion, corridas } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { ordenId: 'no-es-un-uuid', propinaCentavos: -5 },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('ENTRADA_INVALIDA');
    expect(corridas).toHaveLength(0);
    // Lo que importa no es cuántas transacciones se abrieron —leer el paquete
    // exige una— sino que ninguna dejó nada escrito.
    expect(fabrica.base.confirmadas).toHaveLength(0);
  });

  it('nombra el campo que falló SIN devolver el valor recibido', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { ordenId: 'CORREO-SECRETO@ejemplo.com', propinaCentavos: 0 },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    const problemas = salida.error.problemas ?? [];
    expect(problemas.map((p) => p.ruta)).toContain('ordenId');
    // El valor que mandó el cliente puede ser un dato personal. Nunca vuelve.
    expect(JSON.stringify(salida)).not.toContain('CORREO-SECRETO');
  });

  it('rechaza propiedades que el esquema no declara', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      // `totalCentavos` es justo lo que P0-07 prohíbe aceptar del cliente.
      entrada: { ...ENTRADA_BUENA, totalCentavos: 1 },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('ENTRADA_INVALIDA');
  });
});

describe('comando() · permiso por rol (R11)', () => {
  it('deniega a un rol fuera de la lista, sin tocar nada', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion, corridas } = comandoDeJuguete({ roles: ['gerente', 'dueno'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
    expect(corridas).toHaveLength(0);
    expect(fabrica.base.confirmadas.filter((e) => e.tabla === 'comandos_ejecutados')).toHaveLength(
      0,
    );
  });

  it('permite al rol que sí está en la lista', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion, corridas } = comandoDeJuguete({ roles: ['cajero'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    expect(corridas).toHaveLength(1);
  });
});

describe('comando() · paquete de la organización (A-42, prueba PAQ-01)', () => {
  /**
   * Por qué el sujeto de esta prueba cambió de comando.
   *
   * Lo que aquí se afirma —y se sigue afirmando— es que el filtro de paquete
   * funciona sobre un comando REAL de producción, no sobre uno de juguete
   * definido dentro del test: que un comando bien declarado pueda estar mal
   * declarado es justo lo que un comando de juguete nunca puede cazar.
   *
   * El sujeto era `catalogo.crear_modificador`, que declara
   * `PAQUETES_OPERATIVOS`. Servía porque esa lista eran DOS de los tres
   * paquetes: `esencial` —el nivel que vendía sin controlar stock— se quedaba
   * fuera y el 403 llegaba. D-01 borró ese nivel y con él la premisa: hoy
   * `PAQUETES_OPERATIVOS` son LOS TRES, porque `MODULOS_POR_PLANTILLA` le da a
   * `tienda` el bloque de operación entero y un menú que enseña lo que el POST
   * rechaza es peor que no tenerlo. Con `tienda` dentro, el comando ya no se
   * corta por paquete: avanza hasta validar la entrada y devuelve
   * `ENTRADA_INVALIDA`. Cambiar el `expect` a ese código habría dejado una
   * prueba que ya no comprueba ningún gate; lo que hay que cambiar es el sujeto.
   *
   * El sujeto nuevo es un comando de SALA. `restaurante.solicitar_cuenta`
   * declara `PAQUETES_RESTAURANTE`, que D-01 NO tocó: sigue siendo sólo
   * `['restaurante']`, porque mesas, mesero y cocina no existen en una tienda ni
   * en una cafetería. Es el gate de paquete que hoy sigue separando de verdad, y
   * por eso es el único que puede demostrar que el mecanismo sirve.
   *
   * Que ese comando no declare `modulo` es parte de la elección, no casualidad:
   * la perilla apagada (F-016) se rechaza con el MISMO código
   * `PAQUETE_NO_INCLUYE`, así que con un comando que declarara módulo el 403
   * podría venir de la perilla y la prueba pasaría por la razón equivocada.
   */
  async function codigoDeSolicitarCuenta(paquete: Paquete): Promise<string> {
    // La entrada va vacía A PROPÓSITO. El paquete se comprueba antes que la
    // forma de la entrada, así que una entrada inválida es el testigo: si el
    // filtro corta, el código es 403; si deja pasar, es el 400 del escalón
    // siguiente. Un mismo cuerpo distingue las dos respuestas sin tocar la base.
    const salida = await ejecutorDeProduccion(paquete)(solicitarCuenta, {
      entrada: {},
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });
    return salida.ok ? 'ejecutó' : salida.error.codigo;
  }

  it('un comando real de sala devuelve 403 en tienda y en cafetería', async () => {
    expect(await codigoDeSolicitarCuenta('tienda')).toBe('PAQUETE_NO_INCLUYE');
    expect(await codigoDeSolicitarCuenta('cafeteria')).toBe('PAQUETE_NO_INCLUYE');
  });

  it('el mismo comando real SÍ pasa el filtro de paquete en restaurante', async () => {
    // La otra mitad, sin la cual la de arriba no afirma nada: un comando roto
    // que rechazara a todo el mundo —o un filtro que fallara cerrado siempre—
    // daría 403 en las tres plantillas y la prueba anterior seguiría verde. Que
    // aquí el rechazo sea el de la entrada vacía prueba que el filtro DISCRIMINA
    // y no que simplemente niega.
    expect(await codigoDeSolicitarCuenta('restaurante')).toBe('ENTRADA_INVALIDA');
  });

  it('devuelve PAQUETE_NO_INCLUYE antes de ejecutar el caso de uso', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion, corridas } = comandoDeJuguete({ paquetes: ['restaurante'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });

  it('el paquete se lee de la organización, no de la entrada', async () => {
    const fabrica = crearFabrica('restaurante');
    const { definicion, corridas } = comandoDeJuguete({ paquetes: ['restaurante'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(true);
    expect(corridas).toHaveLength(1);
  });

  it('una organización sin paquete legible se trata como no incluida, no como permitida', async () => {
    const fabrica = crearFabrica('tienda');
    fabrica.ponerPaquete(null);
    const { definicion, corridas } = comandoDeJuguete({});
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: ENTRADA_BUENA,
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
    expect(corridas).toHaveLength(0);
  });
});

describe('comando() · orden de las comprobaciones', () => {
  it('el permiso se comprueba ANTES que la forma de la entrada', async () => {
    // Si el 400 llegara primero, un rol sin permiso podría sondear el esquema de
    // un comando administrativo campo por campo, a base de entradas inválidas.
    const fabrica = crearFabrica('tienda');
    const { definicion } = comandoDeJuguete({ roles: ['dueno'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { basura: true },
      ambito: ambitoDeCajero({ rol: 'cajero' }),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('SIN_PERMISO');
  });

  it('el paquete se comprueba ANTES que la forma de la entrada', async () => {
    const fabrica = crearFabrica('tienda');
    const { definicion } = comandoDeJuguete({ paquetes: ['restaurante'] });
    const ejecutar = crearComando<TxFalsa>(fabrica);

    const salida = await ejecutar(definicion, {
      entrada: { basura: true },
      ambito: ambitoDeCajero(),
      idempotencyKey: CLAVE,
    });

    expect(salida.ok).toBe(false);
    if (salida.ok) return;
    expect(salida.error.codigo).toBe('PAQUETE_NO_INCLUYE');
  });
});
