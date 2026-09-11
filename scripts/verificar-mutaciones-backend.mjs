#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const MIGRACION_RLS = join(
  RAIZ,
  'packages',
  'data',
  'src',
  'migraciones',
  'sql',
  '050_rls_faltante.sql',
);
const PRUEBA_RLS = 'packages/data/src/migraciones/rls.test.ts';
const CONFIGURACION = join(RAIZ, 'packages', 'app', 'src', 'configuracion', 'configuracion.ts');
const PRUEBA_CONFIGURACION = 'packages/app/src/configuracion/configuracion.test.ts';
const PRESENTACION = join(RAIZ, 'packages', 'app', 'src', 'puente', 'presentacion.ts');
const CONFIGURACION_PUENTE = join(RAIZ, 'packages', 'app', 'src', 'puente', 'configuracion.ts');
const PRUEBA_PRESENTACION = 'packages/app/src/puente/presentacion.test.ts';
const MIGRACION_SESIONES = join(
  RAIZ,
  'packages',
  'data',
  'src',
  'migraciones',
  'sql',
  '051_sesiones_revocables.sql',
);
const PRUEBA_SESIONES_SQL = 'packages/data/src/migraciones/sesiones.test.ts';
const RESOLVER_SESION = join(RAIZ, 'packages', 'app', 'src', 'sesion', 'resolver.ts');
const PRUEBA_RESOLVER_SESION = 'packages/app/src/sesion/resolver.test.ts';
const ENTRAR = join(RAIZ, 'packages', 'app', 'src', 'identidad', 'entrar.ts');
const PRUEBA_ENTRAR = 'packages/app/src/identidad/entrar.test.ts';
const EMPLEADOS = join(RAIZ, 'packages', 'app', 'src', 'identidad', 'empleados.ts');
const PRUEBA_EMPLEADOS = 'packages/app/src/identidad/empleados.test.ts';
const SALIR = join(RAIZ, 'apps', 'web', 'app', 'api', 'auth', 'salir', 'route.ts');
const PRUEBA_SALIR = 'apps/web/src/servidor/salir.test.ts';
const MAPA_PUENTE = join(RAIZ, 'packages', 'app', 'src', 'puente', 'mapa.ts');
const CONSULTAR_PUENTE = join(RAIZ, 'packages', 'app', 'src', 'puente', 'consultar.ts');
const TIPOS_PUENTE = join(RAIZ, 'packages', 'app', 'src', 'puente', 'tipos.ts');
const PRUEBA_AUTORIZACION_PUENTE = 'packages/app/src/puente/autorizacion.test.ts';
const MIGRACION_QR = join(
  RAIZ,
  'packages',
  'data',
  'src',
  'migraciones',
  'sql',
  '052_qr_token_unico.sql',
);
const COMANDO_QR = join(RAIZ, 'packages', 'app', 'src', 'restaurante', 'qr.ts');
const UTILIDAD_QR = join(RAIZ, 'apps', 'web', 'heredado', 'utils', 'qrUtils.js');
const PRUEBA_QR = 'packages/app/src/restaurante/qr.test.ts';
const PRUEBA_MIGRACION_QR = 'packages/data/src/migraciones/qr-token.test.ts';
const CONSULTA_CATALOGO = join(RAIZ, 'packages', 'app', 'src', 'catalogo', 'consulta.ts');
const RUTA_CATALOGO_PRODUCTOS = join(
  RAIZ,
  'apps',
  'web',
  'app',
  'api',
  'catalogo',
  'productos',
  'route.ts',
);
const PRUEBA_CONSULTA_CATALOGO = 'packages/app/src/catalogo/consulta.test.ts';
const HTTP_WEB = join(RAIZ, 'apps', 'web', 'src', 'servidor', 'http.ts');
const PRUEBA_ROLES_GET = 'apps/web/src/servidor/consultas-roles.test.ts';
const PRUEBA_SEGURIDAD_HTTP = 'apps/web/src/servidor/seguridad-http.test.ts';
const SEGURIDAD_HTTP = join(RAIZ, 'apps', 'web', 'src', 'servidor', 'seguridad-http.ts');
const RUTA_ACCESOS = join(RAIZ, 'apps', 'web', 'app', 'api', 'identidad', 'accesos', 'route.ts');
const LIMITE_CUERPO = join(RAIZ, 'packages', 'app', 'src', 'http', 'limite-cuerpo.ts');
const RUTA_COMANDO = join(RAIZ, 'packages', 'app', 'src', 'http', 'ruta.ts');
const HTTP_PORTAL = join(RAIZ, 'packages', 'app', 'src', 'portal', 'http.ts');
const PRUEBA_LIMITE_CUERPO = 'packages/app/src/http/limite-cuerpo.test.ts';
const CONFIGURACION_PARCIAL = join(RAIZ, 'packages', 'app', 'src', 'puente', 'configuracion.ts');
const PRUEBA_CONFIGURACION_PARCIAL = 'packages/app/src/puente/configuracion-limites.test.ts';
const CONTRATO_ESQUEMA = join(
  RAIZ,
  'packages',
  'data',
  'src',
  'verificacion',
  'contrato-esquema.ts',
);
const MANIFIESTO_RAIZ = join(RAIZ, 'package.json');
const PRUEBA_CONTRATO_ESQUEMA = 'packages/data/src/verificacion/contrato-esquema.test.ts';
const CONTRATO_RLS = join(RAIZ, 'packages', 'data', 'src', 'verificacion', 'rls.ts');
const SCRIPT_RLS = join(RAIZ, 'scripts', 'verificar-rls.mjs');
const PRUEBA_RLS_VIVA = 'packages/data/src/verificacion/rls.test.ts';
const REPOSITORIO_LIMITE = join(RAIZ, 'packages', 'data', 'src', 'repos', 'limite.ts');
const PRUEBA_REPOSITORIO_LIMITE = 'packages/data/src/repos/limite.test.ts';
const MIGRACION_RETENCION_COMANDOS = join(
  RAIZ,
  'packages',
  'data',
  'src',
  'migraciones',
  'sql',
  '053_retencion_comandos.sql',
);
const PRUEBA_RETENCION_COMANDOS = 'packages/data/src/migraciones/retencion-comandos.test.ts';
const COMANDO_PUBLICO = join(RAIZ, 'packages', 'app', 'src', 'portal', 'comando-publico.ts');
const IDEMPOTENCIA_PORTAL = join(RAIZ, 'packages', 'app', 'src', 'portal', 'idempotencia.ts');
const PRUEBA_IDEMPOTENCIA_PORTAL = 'packages/app/src/portal/idempotencia.test.ts';
const LIMITE_APLICACION = join(RAIZ, 'packages', 'app', 'src', 'http', 'limite.ts');
const RUTA_PRESENTACION = join(
  RAIZ,
  'apps',
  'web',
  'app',
  'api',
  'configuracion',
  'presentacion',
  'route.ts',
);
const PRUEBA_LIMITE_PRESENTACION = 'apps/web/src/servidor/presentacion-limite.test.ts';
const RUTA_EMPLEADOS_PUBLICOS = join(
  RAIZ,
  'apps',
  'web',
  'app',
  'api',
  'auth',
  'empleados',
  'route.ts',
);
const PRUEBA_LIMITE_EMPLEADOS = 'apps/web/src/servidor/empleados-limite.test.ts';
const CONFIG_NEXT = join(RAIZ, 'apps', 'web', 'next.config.mjs');
const VERIFICADOR_CABECERAS = join(RAIZ, 'scripts', 'verificar-cabeceras.mjs');
const PRUEBA_CABECERAS = 'apps/web/src/seguridad/cabeceras.test.ts';
const PRUEBA_CORRELACION = 'apps/web/src/servidor/correlacion.test.ts';
const OBSERVABILIDAD = join(RAIZ, 'packages', 'app', 'src', 'observabilidad.ts');
const AUDITORIA = join(RAIZ, 'packages', 'app', 'src', 'auditoria.ts');
const ENVOLTORIO_COMANDO = join(RAIZ, 'packages', 'app', 'src', 'comando.ts');
const LIMITE_PORTAL = join(RAIZ, 'packages', 'app', 'src', 'portal', 'limite.ts');
const RUTA_AUTH_ENTRAR = join(RAIZ, 'apps', 'web', 'app', 'api', 'auth', 'entrar', 'route.ts');
const PRUEBA_OBSERVABILIDAD = 'packages/app/src/observabilidad.test.ts';
const PRUEBA_ADOPCION_OBSERVABILIDAD = 'apps/web/src/servidor/observabilidad-backend.test.ts';
const VITEST = join(RAIZ, 'node_modules', 'vitest', 'vitest.mjs');

