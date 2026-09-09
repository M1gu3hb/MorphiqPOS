/**
 * Contratos de identidad: lo que hace que sólo entre quien debe.
 *
 * Nacen del fallo más caro de este proyecto: `hashearPin` y `verificarPin`
 * dejaron de cerrar el círculo y **nadie podía entrar durante tres sesiones**.
 * Había pruebas alrededor del PIN; no había ninguna del viaje redondo, y el
 * `catch` de `verificarPin` convertía el error de llamada en «PIN incorrecto».
 *
 * Por eso los contratos de aquí miran el USO —el orden de los pasos, el filtro
 * por organización, qué llega al payload de auditoría— y no la forma de un
 * valor. Un contrato sobre el prefijo `$argon2id$` habría pasado durante todo
 * el fallo, porque el hash SÍ se creaba bien.
 */
import { readFileSync } from 'node:fs';

import { cuerpo, sinComentarios } from '../venta/contratos.mjs';

/**
 * DOS PROPIEDADES QUE NO SE EXPRESAN AQUÍ, y hay que decirlo.
 *
 * 1 · «Existe una prueba que hashea y verifica.» Se intentó y salió frágil: el
 *     recorte encontraba el mismo par en las otras pruebas del archivo, así que
 *     borrar la del viaje redondo lo dejaba pasar. Un contrato que no se ha
 *     visto fallar no protege nada.
 * 2 · «La pimienta va en texto y no en Buffer.» Afirmar `digest('hex')` sobre
 *     el código castigaría un `digest('base64')` que es igual de correcto.
 *
 * Las dos están cubiertas donde de verdad importan: por la mutación
 * «devolver la pimienta a Buffer» de `mutaciones.mjs`, que reintroduce el fallo
 * real y tiene que poner la SUITE en rojo. Si la prueba del viaje redondo
 * desaparece, esa mutación sobrevive y el arnés falla.
 */

const PIN = 'packages/app/src/identidad/pin.ts';
const ENTRAR = 'packages/app/src/identidad/entrar.ts';
const COMANDOS = 'packages/app/src/identidad/comandos.ts';
const CONSULTAS = 'packages/app/src/identidad/consultas.ts';
const REPO = 'packages/data/src/repos/identidad.ts';
const ARRANQUE = 'packages/app/src/arranque/primer-acceso.ts';
const RUTA_ENTRAR = 'apps/web/app/api/auth/entrar/route.ts';

function leer(ruta) {
  return sinComentarios(readFileSync(ruta, 'utf8'));
}

function ordena(texto, antes, despues) {
  const a = texto.indexOf(antes);
  const b = texto.indexOf(despues);
  return a !== -1 && b !== -1 && a < b;
}

