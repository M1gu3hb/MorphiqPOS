import { empaqueDelCanal } from '~/corte/giros';
import { CANAL, centavos, type ExtrasDelServidor, type HojaDelServidor } from '~/corte/hoja';

/**
 * LAS CIFRAS DEL TURNO QUE EL PUENTE NO SERVÍA (C.9 de la 2.4).
 *
 * El cierre de turno pintaba «—» en las bebidas, en el canal de la venta y en la merma de
 * barra: «el puente aún no expone el canal ni el empaque». Ahora salen de la MISMA hoja del
 * corte que va al PDF (`caja.hoja_del_corte`), así que la pantalla y el papel no pueden decir
 * cosas distintas. La comisión estimada de terminal sigue sin dato: el sistema no conoce la
 * tasa de la terminal de cada negocio (D-20).
 */

export interface CifraDelTurno {
  readonly etiqueta: string;
  readonly valor: string;
}

type ExtrasDeCafeteria = Extract<ExtrasDelServidor, { plantilla: 'cafeteria' }>;

const PESOS = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const pesos = (enTexto: string): string => PESOS.format(centavos(enTexto) / 100);

function extrasDeCafeteria(hoja: HojaDelServidor): ExtrasDeCafeteria | null {
  return hoja.extras.plantilla === 'cafeteria' ? hoja.extras : null;
}

/** Las bebidas vendidas: las unidades de lo que el catálogo marca como bebida. */
export function bebidasDelTurno(hoja: HojaDelServidor): number {
  return hoja.productos
    .filter((p) => p.familia === 'bebida')
    .reduce((suma, p) => suma + Number(p.cantidad), 0);
}

/** Aquí · Para llevar · Plataforma · Anticipado, con su importe y el empaque que se fue. */
export function cifrasDeCanal(hoja: HojaDelServidor): readonly CifraDelTurno[] {
  const extras = extrasDeCafeteria(hoja);
  if (extras === null) return [];
  return extras.canales.map((c) => {
    const empaque = empaqueDelCanal(extras, c.canal);
    return {
      etiqueta: CANAL[c.canal] ?? c.canal,
      valor:
        `${String(c.pedidos)} · ${pesos(c.importeCentavos)}` +
        (empaque === null ? '' : ` · ${empaque} de empaque`),
    };
  });
}

/** La merma de barra por motivo: calibración, vaporizado, rehecha, caducidad. */
export function cifrasDeMerma(hoja: HojaDelServidor): readonly CifraDelTurno[] {
  const extras = extrasDeCafeteria(hoja);
  if (extras === null) return [];
  return extras.mermaDeBarra.map((m) => ({
    etiqueta: m.motivo ?? 'Sin motivo',
    valor:
      `${m.cantidad} ${m.unidad} de ${m.insumo}` +
      (hoja.verCostos ? ` · ${pesos(m.costoCentavos)}` : ''),
  }));
}
