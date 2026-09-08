/** B-11/B-12: muta ledger, saldos y costeo; exige fallos y restaura. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pruebas = [
  'packages/app/src/inventario/inventario.test.ts',
  'packages/app/src/inventario/inventario.sql.test.ts',
];

const mutaciones = [
  [
    'packages/app/src/inventario/inventario.ts',
    'existencias.cantidad + excluded.cantidad',
    'excluded.cantidad',
    'inventario inicial sobrescribe saldo',
  ],
  [
    'packages/app/src/inventario/inventario.ts',
    "tipo: 'inventario_inicial'",
    "tipo: 'ajuste'",
    'inventario inicial pierde tipo de ledger',
  ],
  [
    'packages/app/src/inventario/inventario.ts',
    'and cantidad + ${delta} >= 0 returning cantidad',
    'and true returning cantidad',
    'ajuste omite guarda negativa',
  ],
  [
    'packages/app/src/inventario/recetas.ts',
    'i.costo_unitario_centavos::numeric * r.cantidad',
    'i.costo_unitario_centavos::numeric',
    'costeo ignora cantidad',
  ],
  [
    'packages/app/src/inventario/recetas.ts',
    '(10000 + r.merma_bp)',
    '10000',
    'costeo ignora merma',
  ],
];

mkdirSync('coverage', { recursive: true });

function probar() {
  const resultado = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...pruebas,
      '--reporter=json',
      '--outputFile=coverage/comandos-inventario-mutacion.json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (resultado.error) throw resultado.error;
  const informe = JSON.parse(readFileSync('coverage/comandos-inventario-mutacion.json', 'utf8'));
  const fallos = informe.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter((prueba) => prueba.status === 'failed');
  return { estado: resultado.status, fallos: fallos.map((prueba) => prueba.fullName) };
}

if (probar().estado !== 0) throw new Error('La base debe pasar antes de mutarla.');
for (const [ruta, antes, despues, nombre] of mutaciones) {
  const original = readFileSync(ruta, 'utf8');
  if (!original.includes(antes)) throw new Error(`No se encontró la protección: ${nombre}`);
  let resultado;
  try {
    writeFileSync(ruta, original.replace(antes, despues));
    resultado = probar();
  } finally {
    writeFileSync(ruta, original);
  }
  if (resultado.estado === 0 || resultado.fallos.length === 0)
    throw new Error(`Mutación sobreviviente: ${nombre}`);
  console.log(
    JSON.stringify({ mutacion: nombre, detectadaPor: resultado.fallos, restaurada: true }),
  );
}
if (probar().estado !== 0) throw new Error('La versión restaurada no pasa.');
console.log(`${mutaciones.length} mutaciones detectadas; versión restaurada en verde.`);
