import { navegacionDePlantilla, PLANTILLA_POR_GIRO, PLANTILLAS } from '@morphiqpos/contracts';
import { describe, expect, it } from 'vitest';

import { crearVocabulario } from './vocabulario.ts';

/**
 * El menú, tal y como lo LEE el dueño.
 *
 * ── Los dos defectos que esto viene a cerrar ───────────────────────────────
 * El menú por plantilla se escribió en la etapa E2 y estas dos cosas se colaron
 * hasta E4, con la puerta en verde las dos veces:
 *
 * **1 · La `entidad` sustituye la etiqueta ENTERA.** `etiquetaDeNavegacion`
 * cambia el texto por el plural del sustantivo del giro, que está bien cuando la
 * etiqueta ES el sustantivo —«Mesas» → «Estaciones»— y lo destruye cuando es una
 * frase: «Mi día» salía «Estilistas», «Alta rápida» salía «Productos», y
 * «Agendar» y «Cita en curso» salían las dos «Citas». Un menú con dos entradas
 * iguales que van a sitios distintos obliga a adivinar.
 *
 * **2 · El punto de venta de todos los días perdió su menú.** Las entradas del
 * modelo sustituyeron a las doce heredadas, así que las pantallas que Miguel abre
 * cada mañana —`/mesero`, `/compras`, `/ventas`— respondían y sólo se abrían
 * tecleando la URL. Es el mismo defecto que esta fase vino a arreglar, al revés.
 *
 * Esta prueba afirma lo que el dueño lee, con el diccionario de SU giro, porque
 * es lo único que las dos cosas tienen en común: la lista de rutas estaba bien
 * en los dos casos.
 */

/** El giro de cada plantilla, para sacar su diccionario. `farmacia` no tiene plantilla propia. */
const GIRO_DE_LA_PLANTILLA: Readonly<Record<string, string>> = {
  tienda: 'tienda',
  cafeteria: 'cafeteria',
  restaurante: 'restaurante',
  ferreteria: 'ferreteria',
  estetica: 'estetica',
};

/** Lo mismo que hace `heredado/lib/permissions.js` al pintar cada entrada. */
function comoSeLee(etiqueta: string, entidad: string | undefined, giro: string): string {
  if (entidad === undefined) return etiqueta;
  const plural = crearVocabulario(giro).plural(entidad as never);
  if (plural === '') return etiqueta;
  return plural.charAt(0).toLocaleUpperCase('es-MX') + plural.slice(1);
}

describe('el menú que el dueño lee', () => {
  it('las cinco plantillas están cubiertas por esta prueba', () => {
    // Si mañana entra una sexta plantilla y nadie añade su giro aquí, esta
    // prueba dejaría de mirarla en silencio. Que falle.
    expect([...PLANTILLAS].sort()).toEqual(Object.keys(GIRO_DE_LA_PLANTILLA).sort());
    for (const [plantilla, giro] of Object.entries(GIRO_DE_LA_PLANTILLA)) {
      expect(PLANTILLA_POR_GIRO[giro as never]).toBe(plantilla);
    }
  });

  for (const plantilla of PLANTILLAS) {
    const giro = GIRO_DE_LA_PLANTILLA[plantilla] ?? '';

    it(`«${plantilla}» no tiene dos entradas que se lean igual`, () => {
      const leidas = navegacionDePlantilla(plantilla).map((entrada) =>
        comoSeLee(entrada.etiqueta, entrada.entidad, giro),
      );
      const repetidas = [...new Set(leidas.filter((e, i) => leidas.indexOf(e) !== i))];
      expect(
        repetidas,
        `El menú de «${plantilla}» enseña ${repetidas.length} etiqueta(s) dos veces: ` +
          `${repetidas.join(', ')}. Pasa cuando una entrada cuya etiqueta es una FRASE ` +
          'declara `entidad`: `etiquetaDeNavegacion` sustituye el texto entero por el ' +
          'plural del sustantivo, y dos frases distintas de la misma entidad acaban con ' +
          'el mismo nombre. La `entidad` sólo va en las entradas que nombran la entidad ' +
          'y nada más.',
      ).toEqual([]);
    });

    it(`«${plantilla}» no deja ninguna entrada con una etiqueta vacía`, () => {
      for (const entrada of navegacionDePlantilla(plantilla)) {
        const leida = comoSeLee(entrada.etiqueta, entrada.entidad, giro);
        expect(leida.trim(), `«${entrada.ruta}» se lee vacía en «${plantilla}».`).not.toBe('');
      }
    });

    it(`«${plantilla}» sigue llevando al punto de venta de todos los días`, () => {
      // No se exige la lista entera: la plantilla decide, y una ferretería no
      // tiene «Mesero». Se exige que ALGUNA de las heredadas esté, porque si no
      // queda ninguna es que el grupo se perdió otra vez.
      const rutas = new Set(navegacionDePlantilla(plantilla).map((e) => e.ruta));
      const heredadas = [
        '/mesero',
        '/cocina',
        '/caja',
        '/ventas',
        '/recetas',
        '/productos',
        '/inventario',
        '/compras',
        '/registros',
        '/portal-qr',
      ].filter((ruta) => rutas.has(ruta));
      expect(
        heredadas.length,
        `El menú de «${plantilla}» no lleva a NINGUNA pantalla del punto de venta ` +
          'heredado. Ésas son las que los cuatro negocios abren cada mañana; las del ' +
          'modelo se añadieron para que no estuvieran huérfanas, no para dejar huérfanas ' +
          'a las otras.',
      ).toBeGreaterThan(0);
    });
  }

  it('cada plantilla lleva a TODAS las pantallas de su modelo', () => {
    // La regla de «una entrada por módulo» se aplica sólo ENTRE grupos. Dentro
    // del modelo dos pantallas pueden compartir módulo —«Cobrar» y «Caja» de una
    // tiendita son las dos `caja_directa`— y las dos tienen que salir. La primera
    // versión de esa regla se comió tres pantallas de modelo sin avisar.
    const cuentas: Record<string, number> = {
      tienda: 11,
      cafeteria: 11,
      restaurante: 11,
      ferreteria: 12,
      // TRECE desde el 20-09-2026: la estética estrenó su TABLERO, y en este modelo
      // no vive en `/` como en los otros cuatro. Su §4.4.1 defiende que su inicio es
      // la agenda —«a las 9:45 de la mañana, casi todos los indicadores de un
      // dashboard son adornos»— así que el tablero cuelga de una entrada de menú.
      estetica: 13,
    };
    for (const plantilla of PLANTILLAS) {
      const delModelo = navegacionDePlantilla(plantilla).filter((e) =>
        /^\/(restaurante|cafeteria|abarrotes|ferreteria|estetica-salon)\//.test(e.ruta),
      );
      expect(
        delModelo.length,
        `«${plantilla}» ofrece ${delModelo.length} pantallas de su modelo y tiene que ` +
          `ofrecer ${cuentas[plantilla] ?? 0}. Si el número bajó, la regla de «una entrada ` +
          'por módulo» se está aplicando dentro del grupo del modelo y se está comiendo ' +
          'pantallas; si subió, actualiza este número a propósito.',
      ).toBe(cuentas[plantilla] ?? 0);
    }
  });
});
