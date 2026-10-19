/** Los tipos del analizador de `verify:adopcion`, para que sus pruebas no lean `any`. */
export interface Hallazgo {
  readonly condicion: '1.1' | '1.2' | '1.3' | '1.4';
  readonly motivo: string;
  readonly linea: number;
}

export interface Estados {
  readonly vacio: boolean;
  readonly cargando: boolean;
  readonly error: boolean;
}

/** Un envoltorio local de un estado del sistema, por el nombre con que se pinta. */
export interface Envoltorio {
  readonly nombre: string;
  readonly modulo: string;
  readonly estado: keyof Estados;
}

export interface Analisis {
  /** `false` para un proveedor: un archivo que no pinta ningún elemento no es pantalla. */
  readonly interfaz: boolean;
  readonly hallazgos: Hallazgo[];
  readonly pinta: Estados;
  readonly envoltorios: readonly Envoltorio[];
}

export function analizarPantalla(texto: string, nombre?: string): Analisis;

export function estadosPorComponente(texto: string, nombre?: string): Map<string, Estados>;

export function pintaConEnvoltorios(
  pinta: Estados,
  envoltorios: readonly Envoltorio[],
  leerModulo: (modulo: string) => string | null,
): Estados;
