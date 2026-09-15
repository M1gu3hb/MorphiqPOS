#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const HEREDADO = join(RAIZ, 'apps', 'web', 'heredado');
const CONTRATO = join(RAIZ, 'packages', 'app', 'src', 'puente', 'cobertura.test.ts');

/**
 * Excepciones deliberadas a lecturas que comparten nombre con un descarte.
 *
 * Se fija también el número exacto de accesos. Una razón sin conteo convertiría
 * la excepción en permiso permanente para añadir lecturas nuevas en cualquier
 * archivo. Toda entrada debe explicar de qué entidad o dato transitorio sale.
 */
const LECTURAS_PERMITIDAS = [
  {
    campo: 'descripcion',
    cantidad: 53,
    razon:
      'Es un nombre compartido por productos, estaciones, menús, gastos y formularios; sólo se descarta en las entidades de categoría.',
  },
  {
    campo: 'fecha',
    cantidad: 30,
    razon:
      'Las lecturas son de compras, gastos y formularios de importación; el descarte corresponde a los dos ledgers inmutables.',
  },
  {
    campo: 'producto_id',
    cantidad: 16,
    razon:
      'Las lecturas pertenecen a recetas, líneas de venta, comandas y carritos; sólo la vista agregada de descuentos lo descarta.',
  },
  {
    campo: 'tipo_venta',
    cantidad: 42,
    razon:
      'Casi todas las lecturas son de ProductoTerminado y PedidoPreparacionItem, donde sí está mapeado; Venta conserva un badge opcional de compatibilidad.',
  },
  {
    campo: 'modificadores',
    cantidad: 19,
    razon:
      'Son DTO de catálogo, selección y carrito; el producto normalizado los guarda mediante catalogo.guardar_modificadores y no como una columna.',
  },
  {
    campo: 'fecha_inicio',
    cantidad: 17,
    razon:
      'Es un campo real de PedidoPreparacion y un respaldo heredado para cortes; CorteCaja usa fecha_apertura como fuente primaria.',
  },
  {
    campo: 'venta_folio',
    cantidad: 1,
    razon:
      'Es una defensa opcional del detector de comandas huérfanas; venta_id y mesa_id resuelven la identidad antes de este respaldo.',
  },
  {
    campo: 'venta_ids',
    cantidad: 1,
    razon:
      'Es el arreglo local que agruparPropinasPorMesero construye para el diálogo; no es una lectura de LiquidacionPropina.',
  },
  {
    campo: 'costo_total_movimiento',
    cantidad: 1,
    razon:
      'Es una proyección de presentación calculada sobre el movimiento y no una columna que se espere recibir del ledger.',
  },
  {
    campo: 'costo_total_linea_snapshot',
    cantidad: 1,
    razon:
      'El ticket acepta esta propiedad opcional dentro de su DTO de impresión; la venta real conserva costo unitario y cantidad.',
  },
  {
    campo: 'costo_total_estimado',
    cantidad: 1,
    razon:
      'Pertenece al DTO calculado del reporte de corte y no a la fila persistida de CorteCaja.',
  },
  {
    campo: 'diferencia_apertura',
    cantidad: 1,
    razon:
      'Pertenece al DTO calculado del reporte de corte y no a la fila persistida de CorteCaja.',
  },
  {
    campo: 'diferencia_efectivo',
    cantidad: 1,
    razon:
      'Pertenece al DTO calculado del reporte de corte y no a la fila persistida de CorteCaja.',
  },
  {
    campo: 'numero_ventas',
    cantidad: 4,
    razon:
      'Las pantallas lo leen del resumen o del DTO de cierre calculado; no se conserva como contador duplicado en la sesión.',
  },
  {
    campo: 'propinas_por_mesero',
    cantidad: 1,
    razon:
      'Pertenece al DTO calculado del reporte de corte y se deriva de pagos y órdenes, no de CorteCaja.',
  },
  {
    campo: 'ticket_promedio',
    cantidad: 1,
    razon:
      'Pertenece al DTO calculado del reporte de corte y se deriva del total y el número de ventas.',
  },
  {
    campo: 'total_efectivo',
    cantidad: 3,
    razon:
      'Pertenece a resúmenes y DTO de impresión derivados de pagos; no se guarda como segunda verdad en CorteCaja.',
  },
  {
    campo: 'total_gastos',
    cantidad: 2,
    razon:
      'Pertenece a resúmenes y DTO de impresión derivados de gastos; no se guarda como segunda verdad en CorteCaja.',
  },
  {
    campo: 'total_general',
    cantidad: 9,
    razon:
      'Pertenece a resúmenes y DTO de impresión derivados de ventas; no se guarda como segunda verdad en CorteCaja.',
  },
  {
    campo: 'total_propinas',
    cantidad: 1,
    razon:
      'Pertenece al DTO de impresión derivado de pagos; no se guarda como segunda verdad en CorteCaja.',
  },
  {
    campo: 'total_tarjeta',
    cantidad: 3,
    razon:
      'Pertenece a resúmenes y DTO de impresión derivados de pagos; no se guarda como segunda verdad en CorteCaja.',
  },
  {
    campo: 'total_transferencia',
    cantidad: 3,
    razon:
      'Pertenece a resúmenes y DTO de impresión derivados de pagos; no se guarda como segunda verdad en CorteCaja.',
  },
  {
    campo: 'utilidad_bruta_total',
    cantidad: 3,
    razon:
      'Pertenece al DTO calculado del reporte de corte y se deriva de ventas, sin incluir propinas.',
  },
  {
    campo: 'utilidad_neta_estimada',
    cantidad: 2,
    razon:
      'Pertenece al DTO calculado del reporte de corte y se deriva de utilidad bruta menos gastos.',
  },
];

