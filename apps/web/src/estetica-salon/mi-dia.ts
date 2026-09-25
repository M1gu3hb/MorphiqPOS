import { centavosDe } from '~/cliente/dinero-del-puente';

/**
 * EL DÍA DE UNA PROFESIONAL, armado con lo que el puente sirve (C.9 de la 2.4).
 *
 * Vive aparte de `MiDia.tsx` para probarse sin navegador. Tres cosas que la pantalla
 * pintaba mal y que aquí se corrigen: el nombre del servicio llegaba en `null` aunque el
 * puente ya lo derivaba; los minutos de procesado, también; y la bandera de alergia se
 * sacaba buscando «alergia» en las notas de la cita —un falso negativo es una quemadura—,
 * cuando el dato vive en el EXPEDIENTE de la clienta.
 */

export interface CitaDeMiDia {
  readonly id: string;
  readonly citaServicioId: string;
  readonly folio: string | null;
  readonly clienteNombre: string | null;
  readonly servicio: string | null;
  /** ISO. La hora se pinta sólo en el navegador: el servidor tiene otro huso. */
  readonly inicio: string;
  readonly estado: string;
  /**
   * En CENTAVOS: `componerElDia` ya lo convirtió con `centavosDe` desde el `precio_pesos`
   * del puente. Aquí viajaban los pesos y cada pantalla que los pintaba tenía que
   * acordarse de convertirlos.
   */
  readonly precioCentavos: number;
  readonly alergias: boolean;
  readonly minutosProcesado: number | null;
}

export interface FilaCitaServicio {
  readonly id: string;
  readonly cita_id: string;
  /** EN PESOS: el gemelo honesto de `precio_centavos`. Se lee sólo con `centavosDe`. */
  readonly precio_pesos: number | null;
  readonly servicio_nombre?: string | null;
  readonly minutos_procesado?: number | null;
}

export interface FilaCita {
  readonly id: string;
  readonly folio: string | null;
  readonly cliente_id: string | null;
  readonly estado: string | null;
  readonly agendada_para: string | null;
  readonly notas: string | null;
}

export interface FilaCliente {
  readonly id: string;
  readonly nombre: string | null;
}

export interface FilaComision {
  readonly id: string;
  readonly tipo: string | null;
  /** EN PESOS: el gemelo honesto de `monto_centavos`. Se lee sólo con `centavosDe`. */
  readonly monto_pesos: number | null;
  readonly causada_en: string | null;
  readonly motivo: string | null;
}

/** El expediente de belleza: su `id` ES el de la clienta. */
export interface FilaExpediente {
  readonly id: string;
  readonly alergias: string | null;
}

export function esMismoDia(iso: string, referencia: Date): boolean {
  const f = new Date(iso);
  return (
    f.getFullYear() === referencia.getFullYear() &&
    f.getMonth() === referencia.getMonth() &&
    f.getDate() === referencia.getDate()
  );
}

/** Une lo que el puente devuelve en cuatro lecturas y lo ordena por hora. */
export function componerElDia(
  servicios: readonly FilaCitaServicio[],
  citas: readonly FilaCita[],
  clientes: readonly FilaCliente[],
  expedientes: readonly FilaExpediente[],
  hoy: Date,
): readonly CitaDeMiDia[] {
  const porCita = new Map(citas.map((c) => [c.id, c]));
  const nombreDe = new Map(clientes.map((c) => [c.id, c.nombre]));
  const conAlergias = new Set(
    expedientes.filter((e) => (e.alergias ?? '').trim() !== '').map((e) => e.id),
  );
  const filas: CitaDeMiDia[] = [];
  for (const servicio of servicios) {
    const cita = porCita.get(servicio.cita_id);
    const cuando = cita?.agendada_para ?? null;
    if (cita === undefined || cuando === null || !esMismoDia(cuando, hoy)) continue;
    filas.push({
      id: cita.id,
      citaServicioId: servicio.id,
      folio: cita.folio,
      clienteNombre: cita.cliente_id === null ? null : (nombreDe.get(cita.cliente_id) ?? null),
      servicio: servicio.servicio_nombre ?? null,
      inicio: cuando,
      estado: cita.estado ?? 'agendada',
      precioCentavos: centavosDe('CitaServicio', 'precio_pesos', servicio.precio_pesos) ?? 0,
      alergias: cita.cliente_id !== null && conAlergias.has(cita.cliente_id),
      minutosProcesado: servicio.minutos_procesado ?? null,
    });
  }
  return filas.sort((a, b) => a.inicio.localeCompare(b.inicio));
}
