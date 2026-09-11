/**
 * F1.1 carril A — arnés de contratos y mutación de la venta (`verify:venta`).
 *
 * El motor de cuatro fases vive en `scripts/lib/arnes.mjs` desde que nació el
 * segundo arnés; aquí sólo quedan los contratos y las mutaciones de venta.
 */
import { correrArnes } from './lib/arnes.mjs';
import { contratos } from './venta/contratos.mjs';
import { contraContratos, contraPruebas, inocuas } from './venta/mutaciones.mjs';

correrArnes({
  nombre: 'venta',
  contratos,
  contraContratos,
  contraPruebas,
  inocuas,
  pruebas: [
    'packages/domain/src/venta/totales.test.ts',
    'packages/app/src/venta/pagos.test.ts',
    'packages/app/src/venta/escala.test.ts',
  ],
  informe: 'coverage/venta-mutacion.json',
});
