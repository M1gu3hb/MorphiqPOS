import { describe, expect, it } from 'vitest';

import {
  ESTADO_INICIAL,
  MAXIMO_MS_ENTRE_TECLAS,
  mismoCodigo,
  normalizarCodigo,
  pareceCodigo,
  pulsar,
  type EstadoDelLector,
  type Resultado,
} from './lector-teclado';

/**
 * F-986 y F-029 · El lector de código de barras, que es un teclado.
 *
 * ── Lo que estas pruebas defienden ───────────────────────────────────────
 * Que seis refrescos iguales seguidos den SEIS lecturas. El componente de
 * cámara del sistema heredado espera 1 500 ms entre una y otra —correcto para
 * una cámara, inaceptable aquí— y con esa espera el quinto refresco se ignora
 * en silencio: la venta sale con cuatro.
 *
 * Y que teclear a mano no se confunda con escanear. Si «12» tecleado despacio
 * se pegara al código que viene después, el producto no se encontraría y el
 * cajero acabaría culpando al catálogo.
 */

/** Escribe una ristra a velocidad de lector y devuelve lo último que pasó. */
function escanear(codigo: string, desde = 1_000): { resultado: Resultado; fin: number } {
  let estado: EstadoDelLector = ESTADO_INICIAL;
  let reloj = desde;
  for (const tecla of codigo) {
    estado = pulsar(estado, tecla, reloj).estado;
    reloj += 10;
  }
  return { resultado: pulsar(estado, 'Enter', reloj), fin: reloj };
}

describe('F-986 · el lector se distingue por VELOCIDAD', () => {
  it('una ristra veloz que termina en Enter es un código', () => {
    const { resultado } = escanear('7501055363513');

    expect(resultado.tipo).toBe('codigo');
    if (resultado.tipo === 'codigo') expect(resultado.codigo).toBe('7501055363513');
  });

  it('lo mismo tecleado DESPACIO no es un código', () => {
    // Cada tecla llega 300 ms después: es una persona buscando, y tratarlo
    // como escaneo dispararía una búsqueda por cada letra a medio teclear.
    let estado: EstadoDelLector = ESTADO_INICIAL;
    let reloj = 1_000;
    for (const tecla of '7501055363513') {
      estado = pulsar(estado, tecla, reloj).estado;
      reloj += 300;
    }
    const final = pulsar(estado, 'Enter', reloj);

    // El buffer se reinició en cada tecla lenta, así que sólo queda la última.
    expect(final.tipo).toBe('humano');
  });

  it('el umbral es el declarado, ni un milisegundo más', () => {
    const justo = pulsar(
      { buffer: '75010', ultimaTecla: 1_000 },
      '5',
      1_000 + MAXIMO_MS_ENTRE_TECLAS,
    );
    const tarde = pulsar(
      { buffer: '75010', ultimaTecla: 1_000 },
      '5',
      1_000 + MAXIMO_MS_ENTRE_TECLAS + 1,
    );

    expect(justo.estado.buffer).toBe('750105');
    // Una tecla tarde reinicia: lo de antes era de una persona.
    expect(tarde.estado.buffer).toBe('5');
  });

  it('TECLEAR A MANO Y LUEGO ESCANEAR no pega las dos cosas', () => {
    // Sin el reinicio, «12» + el código daría «127501055363513» y el producto
    // no se encontraría. El cajero culparía al catálogo.
    let estado: EstadoDelLector = ESTADO_INICIAL;
    estado = pulsar(estado, '1', 1_000).estado;
    estado = pulsar(estado, '2', 1_500).estado;

    let reloj = 3_000;
    for (const tecla of '7501055363513') {
      estado = pulsar(estado, tecla, reloj).estado;
      reloj += 10;
    }
    const final = pulsar(estado, 'Enter', reloj);

    expect(final.tipo).toBe('codigo');
    if (final.tipo === 'codigo') expect(final.codigo).toBe('7501055363513');
  });

  it('las teclas que no son caracteres no rompen la ristra', () => {
    // El lector manda `Shift` en los códigos con letras, y una flecha perdida
    // no puede tirar una lectura a medias.
    let estado: EstadoDelLector = { buffer: '750105', ultimaTecla: 1_000 };
    estado = pulsar(estado, 'Shift', 1_010).estado;

    expect(estado.buffer).toBe('750105');
    expect(estado.ultimaTecla).toBe(1_000);
  });
});