function exigirCambio(nombre, original, mutado) {
  if (mutado === original) {
    throw new Error(`La mutación "${nombre}" no cambió el archivo objetivo.`);
  }
}

function comprobarMutacion({ nombre, origen, archivoTemporal, variable, prueba, transformar }) {
  const carpeta = mkdtempSync(join(tmpdir(), 'morphiqpos-mutacion-'));
  const archivo = join(carpeta, archivoTemporal);
  const original = readFileSync(origen, 'utf8');
  const mutado = transformar(original);
  exigirCambio(nombre, original, mutado);
  writeFileSync(archivo, mutado, 'utf8');

  try {
    const resultado = spawnSync(
      process.execPath,
      [
        VITEST,
        'run',
        prueba,
        '--reporter',
        'dot',
        '--pool',
        'forks',
        '--maxWorkers',
        '1',
        '--no-file-parallelism',
        '--teardownTimeout',
        '1000',
      ],
      {
        cwd: RAIZ,
        encoding: 'utf8',
        env: { ...process.env, [variable]: archivo },
        windowsHide: true,
      },
    );

    if (resultado.error !== undefined) throw resultado.error;
    if (resultado.status === 0) {
      throw new Error(`La suite sobrevivió a la mutación "${nombre}".`);
    }
  } finally {
    rmSync(carpeta, { force: true, recursive: true });
  }

  console.log(`✓ Mutación rechazada: ${nombre}`);
}

