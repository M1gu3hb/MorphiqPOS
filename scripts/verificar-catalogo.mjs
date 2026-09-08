/** B-01: retira protecciones, exige fallos de aserción y restaura cada archivo. */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const raiz = 'packages/domain/src/catalogo/';
const mutaciones = [
  [
    'precio.ts',
    'redondear(precio * valor, ESCALA_CANTIDAD)',
    '(precio * valor / ESCALA_CANTIDAD)',
    'truncar medio centavo',
  ],
  [
    'precio.ts',
    'redondear(precio * valor, ESCALA_CANTIDAD)',
    'redondear(BigInt(Number(precio)) * valor, ESCALA_CANTIDAD)',
    'dinero por Number',
  ],
  [
    'precio.ts',
    'mayoreoActivo && valor >= minimo',
    'mayoreoActivo && valor > minimo',
    'excluir umbral mayoreo',
  ],
  [
    'precio.ts',
    'mayoreoActivo && valor >= minimo',
    'valor >= minimo',
    'ignorar interruptor mayoreo',
  ],
  ['precio.ts', 'if (precio < 0n)', 'if (false)', 'permitir precio negativo'],
  ['precio.ts', 'if (valor === 0n)', 'if (false)', 'permitir cantidad cero'],
  [
    'precio.ts',
    "['pieza', 'caja', 'paquete'].includes(unidad)",
    'false',
    'permitir fracciones de piezas',
  ],
  ['precio.ts', 'valor < minimo', 'false', 'omitir mínimo'],
  ['precio.ts', 'valor > maximo', 'false', 'omitir máximo'],
  ['precio.ts', 'valor % positiva(producto.incremento) !== 0n', 'false', 'omitir incremento'],
  ['porciones.ts', 'porcion > capacidad', 'false', 'omitir capacidad'],
  ['porciones.ts', 'capacidad * ESCALA_CANTIDAD', 'capacidad', 'omitir escala al derivar porción'],
  ['unidades.ts', 'valor * factor', 'valor', 'omitir contenido del empaque'],
  [
    'precio.ts',
    "captura.unidad !== 'porcion' || capturada % ESCALA_CANTIDAD !== 0n",
    'false',
    'omitir unidad y entero de porciones',
  ],
  [
    'unidades.ts',
    'if (desde.dimension !== hasta.dimension) {',
    'if (false) {',
    'mezclar dimensiones',
  ],
  ['unidades.ts', 'valor * desde.factor', 'valor', 'omitir factor de conversión'],
  ['cantidades.ts', 'numerador % denominador !== 0n', 'false', 'truncar cantidad de stock'],
  ['cantidades.ts', 'valor > MAXIMO', 'false', 'permitir desbordamiento'],
];

function probar() {
  const resultado = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      raiz,
      '--reporter=json',
      '--outputFile=coverage/catalogo-mutacion.json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (resultado.error) throw resultado.error;
  const informe = JSON.parse(readFileSync('coverage/catalogo-mutacion.json', 'utf8'));
  // Un import roto, error de sintaxis o timeout no cuenta como prueba de negocio.
  const fallos = informe.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter((prueba) => prueba.status === 'failed');
  return { estado: resultado.status, fallos: fallos.map((prueba) => prueba.fullName) };
}

if (probar().estado !== 0) throw new Error('La base debe pasar antes de mutarla.');
for (const [archivo, antes, despues, nombre] of mutaciones) {
  const ruta = raiz + archivo;
  const original = readFileSync(ruta, 'utf8');
  if (!original.includes(antes)) throw new Error(`No se encontró la protección: ${nombre}`);
  let resultado;
  try {
    writeFileSync(ruta, original.replace(antes, despues));
    resultado = probar();
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
