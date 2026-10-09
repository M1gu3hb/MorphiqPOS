import { describe, expect, it } from 'vitest';

import { hasPermission } from '../../heredado/lib/permissions.js';
import { navegacionParaRolYPlantilla } from '../cliente/package-config.ts';

/**
 * D.1 de la 2.4 · LA AGENDA EN EL MENÚ DE QUIEN LA USA.
 *
 * La entrada «Agenda» de la estética pedía `ver_dashboard`, que sólo tiene quien dirige:
 * la recepcionista —que la mira todo el día— y la estilista —que atiende SU columna— no la
 * tenían en su menú, aunque el servidor (`agenda.dia`) les deja leerla. Se prueba con el
 * MENÚ de verdad: la plantilla del negocio y el permiso del rol, como lo arma la barra.
 */

const AGENDA = '/estetica-salon/agenda-del-dia';

const rutasDe = (rol: string): readonly string[] =>
  (
    navegacionParaRolYPlantilla(rol, 'estetica', hasPermission) as readonly {
      readonly ruta: string;
    }[]
  ).map((entrada) => entrada.ruta);

describe('la agenda del salón, en el menú de cada puesto', () => {
  it('la recepción y la estilista la tienen, y quien dirige también', () => {
    // Los roles del menú son los del frontend heredado: `caja` es la cajera y
    // `administrador` cubre al dueño y a la gerente (`puente/roles.ts`).
    for (const rol of ['caja', 'mesero', 'administrador']) {
      expect(rutasDe(rol), `«Agenda» no está en el menú de ${rol}.`).toContain(AGENDA);
    }
  });

  it('el almacén y la cocina no: su puesto no lee la agenda', () => {
    for (const rol of ['almacen', 'cocina']) {
      expect(rutasDe(rol)).not.toContain(AGENDA);
    }
  });
});