describe('F-986 · SIN espera entre lecturas', () => {
  it('SEIS REFRESCOS IGUALES SON SEIS LECTURAS', () => {
    // Es la razón entera por la que el capturador de cámara no sirve aquí: con
    // 1 500 ms de espera, el quinto refresco se ignora y la venta sale con
    // cuatro sin que nadie vea un error.
    let reloj = 1_000;
    const lecturas: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { resultado, fin } = escanear('7501055363513', reloj);
      if (resultado.tipo === 'codigo') lecturas.push(resultado.codigo);
      // El siguiente refresco pasa 200 ms después: más rápido que el «cooldown»
      // de la cámara y perfectamente normal en hora pico.
      reloj = fin + 200;
    }

    expect(lecturas).toHaveLength(6);
  });

  it('dos códigos DISTINTOS seguidos tampoco se pisan', () => {
    const primero = escanear('7501055363513', 1_000);
    const segundo = escanear('7501000112233', primero.fin + 50);

    expect(primero.resultado.tipo).toBe('codigo');
    expect(segundo.resultado.tipo).toBe('codigo');
    if (segundo.resultado.tipo === 'codigo') {
      expect(segundo.resultado.codigo).toBe('7501000112233');
    }
  });

  it('el estado queda LIMPIO después de cada Enter', () => {
    const { resultado } = escanear('7501055363513');

    expect(resultado.estado).toEqual(ESTADO_INICIAL);
  });
});

describe('F-986 · lo que NO se trata como código', () => {
  it('un Enter suelto no busca nada', () => {
    // Pasa todo el tiempo: alguien confirma un diálogo con Intro. Convertirlo
    // en búsqueda dispararía «producto no encontrado» sin que nadie escaneara.
    const resultado = pulsar(ESTADO_INICIAL, 'Enter', 1_000);

    expect(resultado.tipo).toBe('sigue');
  });

  it('una ristra corta es de una persona, no del lector', () => {
    const { resultado } = escanear('750');

    expect(resultado.tipo).toBe('humano');
  });
});

describe('F-986 · la normalización', () => {
  it('quita el retorno de carro y los espacios que manda el lector', () => {
    // Un espacio invisible al final es lo que hace que un producto que SÍ está
    // en el catálogo salga como no encontrado.
    expect(normalizarCodigo(' 7501055363513\r\n')).toBe('7501055363513');
  });

  it('sube a mayúsculas los códigos con letras', () => {
    expect(normalizarCodigo('abc123')).toBe('ABC123');
  });

  it('dos formas del mismo código son el mismo código', () => {
    expect(mismoCodigo('7501055363513', ' 7501055363513 ')).toBe(true);
  });

  it('dos vacíos NO son el mismo código', () => {
    // Si lo fueran, cualquier lectura fallida coincidiría con cualquier otra.
    expect(mismoCodigo('', '')).toBe(false);
  });

  it('acepta el EAN de báscula con prefijo 2, que trae peso dentro', () => {
    expect(pareceCodigo('2012345006543')).toBe(true);
  });

  it('acepta un código interno con letras', () => {
    // Validar el dígito verificador aquí descartaría en silencio un código
    // legítimo mal impreso, que es peor que buscarlo y no encontrarlo: eso al
    // menos abre el alta rápida.
    expect(pareceCodigo('TORN-1-4-X2')).toBe(true);
  });
});
