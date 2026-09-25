#!/usr/bin/env node
/**
 * verify:adopcion · que «usa la biblioteca» deje de ser una cifra que se pueda jugar.
 *
 * La etapa 2.35 cerró diciendo «31 de 72 pantallas usan la biblioteca», y la cuenta
 * era verdad y no decía nada: 22 de esas 31 importaban UN símbolo —casi siempre
 * `Vacio`— y `tabla.tsx`, la pieza más argumentada, no la usaba ni una pantalla de
 * producción. Importar contaba como adoptar.
 *
 * Aquí una pantalla está ADOPTADA sólo si cumple las CUATRO, que el analizador de
 * `lib/adopcion.mjs` mide sobre el árbol de sintaxis:
 *
 *   1.1 cero superficies a mano · 1.2 cero tablas y filas de datos a mano
 *   1.3 cero dinero formateado a mano · 1.4 sus tres estados salen del sistema
 *
 * Sale en 1 mientras UNA no cumpla. `--detalle` lista cada hallazgo con su línea;
 * `--json` lo da para una máquina; `--solo <modelo>` recorta a una carpeta, y
 * `--solo <modelo>/<Pantalla>` a una sola pantalla.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { analizarPantalla } from './lib/adopcion.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PANTALLAS = join(RAIZ, 'apps', 'web', 'src');

/**
 * LOS ESTADOS QUE UNA PANTALLA NO TIENE, declarados y no escondidos.
 *
 * Una fila por pantalla y estado, con la razón de por qué ESE estado no existe en
 * esa pantalla —no «pendiente»—. La puerta falla también al revés: si la pantalla
 * acaba pintando el estado, la fila sobra y hay que borrarla.
 */
