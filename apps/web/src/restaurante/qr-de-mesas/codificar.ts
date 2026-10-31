import type { MatrizQr } from '@morphiqpos/domain/qr';
import QRCode from 'qrcode';

/**
 * La matriz del QR de una mesa (DP-9.8). La codificación la hace `qrcode`, la librería que ya
 * dibujaba los QR; el motor de diseño sólo dibuja la matriz que recibe. Con logo al centro, la
 * corrección de errores sube a la alta (H: aguanta perder hasta ~30 %), como en el estudio.
 */
export function matrizDelContenido(contenido: string, conLogo: boolean): MatrizQr {
  const qr = QRCode.create(contenido, { errorCorrectionLevel: conLogo ? 'H' : 'M' });
  const tamano = qr.modules.size;
  const datos = Uint8Array.from(qr.modules.data);
  return {
    tamano,
    version: qr.version,
    modulo: (x, y) => x >= 0 && y >= 0 && x < tamano && y < tamano && datos[y * tamano + x] === 1,
  };
}
