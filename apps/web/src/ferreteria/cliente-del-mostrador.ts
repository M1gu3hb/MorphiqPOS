import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * A QUIÉN SE LE REMITE: el cliente de crédito del mostrador, con sus obras y quién puede
 * recoger por él (C.10 de la 2.4).
 *
 * ── El defecto que esto cierra ───────────────────────────────────────────
 * El mostrador tenía la salida a crédito entera —F11, la remisión, la firma, el muro del
 * límite— y NINGUNA forma de elegir al cliente: la página lo montaba sin cliente y la
 * prop sólo la llenaban las pruebas. La remisión a cuenta, que es como compra el
 * contratista, no se podía hacer desde el mostrador de ningún negocio.
 *
 * ── Lo que se lee, y de dónde ────────────────────────────────────────────
 * El cliente con su límite (`Cliente`), lo que debe por obra (`CarteraPorObra`, que trae
 * los días del saldo más viejo), sus obras abiertas (`Obra`) y sus autorizados
 * (`AutorizadoCuenta`). Todo por el puente, y la decisión final la toma el servidor al
 * remitir (`credito.registrar_remision` evalúa el muro otra vez): esto sólo ENSEÑA.
 */

export interface ClienteDelPuente {
  readonly id: string;
  readonly nombre: string | null;
  readonly telefono: string | null;
  /** EN PESOS: el gemelo honesto de `limite_credito_centavos`. */
  readonly limite_credito_pesos: number | null;
}

export interface CarteraDelPuente {
  readonly cliente_id: string;
  readonly obra_nombre: string | null;
  /** Centavos (`conversion: 'entero'`). */
  readonly saldo_centavos: number | null;
  readonly dias_mas_viejo: number | null;
}

export interface ObraDelPuente {
  readonly id: string;
  readonly cliente_id: string;
  readonly nombre: string;
  readonly estado: string | null;
}

export interface AutorizadoDelPuente {
  readonly id: string;
  readonly cliente_id: string;
  readonly obra_id: string | null;
  readonly nombre: string;
  readonly activo: boolean | null;
}

export interface ObraParaElegir {
  readonly id: string;
  readonly nombre: string;
}

export interface AutorizadoParaElegir {
  readonly id: string;
  readonly nombre: string;
  /** Nulo: puede recoger para cualquier obra del cliente. */
  readonly obraId: string | null;
}

export interface ClienteParaElegir {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly saldoCentavos: number;
  readonly limiteCentavos: number;
  readonly diasVencido: number;
  readonly obras: readonly ObraParaElegir[];
  readonly autorizados: readonly AutorizadoParaElegir[];
}

/** Junta las cuatro lecturas en un cliente por renglón, ordenado por nombre. */
export function clientesParaElegir(
  clientes: readonly ClienteDelPuente[],
  cartera: readonly CarteraDelPuente[],
  obras: readonly ObraDelPuente[],
  autorizados: readonly AutorizadoDelPuente[],
): ClienteParaElegir[] {
  const deuda = new Map<string, { saldo: number; dias: number }>();
  for (const fila of cartera) {
    const previa = deuda.get(fila.cliente_id) ?? { saldo: 0, dias: 0 };
    deuda.set(fila.cliente_id, {
      saldo:
        previa.saldo + (centavosDe('CarteraPorObra', 'saldo_centavos', fila.saldo_centavos) ?? 0),
      dias: Math.max(previa.dias, fila.dias_mas_viejo ?? 0),
    });
  }
  return clientes
    .map((c) => ({
      id: c.id,
      nombre: c.nombre ?? 'Sin nombre',
      telefono: c.telefono,
      saldoCentavos: deuda.get(c.id)?.saldo ?? 0,
      limiteCentavos: centavosDe('Cliente', 'limite_credito_pesos', c.limite_credito_pesos) ?? 0,
      diasVencido: deuda.get(c.id)?.dias ?? 0,
      // Sólo las ABIERTAS: a una obra cerrada ya no se le remite material.
      obras: obras
        .filter((o) => o.cliente_id === c.id && o.estado !== 'cerrada')
        .map((o) => ({ id: o.id, nombre: o.nombre })),
      autorizados: autorizados
        .filter((a) => a.cliente_id === c.id && a.activo !== false)
        .map((a) => ({ id: a.id, nombre: a.nombre, obraId: a.obra_id })),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'));
}

/** Por nombre o por los últimos dígitos del teléfono, sin acentos. */
export function filtrarClientes(
  clientes: readonly ClienteParaElegir[],
  busqueda: string,
): ClienteParaElegir[] {
  const aguja = sinAcentos(busqueda.trim());
  if (aguja === '') return [...clientes];
  const digitos = aguja.replace(/\D/g, '');
  return clientes.filter(
    (c) =>
      sinAcentos(c.nombre).includes(aguja) ||
      (digitos.length >= 3 && (c.telefono ?? '').replace(/\D/g, '').includes(digitos)),
  );
}

function sinAcentos(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Quién puede recoger para esa obra: los de la obra y los del cliente en general. */
export function autorizadosDeLaObra(
  cliente: ClienteParaElegir,
  obraId: string | null,
): AutorizadoParaElegir[] {
  return cliente.autorizados.filter((a) => a.obraId === null || a.obraId === obraId);
}

/** Si esta salida pasa del límite: lo que ya debe más lo que se lleva. */
export function pasaDelLimite(cliente: ClienteParaElegir, importeCentavos: number): boolean {
  return cliente.saldoCentavos + importeCentavos > cliente.limiteCentavos;
}
