'use client';
import React from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { MH_LOGO_URL as AZECAFE_LOGO_URL } from '@/lib/ConfigContext';

/**
 * PDF imprimible de un periodo seleccionado en Registros.
 * Se renderiza con `.ticket-printable.letter-doc` para usar el layout carta.
 */
export default function PeriodoPDF({ data, config = {}, sinCostos = false }) {
  if (!data) return null;
  const {
    from,
    to,
    periodo,
    ventas = [],
    compras = [],
    gastos = [],
    totals = {},
    margen = 0,
  } = data;
  // Neto NO incluye propinas porque no son ingreso del restaurante.
  const neto = (totals.ingresos || 0) - (totals.compras || 0) - (totals.gastos || 0);

  return (
    <div
      className="ticket-printable letter-doc cash-cut-pdf bg-superficie text-texto mx-auto"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '15mm',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-borde-fuerte">
        <div className="flex items-center gap-3">
          <img
            src={config.logo_url || AZECAFE_LOGO_URL}
            alt="logo"
            style={{ width: 56, height: 56, objectFit: 'contain' }}
          />
          <div>
            <h1 className="text-xl font-bold">{config.nombre_negocio || 'AZECAFE'}</h1>
            <p className="text-xs text-texto-sutil">{config.direccion || ''}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-lg font-bold">Reporte de periodo</h2>
          <p className="text-xs">
            {format(from, 'd MMM yyyy', { locale: es })} –{' '}
            {format(to, 'd MMM yyyy', { locale: es })}
          </p>
          <p className="text-[10px] text-texto-sutil">
            Generado: {format(new Date(), 'd MMM yyyy, HH:mm', { locale: es })}
          </p>
        </div>
      </div>

      {/* Resumen — sin `costos_basicos`: sólo ventas y métodos de pago. Las propinas aparecen en las 3 plantillas pero SEPARADAS de utilidad/neto */}
      <h3 className="text-sm font-bold uppercase tracking-wide mb-2 mt-4">
        {sinCostos ? 'Resumen de ventas' : 'Resumen financiero'}
      </h3>
      <table className="w-full text-xs border mb-4">
        <tbody>
          <tr>
            <td className="border px-2 py-1.5 font-medium w-1/2">
              Ingresos por ventas (sin propina)
            </td>
            <td className="border px-2 py-1.5 text-right">
              {formatCurrency(totals.ingresos || 0)}
            </td>
          </tr>
          <tr>
            <td className="border px-2 py-1.5 font-medium">Número de ventas</td>
            <td className="border px-2 py-1.5 text-right">{totals.nVentas || 0}</td>
          </tr>
          <tr>
            <td className="border px-2 py-1.5 font-medium">Propinas (no son del restaurante)</td>
            <td className="border px-2 py-1.5 text-right text-peligro">
              {formatCurrency(totals.propinas || 0)}
            </td>
          </tr>
          <tr>
            <td className="border px-2 py-1.5 font-medium">Total cobrado (ventas + propinas)</td>
            <td className="border px-2 py-1.5 text-right font-semibold">
              {formatCurrency((totals.ingresos || 0) + (totals.propinas || 0))}
            </td>
          </tr>
          {!sinCostos && (
            <>
              <tr>
                <td className="border px-2 py-1.5 font-medium">Utilidad bruta</td>
                <td className="border px-2 py-1.5 text-right text-exito">
                  {formatCurrency(totals.utilidad || 0)}
                </td>
              </tr>
              <tr>
                <td className="border px-2 py-1.5 font-medium">Margen promedio</td>
                <td className="border px-2 py-1.5 text-right">
                  {(Number.isFinite(Number(margen)) ? Number(margen) : 0).toFixed(1)}%
                </td>
              </tr>
              <tr>
                <td className="border px-2 py-1.5 font-medium">Compras de insumos</td>
                <td className="border px-2 py-1.5 text-right text-advertencia">
                  −{formatCurrency(totals.compras || 0)}
                </td>
              </tr>
              <tr>
                <td className="border px-2 py-1.5 font-medium">Gastos operativos</td>
                <td className="border px-2 py-1.5 text-right text-peligro">
                  −{formatCurrency(totals.gastos || 0)}
                </td>
              </tr>
              <tr className="bg-fondo-sutil">
                <td className="border px-2 py-2 font-bold">NETO DEL PERIODO (sin propinas)</td>
                <td className="border px-2 py-2 text-right font-bold text-base">
                  {neto >= 0 ? '' : '−'}
                  {formatCurrency(Math.abs(neto))}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {/* Ventas */}
      <h3 className="text-sm font-bold uppercase tracking-wide mb-2 mt-4">
        Ventas ({ventas.length})
      </h3>
      {ventas.length > 0 ? (
        <table className="w-full text-[10px] border mb-4">
          <thead className="bg-fondo-sutil">
            <tr>
              <th className="border px-1.5 py-1 text-left">Folio</th>
              <th className="border px-1.5 py-1 text-left">Fecha</th>
              <th className="border px-1.5 py-1 text-left">Tipo</th>
              <th className="border px-1.5 py-1 text-left">Pago</th>
              <th className="border px-1.5 py-1 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {ventas.slice(0, 100).map((v) => (
              <tr key={v.id}>
                <td className="border px-1.5 py-1 font-mono">{v.folio}</td>
                <td className="border px-1.5 py-1">
                  {v.fecha_cierre ? format(new Date(v.fecha_cierre), 'd/MM HH:mm') : ''}
                </td>
                <td className="border px-1.5 py-1">
                  {v.tipo_venta}
                  {v.mesa_numero ? ` · M${v.mesa_numero}` : ''}
                </td>
                <td className="border px-1.5 py-1 capitalize">{v.metodo_pago || '—'}</td>
                <td className="border px-1.5 py-1 text-right font-medium">
                  {formatCurrency(v.total)}
                </td>
              </tr>
            ))}
            {ventas.length > 100 && (
              <tr>
                <td colSpan={5} className="border px-1.5 py-1 text-center text-texto-sutil italic">
                  ...y {ventas.length - 100} ventas más
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-texto-sutil italic">Sin ventas en este periodo.</p>
      )}

      {/* Compras — solo con el módulo `compras` */}
      {!sinCostos && (
        <>
          <h3 className="text-sm font-bold uppercase tracking-wide mb-2 mt-4">
            Compras ({compras.length})
          </h3>
          {compras.length > 0 ? (
            <table className="w-full text-[10px] border mb-4">
              <thead className="bg-fondo-sutil">
                <tr>
                  <th className="border px-1.5 py-1 text-left">Fecha</th>
                  <th className="border px-1.5 py-1 text-left">Proveedor</th>
                  <th className="border px-1.5 py-1 text-left">Pago</th>
                  <th className="border px-1.5 py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id}>
                    <td className="border px-1.5 py-1">{c.fecha}</td>
                    <td className="border px-1.5 py-1">{c.proveedor_nombre || 'Compra directa'}</td>
                    <td className="border px-1.5 py-1 capitalize">{c.metodo_pago || '—'}</td>
                    <td className="border px-1.5 py-1 text-right font-medium">
                      {formatCurrency(c.total_compra)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-texto-sutil italic">Sin compras en este periodo.</p>
          )}

          {/* Gastos */}
          <h3 className="text-sm font-bold uppercase tracking-wide mb-2 mt-4">
            Gastos operativos ({gastos.length})
          </h3>
          {gastos.length > 0 ? (
            <table className="w-full text-[10px] border mb-4">
              <thead className="bg-fondo-sutil">
                <tr>
                  <th className="border px-1.5 py-1 text-left">Fecha</th>
                  <th className="border px-1.5 py-1 text-left">Categoría</th>
                  <th className="border px-1.5 py-1 text-left">Descripción</th>
                  <th className="border px-1.5 py-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => (
                  <tr key={g.id}>
                    <td className="border px-1.5 py-1">{g.fecha}</td>
                    <td className="border px-1.5 py-1 capitalize">{g.categoria}</td>
                    <td className="border px-1.5 py-1">{g.descripcion}</td>
                    <td className="border px-1.5 py-1 text-right font-medium text-peligro">
                      −{formatCurrency(g.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-texto-sutil italic">Sin gastos en este periodo.</p>
          )}
        </>
      )}

      <div className="mt-8 pt-4 border-t text-[9px] text-texto-sutil text-center">
        Documento generado automáticamente por {config.nombre_sistema || 'AZECAFE POS'}
      </div>
    </div>
  );
}
