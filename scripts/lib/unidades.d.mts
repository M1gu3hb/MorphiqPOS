/** Los tipos del analizador de `verify:unidades`, para que sus pruebas no lean `any`. */
import type ts from 'typescript';

export interface HallazgoDeUnidades {
  readonly archivo: string;
  readonly linea: number;
  readonly entidad: string;
  readonly campo: string;
  readonly unidad: 'pesos' | 'centavos' | undefined;
  readonly como: string;
}

export function hallazgosDeUnidades(
  programa: ts.Program,
  unidades: Readonly<Record<string, Readonly<Record<string, 'pesos' | 'centavos'>>>>,
  archivos: readonly string[],
): HallazgoDeUnidades[];