comprobarMutacion({
  nombre: 'RLS FORCE eliminado',
  origen: MIGRACION_RLS,
  archivoTemporal: '050_rls_faltante.sql',
  variable: 'MORPHIQPOS_RLS_MIGRATION_PATH',
  prueba: PRUEBA_RLS,
  transformar: (sql) => sql.replaceAll('force row level security', 'disable row level security'),
});
comprobarMutacion({
  nombre: 'secuencias excluidas del REVOKE',
  origen: MIGRACION_RLS,
  archivoTemporal: '050_rls_faltante.sql',
  variable: 'MORPHIQPOS_RLS_MIGRATION_PATH',
  prueba: PRUEBA_RLS,
  transformar: (sql) => sql.replace("('r', 'p', 'v', 'm', 'S')", "('r', 'p', 'v', 'm', 's')"),
});
comprobarMutacion({
  nombre: 'paquete reabierto en configuracion.guardar',
  origen: CONFIGURACION,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_CONFIGURACION_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION,
  transformar: (codigo) =>
    codigo.replace(
      "  estilo: z.enum(['base', 'editorial', 'premium']),",
      "  estilo: z.enum(['base', 'editorial', 'premium']),\n  paquete: z.enum(PAQUETES),",
    ),
});
comprobarMutacion({
  nombre: 'merge parcial sustituido por replace',
  origen: CONFIGURACION,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_CONFIGURACION_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION,
  transformar: (codigo) =>
    codigo.replace('      ...(esDocumento(actual?.valores) ? actual.valores : {}),\n', ''),
});
comprobarMutacion({
  nombre: 'cambio de paquete devuelto al JSON',
  origen: PRESENTACION,
  archivoTemporal: 'presentacion.ts',
  variable: 'MORPHIQPOS_PRESENTACION_SOURCE_PATH',
  prueba: PRUEBA_PRESENTACION,
  transformar: (codigo) =>
    codigo.replace(".updateTable('organizaciones')", ".updateTable('configuracion')"),
});
comprobarMutacion({
  nombre: 'lectura de paquete devuelta al JSON',
  origen: CONFIGURACION_PUENTE,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_PUENTE_CONFIGURACION_SOURCE_PATH',
  prueba: PRUEBA_PRESENTACION,
  transformar: (codigo) =>
    codigo.replace('paquete_modo: fila.paquete', "paquete_modo: guardados['paquete_modo']"),
});
comprobarMutacion({
  nombre: 'RLS FORCE omitido en sesiones',
  origen: MIGRACION_SESIONES,
  archivoTemporal: '051_sesiones_revocables.sql',
  variable: 'MORPHIQPOS_SESIONES_MIGRATION_PATH',
  prueba: PRUEBA_SESIONES_SQL,
  transformar: (sql) => sql.replace('force row level security', 'disable row level security'),
});
comprobarMutacion({
  nombre: 'sid ignorado al resolver sesión',
  origen: RESOLVER_SESION,
  archivoTemporal: 'resolver.ts',
  variable: 'MORPHIQPOS_SESSION_RESOLVER_SOURCE_PATH',
  prueba: PRUEBA_RESOLVER_SESION,
  transformar: (codigo) =>
    codigo.replace('await repoSesion.sesionActiva', 'await repoSesion.sesionOmitida'),
});
comprobarMutacion({
  nombre: 'sesión no persistida al entrar',
  origen: ENTRAR,
  archivoTemporal: 'entrar.ts',
  variable: 'MORPHIQPOS_ENTRAR_SOURCE_PATH',
  prueba: PRUEBA_ENTRAR,
  transformar: (codigo) =>
    codigo.replace('await repoSesion.crearSesion', 'await repoSesion.omitirSesion'),
});
comprobarMutacion({
  nombre: 'sesiones conservadas tras cambiar acceso',
  origen: EMPLEADOS,
  archivoTemporal: 'empleados.ts',
  variable: 'MORPHIQPOS_EMPLEADOS_SOURCE_PATH',
  prueba: PRUEBA_EMPLEADOS,
  transformar: (codigo) =>
    codigo.replace('repoSesion.revocarSesionesDeEmpleo', 'repoSesion.conservarSesionesDeEmpleo'),
});
comprobarMutacion({
  nombre: 'logout limitado a borrar la cookie',
  origen: SALIR,
  archivoTemporal: 'route.ts',
  variable: 'MORPHIQPOS_SALIR_ROUTE_PATH',
  prueba: PRUEBA_SALIR,
  transformar: (codigo) => codigo.replace('await cerrarSesion(', 'await Promise.resolve('),
});
comprobarMutacion({
  nombre: 'roles de entidad otra vez opcionales',
  origen: TIPOS_PUENTE,
  archivoTemporal: 'tipos.ts',
  variable: 'MORPHIQPOS_PUENTE_TIPOS_SOURCE_PATH',
  prueba: PRUEBA_AUTORIZACION_PUENTE,
  transformar: (codigo) =>
    codigo.replace(
      'readonly rolesLectura: readonly string[];',
      'readonly rolesLectura?: readonly string[];',
    ),
});
comprobarMutacion({
  nombre: 'guarda de lectura por entidad desactivada',
  origen: CONSULTAR_PUENTE,
  archivoTemporal: 'consultar.ts',
  variable: 'MORPHIQPOS_CONSULTAR_SOURCE_PATH',
  prueba: PRUEBA_AUTORIZACION_PUENTE,
  transformar: (codigo) =>
    codigo.replace(
      'if (!mapa.rolesLectura.includes(ambito.rol))',
      'if (false && !mapa.rolesLectura.includes(ambito.rol))',
    ),
});
comprobarMutacion({
  nombre: 'cortes abiertos a todos los roles',
  origen: MAPA_PUENTE,
  archivoTemporal: 'mapa.ts',
  variable: 'MORPHIQPOS_MAPA_SOURCE_PATH',
  prueba: PRUEBA_AUTORIZACION_PUENTE,
  transformar: (codigo) =>
    codigo.replace(
      "CorteCaja: {\n    tabla: 'sesiones_caja',\n    rolesLectura: [...CAJA]",
      "CorteCaja: {\n    tabla: 'sesiones_caja',\n    rolesLectura: [...TODOS_LOS_ROLES]",
    ),
});
comprobarMutacion({
  nombre: 'token QR visible a roles operativos',
  origen: MAPA_PUENTE,
  archivoTemporal: 'mapa.ts',
  variable: 'MORPHIQPOS_MAPA_SOURCE_PATH',
  prueba: PRUEBA_AUTORIZACION_PUENTE,
  transformar: (codigo) =>
    codigo.replace(
      '      qr_token: {\n        rolesLectura: [...DIRECCION],',
      '      qr_token: {\n        rolesLectura: [...TODOS_LOS_ROLES],',
    ),
});
comprobarMutacion({
  nombre: 'unicidad del token QR eliminada',
  origen: MIGRACION_QR,
  archivoTemporal: '052_qr_token_unico.sql',
  variable: 'MORPHIQPOS_QR_TOKEN_MIGRATION_PATH',
  prueba: PRUEBA_MIGRACION_QR,
  transformar: (sql) => sql.replace('create unique index', 'create index'),
});
comprobarMutacion({
  nombre: 'entropía del token QR reducida',
  origen: COMANDO_QR,
  archivoTemporal: 'qr.ts',
  variable: 'MORPHIQPOS_QR_COMMAND_SOURCE_PATH',
  prueba: PRUEBA_QR,
  transformar: (codigo) => codigo.replace('randomBytes(24)', 'randomBytes(8)'),
});
comprobarMutacion({
  nombre: 'escritura directa de qr_token reabierta',
  origen: MAPA_PUENTE,
  archivoTemporal: 'mapa.ts',
  variable: 'MORPHIQPOS_MAPA_SOURCE_PATH',
  prueba: PRUEBA_QR,
  transformar: (codigo) =>
    codigo.replace(
      "        conversion: 'texto',\n        escribible: false,\n      },\n      qr_activo:",
      "        conversion: 'texto',\n        escribible: true,\n      },\n      qr_activo:",
    ),
});
comprobarMutacion({
  nombre: 'cliente QR devuelto a escritura genérica',
  origen: UTILIDAD_QR,
  archivoTemporal: 'qrUtils.js',
  variable: 'MORPHIQPOS_QR_UTIL_SOURCE_PATH',
  prueba: PRUEBA_QR,
  transformar: (codigo) => codigo.replace('/api/restaurante/rotar-qr', '/api/datos/entidad/Mesa'),
});
comprobarMutacion({
  nombre: 'costo de consumo abierto por la vista alternativa',
  origen: MAPA_PUENTE,
  archivoTemporal: 'mapa.ts',
  variable: 'MORPHIQPOS_MAPA_SOURCE_PATH',
  prueba: PRUEBA_AUTORIZACION_PUENTE,
  transformar: (codigo) =>
    codigo.replace(
      "    costo_unitario_snapshot: {\n      rolesLectura: [...VE_COSTOS_DE_INSUMO],\n      columna: 'costo_unitario_centavos',",
      "    costo_unitario_snapshot: {\n      columna: 'costo_unitario_centavos',",
    ),
});
comprobarMutacion({
  nombre: 'costo de catálogo devuelto a todos los roles',
  origen: CONSULTA_CATALOGO,
  archivoTemporal: 'consulta.ts',
  variable: 'MORPHIQPOS_CATALOGO_QUERY_SOURCE_PATH',
  prueba: PRUEBA_CONSULTA_CATALOGO,
  transformar: (codigo) => codigo.replace('ROLES_CON_COSTO.includes(rol)', 'true'),
});
comprobarMutacion({
  nombre: 'rol de catálogo sustituido por dueño',
  origen: RUTA_CATALOGO_PRODUCTOS,
  archivoTemporal: 'route.ts',
  variable: 'MORPHIQPOS_CATALOGO_PRODUCTS_ROUTE_PATH',
  prueba: PRUEBA_CONSULTA_CATALOGO,
  transformar: (codigo) => codigo.replace('entrada.data, sesion.rol', "entrada.data, 'dueno'"),
});
comprobarMutacion({
  nombre: 'autorización de rol omitida en responderConsulta',
  origen: HTTP_WEB,
  archivoTemporal: 'http.ts',
  variable: 'MORPHIQPOS_HTTP_SOURCE_PATH',
  prueba: PRUEBA_ROLES_GET,
  transformar: (codigo) =>
    codigo.replace('rolPermitidoParaConsulta(sesion.sesion.rol, opciones.roles)', 'true'),
});
comprobarMutacion({
  nombre: 'GET de productos sin allowlist de roles',
  origen: RUTA_CATALOGO_PRODUCTOS,
  archivoTemporal: 'route.ts',
  variable: 'MORPHIQPOS_CATALOGO_PRODUCTS_ROUTE_PATH',
  prueba: PRUEBA_ROLES_GET,
  transformar: (codigo) => codigo.replace('{ roles: ROLES }', '{}'),
});
comprobarMutacion({
  nombre: 'estado de bloqueo visible para gerente',
  origen: RUTA_ACCESOS,
  archivoTemporal: 'route.ts',
  variable: 'MORPHIQPOS_ACCESOS_ROUTE_PATH',
  prueba: PRUEBA_ROLES_GET,
  transformar: (codigo) =>
    codigo.replace(
      "roles: ['dueno', 'administrador']",
      "roles: ['dueno', 'administrador', 'gerente']",
    ),
});
comprobarMutacion({
  nombre: 'límite de cuerpo elevado a 50 MiB',
  origen: LIMITE_CUERPO,
  archivoTemporal: 'limite-cuerpo.ts',
  variable: 'MORPHIQPOS_BODY_LIMIT_SOURCE_PATH',
  prueba: PRUEBA_LIMITE_CUERPO,
  transformar: (codigo) => codigo.replace('256 * 1024', '50 * 1024 * 1024'),
});
comprobarMutacion({
  nombre: 'límite omitido en rutaDeComando',
  origen: RUTA_COMANDO,
  archivoTemporal: 'ruta.ts',
  variable: 'MORPHIQPOS_COMMAND_ROUTE_SOURCE_PATH',
  prueba: PRUEBA_LIMITE_CUERPO,
  transformar: (codigo) =>
    codigo.replace('if (!cuerpoDentroDelLimite(peticion.headers))', 'if (false)'),
});
comprobarMutacion({
  nombre: 'límite omitido en el portal público',
  origen: HTTP_PORTAL,
  archivoTemporal: 'http.ts',
  variable: 'MORPHIQPOS_PORTAL_HTTP_SOURCE_PATH',
  prueba: PRUEBA_LIMITE_CUERPO,
  transformar: (codigo) =>
    codigo.replace('if (!cuerpoDentroDelLimite(peticion.headers))', 'if (false)'),
});
comprobarMutacion({
  nombre: 'límite omitido en ejecutarComandoHttp',
  origen: HTTP_WEB,
  archivoTemporal: 'http.ts',
  variable: 'MORPHIQPOS_WEB_HTTP_SOURCE_PATH',
  prueba: PRUEBA_LIMITE_CUERPO,
  transformar: (codigo) =>
    codigo.replace('if (!cuerpoDentroDelLimite(peticion.headers))', 'if (false)'),
});
comprobarMutacion({
  nombre: 'límite omitido en conSesion',
  origen: HTTP_WEB,
  archivoTemporal: 'http.ts',
  variable: 'MORPHIQPOS_WEB_HTTP_SOURCE_PATH',
  prueba: PRUEBA_LIMITE_CUERPO,
  transformar: (codigo) => {
    const marca = 'export async function conSesion';
    const inicio = codigo.indexOf(marca);
    if (inicio < 0) return codigo;
    return (
      codigo.slice(0, inicio) +
      codigo.slice(inicio).replace('if (!cuerpoDentroDelLimite(peticion.headers))', 'if (false)')
    );
  },
});
comprobarMutacion({
  nombre: 'allowlist de configuración desactivada',
  origen: CONFIGURACION_PARCIAL,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_PARTIAL_CONFIG_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION_PARCIAL,
  transformar: (codigo) => codigo.replace('if (!CLAVES_EDITABLES.has(clave))', 'if (false)'),
});
comprobarMutacion({
  nombre: 'documento de configuración permitido hasta 1 MiB',
  origen: CONFIGURACION_PARCIAL,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_PARTIAL_CONFIG_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION_PARCIAL,
  transformar: (codigo) => codigo.replace('64 * 1024', '1024 * 1024'),
});
comprobarMutacion({
  nombre: 'nombre del negocio sin máximo efectivo',
  origen: CONFIGURACION_PARCIAL,
  archivoTemporal: 'configuracion.ts',
  variable: 'MORPHIQPOS_PARTIAL_CONFIG_SOURCE_PATH',
  prueba: PRUEBA_CONFIGURACION_PARCIAL,
  transformar: (codigo) => codigo.replace('nombre.length > 160', 'false'),
});
comprobarMutacion({
  nombre: 'índices omitidos del contrato de esquema',
  origen: CONTRATO_ESQUEMA,
  archivoTemporal: 'contrato-esquema.ts',
  variable: 'MORPHIQPOS_SCHEMA_CONTRACT_SOURCE_PATH',
  prueba: PRUEBA_CONTRATO_ESQUEMA,
  transformar: (codigo) =>
    codigo.replace(
      "const CATEGORIAS = ['columnas', 'restricciones', 'indices'] as const",
      "const CATEGORIAS = ['columnas', 'restricciones'] as const",
    ),
});
comprobarMutacion({
  nombre: 'contrato de esquema desconectado de verify',
  origen: MANIFIESTO_RAIZ,
  archivoTemporal: 'package.json',
  variable: 'MORPHIQPOS_PACKAGE_JSON_PATH',
  prueba: PRUEBA_CONTRATO_ESQUEMA,
  transformar: (codigo) => codigo.replace(' && pnpm verify:esquema', ''),
});
comprobarMutacion({
  nombre: 'comprobación viva de RLS desactivada',
  origen: CONTRATO_RLS,
  archivoTemporal: 'rls.ts',
  variable: 'MORPHIQPOS_RLS_CONTRACT_SOURCE_PATH',
  prueba: PRUEBA_RLS_VIVA,
  transformar: (codigo) => codigo.replace('if (relacion.rlsActiva !== true)', 'if (false)'),
});
comprobarMutacion({
  nombre: 'índice único 046 omitido de la verificación',
  origen: CONTRATO_RLS,
  archivoTemporal: 'rls.ts',
  variable: 'MORPHIQPOS_RLS_CONTRACT_SOURCE_PATH',
  prueba: PRUEBA_RLS_VIVA,
  transformar: (codigo) => codigo.replace("  'cortes_folio_unico',\n", ''),
});
comprobarMutacion({
  nombre: 'FORCE RLS omitido de la consulta viva',
  origen: SCRIPT_RLS,
  archivoTemporal: 'verificar-rls.mjs',
  variable: 'MORPHIQPOS_RLS_VERIFY_SCRIPT_PATH',
  prueba: PRUEBA_RLS_VIVA,
  transformar: (codigo) => codigo.replace('c.relforcerowsecurity', 'false'),
});
comprobarMutacion({
  nombre: 'verificación RLS desconectada de verify',
  origen: MANIFIESTO_RAIZ,
  archivoTemporal: 'package.json',
  variable: 'MORPHIQPOS_PACKAGE_JSON_PATH',
  prueba: PRUEBA_RLS_VIVA,
  transformar: (codigo) => codigo.replace(' && pnpm verify:rls', ''),
});
comprobarMutacion({
  nombre: 'purga de limite_tasa desconectada del contador',
  origen: REPOSITORIO_LIMITE,
  archivoTemporal: 'limite.ts',
  variable: 'MORPHIQPOS_RATE_LIMIT_REPOSITORY_PATH',
  prueba: PRUEBA_REPOSITORIO_LIMITE,
  transformar: (codigo) => codigo.replace('  await limpiarSiCorresponde();\n', ''),
});
comprobarMutacion({
  nombre: 'probabilidad de purga de limite_tasa anulada',
  origen: REPOSITORIO_LIMITE,
  archivoTemporal: 'limite.ts',
  variable: 'MORPHIQPOS_RATE_LIMIT_REPOSITORY_PATH',
  prueba: PRUEBA_REPOSITORIO_LIMITE,
  transformar: (codigo) =>
    codigo.replace('valorAleatorio < 1 / FRECUENCIA_LIMPIEZA', 'valorAleatorio < 0'),
});
comprobarMutacion({
  nombre: 'retención de idempotencia ampliada a 900 días',
  origen: MIGRACION_RETENCION_COMANDOS,
  archivoTemporal: '053_retencion_comandos.sql',
  variable: 'MORPHIQPOS_COMMAND_RETENTION_MIGRATION_PATH',
  prueba: PRUEBA_RETENCION_COMANDOS,
  transformar: (sql) => sql.replace("interval '90 days'", "interval '900 days'"),
});
comprobarMutacion({
  nombre: 'trabajo de retención sin borrado',
  origen: MIGRACION_RETENCION_COMANDOS,
  archivoTemporal: '053_retencion_comandos.sql',
  variable: 'MORPHIQPOS_COMMAND_RETENTION_MIGRATION_PATH',
  prueba: PRUEBA_RETENCION_COMANDOS,
  transformar: (sql) =>
    sql.replace(
      'delete from public.comandos_ejecutados',
      'select * from public.comandos_ejecutados',
    ),
});
comprobarMutacion({
  nombre: 'CSRF omitido en conSesion',
  origen: HTTP_WEB,
  archivoTemporal: 'http.ts',
  variable: 'MORPHIQPOS_WEB_HTTP_SOURCE_PATH',
  prueba: PRUEBA_SEGURIDAD_HTTP,
  transformar: (codigo) => {
    const inicio = codigo.indexOf('export async function conSesion');
    if (inicio < 0) return codigo;
    return (
      codigo.slice(0, inicio) +
      codigo
        .slice(inicio)
        .replace('if (!peticionDeEscrituraValida(peticion,', 'if (false && peticion,')
    );
  },
});
comprobarMutacion({
  nombre: 'origen web confiado al Host falsificable',
  origen: SEGURIDAD_HTTP,
  archivoTemporal: 'seguridad-http.ts',
  variable: 'MORPHIQPOS_SECURITY_HTTP_SOURCE_PATH',
  prueba: PRUEBA_SEGURIDAD_HTTP,
  transformar: (codigo) => codigo.replace('new URL(appUrl).origin', 'new URL(peticion.url).origin'),
});
comprobarMutacion({
  nombre: 'origen del portal confiado al Host falsificable',
  origen: HTTP_PORTAL,
  archivoTemporal: 'http.ts',
  variable: 'MORPHIQPOS_PORTAL_HTTP_SOURCE_PATH',
  prueba: PRUEBA_SEGURIDAD_HTTP,
  transformar: (codigo) =>
    codigo.replace(
      'new URL(validarEntorno(process.env).APP_URL).origin',
      'new URL(peticion.url).origin',
    ),
});
comprobarMutacion({
  nombre: 'clave pública devuelta al alcance global',
  origen: COMANDO_PUBLICO,
  archivoTemporal: 'comando-publico.ts',
  variable: 'MORPHIQPOS_PUBLIC_COMMAND_SOURCE_PATH',
  prueba: PRUEBA_IDEMPOTENCIA_PORTAL,
  transformar: (codigo) =>
    codigo.replace(
      'alcanceIdempotenciaPortal(ambito.mesaId, clave, validada.datos)',
      "alcanceIdempotenciaPortal('global', clave, validada.datos)",
    ),
});
comprobarMutacion({
  nombre: 'mesa omitida de la huella pública',
  origen: IDEMPOTENCIA_PORTAL,
  archivoTemporal: 'idempotencia.ts',
  variable: 'MORPHIQPOS_PORTAL_IDEMPOTENCY_SOURCE_PATH',
  prueba: PRUEBA_IDEMPOTENCIA_PORTAL,
  transformar: (codigo) =>
    codigo.replace('huellaEntrada: huella({ mesaId, entrada })', 'huellaEntrada: huella(entrada)'),
});
comprobarMutacion({
  nombre: 'ventana de presentación eliminada',
  origen: LIMITE_APLICACION,
  archivoTemporal: 'limite.ts',
  variable: 'MORPHIQPOS_APP_RATE_LIMIT_SOURCE_PATH',
  prueba: PRUEBA_LIMITE_PRESENTACION,
  transformar: (codigo) =>
    codigo.replace('  presentacion: { intentos: 10, ventanaSegundos: 900 },\n', ''),
});
comprobarMutacion({
  nombre: 'desbloqueo de presentación sin consumo de cuota',
  origen: RUTA_PRESENTACION,
  archivoTemporal: 'route.ts',
  variable: 'MORPHIQPOS_PRESENTATION_ROUTE_PATH',
  prueba: PRUEBA_LIMITE_PRESENTACION,
  transformar: (codigo) => codigo.replace("permitir('presentacion'", "permitir('entrar'"),
});
comprobarMutacion({
  nombre: 'plantilla anónima sin consumo de cuota de entrada',
  origen: RUTA_EMPLEADOS_PUBLICOS,
  archivoTemporal: 'route.ts',
  variable: 'MORPHIQPOS_EMPLOYEES_ROUTE_PATH',
  prueba: PRUEBA_LIMITE_EMPLEADOS,
  transformar: (codigo) => codigo.replace("permitir('entrar'", "permitir('enrolar'"),
});
comprobarMutacion({
  nombre: 'HSTS eliminada de Next',
  origen: CONFIG_NEXT,
  archivoTemporal: 'next.config.mjs',
  variable: 'MORPHIQPOS_NEXT_CONFIG_PATH',
  prueba: PRUEBA_CABECERAS,
  transformar: (codigo) =>
    codigo.replace("key: 'Strict-Transport-Security'", "key: 'X-HSTS-Omitida'"),
});
comprobarMutacion({
  nombre: 'HSTS eliminada de la comprobación viva',
  origen: VERIFICADOR_CABECERAS,
  archivoTemporal: 'verificar-cabeceras.mjs',
  variable: 'MORPHIQPOS_HEADERS_VERIFIER_PATH',
  prueba: PRUEBA_CABECERAS,
  transformar: (codigo) =>
    codigo.replace("nombre: 'strict-transport-security'", "nombre: 'x-hsts-omitida'"),
});
for (const [nombre, origen, variable] of [
  ['web', HTTP_WEB, 'MORPHIQPOS_WEB_HTTP_SOURCE_PATH'],
  ['comandos', RUTA_COMANDO, 'MORPHIQPOS_COMMAND_ROUTE_SOURCE_PATH'],
  ['portal', HTTP_PORTAL, 'MORPHIQPOS_PORTAL_HTTP_SOURCE_PATH'],
]) {
  comprobarMutacion({
    nombre: `correlación del middleware omitida en ${nombre}`,
    origen,
    archivoTemporal: 'http.ts',
    variable,
    prueba: PRUEBA_CORRELACION,
    transformar: (codigo) =>
      codigo.replaceAll('x-morphiqpos-correlacion', 'x-morphiqpos-correlacion-omitida'),
  });
}
comprobarMutacion({
  nombre: 'registrador estructurado devuelto a texto libre',
  origen: OBSERVABILIDAD,
  archivoTemporal: 'observabilidad.ts',
  variable: 'MORPHIQPOS_LOGGER_SOURCE_PATH',
  prueba: PRUEBA_OBSERVABILIDAD,
  transformar: (codigo) =>
    codigo.replace('console.error(JSON.stringify(evento))', 'console.error(evento.mensaje)'),
});
for (const [nombre, origen, variable] of [
  ['auditoria', AUDITORIA, 'MORPHIQPOS_LOG_AUDITORIA_SOURCE_PATH'],
  ['comando', ENVOLTORIO_COMANDO, 'MORPHIQPOS_LOG_COMANDO_SOURCE_PATH'],
  ['limite', LIMITE_APLICACION, 'MORPHIQPOS_LOG_LIMITE_SOURCE_PATH'],
  ['portal comando', COMANDO_PUBLICO, 'MORPHIQPOS_LOG_PORTAL_COMANDO_SOURCE_PATH'],
  ['portal http', HTTP_PORTAL, 'MORPHIQPOS_LOG_PORTAL_HTTP_SOURCE_PATH'],
  ['portal limite', LIMITE_PORTAL, 'MORPHIQPOS_LOG_PORTAL_LIMITE_SOURCE_PATH'],
  ['http web', HTTP_WEB, 'MORPHIQPOS_LOG_HTTP_WEB_SOURCE_PATH'],
  ['auth entrar', RUTA_AUTH_ENTRAR, 'MORPHIQPOS_LOG_AUTH_ENTRAR_SOURCE_PATH'],
  ['auth empleados', RUTA_EMPLEADOS_PUBLICOS, 'MORPHIQPOS_LOG_AUTH_EMPLEADOS_SOURCE_PATH'],
]) {
  comprobarMutacion({
    nombre: `registro estructurado omitido en ${nombre}`,
    origen,
    archivoTemporal: 'registro.ts',
    variable,
    prueba: PRUEBA_ADOPCION_OBSERVABILIDAD,
    transformar: (codigo) => codigo.replace('registrar({', 'console.error({'),
  });
}
for (const [nombre, origen, variable] of [
  ['limite', LIMITE_APLICACION, 'MORPHIQPOS_LOG_LIMITE_SOURCE_PATH'],
  ['portal limite', LIMITE_PORTAL, 'MORPHIQPOS_LOG_PORTAL_LIMITE_SOURCE_PATH'],
]) {
  comprobarMutacion({
    nombre: `alerta del contador degradada en ${nombre}`,
    origen,
    archivoTemporal: 'limite.ts',
    variable,
    prueba: PRUEBA_ADOPCION_OBSERVABILIDAD,
    transformar: (codigo) => codigo.replace("nivel: 'alerta'", "nivel: 'error'"),
  });
}
