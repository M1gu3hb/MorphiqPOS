import { describe, expect, it } from 'vitest';

import { abrirConteo, cerrarConteo } from '../abarrotes/conteo.ts';
import { importarNotaDeProveedor } from '../compras/importar-nota.ts';
import { recibirEntrada } from './entrada.ts';
import { calibrarPeso, conteoPorPeso } from './peso.ts';

/**
 * LO QUE EL MENÚ DEL ALMACÉN ABRE, EL ALMACÉN LO PUEDE HACER (bloque D de la 2.4).
 *
 * `ferreteria/04-INTERFAZ §4.2`: «Almacén · Existencias · Entradas · Conteo». El menú se lo
 * daba y los comandos de esas pantallas no: el día completo de la ferretería encontró que
 * Rubén abría la toma y no podía pesar ni calibrar, y que recibía la nota del proveedor
 * pero no podía importar su archivo —las dos le contestaban 403—. Una entrada de menú que
 * lleva a una pantalla que rechaza a quien la abrió es un botón muerto.
 */

describe('el almacén, en las pantallas de su menú', () => {
  it('«Conteo»: abre la toma, calibra, pesa y la cierra con su ajuste', () => {
    for (const comando of [abrirConteo, calibrarPeso, conteoPorPeso, cerrarConteo]) {
      expect(comando.roles, comando.nombre).toContain('almacen');
    }
  });

  it('«Entradas»: importa el archivo del proveedor y guarda la entrada', () => {
    for (const comando of [importarNotaDeProveedor, recibirEntrada]) {
      expect(comando.roles, comando.nombre).toContain('almacen');
    }
  });

  it('calibrar no se le abre a quien cobra: el peso por pieza es dato de catálogo', () => {
    expect(calibrarPeso.roles).not.toContain('cajero');
    expect(calibrarPeso.roles).not.toContain('mesero');
  });
});
