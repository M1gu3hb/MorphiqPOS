/**
 * Las mutaciones que validan los contratos y las pruebas de identidad.
 *
 * La primera de la lista **es el fallo real**, reintroducido tal cual: cambiar
 * `digest('hex')` por `digest()` devuelve el código al estado en el que nadie
 * podía entrar. Si la prueba del viaje redondo no lo caza, no sirve.
 */

/** Un salto de línea literal, para mutaciones multilinea sin escapes raros. */
const BR = String.fromCharCode(10);

const PIN = 'packages/app/src/identidad/pin.ts';
const ENTRAR = 'packages/app/src/identidad/entrar.ts';
const COMANDOS = 'packages/app/src/identidad/comandos.ts';
const CONSULTAS = 'packages/app/src/identidad/consultas.ts';
const REPO = 'packages/data/src/repos/identidad.ts';
const ARRANQUE = 'packages/app/src/arranque/primer-acceso.ts';
const RUTA_ENTRAR = 'apps/web/app/api/auth/entrar/route.ts';

/** Destructivas que deben hacer FALLAR a un contrato con nombre. */
export const contraContratos = [
  {
    nombre: 'quitar la guarda de forma y volver al catch que lo traga todo',
    ruta: PIN,
    contrato: 'verificar_no_traga_errores_de_llamada',
    antes: '  if (!FORMA_HASH.test(hashGuardado)) return false;\n',
    despues: '',
  },
  {
    nombre: 'dejar que el cliente diga en que negocio entra',
    ruta: RUTA_ENTRAR,
    contrato: 'la_organizacion_no_viene_del_cliente',
    antes: '  pin: z.string().min(4).max(8),',
    despues: '  pin: z.string().min(4).max(8),' + BR + '  organizacion: z.string(),',
  },
  {
    nombre: 'dar de alta la caja ANTES de comprobar el PIN',
    ruta: ENTRAR,
    contrato: 'la_terminal_se_crea_despues_de_verificar_el_pin',
    antes:
      '  const correcto = await verificarPin(peticion.pin, credencial.pinHash, peticion.pimienta);',
    despues:
      '  const adelantada = await resolverTerminal(peticion, null, ahora);' +
      BR +
      '  void adelantada;' +
      BR +
      '  const correcto = await verificarPin(peticion.pin, credencial.pinHash, peticion.pimienta);',
  },
  {
    nombre: 'comprobar el PIN aunque la credencial esté bloqueada',
    ruta: ENTRAR,
    contrato: 'bloqueo_antes_de_comprobar_el_pin',
    antes: 'credencial.bloqueadaHasta.getTime() > ahora.getTime()',
    despues: 'false',
  },
  {
    nombre: 'firmar la sesión sin releer el ámbito',
    ruta: ENTRAR,
    contrato: 'el_ambito_se_relee_de_la_base',
    antes:
      'const ambito = await repoSesion.resolverAmbito(db, credencial.identidadId, credencial.empleoId);',
    despues:
      'const ambito = { organizacionId: peticion.organizacionId, sucursalId: null, rol: "dueno", nombrePersona: "" };',
  },
  {
    nombre: 'poner PIN a un empleado de otra organización',
    ruta: COMANDOS,
    contrato: 'establecer_pin_filtra_por_organizacion',
    antes: "        .where('empleos.organizacion_id', '=', organizacionId)\n",
    despues: '',
  },
  {
    nombre: 'auditar el hash del PIN junto al cambio',
    ruta: COMANDOS,
    contrato: 'establecer_pin_no_audita_el_pin',
    antes: '        rotado: previa !== undefined,',
    despues: '        rotado: previa !== undefined,' + BR + '        pinHash: hash,',
  },
  {
    nombre: 'guardar el token del dispositivo en claro',
    ruta: ENTRAR,
    contrato: 'el_token_del_dispositivo_se_guarda_hasheado',
    antes: 'const deviceTokenHash = hashearDispositivo(deviceToken, peticion.pimienta);',
    despues: 'const deviceTokenHash = deviceToken;',
  },
  {
    nombre: 'devolver el hash del PIN en la lista de accesos',
    ruta: CONSULTAS,
    contrato: 'la_consulta_de_accesos_no_devuelve_el_hash',
    antes: "      'credenciales_pin.id as credencialId',",
    despues:
      "      'credenciales_pin.id as credencialId',\n      'credenciales_pin.pin_hash as pinHash',",
  },
  {
    nombre: 'seleccionar el hash también en la lista de empleados',
    ruta: REPO,
    contrato: 'solo_credencial_para_verificar_lee_el_hash',
    antes: ".select(['empleos.id as empleoId', 'personas.nombre as nombre', 'empleos.rol as rol'])",
    despues:
      ".select(['empleos.id as empleoId', 'personas.nombre as nombre', 'empleos.rol as rol', 'credenciales_pin.pin_hash as pinHash'])",
  },
  {
    nombre: 'guardar el PIN del arranque sin hashear',
    ruta: ARRANQUE,
    contrato: 'el_arranque_hashea_con_argon2',
    antes: 'const hash = await hashearPin(peticion.pin, peticion.pimienta);',
    despues: 'const hash = peticion.pin;',
  },
];