function nombreDe(propiedad) {
  if (ts.isIdentifier(propiedad) || ts.isStringLiteral(propiedad)) return propiedad.text;
  return null;
}

function objetoLiteral(expresion) {
  let actual = expresion;
  while (ts.isAsExpression(actual) || ts.isParenthesizedExpression(actual)) {
    actual = actual.expression;
  }
  return ts.isObjectLiteralExpression(actual) ? actual : null;
}

function camposDescartados() {
  const texto = readFileSync(CONTRATO, 'utf8');
  const fuente = ts.createSourceFile(
    CONTRATO,
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const porCampo = new Map();
  let encontrado = false;

  function visitar(nodo) {
    if (
      ts.isVariableDeclaration(nodo) &&
      ts.isIdentifier(nodo.name) &&
      nodo.name.text === 'DESCARTADOS' &&
      nodo.initializer !== undefined
    ) {
      const entidades = objetoLiteral(nodo.initializer);
      if (entidades === null) throw new Error('DESCARTADOS debe ser un objeto literal analizable.');
      encontrado = true;
      for (const propiedadEntidad of entidades.properties) {
        if (!ts.isPropertyAssignment(propiedadEntidad)) continue;
        const entidad = nombreDe(propiedadEntidad.name);
        const campos = objetoLiteral(propiedadEntidad.initializer);
        if (entidad === null || campos === null) continue;
        for (const propiedadCampo of campos.properties) {
          if (!ts.isPropertyAssignment(propiedadCampo)) continue;
          const campo = nombreDe(propiedadCampo.name);
          if (campo === null) continue;
          const suyas = porCampo.get(campo) ?? new Set();
          suyas.add(entidad);
          porCampo.set(campo, suyas);
        }
      }
      return;
    }
    ts.forEachChild(nodo, visitar);
  }

  visitar(fuente);
  if (!encontrado || porCampo.size === 0) {
    throw new Error('No se pudo extraer DESCARTADOS del contrato del puente.');
  }
  return porCampo;
}

function archivosJavaScript(carpeta) {
  const encontrados = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...archivosJavaScript(ruta));
    else if (['.js', '.jsx'].includes(extname(entrada.name))) encontrados.push(ruta);
  }
  return encontrados.sort();
}

function esSoloEscritura(nodo) {
  const padre = nodo.parent;
  return (
    (ts.isBinaryExpression(padre) &&
      padre.left === nodo &&
      padre.operatorToken.kind === ts.SyntaxKind.EqualsToken) ||
    ts.isDeleteExpression(padre)
  );
}

