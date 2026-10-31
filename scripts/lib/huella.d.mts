/** Los tipos de la huella de los negocios (`huella.mjs`), para que sus pruebas no lean `any`. */
export interface ConteoYMd5 {
  readonly n: number;
  readonly md5: string;
}

export interface TablaDeLaHuella {
  readonly columnas: readonly string[];
  readonly nueva: boolean;
  readonly porNegocio: Readonly<Record<string, ConteoYMd5>>;
}

export interface MesaAbsorbida {
  readonly mesa: string;
  readonly principal: string;
  readonly org: string;
  readonly md5: string | null;
  readonly unida: string | null;
}

export interface Huella {
  readonly tomada: string;
  readonly organizaciones: readonly { readonly id: string; readonly slug: string }[];
  readonly tablas: Readonly<Record<string, TablaDeLaHuella>>;
  readonly absorbidas: readonly MesaAbsorbida[];
  readonly marcadas: readonly string[];
}

export interface Comparacion {
  readonly diferencias: readonly string[];
  readonly relleno: number;
  readonly uniones: number;
  readonly nuevas: readonly string[];
}

export function tomarHuella(
  cliente: unknown,
  opciones?: {
    readonly solo?: readonly string[];
    readonly excluir?: readonly string[];
    readonly columnasDe?: Readonly<Record<string, readonly string[]>> | null;
  },
): Promise<Huella>;

export function columnasDeLaHuella(huella: Huella): Record<string, readonly string[]>;

export function compararHuellas(antes: Huella, despues: Huella): Comparacion;
