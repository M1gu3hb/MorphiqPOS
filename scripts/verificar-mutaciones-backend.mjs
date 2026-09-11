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
