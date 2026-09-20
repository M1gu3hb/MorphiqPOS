import { describe, expect, it } from 'vitest';

import { posicionDe, seCruzan, type BloqueColocable } from './agenda-geometria';

/**
 * EL HUECO INTERCALADO NO PUEDE TAPAR LA CITA.
 *
 * ── El defecto que esta prueba fija ───────────────────────────────────────
 * Mientras un tinte procesa, la profesional está libre y `agenda.huecos` ofrece ese
 * rato como vendible: un hueco DENTRO del rango de otra cita. La agenda pintaba los
 * dos con `inset-x-1` y el mismo `top`, así que el último del DOM —el hueco— se
 * quedaba encima y **la cita no se podía tocar**. Tocar una cita es lo que la
 * empieza, así que la pantalla principal del salón tenía una cita inalcanzable.
 *
 * Se vio en el navegador: el clic sobre la cita agotó los tres minutos del límite y
 * Playwright dijo que el `<button>` del hueco «intercepts pointer events».
 *
 * Aquí se afirma la regla en el único sitio donde se puede afirmar sin navegador: la
 * función que decide el ancho. Si alguien vuelve a poner los dos a todo lo ancho,
 * esto se cae.
 */

const APERTURA_9 = '09:00';

/**
 * Lo mínimo que la colocación mira: identidad, horas y estado.
 *
 * Nada de clienta, servicio ni alergia: `BloqueColocable` declara exactamente lo
 * que cambia dónde se pinta un bloque, y pasarle lo demás sería afirmar que influye.
 */
function bloque(cambios: Partial<BloqueColocable>): BloqueColocable {
  return {
    id: 'b1',
    inicio: APERTURA_9,
    fin: '10:00',
    estado: 'en_curso',
    ...cambios,
  };
}

describe('la agenda del día · citas y huecos a la misma hora', () => {
  it('SE CRUZAN cuando comparten un minuto, y no cuando se tocan por el borde', () => {
    const cita = bloque({ inicio: '09:00', fin: '10:00' });
    expect(seCruzan(cita, bloque({ id: 'h', inicio: '09:30', fin: '09:45' }))).toBe(true);
    // Pegados no es cruzados: el hueco que empieza donde acaba la cita cabe entero.
    expect(seCruzan(cita, bloque({ id: 'h', inicio: '10:00', fin: '10:30' }))).toBe(false);
  });

  it('EL HUECO INTERCALADO deja media columna a la cita, y cada uno la suya', () => {
    const cita = bloque({ id: 'cita', inicio: '09:00', fin: '11:00' });
    const hueco = bloque({ id: 'hueco', estado: 'hueco', inicio: '09:30', fin: '10:15' });
    const columna = [cita, hueco];

    const deLaCita = posicionDe(cita, columna);
    const delHueco = posicionDe(hueco, columna);

    // La cita a la IZQUIERDA y el hueco a la DERECHA: los dos tocables, que es el
    // punto. Con los dos a todo lo ancho, el segundo se come los clics del primero.
    expect(deLaCita.left).toBe('4px');
    expect(deLaCita.right).not.toBe('4px');
    expect(delHueco.left).not.toBe('4px');
    expect(delHueco.right).toBe('4px');
  });

  it('SIN CRUCE cada bloque ocupa su columna entera', () => {
    const cita = bloque({ id: 'cita', inicio: '09:00', fin: '10:00' });
    const hueco = bloque({ id: 'hueco', estado: 'hueco', inicio: '10:00', fin: '11:00' });
    const columna = [cita, hueco];

    for (const suyo of columna) {
      const donde = posicionDe(suyo, columna);
      expect(donde.left).toBe('4px');
      expect(donde.right).toBe('4px');
    }
  });

  it('DOS CITAS a la misma hora NO se disimulan haciéndolas estrechas', () => {
    // Dos citas cruzadas en la misma persona es un error de agenda, y estrecharlas
    // lo escondería. Se pintan las dos a todo lo ancho, encimadas y visibles.
    const una = bloque({ id: 'una', inicio: '09:00', fin: '10:00' });
    const otra = bloque({ id: 'otra', inicio: '09:30', fin: '10:30' });
    const columna = [una, otra];

    expect(posicionDe(una, columna).right).toBe('4px');
    expect(posicionDe(otra, columna).left).toBe('4px');
  });
});
