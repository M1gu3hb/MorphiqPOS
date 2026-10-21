import { describe, expect, it } from 'vitest';

import { elegirNegocioDelToken } from './despliegue.ts';

/**
 * DE QUIÉN ES UN CÓDIGO QR cuando el despliegue sirve a varios negocios (cierre del 21-10).
 *
 * En el dominio propio el sistema maestro sirve seis negocios, y el portal pedía «el» negocio
 * del despliegue antes de mirar el token: todo QR contestaba 422. Ahora decide el token, pero
 * sólo entre los candidatos —lo que sirve el despliegue y sus contextos de presentación—.
 */
const restaurante = { organizacionId: 'org-restaurante', nombre: 'Restaurante MH', slug: 'r' };
const tienda = { organizacionId: 'org-tienda', nombre: 'Tienda', slug: 't' };
const espejo = { organizacionId: 'org-espejo', nombre: 'Restaurante MH', slug: 'r-p' };

describe('el negocio de un token de mesa', () => {
  it('con un solo negocio servido decide el despliegue, como antes', () => {
    expect(elegirNegocioDelToken([restaurante], [])).toBe(restaurante);
  });

  it('con varios, el de la mesa del token', () => {
    expect(
      elegirNegocioDelToken(
        [tienda, restaurante, espejo],
        [{ organizacion_id: 'org-restaurante' }],
      ),
    ).toBe(restaurante);
    expect(
      elegirNegocioDelToken([tienda, restaurante, espejo], [{ organizacion_id: 'org-espejo' }]),
    ).toBe(espejo);
  });

  it('un token que no es de ninguna mesa servida no encuentra negocio', () => {
    expect(elegirNegocioDelToken([tienda, restaurante], [])).toBeNull();
    expect(
      elegirNegocioDelToken([tienda, restaurante], [{ organizacion_id: 'org-ajena' }]),
    ).toBeNull();
  });

  it('un token repetido en dos negocios falla cerrado', () => {
    expect(
      elegirNegocioDelToken(
        [tienda, restaurante],
        [{ organizacion_id: 'org-tienda' }, { organizacion_id: 'org-restaurante' }],
      ),
    ).toBeNull();
  });

  it('dos filas del MISMO negocio no lo vuelven ambiguo aquí (lo rechaza el ámbito)', () => {
    expect(
      elegirNegocioDelToken(
        [tienda, restaurante],
        [{ organizacion_id: 'org-restaurante' }, { organizacion_id: 'org-restaurante' }],
      ),
    ).toBe(restaurante);
  });
});