function accesoDe(nodo) {
  if (ts.isPropertyAccessExpression(nodo)) {
    return { campo: nodo.name.text, base: nodo.expression.getText() };
  }
  if (ts.isElementAccessExpression(nodo) && nodo.argumentExpression !== undefined) {
    const argumento = nodo.argumentExpression;
    if (ts.isStringLiteral(argumento) || ts.isNoSubstitutionTemplateLiteral(argumento)) {
      return { campo: argumento.text, base: nodo.expression.getText() };
    }
  }
  return null;
}

function lecturasEn(archivo, descartados) {
  const texto = readFileSync(archivo, 'utf8');
  const fuente = ts.createSourceFile(
    archivo,
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );
  const lineas = texto.split(/\r?\n/);
  const lecturas = [];

  function registrar(campo, base, nodo) {
    if (!descartados.has(campo)) return;
    const posicion = fuente.getLineAndCharacterOfPosition(nodo.getStart(fuente));
    lecturas.push({
      archivo: relative(RAIZ, archivo).replaceAll('\\', '/'),
      campo,
      base,
      linea: posicion.line + 1,
      contexto: (lineas[posicion.line] ?? '').trim(),
    });
  }

  function visitar(nodo) {
    const acceso = accesoDe(nodo);
    if (acceso !== null && !esSoloEscritura(nodo)) {
      registrar(acceso.campo, acceso.base, nodo);
    }
    if (ts.isBindingElement(nodo)) {
      const campo = nombreDe(nodo.propertyName ?? nodo.name);
      if (campo !== null) registrar(campo, 'desestructuración', nodo);
    }
    ts.forEachChild(nodo, visitar);
  }

  visitar(fuente);
  return lecturas;
}

function claveDe(lectura) {
  return lectura.campo;
}

function validarExcepciones(excepciones) {
  const claves = new Set();
  for (const excepcion of excepciones) {
    const clave = excepcion.campo;
    if (claves.has(clave)) throw new Error(`Excepción duplicada: ${clave}`);
    if (!Number.isInteger(excepcion.cantidad) || excepcion.cantidad < 1) {
      throw new Error(`Excepción sin cantidad positiva: ${clave}`);
    }
    if (typeof excepcion.razon !== 'string' || excepcion.razon.trim().length < 20) {
      throw new Error(`Excepción sin razón suficiente: ${clave}`);
    }
    claves.add(clave);
  }
}

const descartados = camposDescartados();
const lecturas = archivosJavaScript(HEREDADO).flatMap((archivo) =>
  lecturasEn(archivo, descartados),
);
const porClave = new Map();
for (const lectura of lecturas) {
  const clave = claveDe(lectura);
  const grupo = porClave.get(clave) ?? [];
  grupo.push(lectura);
  porClave.set(clave, grupo);
}

validarExcepciones(LECTURAS_PERMITIDAS);
const excepciones = new Map(LECTURAS_PERMITIDAS.map((excepcion) => [excepcion.campo, excepcion]));
const problemas = [];

for (const [clave, grupo] of porClave) {
  const excepcion = excepciones.get(clave);
  if (excepcion === undefined) {
    problemas.push(...grupo);
    continue;
  }
  if (grupo.length !== excepcion.cantidad) {
    problemas.push(...grupo);
    console.error(
      `EXCEPCIÓN DESACTUALIZADA ${clave}: esperaba ${String(excepcion.cantidad)}, encontró ${String(grupo.length)}.`,
    );
  }
}

for (const [clave, excepcion] of excepciones) {
  if (!porClave.has(clave)) {
    console.error(`EXCEPCIÓN SOBRANTE ${clave}: ${excepcion.razon}`);
    problemas.push({
      archivo: '<excepción>',
      campo: excepcion.campo,
      linea: 0,
      contexto: excepcion.razon,
    });
  }
}

if (problemas.length > 0) {
  console.error(
    `Lecturas prohibidas: ${String(problemas.length)} acceso(s) a campos descartados por el puente.`,
  );
  for (const lectura of problemas) {
    const entidades = [...(descartados.get(lectura.campo) ?? [])].join(', ');
    console.error(
      `  ${lectura.archivo}:${String(lectura.linea)} · ${lectura.campo} (${entidades}) · ${lectura.contexto}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log(
    `✓ Lecturas del puente: ${String(descartados.size)} campos descartados vigilados; ${String(lecturas.length)} lectura(s) justificadas.`,
  );
}
