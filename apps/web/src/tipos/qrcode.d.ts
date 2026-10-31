/**
 * Lo poco de `qrcode` que usa `src/` (DP-9.4): el QR del teléfono de una estación de cocina,
 * dibujado en el navegador. La librería ya estaba en `apps/web` para el heredado (`QRCanvas`),
 * que es JavaScript y no necesitaba tipos; esto los declara sin sumar `@types/qrcode`.
 */
declare module 'qrcode' {
  export interface OpcionesDeQr {
    readonly width?: number;
    readonly margin?: number;
    readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    readonly color?: { readonly dark?: string; readonly light?: string };
  }
  export function toDataURL(texto: string, opciones?: OpcionesDeQr): Promise<string>;
  const QRCode: { readonly toDataURL: typeof toDataURL };
  export default QRCode;
}
