/**
 * F1.1-C-15 — arnés del selector de paquete (`verify:paquetes`).
 *
 * El motor de cuatro fases vive en `scripts/lib/arnes.mjs`.
 */
import { correrArnes } from './lib/arnes.mjs';
import { contratos } from './paquetes/contratos.mjs';
import { contraContratos, contraPruebas, inocuas } from './paquetes/mutaciones.mjs';

correrArnes({
  nombre: 'paquetes',
  contratos,
  contraContratos,
  contraPruebas,
  inocuas,
  pruebas: ['packages/app/src/paquetes.test.ts'],
  informe: 'coverage/paquetes-mutacion.json',
});
