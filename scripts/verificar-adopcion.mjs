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
