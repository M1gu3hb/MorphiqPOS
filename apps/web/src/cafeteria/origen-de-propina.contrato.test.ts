import { ORIGENES_DE_PROPINA } from '@morphiqpos/app/propinas';
import { describe, expect, it } from 'vitest';

import { origenDeLaPropina } from './origen-de-propina';

/**
 * C.14 de la etapa 2.4 · `CobroYPropina` mandaba `propinaOrigen: 'barista' | 'cliente'`,
 * fuera de la lista del servidor: `venta.cobrar` contestaba ENTRADA_INVALIDA y la
 * pantalla no cobró nunca. Lo destapó el e2e del apartado. Los dos orígenes que puede
 * mandar tienen que estar en la lista cerrada (que es la del `check` de la base).
 */
describe('el origen de la propina de la barra', () => {
  it('los dos que manda la pantalla existen en el servidor', () => {
    const lista: readonly string[] = ORIGENES_DE_PROPINA;
    expect(lista).toContain(origenDeLaPropina(true));
    expect(lista).toContain(origenDeLaPropina(false));
  });
});
