'use client';

const CAMPOS_EDITABLES_MESA = new Set([
  'numero',
  'nombre',
  'zona_id',
  'capacidad',
  'forma',
  'tamano',
  'posicion_x',
  'posicion_y',
  'orden',
  'qr_activo',
  'mesero_asignado_id',
  'activo',
]);

/** Conserva únicamente los campos que Mesa.create/update acepta. */
export function soloCamposEditablesMesa(fila) {
  return Object.fromEntries(
    Object.entries(fila).filter(
      ([clave, valor]) => CAMPOS_EDITABLES_MESA.has(clave) && valor !== undefined,
    ),
  );
}