export const SIN_ESTADO = [
  {
    pantalla: 'restaurante/AnularLineaDialog',
    estado: 'vacio',
    razon:
      'Diálogo: recibe por props la orden, la línea, el platillo y si ya se preparó, y sus cuatro motivos son fijos del giro. No hay ninguna lista que pueda llegar vacía.',
  },
  {
    pantalla: 'restaurante/AnularLineaDialog',
    estado: 'cargando',
    razon:
      'Diálogo: no lee nada —ni consultarPuente ni una espera antes de pintarse—. Lo único asíncrono es el comando, y mientras corre el botón pasa a «Quitando…» con `cargando`.',
  },
  {
    pantalla: 'restaurante/DividirCuentaDialog',
    estado: 'vacio',
    razon:
      'Diálogo: MesaActiva sólo ofrece «Dividir» cuando hay platillos enviados, así que nunca se abre sin líneas que repartir. Tenía un Vacio para ese caso y era una guarda inalcanzable (C.12 de la 2.4).',
  },
  {
    pantalla: 'restaurante/DividirCuentaDialog',
    estado: 'cargando',
    razon:
      'Diálogo: MesaActiva le pasa por props los platillos enviados y la orden; no hay lectura que esperar. Lo único asíncrono es el comando dividir-cuenta, pintado con el botón `cargando` («Dividiendo…»).',
  },
  {
    pantalla: 'abarrotes/BasculaDeEtiquetas',
    estado: 'vacio',
    razon:
      'Formulario del layout de la báscula: siempre tiene sus seis campos —con el de fábrica si el negocio no declaró uno—. No hay lista que pueda llegar vacía (C.10 de la 2.4).',
  },
  {
    pantalla: 'abarrotes/cobro/AbonoRapido',
    estado: 'vacio',
    razon:
      'Formulario del abono: la lista de clientes, que sí puede llegar vacía, la pinta ElegirCliente —montada dentro— con su Vacio.',
  },
  {
    pantalla: 'abarrotes/cobro/AbonoRapido',
    estado: 'cargando',
    razon:
      'No lee nada propio: ElegirCliente pinta su EsqueletoDeLista mientras lee los clientes, y registrar el abono pone el botón en «Registrando…».',
  },
  {
    pantalla: 'abarrotes/cobro/Avisos',
    estado: 'vacio',
    razon:
      'Pieza de avisos del cobro: pinta un Aviso o nada. La venta vacía la pinta Cobrar con su Vacio; aquí no hay lista.',
  },
  {
    pantalla: 'abarrotes/cobro/Avisos',
    estado: 'cargando',
    razon:
      'No lee nada: recibe por props lo que ya pasó —una apartada, un abono, una etiqueta mal leída— y lo dice.',
  },
  {
    pantalla: 'abarrotes/cobro/BloqueDeCobro',
    estado: 'vacio',
    razon:
      'El bloque de cobro no tiene lista: la venta vacía la pinta Cobrar con su Vacio, y aquí COBRAR se queda apagado sin líneas.',
  },
  {
    pantalla: 'abarrotes/cobro/BloqueDeCobro',
    estado: 'cargando',
    razon:
      'No lee nada: recibe el total, el método y el cliente por props. Mientras cobra, CONFIRMAR dice «Cobrando…».',
  },
  {
    pantalla: 'abarrotes/cobro/TeclasRapidas',
    estado: 'vacio',
    razon:
      'Sin ventas no hay «los de siempre» y la fila NO se pinta: rellenarla con los primeros del catálogo enseñaría una memoria muscular falsa (D-21).',
  },
  {
    pantalla: 'abarrotes/cobro/TeclasRapidas',
    estado: 'cargando',
    razon:
      'Recibe los productos por props. Mientras los más vendidos no llegan la fila no aparece, y el cobro funciona igual sin ella.',
  },
  {
    pantalla: 'abarrotes/cobro/TeclasRapidas',
    estado: 'error',
    razon:
      'Si los más vendidos no se leen, la fila no aparece: es una ayuda para cobrar, y un aviso de error ahí taparía la venta en curso.',
  },
  {
    pantalla: 'abarrotes/cobro/columnas',
    estado: 'vacio',
    razon:
      'No es una pantalla: son las columnas del ticket que Cobrar pinta en su Tabla, con el Vacio de Cobrar.',
  },
  {
    pantalla: 'abarrotes/cobro/columnas',
    estado: 'cargando',
    razon:
      'No es una pantalla: son las columnas del ticket; el esqueleto de la venta lo pinta Cobrar mientras lee el catálogo.',
  },
  {
    pantalla: 'abarrotes/cobro/columnas',
    estado: 'error',
    razon:
      'No es una pantalla: son las columnas del ticket; el fallo de lectura o de cobro lo dice Cobrar en su Aviso.',
  },
  {
    pantalla: 'abarrotes/conteo/MotivoDeLaDiferencia',
    estado: 'vacio',
    razon:
      'Celda de la tabla de diferencias del conteo: sin motivos leídos no pinta el selector y la diferencia se cierra con el de omisión, como antes.',
  },
  {
    pantalla: 'abarrotes/conteo/MotivoDeLaDiferencia',
    estado: 'cargando',
    razon:
      'Celda de una tabla ya pintada: mientras llegan los motivos se ve el enlace al kardex y el selector aparece al llegar; un esqueleto por renglón sería ruido.',
  },
  {
    pantalla: 'abarrotes/conteo/MotivoDeLaDiferencia',
    estado: 'error',
    razon:
      'Si los motivos no se leen, la diferencia se cierra con el motivo de omisión: el conteo no se pierde por una lista de apoyo.',
  },
  {
    pantalla: 'abarrotes/entradas/CanjeDeLaNota',
    estado: 'cargando',
    razon:
      'Los artículos llegan por props con el sugerido; los motivos se leen aparte y, mientras tanto, el selector ofrece «Caducado», que es el del canje.',
  },
  {
    pantalla: 'abarrotes/entradas/CanjeDeLaNota',
    estado: 'error',
    razon:
      'Si los motivos no se leen queda «Caducado»; y el fallo al guardar la nota —con su canje— lo dice Entradas en su Aviso, sin perder lo capturado.',
  },
  {
    pantalla: 'cafeteria/TasaDeTerminal',
    estado: 'vacio',
    razon:
      'Formulario de un solo campo —la tasa de la terminal—: no hay lista que pueda llegar vacía; aparece sólo cuando la tasa falta (C.10 de la 2.4).',
  },
  {
    pantalla: 'cafeteria/TasaDeTerminal',
    estado: 'cargando',
    razon:
      'No lee nada: CierreDeTurno lo monta con la hoja del corte ya leída, y guardar la tasa pone el botón en cargando.',
  },
  {
    pantalla: 'cafeteria/CostoPorCanal',
    estado: 'vacio',
    razon:
      'Pieza de Recetas: sólo se monta cuando la receta ya tiene líneas; la receta vacía la pinta Recetas con su Vacio.',
  },
  {
    pantalla: 'cafeteria/CostoPorCanal',
    estado: 'cargando',
    razon:
      'Pieza de Recetas: recibe el costo ya sumado de líneas ya leídas; el esqueleto de la carga es el de Recetas.',
  },
  {
    pantalla: 'cafeteria/CostoPorCanal',
    estado: 'error',
    razon:
      'Pieza de Recetas: no lee nada; si la receta no se pudo leer, Recetas pinta su ErrorDePantalla y esta pieza no se monta.',
  },
  {
    pantalla: 'cafeteria/FormularioDeLinea',
    estado: 'vacio',
    razon:
      'Pieza de Recetas: captura una línea; sin ingredientes dados de alta ya pinta su Aviso que lleva al inventario.',
  },
  {
    pantalla: 'cafeteria/FormularioDeLinea',
    estado: 'cargando',
    razon:
      'Pieza de Recetas: sólo se monta con las líneas e ingredientes ya leídos; la carga es de Recetas.',
  },
  {
    pantalla: 'estetica-salon/CostoDelServicio',
    estado: 'vacio',
    razon:
      'Pieza de la cita en curso: una cita sin servicios no tiene costo que enseñar; su vacío lo pinta CitaEnCurso.',
  },
  {
    pantalla: 'estetica-salon/CostoDelServicio',
    estado: 'error',
    razon:
      'Pieza informativa: si la receta o la cotización no se leen, cada cifra dice «—» en su lugar, sin tapar la cita.',
  },
  {
    pantalla: 'estetica-salon/FotosDeLaCita',
    estado: 'vacio',
    razon:
      'Pieza de captura: son siempre las dos teselas, antes y después; sin servicio abierto lo dice con palabras.',
  },
  {
    pantalla: 'estetica-salon/FotosDeLaCita',
    estado: 'cargando',
    razon:
      'Pieza de captura: no lee nada al montarse; mientras sube, la tesela dice «subiendo…».',
  },
  {
    pantalla: 'estetica-salon/LaCabinaContraLaAgenda',
    estado: 'vacio',
    razon:
      'Pieza de pregunta: antes de preguntar no hay lista; sin servicios de hoy lo dice con un aviso.',
  },
  {
    pantalla: 'estetica-salon/LaCabinaContraLaAgenda',
    estado: 'cargando',
    razon:
      'Pieza de pregunta: no lee al montarse; mientras pregunta, el botón queda apagado.',
  },
  {
    pantalla: 'estetica-salon/NotaDeLaCita',
    estado: 'vacio',
    razon:
      'Pieza de captura: el campo vacío ES el estado vacío, con su texto de ayuda.',
  },
  {
    pantalla: 'estetica-salon/NotaDeLaCita',
    estado: 'cargando',
    razon:
      'Pieza de captura: recibe la nota ya leída por CitaEnCurso; al guardar lo dice el indicador de guardado.',
  },
  {
    pantalla: 'estetica-salon/ReglaDeComision',
    estado: 'vacio',
    razon:
      'Pieza de la liquidación: sin regla propia lo dice con palabras («manda la de cada servicio»), no con un vacío.',
  },
  {
    pantalla: 'ferreteria/ImportarLaNota',
    estado: 'vacio',
    razon:
      'Pieza de Entradas: un campo de archivo, sin lista propia; lo que el archivo propone lo pinta la nota de Entradas con su vacío.',
  },
  {
    pantalla: 'ferreteria/ImportarLaNota',
    estado: 'cargando',
    razon:
      'Mientras lee el archivo el campo se deshabilita con aria-busy: no hay lista que esperar, y lo propuesto aparece en la nota de Entradas.',
  },
  {
    pantalla: 'ferreteria/ImportarLaNota',
    estado: 'error',
    razon:
      'El fallo —columna que falta, filas ilegibles, respuesta del servidor— sube a Entradas por alFallar y se pinta en su Aviso de peligro.',
  },
  {
    pantalla: 'ferreteria/ContraElPedido',
    estado: 'cargando',
    razon:
      'Pieza de Entradas: recibe la sugerencia y las partidas ya leídas por Entradas, que tiene su esqueleto; no lee nada por su cuenta.',
  },
  {
    pantalla: 'ferreteria/ContraElPedido',
    estado: 'error',
    razon:
      'No hace ninguna lectura propia: el fallo de la sugerencia lo dice Entradas en su Aviso, y aquí queda el vacío que lo explica.',
  },
  {
    pantalla: 'configuracion/SelectorDeApariencia',
    estado: 'vacio',
    razon:
      'Los ocho estilos y sus perillas son constantes del sistema de diseño (ESTILOS, PERILLAS), no datos de la red: no hay ninguna lista que pueda llegar vacía.',
  },
  {
    pantalla: 'cliente/en-linea',
    estado: 'vacio',
    razon:
      'No es una pantalla: es el AVISO «Sin internet. No se puede cobrar» que las cinco pantallas de cobro montan cuando se cae la red. No lista nada que pueda llegar vacío.',
  },
  {
    pantalla: 'cliente/en-linea',
    estado: 'cargando',
    razon:
      'El aviso lee `navigator.onLine` al montar, de forma síncrona: no hay espera que enseñar. Sin red, el aviso ES el estado.',
  },
  {
    pantalla: 'entrada/EntradaSinNegocio',
    estado: 'cargando',
    razon:
      'Se pinta en el servidor con el HTML y no lee nada: es la entrada de un despliegue de varios negocios cuando la dirección no nombra ninguno. No hay espera que enseñar.',
  },
  {
    pantalla: 'entrada/EntradaSinNegocio',
    estado: 'error',
    razon:
      'No tiene una operación que pueda fallar: ni lectura ni comando. Es un texto fijo que dice por dónde se entra; si la resolución del negocio falla, `/login-pos` ya cae aquí.',
  },
  {
    pantalla: 'ferreteria/AbrirConteo',
    estado: 'vacio',
    razon:
      'Pieza de Existencias: sin zonas dadas de alta sigue ofreciendo «Toda la ferretería», que es un alcance válido del comando. No hay una lista vacía que explicar; lo que se lee se espera con Esqueleto y su fallo es un Aviso.',
  },
  {
    pantalla: 'ferreteria/CerrarConteo',
    estado: 'vacio',
    razon:
      'Pieza del conteo: un botón de cerrar con su confirmación. No lista nada; la toma que cierra llega por props desde la dirección.',
  },
  {
    pantalla: 'ferreteria/CerrarConteo',
    estado: 'cargando',
    razon:
      'Pieza del conteo: no lee nada. Lo único asíncrono es el cierre, y mientras corre su botón pasa a «Cerrando…» con `cargando`.',
  },
  {
    pantalla: 'ferreteria/EfectivoYMixto',
    estado: 'vacio',
    razon:
      'Pieza de la caja: lo recibido, los billetes probables y los tres métodos del mixto salen del total de la nota, que llega por props. No hay lista de la red que pueda llegar vacía.',
  },
  {
    pantalla: 'ferreteria/EfectivoYMixto',
    estado: 'cargando',
    razon:
      'Pieza de la caja: no lee nada. Lo único asíncrono es el cobro, y mientras corre su botón pasa a «Cobrando…» con `cargando`.',
  },
  {
    pantalla: 'estetica-salon/DescuentoDelCobro',
    estado: 'vacio',
    razon:
      'Pieza del cobro: un campo de porcentaje y la frase del §3 con la cotización de ESE porcentaje. No lista nada que pueda llegar vacío; mientras cotiza pinta Esqueleto y si falla un Aviso.',
  },
  {
    pantalla: 'estetica-salon/PagoDelCobro',
    estado: 'vacio',
    razon:
      'Pieza del cobro: los tres métodos y el mixto son fijos del comando `venta.cobrar_cita`, y quienes atendieron llegan por props desde Cobrar. No hay lista de la red que pueda llegar vacía.',
  },
  {
    pantalla: 'estetica-salon/PagoDelCobro',
    estado: 'cargando',
    razon:
      'Pieza del cobro: no lee nada. Lo que queda por cobrar llega por props, y mientras Cobrar lo cotiza enseña el Esqueleto del total y deja COBRAR apagado.',
  },
  {
    pantalla: 'estetica-salon/PropinaDelCobro',
    estado: 'vacio',
    razon:
      'Pieza del cobro: los tres porcentajes y los tres caminos son constantes del documento del giro, y el equipo llega por props. No hay lista de la red que pueda llegar vacía.',
  },
  {
    pantalla: 'estetica-salon/PropinaDelCobro',
    estado: 'cargando',
    razon:
      'Pieza del cobro: no lee ni escribe nada. La propina viaja con el cobro, y la espera de ESE comando la pinta Cobrar en su botón («Cobrando…»).',
  },
  {
    pantalla: 'estetica-salon/PropinaDelCobro',
    estado: 'error',
    razon:
      'Pieza del cobro sin operación propia que pueda fallar: si el servidor rechaza la propina, el rechazo llega al cobrar y Cobrar lo pinta en su Aviso de peligro, con todo lo capturado en su sitio.',
  },
  {
    pantalla: 'corte/CorteEnPdf',
    estado: 'vacio',
    razon:
      'Se monta sólo con la sesión que se acaba de cerrar, y una sesión cerrada siempre tiene corte: encabezado, arqueo y firmas. No hay lista que pueda llegar vacía; lo que falta dentro se omite sección por sección (C.6 de la 2.4).',
  },
  {
    pantalla: 'corte/HojaDelCorte',
    estado: 'vacio',
    razon:
      'Es el DOCUMENTO impreso, no una pantalla: recibe el corte ya armado por props y siempre lleva encabezado, arqueo y firmas. Sus tablas vacías no se pintan («ninguna sección en cero», §9.4 de cada giro).',
  },
  {
    pantalla: 'corte/HojaDelCorte',
    estado: 'cargando',
    razon:
      'Es el DOCUMENTO impreso: no lee nada, se pinta fuera de pantalla con el corte que CorteEnPdf ya leyó, y es CorteEnPdf quien pinta el Esqueleto mientras lee.',
  },
  {
    pantalla: 'corte/HojaDelCorte',
    estado: 'error',
    razon:
      'Es el DOCUMENTO impreso: no tiene operación que falle. Si la lectura falla, CorteEnPdf pinta su Aviso y NO se genera archivo: un PDF con ceros guardado como corte es peor que ninguno.',
  },
  {
    pantalla: 'configuracion/SelectorDeApariencia',
    estado: 'cargando',
    razon:
      'La apariencia la escribe el servidor en el <html> antes de la primera pintura y el proveedor no hace fetch. Lo único asíncrono es el POST de guardar, con el botón en `cargando`.',
  },
];

