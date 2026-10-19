import {
  centavos,
  dinero,
  hora,
  tablaSiHay,
  texto,
  type HojaDelServidor,
  type Seccion,
} from './hoja.ts';

/**
 * LAS DEVOLUCIONES DEL DÍA en el corte (cierre de la 2.4).
 *
 * «Devolución de material vendible · Resta de la venta del día en que se devuelve» —lo dicen
 * la tienda, la ferretería y el salón—. Cada renglón dice de qué venta, cuándo, quién y por
 * qué, y CÓMO salió el dinero: del cajón, por reversar en la terminal o el banco, o bajando
 * lo que el cliente debe (fiado y crédito, 182). Una devolución es la segunda puerta del
 * robo después del descuento fantasma: sin quién y sin motivo no sirve.
 */

const COMO_SE_DEVOLVIO: Readonly<Record<string, string>> = {
  efectivo: 'Efectivo, del cajón',
  tarjeta: 'Tarjeta, por reversar',
  transferencia: 'Transferencia, por reversar',
  fiado: 'Fiado: baja lo que debe',
  credito: 'Crédito: baja su saldo',
};

export function devolucionesDelDia(
  hoja: HojaDelServidor,
  titulo = 'Devoluciones',
): readonly Seccion[] {
  return tablaSiHay({
    tipo: 'tabla',
    titulo,
    columnas: [
      { titulo: 'Venta' },
      { titulo: 'Hora' },
      { titulo: 'Cómo' },
      { titulo: 'Quién' },
      { titulo: 'Motivo' },
      { titulo: 'Monto', numerica: true },
    ],
    filas: hoja.devoluciones.map((d) => [
      texto(d.folio),
      hora(d.devueltaEn),
      texto(COMO_SE_DEVOLVIO[d.metodo] ?? d.metodo),
      texto(d.quien),
      texto(d.motivo),
      dinero(-centavos(d.montoCentavos)),
    ]),
  });
}
