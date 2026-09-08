/** B-02/B-03: muta consumo y decremento atómico, exige fallos y restaura. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pruebas = [
  'packages/domain/src/inventario/consumo.test.ts',
  'packages/data/src/repos/stock.test.ts',
];

const mutaciones = [
  [
    'packages/domain/src/inventario/consumo.ts',
    'convertirUnidad(cantidadLinea, linea.unidadVenta, linea.unidadBase)',
    'cantidadLinea',
    'sku sin conversión',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'const total = multiplicar(porProducto, cantidadLinea);',
    'const total = porProducto;',
    'receta sin cantidad vendida',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'aplicarMerma(total, ingrediente.mermaPorcentaje)',
    'total',
    'receta sin merma',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'return convertirUnidad(positiva(captura.cantidad), captura.unidad, destino);',
    'return positiva(captura.cantidad);',
    'variable sin conversión base',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'const mlPorPorcion = calcularMlPorPorcion(captura);',
    'const mlPorPorcion = cantidad(captura.capacidadMl);',
    'porción usa contenedor completo',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'actual.cantidad = desdeDiezmilesimas(actual.cantidad + valor);',
    'actual.cantidad = valor;',
    'agrupación pierde consumos previos',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'actual.permiteNegativo && linea.permiteVentaSinStock',
    'actual.permiteNegativo || linea.permiteVentaSinStock',
    'política negativa permisiva',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'linea.ordenId !== primera.ordenId ||',
    'false ||',
    'mezclar referencias de orden',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    "case 'ninguno':\n        break;",
    "case 'ninguno':\n        throw new ErrorDominio('INVENTARIO_INVALIDO', 'mutación');",
    'servicio descuenta o falla',
  ],
  [
    'packages/domain/src/inventario/consumo.ts',
    'return cantidadExacta(valor * (cien + merma), cien);',
    'return desdeDiezmilesimas((valor * (cien + merma)) / cien);',
    'merma trunca precisión',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'set cantidad = cantidad - ${consumo}',
    'set cantidad = cantidad + ${consumo}',
    'incrementar en una venta',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'where organizacion_id = ${movimiento.organizacionId}',
    'where true',
    'omitir organización',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'and (cantidad >= ${consumo} or ${movimiento.permiteNegativo})',
    'and true',
    'omitir guarda de stock',
  ],
  [
    'packages/data/src/repos/stock.ts',
    '${movimiento.permiteNegativo})',
    '${true})',
    'forzar stock negativo',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'if (resultado.rows.length !== 1)',
    'if (resultado.rows.length === 1)',
    'aceptar update sin fila',
  ],
  [
    'packages/data/src/repos/stock.ts',
    '${`-${consumo}`}',
    '${consumo}',
    'ledger con signo positivo',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'return claveA < claveB ? -1 : claveA > claveB ? 1 : 0;',
    'return claveA < claveB ? 1 : claveA > claveB ? -1 : 0;',
    'bloqueos sin orden estable',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'values ${sql.join(filas)}',
    'values ${sql.join(filas.slice(0, 1))}',
    'ledger omite movimientos',
  ],
  [
    'packages/data/src/repos/stock.ts',
    'if (valor === 0n)',
    'if (false)',
    'aceptar movimiento cero',
  ],
];

mkdirSync('coverage', { recursive: true });

function probar(rutas = pruebas) {
  const resultado = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      ...rutas,
      '--reporter=json',
      '--outputFile=coverage/inventario-mutacion.json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (resultado.error) throw resultado.error;
  const informe = JSON.parse(readFileSync('coverage/inventario-mutacion.json', 'utf8'));
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
    resultado = probar([ruta.includes('/domain/') ? pruebas[0] : pruebas[1]]);
  } finally {
    writeFileSync(ruta, original);
  }
  if (resultado.estado === 0 || resultado.fallos.length === 0) {
    throw new Error(`Mutación sobreviviente o fallo sin aserción: ${nombre}`);
  }
  console.log(
    JSON.stringify({ mutacion: nombre, detectadaPor: resultado.fallos, restaurada: true }),
  );
}
if (probar().estado !== 0) throw new Error('La versión restaurada no pasa.');
console.log(`${mutaciones.length} mutaciones detectadas; versión restaurada en verde.`);