const argumentos = process.argv.slice(2);
const conDetalle = argumentos.includes('--detalle');
const comoJson = argumentos.includes('--json');
const solo = argumentos.includes('--solo') ? argumentos[argumentos.indexOf('--solo') + 1] : null;

function archivos(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return nombre.endsWith('.tsx') && !nombre.includes('.test.') ? [ruta] : [];
  });
}

const ESTADOS = {
  vacio: 'no pinta Vacio',
  cargando: 'no pinta Esqueleto ni EsqueletoDeLista',
  error: 'no pinta ErrorDePantalla ni Aviso',
};

const filas = [];
const problemasDeLaLista = [];

for (const ruta of archivos(PANTALLAS).sort()) {
  const pantalla = relative(PANTALLAS, ruta)
    .split(sep)
    .join('/')
    .replace(/\.tsx$/, '');
  if (solo !== null && pantalla !== solo && !pantalla.startsWith(`${solo}/`)) continue;
  const { interfaz, hallazgos, pinta } = analizarPantalla(readFileSync(ruta, 'utf8'), ruta);
  if (!interfaz) {
    filas.push({ pantalla, interfaz, hallazgos: [] });
    continue;
  }
  for (const [estado, motivo] of Object.entries(ESTADOS)) {
    const declarada = SIN_ESTADO.find((e) => e.pantalla === pantalla && e.estado === estado);
    if (declarada !== undefined && pinta[estado]) {
      problemasDeLaLista.push(
        `${pantalla} · «${estado}» declarado sin estado, y lo pinta: borra la fila`,
      );
    }
    if (!pinta[estado] && declarada === undefined)
      hallazgos.push({ condicion: '1.4', motivo, linea: 0 });
  }
  filas.push({ pantalla, interfaz, hallazgos });
}

