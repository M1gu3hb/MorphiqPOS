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

import { analizarPantalla, pintaConEnvoltorios } from './lib/adopcion.mjs';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const PANTALLAS = join(RAIZ, 'apps', 'web', 'src');

/**
 * El texto del módulo de un envoltorio local, visto desde la pantalla que lo importa:
 * relativo a ella, o `~/` desde `apps/web/src` (el alias de `tsconfig`). `null` si no
 * existe: un envoltorio que no se puede leer no cuenta.
 */
function lectorDesde(ruta) {
  return (modulo) => {
    const base = modulo.startsWith('~/')
      ? join(PANTALLAS, modulo.slice(2))
      : join(dirname(ruta), modulo);
    for (const candidato of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) {
      if (existsSync(candidato)) return readFileSync(candidato, 'utf8');
    }
    return null;
  };
}

/**
 * LOS ESTADOS QUE UNA PANTALLA NO TIENE, declarados y no escondidos.
 *
 * Una fila por pantalla y estado, con la razón de por qué ESE estado no existe en
 * esa pantalla —no «pendiente»—. La puerta falla también al revés: si la pantalla
 * acaba pintando el estado, la fila sobra y hay que borrarla.
 */
export const SIN_ESTADO = [
  {
    pantalla: 'configuracion/ExperienciaDelNegocio',
    estado: 'vacio',
    razon:
      'Dos interruptores de la configuración del negocio (DP-11.1 y 11.2): no tiene lista que pueda llegar vacía.',
  },
  {
    pantalla: 'configuracion/ExperienciaDelNegocio',
    estado: 'cargando',
    razon:
      'No lee nada al pintarse: el valor llega del servidor con la página (useExperiencia). Mientras guarda, el interruptor queda deshabilitado.',
  },
  {
    pantalla: 'configuracion/ModoEsperaDelAparato',
    estado: 'vacio',
    razon:
      'Un interruptor y un selector de minutos de ESTE aparato (DP-11.2): no tiene lista que pueda llegar vacía.',
  },
  {
    pantalla: 'configuracion/ModoEsperaDelAparato',
    estado: 'cargando',
    razon:
      'Lee el almacén del navegador, que responde al instante; sin almacén pinta lo de omisión. No hay viaje al servidor.',
  },
  {
    pantalla: 'espera/CapaModal',
    estado: 'vacio',
    razon:
      'El marco de las capas del modo espera (DP-11.2): un `<dialog>` en la capa superior que pinta lo que le dan. No tiene lista propia.',
  },
  {
    pantalla: 'espera/CapaModal',
    estado: 'cargando',
    razon: 'No lee nada: abre el diálogo al montarse y lo cierra al quitarse.',
  },
  {
    pantalla: 'espera/CapaModal',
    estado: 'error',
    razon: 'No hace viajes. Lo que pinta adentro (la espera, el PIN) dice sus propios errores.',
  },
  {
    pantalla: 'espera/ModoEspera',
    estado: 'vacio',
    razon: 'Monta la capa del modo espera o el PIN según la fase (DP-11.2); no pinta lista alguna.',
  },
  {
    pantalla: 'espera/ModoEspera',
    estado: 'cargando',
    razon:
      'No lee nada: la marca y la sesión ya están en sus contextos y la fase la decide el reloj del aparato.',
  },
  {
    pantalla: 'espera/ModoEspera',
    estado: 'error',
    razon:
      'No hace viajes: decide qué capa va encima. El error del PIN lo dice `PedirPinAlDespertar`.',
  },
  {
    pantalla: 'espera/PantallaDeEspera',
    estado: 'vacio',
    razon:
      'La pantalla dormida (DP-11.2): la hora, la fecha, el logo y Morfi. No tiene lista que pueda llegar vacía.',
  },
  {
    pantalla: 'espera/PantallaDeEspera',
    estado: 'cargando',
    razon:
      'La hora sale del reloj del aparato; Morfi trae su imagen fija como póster mientras llega el clip.',
  },
  {
    pantalla: 'espera/PantallaDeEspera',
    estado: 'error',
    razon:
      'No hace viajes. Si un clip de Morfi no carga, `ClipDeMorfi` se queda con la imagen fija.',
  },
  {
    pantalla: 'espera/PedirPinAlDespertar',
    estado: 'vacio',
    razon: 'Un teclado de PIN (DP-11.2): no tiene lista que pueda llegar vacía.',
  },
  {
    pantalla: 'espera/PedirPinAlDespertar',
    estado: 'cargando',
    razon:
      'Mientras comprueba el PIN, las teclas quedan deshabilitadas; no carga nada al pintarse.',
  },
  {
    pantalla: 'morfi/ClipDeMorfi',
    estado: 'vacio',
    razon:
      'Pieza decorativa (DP-11.1): pinta un clip de Morfi o su imagen fija; no tiene lista que pueda llegar vacía. El texto de al lado dice lo que pasa.',
  },
  {
    pantalla: 'morfi/ClipDeMorfi',
    estado: 'cargando',
    razon:
      'Pieza decorativa: mientras el clip se descarga se ve su imagen fija, y antes de saber el navegador un hueco del mismo tamaño. No lee datos.',
  },
  {
    pantalla: 'morfi/ClipDeMorfi',
    estado: 'error',
    razon:
      'Pieza decorativa: si el clip no se puede reproducir (sin red, sin archivo, sin alfa) se queda en su imagen fija, y el texto de la pantalla sigue diciendo lo que pasa.',
  },
  {
    pantalla: 'morfi/HoyoEnLaTarjeta',
    estado: 'vacio',
    razon:
      'Dibujo SVG del hoyo de la página que no existe (DP-11.1): no tiene lista ni contenido que pueda faltar.',
  },
  {
    pantalla: 'morfi/HoyoEnLaTarjeta',
    estado: 'cargando',
    razon: 'Dibujo SVG en línea: no se descarga ni lee nada, así que no tiene espera que enseñar.',
  },
  {
    pantalla: 'morfi/HoyoEnLaTarjeta',
    estado: 'error',
    razon:
      'Dibujo SVG en línea: no lee nada ni manda comandos, así que no tiene nada que pueda fallar.',
  },
  {
    pantalla: 'morfi/MorfiCargando',
    estado: 'vacio',
    razon:
      'ES la espera de una pantalla entera (DP-11.1, PantallaDeCarga con Morfi): no tiene lista; lo que llega después lo pinta la pantalla que cargaba.',
  },
  {
    pantalla: 'morfi/MorfiCargando',
    estado: 'error',
    razon:
      'ES la espera: si lo que se carga falla, lo dice la pantalla que lo pidió (AppLayout manda a la entrada, el portal pinta su error).',
  },
  {
    pantalla: 'morfi/MorfiNoEncontrada',
    estado: 'cargando',
    razon:
      'La página que no existe (DP-11.1) no lee nada: recibe su título, su explicación y su acción por props.',
  },
  {
    pantalla: 'morfi/MorfiNoEncontrada',
    estado: 'error',
    razon:
      'Ya es el estado de «no está»: su título y su acción dicen qué hacer; no manda comandos que puedan fallar.',
  },
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
    pantalla: 'cliente/EstadosDeCarga',
    estado: 'vacio',
    razon:
      'Pieza de los estados de carga de las pantallas heredadas (21-10): pinta el esqueleto con su espacio reservado y el error con «Reintentar»; el vacío real lo dice cada pantalla que la monta.',
  },
  {
    pantalla: 'configuracion/ModoPresentacionAlCliente',
    estado: 'vacio',
    razon:
      'Interruptor del modo presentación (21-10): no lista nada; mientras lee su estado pinta EsqueletoDeLista y si falla un Aviso de peligro.',
  },
  {
    pantalla: 'proveedores/Proveedores',
    estado: 'vacio',
    razon:
      'No es una pantalla: monta apariencia, sesión, caché de consultas y avisos alrededor de la aplicación.',
  },
  {
    pantalla: 'proveedores/Proveedores',
    estado: 'cargando',
    razon: 'No es una pantalla: no lee nada; cada pantalla de dentro pinta su propia espera.',
  },
  {
    pantalla: 'proveedores/Proveedores',
    estado: 'error',
    razon: 'No es una pantalla: no lee nada; cada pantalla de dentro pinta su propio error.',
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
    pantalla: 'abarrotes/cobro/DepositoDeEnvase',
    estado: 'vacio',
    razon:
      'Formulario del casco (F-256, bloque D de la 2.4): cuántos y a cuánto. No hay lista que pueda llegar vacía; el saldo de envases lo dice el corte.',
  },
  {
    pantalla: 'abarrotes/cobro/DepositoDeEnvase',
    estado: 'cargando',
    razon:
      'No lee nada antes de pintarse: lo único asíncrono es mover el depósito, y mientras corre el botón pasa a `cargando`.',
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
    razon: 'Pieza de captura: no lee nada al montarse; mientras sube, la tesela dice «subiendo…».',
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
    razon: 'Pieza de pregunta: no lee al montarse; mientras pregunta, el botón queda apagado.',
  },
  {
    pantalla: 'estetica-salon/NotaDeLaCita',
    estado: 'vacio',
    razon: 'Pieza de captura: el campo vacío ES el estado vacío, con su texto de ayuda.',
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
    pantalla: 'ferreteria/LlaveYLimite',
    estado: 'vacio',
    razon:
      'Dos formularios de la ficha del cliente (la llave y el límite): no listan nada que pueda llegar vacío; lo que falta lo dicen con su botón apagado.',
  },
  {
    pantalla: 'ferreteria/LlaveYLimite',
    estado: 'cargando',
    razon:
      'No leen nada: escriben. Mientras envían, el botón dice que carga (cargando) y el resultado se anuncia con su Aviso.',
  },
  {
    pantalla: 'ferreteria/NuevoClienteDeCredito',
    estado: 'vacio',
    razon:
      'Es un formulario de alta dentro de su hoja: no lista datos, así que no hay lista vacía que explicar.',
  },
  {
    pantalla: 'ferreteria/NuevoClienteDeCredito',
    estado: 'cargando',
    razon:
      'No lee nada al abrir: escribe. Mientras da de alta, su botón carga; el fallo se dice en su Aviso.',
  },
  {
    pantalla: 'configuracion/SelectorDeApariencia',
    estado: 'vacio',
    razon:
      'Los ocho estilos y sus perillas son constantes del sistema de diseño (ESTILOS, PERILLAS), no datos de la red: no hay ninguna lista que pueda llegar vacía.',
  },
  {
    pantalla: 'restaurante/PlatilloParaPedir',
    estado: 'vacio',
    razon:
      'No es una pantalla: es UN renglón bajo una página del menú personalizado del portal (DP-5). Sin platillos que pedir, la página no pinta la lista.',
  },
  {
    pantalla: 'restaurante/PlatilloParaPedir',
    estado: 'cargando',
    razon: 'No lee nada: recibe el platillo ya leído por el portal, que enseña su propia espera.',
  },
  {
    pantalla: 'restaurante/PlatilloParaPedir',
    estado: 'error',
    razon:
      'No lee ni escribe: «Agregar» abre el diálogo del portal, que es quien envía y dice si falló.',
  },
  {
    pantalla: 'restaurante/GlobosDeSolicitud',
    estado: 'vacio',
    razon:
      'No es una pantalla: son los globos de UNA mesa en el mapa (DP-9.2). Sin solicitudes no pinta nada: la mesa se ve como siempre.',
  },
  {
    pantalla: 'restaurante/GlobosDeSolicitud',
    estado: 'cargando',
    razon:
      'No lee nada: recibe las solicitudes que el mapa ya leyó, y el mapa enseña su propia espera.',
  },
  {
    pantalla: 'restaurante/menu-qr/PaginaConBotones',
    estado: 'vacio',
    razon:
      'No es una pantalla: es UNA página del menú del portal (DP-9.7). Sin botones es sólo imagen; sin páginas, el portal dice «Sin menú configurado».',
  },
  {
    pantalla: 'restaurante/menu-qr/PaginaConBotones',
    estado: 'cargando',
    razon:
      'No lee nada: recibe la página y el catálogo que el portal ya leyó, y el portal enseña su espera.',
  },
  {
    pantalla: 'restaurante/menu-qr/PaginaConBotones',
    estado: 'error',
    razon:
      'No lee ni escribe: «Agregar» abre el diálogo del portal, que es quien envía y dice si falló.',
  },
  {
    pantalla: 'restaurante/menu-qr/LienzoDeBotones',
    estado: 'vacio',
    razon:
      'No es una pantalla: es la imagen con sus botones dentro del editor (DP-9.7). Sin botones, el editor dice qué hacer al lado.',
  },
  {
    pantalla: 'restaurante/menu-qr/LienzoDeBotones',
    estado: 'cargando',
    razon: 'No lee nada: el editor ya leyó los botones y enseña su espera.',
  },
  {
    pantalla: 'restaurante/menu-qr/LienzoDeBotones',
    estado: 'error',
    razon: 'No escribe: mover un botón es estado local; guardar y su fallo son del editor.',
  },
  {
    pantalla: 'restaurante/menu-qr/PanelDelBoton',
    estado: 'vacio',
    razon:
      'No es una pantalla: es el formulario de UN botón; sin botón elegido no se pinta (el editor dice qué tocar).',
  },
  {
    pantalla: 'restaurante/menu-qr/PanelDelBoton',
    estado: 'cargando',
    razon: 'No lee nada: el catálogo se lo pasa la pestaña Menú QR, que ya lo leyó.',
  },
  {
    pantalla: 'restaurante/menu-qr/EditorDeBotones',
    estado: 'vacio',
    razon:
      'Es un diálogo de edición (DP-9.7): una página sin botones dice «Toca un botón para elegir qué hace, o agrega uno» con un Aviso.',
  },
  {
    pantalla: 'restaurante/menu-qr/AspectoDelPortal',
    estado: 'vacio',
    razon:
      'Es un formulario de tres opciones que siempre tiene valor (el de siempre si no se guardó nada): no hay vacío que enseñar.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/ControlesDelDiseno',
    estado: 'vacio',
    razon:
      'No es una pantalla: son los controles del diseño de un QR dentro del editor (DP-9.8); siempre hay un diseño que editar.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/ControlesDelDiseno',
    estado: 'cargando',
    razon: 'No lee nada: recibe el diseño que el editor ya tiene.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/ControlesDelDiseno',
    estado: 'error',
    razon:
      'No escribe: cambiar un control es estado local; el editor dice lo que falta y si se lee.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/MiniaturaDelQr',
    estado: 'vacio',
    razon: 'No es una pantalla: es la imagen de UN QR (DP-9.8); sin mesa con token no se pinta.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/MiniaturaDelQr',
    estado: 'cargando',
    razon: 'No lee nada: dibuja en el momento el diseño que recibe.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/MiniaturaDelQr',
    estado: 'error',
    razon: 'No escribe ni lee: el diseño que recibe ya pasó la validación.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/DisenoDeLaMesa',
    estado: 'vacio',
    razon:
      'No es una pantalla: es el QR de UNA mesa en su tarjeta (DP-9.8); sin token dice «Sin token», y sin mesas la pestaña enseña su vacío.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/DisenoDeLaMesa',
    estado: 'cargando',
    razon: 'No lee nada: el diseño lo leyó la pestaña, y su panel enseña la espera.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/DescargasDeLaMesa',
    estado: 'vacio',
    razon: 'No es una pantalla: son las descargas de UNA mesa en su diálogo (DP-9.8).',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/DescargasDeLaMesa',
    estado: 'cargando',
    razon: 'No lee nada: mientras revisa y arma el archivo, el botón dice «Revisando…».',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/EditorDeDisenoDeQr',
    estado: 'vacio',
    razon: 'No es una pantalla: es el diálogo de UN diseño (DP-9.8); siempre abre con uno.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/EditorDeDisenoDeQr',
    estado: 'cargando',
    razon: 'No lee nada: recibe el diseño ya leído; la revisión de lectura se anuncia con Aviso.',
  },
  {
    pantalla: 'restaurante/qr-de-mesas/PanelDeLosQr',
    estado: 'vacio',
    razon:
      'Sin mesas con token no hay QR que diseñar: lo dice un Aviso que manda a «Generar tokens faltantes», el botón de al lado (DP-9.8).',
  },
  {
    pantalla: 'telefono-de-cocina/ComandaEnElTelefono',
    estado: 'vacio',
    razon:
      'No es una pantalla: es la tarjeta de UNA comanda en el teléfono de cocina (DP-9.4). Sin comanda no se pinta: el teléfono enseña su Vacio.',
  },
  {
    pantalla: 'telefono-de-cocina/ComandaEnElTelefono',
    estado: 'cargando',
    razon:
      'No lee nada: recibe la comanda que el teléfono ya leyó, y el teléfono enseña su espera.',
  },
  {
    pantalla: 'telefono-de-cocina/ConectarTelefono',
    estado: 'vacio',
    razon:
      'Es un diálogo de un paso (DP-9.4): sin estaciones activas dice por qué con un Aviso dentro del diálogo, no con una pantalla vacía.',
  },
  {
    pantalla: 'restaurante/IconoDeSolicitud',
    estado: 'vacio',
    razon: 'No es una pantalla: es el icono de UN tipo de solicitud (DP-9.3); siempre tiene uno.',
  },
  {
    pantalla: 'restaurante/IconoDeSolicitud',
    estado: 'cargando',
    razon: 'No lee nada: recibe el tipo de quien lo pinta.',
  },
  {
    pantalla: 'restaurante/IconoDeSolicitud',
    estado: 'error',
    razon: 'No lee ni escribe: no tiene cómo fallar.',
  },
  {
    pantalla: 'restaurante/SelectorDeVista',
    estado: 'vacio',
    razon:
      'No es una pantalla: son los dos botones Mesas / Solicitudes (DP-9.3); siempre están los dos.',
  },
  {
    pantalla: 'restaurante/SelectorDeVista',
    estado: 'cargando',
    razon: 'No lee nada: el número de pendientes se lo pasa la pantalla de Mesas, que ya las leyó.',
  },
  {
    pantalla: 'restaurante/SelectorDeVista',
    estado: 'error',
    razon: 'No escribe en el servidor: recordar la vista en el aparato no falla para quien la usa.',
  },
  {
    pantalla: 'restaurante/AreaDePreparacionSelect',
    estado: 'vacio',
    razon:
      'No es una pantalla: es UN campo de los diálogos de Recetas y Platillos (DP-9.1). Sus opciones son fijas; nunca está vacío.',
  },
  {
    pantalla: 'restaurante/AreaDePreparacionSelect',
    estado: 'cargando',
    razon: 'No lee nada: las cinco áreas son una lista fija del dominio.',
  },
  {
    pantalla: 'restaurante/AreaDePreparacionSelect',
    estado: 'error',
    razon:
      'No lee ni escribe: el diálogo que lo contiene es quien guarda y dice si el servidor se negó.',
  },
  {
    pantalla: 'restaurante/RecetasPendientes',
    estado: 'vacio',
    razon:
      'No es una pantalla: es el aviso «N platillos sin receta» del tablero (DP-5). Con cero no hay nada que avisar, y no pintar nada ES su estado vacío.',
  },
  {
    pantalla: 'restaurante/RecetasPendientes',
    estado: 'cargando',
    razon:
      'Es un aviso dentro del tablero, que ya enseña sus propios esqueletos: mientras cuenta no se pinta, en vez de empujar el tablero con un hueco que luego desaparece.',
  },
  {
    pantalla: 'marca/MarcaMorphiq',
    estado: 'vacio',
    razon:
      'No es una pantalla: es la firma de la plataforma —la palabra «Morphiq» o su logo— que acaba un acceso, un ticket, un PDF o el portal. No lista nada que pueda llegar vacío.',
  },
  {
    pantalla: 'marca/MarcaMorphiq',
    estado: 'cargando',
    razon:
      'No lee nada: la marca es una constante del código (o el archivo del logo, que es estático). No hay espera que enseñar.',
  },
  {
    pantalla: 'marca/MarcaMorphiq',
    estado: 'error',
    razon:
      'No puede fallar al leer: no lee. Si el logo oficial no cargara, el navegador deja el texto alternativo «Morphiq», que es la propia marca.',
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
  {
    pantalla: 'venta/GastoDeCaja',
    estado: 'vacio',
    razon:
      'Formulario del gasto en efectivo (bloque D de la 2.4): sus cinco categorías son fijas de `gastos.registrar` y no hay ninguna lista que pueda llegar vacía.',
  },
  {
    pantalla: 'venta/GastoDeCaja',
    estado: 'cargando',
    razon:
      'No lee nada antes de pintarse: lo único asíncrono es registrar el gasto, y mientras corre el botón pasa a `cargando`.',
  },
  {
    pantalla: 'venta/CorteDeTurno',
    estado: 'vacio',
    razon:
      'Formulario del corte de turno (F-233, bloque D de la 2.4): un importe y una nota. No hay ninguna lista que pueda llegar vacía.',
  },
  {
    pantalla: 'venta/CorteDeTurno',
    estado: 'cargando',
    razon:
      'No lee nada antes de pintarse —el esperado aparece DESPUÉS de contar, a ciegas—; entregar el turno pone el botón en `cargando`.',
  },
  {
    pantalla: 'venta/RetiroDeCaja',
    estado: 'vacio',
    razon:
      'Formulario del retiro (D.1 de la 2.4, el de la tienda y el del salón): un importe y a dónde va. No hay ninguna lista que pueda llegar vacía.',
  },
  {
    pantalla: 'venta/RetiroDeCaja',
    estado: 'cargando',
    razon:
      'No lee nada antes de pintarse: lo único asíncrono es registrar el retiro, y mientras corre el botón pasa a `cargando`.',
  },
  {
    pantalla: 'venta/CampoDePesos',
    estado: 'vacio',
    razon:
      'Es un CAMPO, no una pantalla (D.1 de la 2.4): el importe con su `$` que usan la caja de la tienda y el retiro. No pinta ninguna lista.',
  },
  {
    pantalla: 'venta/CampoDePesos',
    estado: 'cargando',
    razon:
      'Un campo de texto controlado por quien lo monta: no lee nada y no espera nada. La espera, si la hay, la pinta el formulario que lo contiene.',
  },
  {
    pantalla: 'venta/CampoDePesos',
    estado: 'error',
    razon:
      'Un campo no decide si lo tecleado está mal: lo decide `aCentavos` en el formulario que lo monta, y ése pinta su Aviso (la caja de la tienda, el retiro).',
  },
  // ── Las piezas del restaurante que salieron de Cobro, Caja, CierreDiario y MesaActiva
  //    cuando pasaban de las 800 líneas (día completo del restaurante, 2.4). Ninguna lee:
  //    lo que pintan llega por props, y la espera y el fallo de la lectura los pinta la
  //    pantalla que las monta.
  {
    pantalla: 'restaurante/AjustesDeLaCuenta',
    estado: 'vacio',
    razon:
      'Dos diálogos del cobro —el descuento de la cuenta y su cancelación con motivo— que ESCRIBEN y no listan: no hay nada de la red que pueda llegar vacío.',
  },
  {
    pantalla: 'restaurante/AjustesDeLaCuenta',
    estado: 'cargando',
    razon:
      'No lee nada antes de pintarse: la cuenta llega por props desde Cobro. Lo único asíncrono es el comando, y mientras corre su botón pasa a `cargando`.',
  },
  {
    pantalla: 'restaurante/MovimientosDeCaja',
    estado: 'vacio',
    razon:
      'Composición de cuatro formularios de `venta/` (corte de turno, retiro, gasto y devolución), cada uno con sus estados. No lista nada él mismo.',
  },
  {
    pantalla: 'restaurante/MovimientosDeCaja',
    estado: 'cargando',
    razon:
      'Composición sin lectura propia: el turno lo lee la Caja, que pinta su Esqueleto; cada formulario pone su botón en `cargando` mientras escribe.',
  },
  {
    pantalla: 'restaurante/MovimientosDeCaja',
    estado: 'error',
    razon:
      'Composición sin operación propia: el fallo de un retiro, un gasto, una devolución o un corte lo pinta ese formulario en su Aviso.',
  },
  {
    pantalla: 'restaurante/ParedDePropina',
    estado: 'vacio',
    razon:
      'Los porcentajes sugeridos son constantes del giro (§4.3) y la venta llega por props: no hay lista de la red que pueda llegar vacía.',
  },
  {
    pantalla: 'restaurante/ParedDePropina',
    estado: 'cargando',
    razon:
      'Pieza del cobro sin lectura ni escritura: elegir la propina sólo la devuelve a Cobro, que la manda con el cobro y pinta su espera.',
  },
  {
    pantalla: 'restaurante/comanda-de-la-mesa',
    estado: 'vacio',
    razon:
      'Módulo de piezas de MesaActiva —columnas de lo enviado y del borrador, importes y su esqueleto—: la cuenta vacía la dice MesaActiva con su Vacio.',
  },
  {
    pantalla: 'restaurante/comanda-de-la-mesa',
    estado: 'error',
    razon:
      'Sus columnas y su esqueleto no tienen operación que falle; la relectura de lo enviado la llama MesaActiva, que pinta su ErrorDePantalla con «Reintentar».',
  },
  {
    pantalla: 'restaurante/piezas-del-cobro',
    estado: 'vacio',
    razon:
      'Funciones puras del cobro (importe de la línea, qué impide cobrar) y las columnas del desglose que Cobro pinta en su Tabla, con el Vacio de Cobro.',
  },
  {
    pantalla: 'restaurante/piezas-del-cobro',
    estado: 'cargando',
    razon:
      'Son columnas y funciones, no una pantalla: no leen nada; el esqueleto de la cuenta lo pinta Cobro mientras la lee.',
  },
  {
    pantalla: 'restaurante/piezas-del-cobro',
    estado: 'error',
    razon:
      'Sin operación propia que falle: el rechazo del cobro o de la lectura lo dice Cobro en su Aviso, con lo capturado en su sitio.',
  },
  {
    pantalla: 'restaurante/semaforo-del-arqueo',
    estado: 'vacio',
    razon:
      'Traduce una diferencia del arqueo a palabra, forma y tinte («Cuadra exacto», «Falta poco»): no lista nada que pueda llegar vacío.',
  },
  {
    pantalla: 'restaurante/semaforo-del-arqueo',
    estado: 'cargando',
    razon:
      'Pieza del cierre sin lectura: la diferencia llega por props DESPUÉS de contar a ciegas; la espera del cierre la pinta CierreDiario.',
  },
  {
    pantalla: 'restaurante/semaforo-del-arqueo',
    estado: 'error',
    razon:
      'No tiene operación que falle: si el cierre lo rechaza el servidor, CierreDiario lo pinta en su Aviso de peligro.',
  },
  {
    pantalla: 'configuracion/PresentacionDelDueno',
    estado: 'vacio',
    razon:
      'Sin modelos concedidos no hay una lista vacía que explicar: se pinta ModoPresentacion, el modo de presentación de siempre, que es lo que ve el dueño que no es el general (D-42). Con concesión, la lista trae al menos su propio negocio.',
  },
  {
    pantalla: 'restaurante/AccesosDelDueno',
    estado: 'vacio',
    razon:
      'Seis accesos fijos del giro, escritos en el archivo: no hay lista que pueda llegar vacía.',
  },
  {
    pantalla: 'restaurante/AccesosDelDueno',
    estado: 'cargando',
    razon:
      'No lee nada: la sesión ya la trae el proveedor de autenticación del tablero, y sin dueño ni administrador la pieza no se pinta.',
  },
  {
    pantalla: 'restaurante/AccesosDelDueno',
    estado: 'error',
    razon:
      'Son enlaces: ni lee ni escribe, así que no hay operación que pueda fallar dentro de la pieza.',
  },
  {
    pantalla: 'restaurante/DividirLaCuenta',
    estado: 'vacio',
    razon:
      'Es un botón con su diálogo: sin líneas, o con menos de dos unidades que repartir, el botón queda deshabilitado; la lista la pinta DividirCuentaDialog.',
  },
  {
    pantalla: 'restaurante/DividirLaCuenta',
    estado: 'cargando',
    razon:
      'Las líneas llegan por props de la pantalla de cobro, que pinta su propia carga; mientras son `null` el botón está deshabilitado.',
  },
  {
    pantalla: 'restaurante/DividirLaCuenta',
    estado: 'error',
    razon:
      'No lee ni escribe por sí misma: dividir lo hace DividirCuentaDialog, que pinta su fallo con un Aviso.',
  },
  {
    pantalla: 'restaurante/ListosParaRecoger',
    estado: 'vacio',
    razon:
      'Sin platillos en la ventana la pieza no se pinta: su lugar es el del catálogo de la mesa, y un «no hay nada listo» permanente sería ruido en la pantalla del mesero.',
  },
  {
    pantalla: 'restaurante/ListosParaRecoger',
    estado: 'cargando',
    razon:
      'Recibe los listos por props y se relee cada pocos segundos: hasta que hay algo listo no se pinta nada, y un esqueleto parpadearía con cada relectura sobre la mesa que ya está en pantalla.',
  },
  {
    pantalla: 'restaurante/PedirLaCuentaDialog',
    estado: 'vacio',
    razon:
      'Diálogo con las opciones de propina fijas del giro (OPCIONES_DE_PROPINA): no hay lista que pueda llegar vacía.',
  },
  {
    pantalla: 'restaurante/PedirLaCuentaDialog',
    estado: 'cargando',
    razon:
      'No lee nada antes de pintarse: el total llega por props. Lo único asíncrono es pedir la cuenta, y mientras corre las teselas quedan deshabilitadas.',
  },
  {
    pantalla: 'restaurante/QuePasoConLoQuitado',
    estado: 'vacio',
    razon:
      'Un selector donde «Corrección de conteo» siempre está: la lista nunca llega vacía, y sin motivos de merma queda esa opción.',
  },
  {
    pantalla: 'restaurante/QuePasoConLoQuitado',
    estado: 'cargando',
    razon:
      'Los motivos se leen una vez, y mientras llegan el selector ya ofrece «Corrección de conteo»: no hay nada que esperar para corregir.',
  },
  {
    pantalla: 'restaurante/QuePasoConLoQuitado',
    estado: 'error',
    razon:
      'Va dentro del renglón de un ajuste de inventario: si los motivos no se leen lo dice en una línea bajo el selector y deja la corrección de conteo. Un Aviso o un ErrorDePantalla ahí ocuparía el renglón entero.',
  },
  {
    pantalla: 'restaurante/unir-mesas/SepararMesasDialog',
    estado: 'vacio',
    razon: 'Diálogo de confirmación de un grupo que ya existe: no tiene lista.',
  },
  {
    pantalla: 'restaurante/unir-mesas/SepararMesasDialog',
    estado: 'cargando',
    razon: 'No lee nada: recibe la unión por props. Mientras separa, su botón dice «Separando…».',
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
  const analisis = analizarPantalla(readFileSync(ruta, 'utf8'), ruta);
  const { interfaz, hallazgos } = analisis;
  const pinta = pintaConEnvoltorios(analisis.pinta, analisis.envoltorios, lectorDesde(ruta));
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
