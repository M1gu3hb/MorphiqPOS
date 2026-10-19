import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { comandosRegistrados } from '../pruebas/comandos-registrados.ts';
import { esTablaDeSucursal, FRONTERA_DE_TABLAS, segmentosDe } from './frontera.ts';

/**
 * NINGÚN ID DE SUCURSAL SIN DECIDIR (D-36).
 *
 * El envoltorio sólo acota lo que el comando declara. Un comando nuevo que recibe un
 * `ordenId` y no lo declara opera la orden de cualquier sucursal, y nada lo diría. Este
 * contrato carga TODOS los módulos de `packages/app/src` que definen comandos, recorre cada
 * entrada y exige que todo campo cuyo NOMBRE dice que es un id de algo de una sucursal
 * esté en `sucursal` o en `sinFrontera` —con su razón—.
 *
 * El nombre es una pista y no la regla: la regla es la declaración, que el comando escribe
 * y `definirComando` comprueba. Por eso la lista de nombres de abajo puede quedarse corta
 * sin abrir nada —un nombre que no está sólo deja de pedir la declaración—, y se agranda
 * cuando aparece una tabla de sucursal nueva.
 */
const NOMBRES_DE_SUCURSAL = new Set([
  'ordenId',
  'ordenIds',
  'pedidoId',
  'lineaId',
  'ordenLineaId',
  'sesionCajaId',
  'corteId',
  'mesaId',
  'mesaIds',
  'mesaPrincipalId',
  'mesaDestinoId',
  'citaId',
  'citaServicioId',
  'comandaId',
  'comandaItemId',
  'esperaId',
  'unionId',
  'solicitudId',
  'compraId',
  'compraLineaId',
  'profesionalId',
  'tomaId',
  'piezaAbiertaId',
  'almacenId',
  'almacenCabinaId',
  'almacenVentaId',
  'almacenOrigen',
  'almacenDestino',
  'ubicacionId',
  'caducidadId',
  'garantiaId',
  'cotizacionId',
  'notaId',
  'listaId',
  'renglonId',
  'pagoId',
  'esquemaId',
  'traspasoId',
  'empleoBeneficiarioId',
  'empleoId',
  'meseroId',
  'empleadoEntraId',
  'empleadoSaleId',
  'quienEntraId',
  'solicitaEmpleoId',
  'empleado',
  'rentaId',
  'presenciaId',
  'anticipoId',
  'liquidacionId',
]);

/**
 * Los que se llaman igual y NO son de una sucursal, cada uno con su razón: el nombre
 * engaña y la tabla es del negocio entero.
 */
const DEL_NEGOCIO_POR_NOMBRE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'cotizacion.registrar_surtido': {
    'entregas[].lineaId':
      'Son renglones de la COTIZACIÓN, y se resuelven dentro de la cotización ya acotada.',
  },
};

/** Los caminos de todos los campos de texto de la entrada, con `[]` en los arreglos. */
function caminos(esquema: unknown, prefijo = ''): string[] {
  if (typeof esquema !== 'object' || esquema === null) return [];
  const nodo = esquema as {
    type?: string;
    properties?: Record<string, unknown>;
    items?: unknown;
    anyOf?: unknown[];
    oneOf?: unknown[];
    allOf?: unknown[];
  };
  const alternativas = [...(nodo.anyOf ?? []), ...(nodo.oneOf ?? []), ...(nodo.allOf ?? [])];
  if (alternativas.length > 0) return alternativas.flatMap((a) => caminos(a, prefijo));
  if (nodo.type === 'object' && nodo.properties !== undefined) {
    return Object.entries(nodo.properties).flatMap(([clave, valor]) =>
      caminos(valor, prefijo === '' ? clave : `${prefijo}.${clave}`),
    );
  }
  if (nodo.type === 'array') return caminos(nodo.items, `${prefijo}[]`);
  return nodo.type === 'string' ? [prefijo] : [];
}

const COMANDOS = await comandosRegistrados();

describe('la frontera por sucursal de los comandos (D-36)', () => {
  it('se cargan los comandos de verdad, no una lista vacía', () => {
    expect(COMANDOS.size).toBeGreaterThan(250);
    expect(COMANDOS.get('venta.cobrar')?.sucursal).toEqual({ ordenId: 'ordenes' });
  });

  it('todo id de algo de una sucursal está declarado en `sucursal` o en `sinFrontera`', () => {
    const sinDecidir: string[] = [];
    for (const [nombre, definicion] of COMANDOS) {
      const declarados = new Set([
        ...Object.keys(definicion.sucursal ?? {}),
        ...Object.keys(definicion.sinFrontera ?? {}),
        ...Object.keys(DEL_NEGOCIO_POR_NOMBRE[nombre] ?? {}),
      ]);
      const esquema = z.toJSONSchema(definicion.entrada, { io: 'input', unrepresentable: 'any' });
      for (const camino of new Set(caminos(esquema))) {
        const campo =
          segmentosDe(camino)
            .filter((s) => s !== '[]')
            .at(-1) ?? '';
        if (NOMBRES_DE_SUCURSAL.has(campo) && !declarados.has(camino)) {
          sinDecidir.push(`${nombre}: ${camino}`);
        }
      }
    }
    expect(sinDecidir).toEqual([]);
  });

  it('cada `sinFrontera` dice por qué', () => {
    for (const [nombre, definicion] of COMANDOS) {
      for (const [camino, razon] of Object.entries(definicion.sinFrontera ?? {})) {
        expect(razon.length, `${nombre}: ${camino}`).toBeGreaterThan(40);
      }
    }
  });

  it('cada tabla declarada tiene su frontera', () => {
    for (const [nombre, definicion] of COMANDOS) {
      for (const tablas of Object.values(definicion.sucursal ?? {})) {
        for (const tabla of typeof tablas === 'string' ? [tablas] : tablas) {
          expect(esTablaDeSucursal(tabla), `${nombre}: ${tabla}`).toBe(true);
        }
      }
    }
    expect(Object.keys(FRONTERA_DE_TABLAS).length).toBeGreaterThan(30);
  });
});