export const contratos = [
  {
    nombre: 'verificar_no_traga_errores_de_llamada',
    ruta: PIN,
    porque:
      'El `catch` que lo devolvía todo como `false` fue lo que escondió el fallo. Ahora la forma del hash se comprueba ANTES, así lo único que puede caer en el catch es un dato roto.',
    comprobar() {
      const c = cuerpo(leer(PIN), 'export async function verificarPin');
      return c !== null && ordena(c, 'FORMA_HASH.test(hashGuardado)', 'await verify(');
    },
  },
  {
    nombre: 'la_organizacion_no_viene_del_cliente',
    ruta: RUTA_ENTRAR,
    porque:
      'R16. Al retirarse el enrolamiento, la organización dejó de decidirla la terminal y pasó a decidirla el despliegue. Si se colara en el cuerpo de la petición, quien llama elegiría en qué negocio entra probando slugs.',
    comprobar() {
      const c = leer(RUTA_ENTRAR);
      const entrada = cuerpo(c, 'const Entrada = z.object(');
      // El esquema NO admite organización, y el id sale de `negocioDelDespliegue`.
      return (
        entrada !== null &&
        !/organizacion/i.test(entrada) &&
        /organizacionId = \(await negocioDelDespliegue\(entorno\.ORGANIZACION\)\)/.test(c)
      );
    },
  },
  {
    nombre: 'la_terminal_se_crea_despues_de_verificar_el_pin',
    ruta: ENTRAR,
    porque:
      'Dar de alta la caja ANTES de comprobar el PIN convertiría la pantalla de acceso en un formulario para crear terminales: cualquiera que teclee cuatro dígitos equivocados dejaría una fila y una cookie.',
    comprobar() {
      const c = cuerpo(leer(ENTRAR), 'export async function entrarConPin');
      return c !== null && ordena(c, 'await verificarPin(', 'resolverTerminal(');
    },
  },
  {
    nombre: 'bloqueo_antes_de_comprobar_el_pin',
    ruta: ENTRAR,
    porque:
      'Comprobar el PIN de una credencial bloqueada gasta Argon2 por cada intento: el bloqueo dejaría de frenar la fuerza bruta y se volvería un amplificador de coste.',
    comprobar() {
      const c = cuerpo(leer(ENTRAR), 'export async function entrarConPin');
      // La comparación completa, no la palabra suelta: `bloqueadaHasta`
      // aparece también dentro del propio bloque y en el registro del fallo,
      // así que buscarla a secas daba por buena una guarda desactivada.
      return (
        c !== null &&
        ordena(c, 'credencial.bloqueadaHasta.getTime() > ahora.getTime()', 'await verificarPin(')
      );
    },
  },
  {
    nombre: 'el_ambito_se_relee_de_la_base',
    ruta: ENTRAR,
    porque:
      'El token guarda quién y desde dónde, no el rol. Un empleo dado de baja a media jornada tiene que dejar de servir en la siguiente petición, no cuando caduque la cookie.',
    comprobar() {
      const c = cuerpo(leer(ENTRAR), 'export async function entrarConPin');
      return c !== null && ordena(c, 'repoSesion.resolverAmbito(', 'firmarSesion(');
    },
  },
  {
    nombre: 'establecer_pin_filtra_por_organizacion',
    ruta: COMANDOS,
    porque:
      'BOLA de manual: sin el filtro, conocer un uuid ajeno basta para ponerle PIN al cajero de otro negocio.',
    comprobar() {
      const c = cuerpo(leer(COMANDOS), 'entrada: entradaEstablecerPin');
      return (
        c !== null &&
        /\.where\(\s*'empleos\.organizacion_id'\s*,\s*'='\s*,\s*organizacionId\s*,?\s*\)/.test(c)
      );
    },
  },
  {
    nombre: 'establecer_pin_no_audita_el_pin',
    ruta: COMANDOS,
    porque:
      'La auditoría se consulta desde la aplicación. Un PIN o un hash en el payload sería una segunda copia de la credencial, y en un sitio que sí se lee.',
    comprobar() {
      const c = cuerpo(leer(COMANDOS), 'entrada: entradaEstablecerPin');
      if (c === null) return false;
      const auditoria = cuerpo(c, 'ctx.auditar(');
      return auditoria !== null && !/\bpin\b|hash/i.test(auditoria);
    },
  },
  {
    nombre: 'el_token_del_dispositivo_se_guarda_hasheado',
    ruta: ENTRAR,
    porque:
      'El token de dispositivo autoriza a una caja durante un anio. En claro en la base, quien lea `terminales` se lleva la caja de otro. Con el enrolamiento por codigo retirado, esta es la unica ruta que lo escribe.',
    comprobar() {
      const c = cuerpo(leer(ENTRAR), 'async function resolverTerminal');
      if (c === null) return false;
      // Se afirma sobre las DOS mitades: que el hash se calcula, y que lo que
      // llega al repositorio es el hash. Sólo la primera dejaría pasar un
      // `deviceTokenHash: deviceToken` con el hash calculado y sin usar.
      const calcula =
        /const deviceTokenHash = hashearDispositivo\(\s*deviceToken\s*,\s*peticion\.pimienta\s*\)/.test(
          c,
        );
      const enClaro = /deviceTokenHash:\s*deviceToken(?![A-Za-z0-9_])/.test(c);
      return calcula && !enClaro;
    },
  },
  {
    nombre: 'la_consulta_de_accesos_no_devuelve_el_hash',
    ruta: CONSULTAS,
    porque:
      'Un hash de PIN viajando a la pantalla es una copia más de la credencial, en el sitio donde menos control hay sobre ella.',
    comprobar() {
      const c = leer(CONSULTAS);
      return !/pin_hash|pinHash/.test(c);
    },
  },
  {
    nombre: 'solo_credencial_para_verificar_lee_el_hash',
    ruta: REPO,
    porque:
      'El PIN nunca sale de la base. Si otra consulta lo seleccionara, tarde o temprano alguien lo devolvería por HTTP sin darse cuenta.',
    comprobar() {
      const c = leer(REPO);
      const apariciones = (c.match(/pin_hash/g) ?? []).length;
      const enLaFuncion = cuerpo(c, 'export async function credencialParaVerificar');
      return enLaFuncion !== null && enLaFuncion.includes('pin_hash') && apariciones === 1;
    },
  },
  {
    nombre: 'el_arranque_hashea_con_argon2',
    ruta: ARRANQUE,
    porque:
      'Es la única excepción al envoltorio. Que sea una excepción no la exime de guardar el PIN como todos los demás.',
    comprobar() {
      const c = cuerpo(leer(ARRANQUE), 'export async function prepararPrimerAcceso');
      return c !== null && /await hashearPin\(\s*peticion\.pin\s*,\s*peticion\.pimienta/.test(c);
    },
  },
];
