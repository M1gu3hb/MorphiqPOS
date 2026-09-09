/**
 * F1.1 — arnés de contratos y mutación de identidad (`verify:identidad`).
 *
 * Nace del fallo que impidió entrar durante tres sesiones. Su primera mutación
 * es ese fallo, reintroducido tal cual.
 *
 * El motor de cuatro fases vive en `scripts/lib/arnes.mjs`, compartido con
 * `verificar-venta.mjs`.
 */
import { correrArnes } from './lib/arnes.mjs';
import { contratos } from './identidad/contratos.mjs';
import { contraContratos, contraPruebas, inocuas } from './identidad/mutaciones.mjs';

correrArnes({
  nombre: 'identidad',
  contratos,
  contraContratos,
  contraPruebas,
  inocuas,
  pruebas: ['packages/app/src/identidad/pin.test.ts'],
  informe: 'coverage/identidad-mutacion.json',
});
