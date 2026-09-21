/** B-04/B-05: muta dinero, ámbito y versión; exige fallos y restaura. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const pruebas = [
  'packages/app/src/catalogo/productos.test.ts',
  'packages/app/src/catalogo/modificadores.test.ts',
  'packages/app/src/configuracion/configuracion.test.ts',
  'packages/app/src/comando.autorizacion.test.ts',
];

const mutaciones = [
  {
    ruta: 'packages/app/src/catalogo/modificadores.ts',
    // Se muta el IMPORT y no la declaración: la lista de paquetes dejó de
    // escribirse a mano (C-15) y ahora viene del contrato. Cambiando el import
    // la mutación compila, así que lo que la caza es la prueba y no el
    // compilador — que es una señal mucho más fuerte.
    antes: "import { ErrorDominio, PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';",
    despues:
      "import { ErrorDominio, PAQUETES_RESTAURANTE as PAQUETES_OPERATIVOS } from '@morphiqpos/contracts';",
    indice: 0,
    nombre: 'modificadores estrechados a la plantilla de restaurante',
  },
  {
    ruta: 'packages/app/src/catalogo/productos.ts',
    antes: 'precio_venta_centavos: desdeTexto(entrada.precioVenta)',
    despues: 'precio_venta_centavos: 0n',
    indice: 1,
    nombre: 'precio de alta en cero',
  },
  {
    ruta: 'packages/app/src/catalogo/productos.ts',
    antes: 'costo_unitario_centavos: desdeTexto(entrada.costoUnitario)',
    despues: 'costo_unitario_centavos: 0n',
    indice: 1,
    nombre: 'costo de alta en cero',
  },
  {
    ruta: 'packages/app/src/catalogo/productos.ts',
    // El costo pasó a ser OPCIONAL en `cambiar_precio` —las dos pantallas que
    // cambian un precio no lo tienen a mano y mandarlo obligaba a reescribirlo—
    // así que la línea mutada cambió de forma. La mutación es la misma: poner el
    // costo en cero cuando SÍ viene.
    antes: 'entrada.costoUnitario === undefined ? null : desdeTexto(entrada.costoUnitario)',
    despues: '0n',
    indice: 0,
    nombre: 'costo actualizado en cero',
  },
  {
    ruta: 'packages/app/src/catalogo/productos.ts',
    antes: 'precio_venta_centavos: desdeTexto(entrada.precioVenta)',
    despues: 'precio_venta_centavos: 0n',
    indice: 0,
    nombre: 'precio actualizado en cero',
  },
  {
    ruta: 'packages/app/src/catalogo/modificadores.ts',
    antes: 'precio_extra_centavos: desdeTexto(opcion.precioExtra)',
    despues: 'precio_extra_centavos: 0n',
    indice: 0,
    nombre: 'extra de modificador en cero',
  },
  {
    ruta: 'packages/app/src/catalogo/productos.ts',
    antes: ".where('organizacion_id', '=', ctx.ambito.organizacionId)",
    despues: ".where('organizacion_id', '=', '00000000-0000-0000-0000-000000000000')",
    indice: 1,
    nombre: 'precio fuera de la organización',
  },
  {
    ruta: 'packages/app/src/configuracion/configuracion.ts',
    antes: ".where('version', '=', entrada.version)",
    despues: ".where('version', '=', entrada.version + 1)",
    indice: 0,
    nombre: 'configuración sin versión esperada',
  },
  {
    ruta: 'packages/app/src/configuracion/configuracion.ts',
    // El texto cambio con el renombre de D-01: ahora se NORMALIZA con
    // plantillaDeOrganizacion en vez de leerse en crudo, porque la columna
    // guarda todavia los nombres viejos. La mutacion sigue siendo la misma:
    // devolver una plantilla fija, que es como una organizacion acaba con los
    // modulos de otra.
    antes: 'paquete: plantillaDeOrganizacion(fila.giro, fila.paquete),',
    despues: "paquete: 'tienda',",
    indice: 0,
    nombre: 'paquete efectivo ignorado al leer',
  },
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
      '--outputFile=coverage/comandos-catalogo-mutacion.json',
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (resultado.error) throw resultado.error;
  const informe = JSON.parse(readFileSync('coverage/comandos-catalogo-mutacion.json', 'utf8'));
  const fallos = informe.testResults
    .flatMap((suite) => suite.assertionResults)
    .filter((prueba) => prueba.status === 'failed');
  return { estado: resultado.status, fallos: fallos.map((prueba) => prueba.fullName) };
}

function reemplazarOcurrencia(texto, antes, despues, indice) {
  let desde = 0;
  let posicion = -1;
  for (let actual = 0; actual <= indice; actual += 1) {
    posicion = texto.indexOf(antes, desde);
    if (posicion === -1) return undefined;
    desde = posicion + antes.length;
  }
  return texto.slice(0, posicion) + despues + texto.slice(posicion + antes.length);
}

if (probar().estado !== 0) throw new Error('La base debe pasar antes de mutarla.');
for (const mutacion of mutaciones) {
  const original = readFileSync(mutacion.ruta, 'utf8');
  const contenido = reemplazarOcurrencia(
    original,
    mutacion.antes,
    mutacion.despues,
    mutacion.indice,
  );
  if (contenido === undefined) {
    throw new Error(`No se encontró la protección: ${mutacion.nombre}`);
  }
  let resultado;
  try {
    writeFileSync(mutacion.ruta, contenido);
    resultado = probar();
  } finally {
    writeFileSync(mutacion.ruta, original);
  }
  if (resultado.estado === 0 || resultado.fallos.length === 0) {
    throw new Error(`Mutación sobreviviente o fallo sin aserción: ${mutacion.nombre}`);
  }
  console.log(
    JSON.stringify({
      mutacion: mutacion.nombre,
      detectadaPor: resultado.fallos,
      restaurada: true,
    }),
  );
}
if (probar().estado !== 0) throw new Error('La versión restaurada no pasa.');
console.log(`${mutaciones.length} mutaciones detectadas; versión restaurada en verde.`);
