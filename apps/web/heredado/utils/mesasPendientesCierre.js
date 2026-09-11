'use client';
// 6A — Helper para bloquear cierre/corte de caja si quedan mesas pendientes.
//
// Regla: NO se puede cerrar caja (cierre_diario) si alguna mesa tiene estado
// distinto a "libre" o tiene venta_activa_id. Tampoco se permite si la mesa
// está en "limpieza" (debe quedar libre antes del cierre).
//
// Devuelve un array de mesas pendientes (Activo:true), ordenado por número.
// No hace ninguna escritura. Solo lectura.

import { api } from '@/api/cliente';

const ESTADOS_NO_BLOQ = new Set(['libre']);

export async function obtenerMesasPendientesCierre() {
  // Antes esto devolvía [] cuando la lectura fallaba, y `[]` significa «no hay
  // mesas pendientes»: exactamente el permiso para cerrar el día. Un 429 del
  // pooler bastaba para cerrar la caja con la mesa 7 abierta y $840 sin cobrar,
  // y el arqueo del día siguiente no cuadraba sin que nadie supiera por qué.
  //
  // «No hay mesas» y «no pude leer las mesas» son cosas distintas. El error se
  // propaga y quien llama decide, con la información delante.
  const mesas = await api.entidades.Mesa.filter({ activo: true });
  const arr = Array.isArray(mesas) ? mesas : [];
  const pendientes = arr.filter((m) => {
    if (!m) return false;
    const estado = m.estado || 'libre';
    const tieneVenta = !!m.venta_activa_id;
    // Bloquea si NO es "libre" o si tiene venta activa.
    return !ESTADOS_NO_BLOQ.has(estado) || tieneVenta;
  });
  // Orden por número ascendente para mostrar bonito en UI.
  return pendientes.sort((a, b) => (Number(a?.numero) || 0) - (Number(b?.numero) || 0));
}
