/**
 * LO QUE LA AGENDA TIENE QUE SABER DE UNA CLIENTA ANTES DE APARTARLE HORA (C.9 de la 2.4).
 *
 * Dos avisos que la pantalla de agendar ya pintaba y que nunca salían, porque leía
 * `alergias` y `faltas_6m` del cliente y el puente no servía ninguno de los dos: la alergia
 * vive en el EXPEDIENTE de belleza, y las faltas en `no_shows`. Aquí se juntan.
 */

/** El expediente de belleza: su `id` ES el de la clienta. */
export interface ExpedienteDeClienta {
  readonly id: string;
  readonly alergias: string | null;
}

export interface FaltaDeClienta {
  readonly cliente_id: string | null;
  readonly ocurrio_en: string | null;
}

/** Seis meses, contados en días: la ventana que el aviso de faltas promete. */
export const DIAS_DE_FALTAS = 183;
const MS_DIA = 86_400_000;

export function conExpedienteYFaltas<C extends { readonly id: string }>(
  clientas: readonly C[],
  expedientes: readonly ExpedienteDeClienta[],
  faltas: readonly FaltaDeClienta[],
  ahora: Date,
): (C & { readonly alergias: boolean; readonly faltas_6m: number })[] {
  const conAlergias = new Set(
    expedientes.filter((e) => (e.alergias ?? '').trim() !== '').map((e) => e.id),
  );
  const desde = ahora.getTime() - DIAS_DE_FALTAS * MS_DIA;
  const cuantas = new Map<string, number>();
  for (const falta of faltas) {
    if (falta.cliente_id === null || falta.ocurrio_en === null) continue;
    const cuando = Date.parse(falta.ocurrio_en);
    if (!Number.isFinite(cuando) || cuando < desde || cuando > ahora.getTime()) continue;
    cuantas.set(falta.cliente_id, (cuantas.get(falta.cliente_id) ?? 0) + 1);
  }
  return clientas.map((clienta) => ({
    ...clienta,
    alergias: conAlergias.has(clienta.id),
    faltas_6m: cuantas.get(clienta.id) ?? 0,
  }));
}