/** Destructivas que deben hacer FALLAR la suite de pruebas. */
export const contraPruebas = [
  {
    // ESTE es el fallo real, tal cual estaba. `digest()` devuelve Buffer y
    // `verify()` decodifica UTF-8: lanza, el catch lo traga y NINGÚN PIN
    // verifica. Es la mutación más importante del repositorio.
    nombre: 'devolver la pimienta a Buffer (el fallo que impidió entrar)',
    ruta: PIN,
    antes: ".update(pin, 'utf8').digest('hex')",
    despues: ".update(pin, 'utf8').digest()",
  },
  {
    nombre: 'la pimienta deja de mezclarse (el hash no depende de ella)',
    ruta: PIN,
    antes: "return createHmac('sha256', pimienta).update(pin, 'utf8').digest('hex');",
    despues: "return createHmac('sha256', 'fija').update(pin, 'utf8').digest('hex');",
  },
  {
    nombre: 'verificar acepta cualquier PIN',
    ruta: PIN,
    antes: 'return await verify(hashGuardado, conPimienta(pin, pimienta), PARAMETROS);',
    despues: 'return true;',
  },
  {
    nombre: 'bajar Argon2id a parámetros de juguete',
    ruta: PIN,
    antes: 'memoryCost: 19_456',
    despues: 'memoryCost: 8',
  },
  {
    nombre: 'aceptar PIN de tres dígitos',
    ruta: PIN,
    antes: 'export const FORMA_PIN = /^\\d{4,8}$/;',
    despues: 'export const FORMA_PIN = /^\\d{3,8}$/;',
  },
  {
    nombre: 'quitar el tope del bloqueo (lockout como negación de servicio)',
    ruta: PIN,
    antes: 'Math.min(',
    despues: 'Math.max(',
  },
];

/** Inocuas: si una de éstas rompiera algo, el contrato mira la forma y no la propiedad. */
export const inocuas = [
  {
    nombre: 'una línea en blanco de más en pin.ts',
    ruta: PIN,
    antes: 'export async function hashearPin',
    despues: '\nexport async function hashearPin',
  },
  {
    nombre: 'partir el where de la organización en cuatro líneas',
    ruta: COMANDOS,
    antes: "        .where('empleos.organizacion_id', '=', organizacionId)",
    despues:
      "        .where(\n          'empleos.organizacion_id',\n          '=',\n          organizacionId,\n        )",
  },
  {
    nombre: 'renombrar un local del arranque',
    ruta: ARRANQUE,
    antes: 'const hash = await hashearPin(peticion.pin, peticion.pimienta);',
    despues: 'const huella = await hashearPin(peticion.pin, peticion.pimienta);',
    tambien: [['guardarPin(tx, identidadId, hash)', 'guardarPin(tx, identidadId, huella)']],
  },
];