for (const e of SIN_ESTADO) {
  if (!existsSync(join(PANTALLAS, `${e.pantalla}.tsx`))) {
    problemasDeLaLista.push(`${e.pantalla} · declarada sin «${e.estado}» y no existe`);
  }
  if (typeof e.razon !== 'string' || e.razon.length < 40) {
    problemasDeLaLista.push(`${e.pantalla} · «${e.estado}» sin una razón que diga por qué`);
  }
}

const deInterfaz = filas.filter((f) => f.interfaz);
const adoptadas = deInterfaz.filter((f) => f.hallazgos.length === 0);
const rojas = deInterfaz.length - adoptadas.length;

if (comoJson) {
  process.stdout.write(
    `${JSON.stringify({ filas, adoptadas: adoptadas.length, rojas, problemasDeLaLista }, null, 1)}\n`,
  );
  process.exit(rojas > 0 || problemasDeLaLista.length > 0 ? 1 : 0);
}

/** `1.1 superficie a mano en <div> ×3 · 1.3 …`: el mismo motivo se cuenta, no se repite. */
function resumen(hallazgos) {
  const cuenta = new Map();
  for (const h of hallazgos) {
    const clave = `${h.condicion} ${h.motivo}`;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  return [...cuenta].map(([clave, n]) => (n > 1 ? `${clave} ×${n}` : clave)).join(' · ');
}

const ancho = Math.max(...filas.map((f) => f.pantalla.length)) + 2;
console.log(
  `verify:adopcion · ${filas.length} archivos de apps/web/src contra las cuatro condiciones\n`,
);
console.log(`${'pantalla'.padEnd(ancho)}adoptada  qué le falta`);
for (const f of filas) {
  if (!f.interfaz) {
    console.log(
      `${f.pantalla.padEnd(ancho)}—         no es una pantalla: no pinta ningún elemento`,
    );
    continue;
  }
  const si = f.hallazgos.length === 0;
  console.log(
    `${f.pantalla.padEnd(ancho)}${si ? 'sí' : 'NO'}        ${si ? '' : resumen(f.hallazgos)}`,
  );
  if (conDetalle && !si) {
    for (const h of f.hallazgos.toSorted((a, b) => a.linea - b.linea)) {
      console.log(
        `${' '.repeat(ancho + 4)}${h.linea > 0 ? `:${h.linea}`.padEnd(6) : '      '}${h.condicion} ${h.motivo}`,
      );
    }
  }
}

const porCondicion = (c) =>
  deInterfaz.filter((f) => f.hallazgos.some((h) => h.condicion === c)).length;
console.log(`\n${adoptadas.length} de ${deInterfaz.length} pantallas adoptadas · ${rojas} en rojo`);
console.log(`  1.1 superficies a mano ........ ${porCondicion('1.1')}`);
console.log(`  1.2 tablas o filas a mano ..... ${porCondicion('1.2')}`);
console.log(`  1.3 dinero a mano ............. ${porCondicion('1.3')}`);
console.log(`  1.4 estados fuera del sistema . ${porCondicion('1.4')}`);
const sinInterfaz = filas.length - deInterfaz.length;
if (sinInterfaz > 0)
  console.log(`  (${sinInterfaz} archivo(s) sin interfaz: proveedores, no pantallas)`);

for (const p of problemasDeLaLista) console.log(`✗ ${p}`);
if (rojas > 0 || problemasDeLaLista.length > 0) {
  console.log(
    `\n✗ La adopción NO está completa.${conDetalle ? '' : ' `--detalle` da cada hallazgo con su línea.'}`,
  );
  process.exit(1);
}
console.log('\n✓ Las pantallas usan el sistema: superficies, tablas, dinero y estados.');
