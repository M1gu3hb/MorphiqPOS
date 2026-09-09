import 'server-only';

import { ErrorDominio } from '@morphiqpos/contracts';
import type { Transaccion } from '@morphiqpos/data';

import { transaccionLibre } from './db-dinamica.ts';

import { entidadMapeada } from './mapa.ts';
import { haciaEl, haciaLaBase, type MapaEntidad } from './tipos.ts';

/**
 * Las escrituras SIMPLES del puente (F1-02 §3, E3-4).
 *
 * Sólo catálogo: crear un producto, renombrar una categoría, archivar un
 * insumo. Pasa por `comando()` como todo lo demás —transacción, rol,
 * idempotencia y auditoría—, sólo que el comando es delgado.
 *
 * ── Lo que este camino RECHAZA, y por qué ──────────────────────────────────
 * · Las entidades marcadas `escritura: 'comando'`. Venta, detalle de venta,
 *   movimiento de inventario y corte de caja NO se escriben campo por campo
 *   desde el navegador. Marcar una venta como pagada y DESPUÉS procesar
 *   recetas, stock y movimientos es el defecto D-07: si algo falla a mitad, la
 *   venta ya está cobrada y el inventario no se descontó.
 * · Los campos `escribible: false`. Subtotales, totales, utilidad, margen y
 *   costos derivados los calcula el servidor. **El endpoint no acepta importes
 *   del cliente**, y esa es la regla que impide que alguien cobre lo que
 *   quiera cambiando un número en la consola.
 * · Cualquier campo que no esté en el mapa. Incluido `organizacion_id`:
 *   mandarlo no cambia nada, el ámbito sale de la sesión.
 */

export interface PeticionEscritura {
  readonly entidad: string;
  readonly operacion: 'create' | 'update' | 'delete';
  readonly id?: string;
  readonly datos?: Readonly<Record<string, unknown>>;
}

export interface AmbitoEscritura {
  readonly organizacionId: string;
  readonly rol: string;
}

type Fila = Record<string, unknown>;

/** Los métodos que se encadenan en un `update`. Ver `db-dinamica.ts`. */
interface ActualizacionLibre {
  where(columna: string, operador: string, valor: unknown): ActualizacionLibre;
  returning(columnas: string[]): { executeTakeFirst(): Promise<Fila | undefined> };
}

/** Ídem para un `delete`. */
interface BorradoLibre {
  where(columna: string, operador: string, valor: unknown): BorradoLibre;
  returning(columna: string): { executeTakeFirst(): Promise<Fila | undefined> };
}

export async function escribir(
  tx: Transaccion,
  ambito: AmbitoEscritura,
  peticion: PeticionEscritura,
): Promise<Fila> {
  const mapa = entidadMapeada(peticion.entidad);
  if (mapa === null) {
    throw new ErrorDominio(
      'PUENTE_ENTIDAD_DESCONOCIDA',
      `La entidad «${peticion.entidad}» no existe en el puente.`,
    );
  }
  if (mapa.escritura === 'lectura') {
    throw new ErrorDominio('PUENTE_SIN_PERMISO', `${peticion.entidad} es de sólo lectura.`);
  }
  if (mapa.escritura === 'comando') {
    throw new ErrorDominio(
      'PUENTE_SIN_PERMISO',
      `${peticion.entidad} se escribe con su comando transaccional, no por el puente.`,
    );
  }

  switch (peticion.operacion) {
    case 'create':
      return crear(tx, ambito, mapa, peticion);
    case 'update':
      return actualizar(tx, ambito, mapa, peticion);
    case 'delete':
      return borrar(tx, ambito, mapa, peticion);
  }
}

/** Traduce el cuerpo a columnas, rechazando lo que no se puede escribir. */
function aColumnas(mapa: MapaEntidad, datos: Readonly<Record<string, unknown>>): Fila {
  const valores: Fila = {};
  for (const [clave, valor] of Object.entries(datos)) {
    const campo = mapa.campos[clave];
    if (campo === undefined) {
      throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', `«${clave}» no es un campo escribible.`);
    }
    if (campo.escribible === false) {
      throw new ErrorDominio(
        'PUENTE_CAMPO_INVALIDO',
        `«${clave}» lo calcula el servidor y no se acepta del cliente.`,
      );
    }
    valores[campo.columna] = haciaLaBase(valor, campo.conversion);
  }
  return valores;
}

