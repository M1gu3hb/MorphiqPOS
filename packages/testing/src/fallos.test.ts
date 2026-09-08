import { describe, expect, it } from 'vitest';

import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { NOMBRES_PELIGROSOS, crearGeneradorDeIds, crearRelojControlado } from './datos';
import { ejecutarCompleto, ejecutarConFallo, esFalloInyectado, type Paso } from './fallos';

/**
 * El caso de juguete que exige F1.0-T10: "El ayudante de fallos puede
 * interrumpir una transaccion a mitad — se prueba con un caso de juguete".
 *
 * Se simula una transaccion con una lista que hace de tabla y un registro de lo
 * que se confirma o se deshace. No hace falta Postgres para comprobar que el
 * MECANISMO funciona; los cuatro escenarios FAULT-* de `13-PRUEBAS §6` se
 * escriben contra Postgres real cuando existan los comandos, en F1.2 y F1.3.
 */

/** Una transaccion de juguete: escribe en memoria y sabe deshacerse. */
function crearTransaccionDeJuguete() {
  const confirmado: string[] = [];
  let pendiente: string[] = [];

  return {
    /** Lo que ve el resto del mundo: solo lo confirmado. */
    persistido: () => [...confirmado],
    escribir: (fila: string) => {
      pendiente.push(fila);
    },
    confirmar: () => {
      confirmado.push(...pendiente);
      pendiente = [];
    },
    deshacer: () => {
      pendiente = [];
    },
  };
}

/** Los pasos de un cobro, con los nombres de `13-PRUEBAS §6`. */
function pasosDeCobro(tx: ReturnType<typeof crearTransaccionDeJuguete>): Paso<string>[] {
  return [
    {
      nombre: 'orden',
      ejecutar: () => {
        tx.escribir('orden');
        return 'orden';
      },
    },
    {
      nombre: 'lineas',
      ejecutar: () => {
        tx.escribir('lineas');
        return 'lineas';
      },
    },
    {
      nombre: 'pago',
      ejecutar: () => {
        tx.escribir('pago');
        return 'pago';
      },
    },
    {
      nombre: 'stock',
      ejecutar: () => {
        tx.escribir('stock');
        return 'stock';
      },
    },
    {
      nombre: 'folio',
      ejecutar: () => {
        tx.escribir('folio');
        return 'folio';
      },
    },
  ];
}

describe('inyeccion de fallos', () => {
  it('sin interrupcion, la transaccion confirma los 5 pasos', async () => {
    const tx = crearTransaccionDeJuguete();
    await ejecutarCompleto(pasosDeCobro(tx));
    tx.confirmar();
    expect(tx.persistido()).toEqual(['orden', 'lineas', 'pago', 'stock', 'folio']);
  });

  // FAULT-01 en miniatura: se interrumpe despues del pago y antes del stock,
  // y no debe quedar NADA — ni la orden pagada, ni el folio consumido.
  it('interrumpida despues del pago, no persiste absolutamente nada', async () => {
    const tx = crearTransaccionDeJuguete();

    await expect(
      ejecutarConFallo(pasosDeCobro(tx), { interrumpirDespuesDe: 'pago' }),
    ).rejects.toSatisfy(esFalloInyectado);

    tx.deshacer();
    expect(tx.persistido()).toEqual([]);
  });

  it('el fallo se distingue de un error real del sistema', async () => {
    const tx = crearTransaccionDeJuguete();
    const error = await ejecutarConFallo(pasosDeCobro(tx), {
      interrumpirDespuesDe: 'lineas',
    }).catch((e: unknown) => e);

    expect(esFalloInyectado(error)).toBe(true);
    expect(esFalloInyectado(new Error('la base se cayo'))).toBe(false);
  });

  it('ejecuta los pasos anteriores al punto de interrupcion, no menos', async () => {
    const tx = crearTransaccionDeJuguete();
    await ejecutarConFallo(pasosDeCobro(tx), { interrumpirDespuesDe: 'stock' }).catch(
      () => undefined,
    );
    // Se confirma a proposito para VER que se habia escrito antes de reventar.
    tx.confirmar();
    expect(tx.persistido()).toEqual(['orden', 'lineas', 'pago', 'stock']);
  });

  // La proteccion que hace que estas pruebas no se pudran: si alguien renombra
  // un paso, la prueba REVIENTA en vez de interrumpir otra cosa en silencio.
  it('rechaza interrumpir despues de un paso que no existe', async () => {
    const tx = crearTransaccionDeJuguete();
    await expect(
      ejecutarConFallo(pasosDeCobro(tx), { interrumpirDespuesDe: 'cobro' }),
    ).rejects.toThrow(ErrorDominio);
  });
});

describe('datos sinteticos', () => {
  it('los nombres peligrosos cubren HTML, comillas, saltos, emoji y unicode largo', () => {
    const todos = NOMBRES_PELIGROSOS.join('');
    expect(todos).toContain('<script>');
    expect(todos).toContain('"');
    expect(todos).toContain("'");
    expect(todos).toContain('\n');
    expect(todos).toContain('🍵');
    expect(NOMBRES_PELIGROSOS.some((n) => n.length >= 500)).toBe(true);
  });

  it('el reloj controlado avanza solo cuando se le pide', () => {
    const reloj = crearRelojControlado();
    const primero = reloj.ahora();
    const segundo = reloj.ahora();
    expect(segundo.getTime()).toBe(primero.getTime());

    reloj.avanzar(60_000);
    expect(reloj.ahora().getTime() - primero.getTime()).toBe(60_000);
  });

  it('el reloj devuelve copias: nadie puede moverlo desde fuera', () => {
    const reloj = crearRelojControlado();
    const momento = reloj.ahora();
    momento.setFullYear(1999);
    expect(reloj.ahora().getFullYear()).not.toBe(1999);
  });

  it('los identificadores son deterministas y ordenables', () => {
    const siguiente = crearGeneradorDeIds('orden');
    expect(siguiente()).toBe('orden-0001');
    expect(siguiente()).toBe('orden-0002');
  });
});
