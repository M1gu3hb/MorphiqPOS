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

const nombreDeZona = (texto) =>
  String(texto ?? '')
    .trim()
    .toLocaleLowerCase('es');

/**
 * Conserva únicamente los campos que Mesa.create/update acepta.
 *
 * El diálogo elige la zona por su NOMBRE («Terraza»), pero lo que se guarda es `zona_id`: `zona`
 * es un derivado de sólo lectura. Sin `zonas` la zona elegida no viajaba y la mesa nueva quedaba
 * sin zona —en «Interior»— aunque se creara desde la pestaña «Terraza». Con ellas, el nombre
 * se traduce a su `zona_id`; si no aparece, la fila sale sin `zona_id` y quien llama decide.
 */
export function soloCamposEditablesMesa(fila, zonas = []) {
  const campos = Object.fromEntries(
    Object.entries(fila)
      .filter(([clave, valor]) => CAMPOS_EDITABLES_MESA.has(clave) && valor !== undefined)
      .map(([clave, valor]) => [
        clave,
        clave === 'mesero_asignado_id' && valor === '' ? null : valor,
      ]),
  );
  if (nombreDeZona(fila.zona) !== '') {
    const zona = zonas.find((z) => nombreDeZona(z?.nombre) === nombreDeZona(fila.zona));
    if (zona?.id) campos.zona_id = zona.id;
    else delete campos.zona_id;
  }
  return campos;
}
