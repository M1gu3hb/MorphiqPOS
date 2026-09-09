'use client';
import React from 'react';
import { formatCurrency } from '@/utils/financialUtils';
import { getVentaTotal } from '@/utils/ventaTotales';
import { formatearCantidadVariable } from '@/utils/tipoVentaUtils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Ticket / pre-cuenta optimizado para impresora térmica de 80mm.
 * Ancho: 80mm = ~302px. Imprime con @media print (.ticket-printable).
 */
export default function PreCuentaTicket({
  venta,
  detalles,
  mesa,
  config,
  codigo,
  esFinal = false,
}) {
  if (!venta) return null;
  const fecha =
    venta.fecha_cierre || venta.fecha_apertura
      ? format(new Date(venta.fecha_cierre || venta.fecha_apertura), 'd MMM yyyy · HH:mm', {
          locale: es,
        })
      : format(new Date(), 'd MMM yyyy · HH:mm', { locale: es });

  return (
    <div
      className="ticket-printable thermal-80 bg-white text-black mx-auto"
      style={{
        width: '80mm',
        maxWidth: '80mm',
        padding: '4mm',
        fontFamily: 'monospace',
        fontSize: '11px',
        lineHeight: '1.35',
        color: '#000',
      }}
    >
      {/* Encabezado con logo */}
      <div className="text-center pb-2 mb-2" style={{ borderBottom: '1px dashed #000' }}>
        {(config?.logo_ticket_url || config?.logo_url) && config?.mostrar_logo_ticket !== false && (
          <img
            src={config.logo_ticket_url || config.logo_url}
            alt=""
            crossOrigin="anonymous"
            style={{
              maxWidth: '140px',
              maxHeight: '60px',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              margin: '0 auto 6px',
              display: 'block',
            }}
          />
        )}
        <h1 style={{ fontWeight: 900, fontSize: '15px', letterSpacing: '2px', margin: 0 }}>
          {config?.nombre_negocio || 'MH Astral Systems'}
        </h1>
        {config?.direccion && (
          <p style={{ fontSize: '9px', margin: '2px 0 0' }}>{config.direccion}</p>
        )}
        {config?.telefono && <p style={{ fontSize: '9px', margin: 0 }}>Tel: {config.telefono}</p>}
        <p style={{ fontWeight: 'bold', marginTop: '4px', fontSize: '12px' }}>
          {esFinal ? 'TICKET DE PAGO' : 'PRE-CUENTA'}
        </p>
      </div>

      {/* Datos */}
      <div style={{ fontSize: '10px', marginBottom: '6px' }}>
        <Row label="Folio" value={venta.folio} bold />
        {mesa && <Row label="Mesa" value={`#${mesa.numero} ${mesa.nombre || ''}`} />}
        {venta.personas > 0 && <Row label="Personas" value={venta.personas} />}
        {venta.cliente_nombre && <Row label="Cliente" value={venta.cliente_nombre} />}
        {venta.usuario_mesero_nombre && <Row label="Mesero" value={venta.usuario_mesero_nombre} />}
        {venta.usuario_cajero_nombre && <Row label="Cajero" value={venta.usuario_cajero_nombre} />}
        <Row label="Fecha" value={fecha} />
      </div>

      {/* Productos — 6B: si la línea es variable, mostramos "500 g × Producto"
          o "4 shots × Producto" en lugar de "1× Producto". precio_fijo intacto. */}
      <div style={{ borderTop: '1px dashed #000', paddingTop: '4px', marginBottom: '4px' }}>
        {(detalles || []).map((d, i) => {
          const cantVarTxt = formatearCantidadVariable(d || {});
          const prefijo = cantVarTxt ? `${cantVarTxt} ×` : `${d?.cantidad || 0}×`;
          return (
            <div key={i} style={{ marginBottom: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 'bold', flex: 1, paddingRight: '4px' }}>
                  {prefijo} {d?.producto_nombre || ''}
                </span>
                <span style={{ fontWeight: 'bold' }}>{formatCurrency(d?.subtotal)}</span>
              </div>
              {d?.notas_producto && (
                <p
                  style={{
                    fontSize: '9px',
                    fontStyle: 'italic',
                    paddingLeft: '8px',
                    margin: '1px 0 0',
                  }}
                >
                  ↳ {d.notas_producto}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Totales — HOTFIX 6A: getVentaTotal calcula desde detalles si la venta
          tiene total/subtotal en 0 (caso de fallo 429 en envío de pedido). */}
      {(() => {
        const subtotalEfectivo = getVentaTotal(venta, detalles);
        return (
          <div style={{ borderTop: '1px dashed #000', paddingTop: '4px', marginBottom: '4px' }}>
            <Row label="Subtotal" value={formatCurrency(subtotalEfectivo)} />
            {venta.descuentos > 0 && (
              <Row label="Descuento" value={`-${formatCurrency(venta.descuentos)}`} />
            )}
            {venta.impuestos > 0 && <Row label="IVA" value={formatCurrency(venta.impuestos)} />}
            {Number(venta.propina_monto) > 0 && (
              <Row
                label={`Propina${venta.propina_porcentaje > 0 ? ` (${venta.propina_porcentaje}%)` : ''}`}
                value={formatCurrency(venta.propina_monto)}
              />
            )}
            {venta.propina_tipo === 'pendiente' && !esFinal && (
              <Row label="Propina" value="A definir en caja" />
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 'bold',
                fontSize: '14px',
                borderTop: '1px solid #000',
                marginTop: '3px',
                paddingTop: '3px',
              }}
            >
              <span>TOTAL</span>
              <span>{formatCurrency(subtotalEfectivo + (Number(venta.propina_monto) || 0))}</span>
            </div>
            {esFinal && venta.metodo_pago && (
              <div style={{ marginTop: '4px', fontSize: '10px' }}>
                <Row label="Pago" value={venta.metodo_pago} capitalize />
                {venta.monto_efectivo > 0 && (
                  <Row label="Efectivo" value={formatCurrency(venta.monto_efectivo)} />
                )}
                {venta.monto_tarjeta > 0 && (
                  <Row label="Tarjeta" value={formatCurrency(venta.monto_tarjeta)} />
                )}
                {venta.monto_transferencia > 0 && (
                  <Row label="Transf." value={formatCurrency(venta.monto_transferencia)} />
                )}
                {venta.cambio > 0 && (
                  <Row label="Cambio" value={formatCurrency(venta.cambio)} bold />
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Código caja para precuentas */}
      {!esFinal && codigo && (
        <div
          style={{
            border: '2px solid #000',
            textAlign: 'center',
            padding: '8px 4px',
            margin: '8px 0',
            borderRadius: '4px',
          }}
        >
          <p style={{ fontSize: '9px', margin: 0 }}>CÓDIGO PARA CAJA</p>
          <p
            style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '4px', margin: '2px 0' }}
          >
            {codigo}
          </p>
          <p style={{ fontSize: '9px', margin: 0 }}>Presenta este código en caja</p>
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          textAlign: 'center',
          borderTop: '1px dashed #000',
          paddingTop: '4px',
          fontSize: '10px',
        }}
      >
        <p style={{ margin: 0 }}>{config?.mensaje_ticket || '¡Gracias por tu visita!'}</p>
        {config?.ticket_footer && (
          <p style={{ fontSize: '9px', margin: '2px 0 0' }}>{config.ticket_footer}</p>
        )}
        {esFinal && <p style={{ fontSize: '9px', margin: '2px 0 0' }}>Conserva este ticket</p>}
        <p style={{ fontSize: '8px', margin: '4px 0 0', color: '#555' }}>
          {config?.platform_brand || 'MH Astral Systems'}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, bold, capitalize }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        textTransform: capitalize ? 'capitalize' : 'none',
      }}
    >
      <span>{label}:</span>
      <span style={{ fontWeight: bold ? 'bold' : 'normal' }}>{value}</span>
    </div>
  );
}