function columnasDeSalida(mapa: MapaEntidad): string[] {
  return Object.entries(mapa.campos).map(([suyo, campo]) => `${campo.columna} as ${suyo}`);
}

function traducirFila(fila: Fila, mapa: MapaEntidad): Fila {
  const salida: Fila = {};
  for (const [suyo, campo] of Object.entries(mapa.campos)) {
    salida[suyo] = haciaEl(fila[suyo], campo.conversion);
  }
  return salida;
}

async function crear(
  tx: Transaccion,
  ambito: AmbitoEscritura,
  mapa: MapaEntidad,
  peticion: PeticionEscritura,
): Promise<Fila> {
  const valores = {
    ...aColumnas(mapa, peticion.datos ?? {}),
    ...(mapa.filtroFijo ?? {}),
    // El ámbito lo pone el servidor. Siempre.
    organizacion_id: ambito.organizacionId,
  };

  // La tabla sale del MAPA, nunca del cliente. Ver `db-dinamica.ts`.
  const fila = (await transaccionLibre(tx)
    .insertInto(mapa.tabla)
    .values(valores as never)
    .returning(columnasDeSalida(mapa))
    .executeTakeFirstOrThrow()) as Fila;

  return traducirFila(fila, mapa);
}

async function actualizar(
  tx: Transaccion,
  ambito: AmbitoEscritura,
  mapa: MapaEntidad,
  peticion: PeticionEscritura,
): Promise<Fila> {
  if (typeof peticion.id !== 'string' || peticion.id === '') {
    throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', 'Falta el identificador.');
  }
  const valores = aColumnas(mapa, peticion.datos ?? {});
  if (Object.keys(valores).length === 0) {
    throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', 'No hay nada que actualizar.');
  }

  let consulta = (
    transaccionLibre(tx)
      .updateTable(mapa.tabla)
      .set(valores as never) as unknown as ActualizacionLibre
  )
    .where('id', '=', peticion.id)
    // El filtro por organización es lo que impide que conocer un identificador
    // ajeno baste para editar el catálogo de otro negocio.
    .where('organizacion_id', '=', ambito.organizacionId);
  for (const [columna, valor] of Object.entries(mapa.filtroFijo ?? {})) {
    consulta = consulta.where(columna, '=', valor);
  }

  const fila = await consulta.returning(columnasDeSalida(mapa)).executeTakeFirst();

  // Cero filas es un FALLO, no un éxito silencioso. Es la trampa de
  // `supabase-vercel-produccion` §7: un UPDATE que no encuentra su fila no da
  // error, devuelve nada, y la pantalla enseña «guardado».
  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese registro no existe en este negocio.');
  }
  return traducirFila(fila, mapa);
}

/**
 * Borrado SUAVE donde el catálogo lo exige (F1-01 §3, regla 8).
 *
 * Los registros históricos guardan el nombre del producto en instantánea, así
 * que borrarlo de verdad rompería un ticket de hace seis meses. Si la entidad
 * tiene campo `activo`, se apaga; si no lo tiene, se borra de verdad.
 */
async function borrar(
  tx: Transaccion,
  ambito: AmbitoEscritura,
  mapa: MapaEntidad,
  peticion: PeticionEscritura,
): Promise<Fila> {
  if (typeof peticion.id !== 'string' || peticion.id === '') {
    throw new ErrorDominio('PUENTE_CAMPO_INVALIDO', 'Falta el identificador.');
  }
  const campoActivo = mapa.campos['activo'];
  if (campoActivo !== undefined) {
    return actualizar(tx, ambito, mapa, {
      entidad: peticion.entidad,
      operacion: 'update',
      id: peticion.id,
      datos: { activo: false },
    });
  }

  const fila = (await (transaccionLibre(tx).deleteFrom(mapa.tabla) as unknown as BorradoLibre)
    .where('id', '=', peticion.id)
    .where('organizacion_id', '=', ambito.organizacionId)
    .returning('id')
    .executeTakeFirst()) as { id: string } | undefined;

  if (fila === undefined) {
    throw new ErrorDominio('PUENTE_NO_ENCONTRADO', 'Ese registro no existe en este negocio.');
  }
  return { id: fila.id };
}
