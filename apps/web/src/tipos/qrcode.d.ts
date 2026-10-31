/**
 * Lo poco de `qrcode` que usa `src/`: el QR del teléfono de una estación de cocina, dibujado en
 * el navegador (DP-9.4), y la matriz de los QR de mesa con diseño (DP-9.8). La librería ya
 * estaba en `apps/web` para el heredado (`QRCanvas`),
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
  /** La matriz sin dibujar (DP-9.8): el motor de diseño de los QR de mesa la dibuja. */
  export interface QrCodificado {
    readonly version: number;
    readonly modules: {
      readonly size: number;
      readonly data: Uint8Array;
      get(fila: number, columna: number): number;
    };
  }
  export function create(
    texto: string,
    opciones?: Pick<OpcionesDeQr, 'errorCorrectionLevel'> & { readonly version?: number },
  ): QrCodificado;
  const QRCode: { readonly toDataURL: typeof toDataURL; readonly create: typeof create };
  export default QRCode;
}
