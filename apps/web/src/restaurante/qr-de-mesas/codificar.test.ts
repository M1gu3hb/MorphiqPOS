import QRCode from 'qrcode';
import { describe, expect, it } from 'vitest';

import { matrizDelContenido } from './codificar';
import { leerPixeles } from './leer-qr';

const CONTENIDO = 'https://pos-don-poncho.vercel.app/qr/Zx9_a8Kq2LmN4pQr7sTu1vWx3yZb5cDe';

/** La matriz pintada a píxeles RGBA, con su margen: lo que «vería» una cámara perfecta. */
function pixeles(
  matriz: ReturnType<typeof matrizDelContenido>,
  { escala = 6, margen = 4, invertido = false } = {},
) {
  const lado = (matriz.tamano + margen * 2) * escala;
  const datos = new Uint8ClampedArray(lado * lado * 4);
  for (let py = 0; py < lado; py++) {
    for (let px = 0; px < lado; px++) {
      const x = Math.floor(px / escala) - margen;
      const y = Math.floor(py / escala) - margen;
      const oscuro = matriz.modulo(x, y) !== invertido;
      const i = (py * lado + px) * 4;
      datos.fill(oscuro ? 0 : 255, i, i + 3);
      datos[i + 3] = 255;
    }
  }
  return { datos, lado };
}

describe('el contenido de un QR de mesa', () => {
  it('la matriz es la de la librería, módulo por módulo', () => {
    const matriz = matrizDelContenido(CONTENIDO, false);
    const referencia = QRCode.create(CONTENIDO, { errorCorrectionLevel: 'M' });
    expect(matriz.version).toBe(referencia.version);
    expect(matriz.tamano).toBe(17 + 4 * matriz.version);
    for (let y = 0; y < matriz.tamano; y++) {
      for (let x = 0; x < matriz.tamano; x++) {
        expect(matriz.modulo(x, y)).toBe(referencia.modules.get(y, x) === 1);
      }
    }
    expect(matriz.modulo(-1, 0)).toBe(false);
    expect(matriz.modulo(0, matriz.tamano)).toBe(false);
  });

  it('con logo sale con corrección alta: más módulos para el mismo contenido', () => {
    const sin = matrizDelContenido(CONTENIDO, false);
    const con = matrizDelContenido(CONTENIDO, true);
    expect(con.version).toBe(QRCode.create(CONTENIDO, { errorCorrectionLevel: 'H' }).version);
    expect(con.version).toBeGreaterThan(sin.version);
  });

  it('se lee y dice exactamente la dirección de la mesa', () => {
    for (const conLogo of [false, true]) {
      const { datos, lado } = pixeles(matrizDelContenido(CONTENIDO, conLogo));
      expect(leerPixeles(datos, lado, lado)).toBe(CONTENIDO);
    }
  });

  it('un QR invertido (claro sobre oscuro) NO cuenta como legible: muchas cámaras no lo leen', () => {
    const { datos, lado } = pixeles(matrizDelContenido(CONTENIDO, false), { invertido: true });
    expect(leerPixeles(datos, lado, lado)).toBeNull();
  });
});
