/** Los tipos del analizador de `verify:adopcion`, para que sus pruebas no lean `any`. */
export interface Hallazgo {
  readonly condicion: '1.1' | '1.2' | '1.3' | '1.4';
  readonly motivo: string;
  readonly linea: number;
}

export interface Analisis {
  /** `false` para un proveedor: un archivo que no pinta ningún elemento no es pantalla. */
  readonly interfaz: boolean;
  readonly hallazgos: Hallazgo[];
  readonly pinta: { readonly vacio: boolean; readonly cargando: boolean; readonly error: boolean };
}

export function analizarPantalla(texto: string, nombre?: string): Analisis;
