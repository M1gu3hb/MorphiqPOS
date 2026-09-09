import { ErrorDominio } from '@morphiqpos/contracts/errores';

import { cantidad, cantidadExacta, ESCALA_CANTIDAD, type Cantidad } from './cantidades.ts';

export interface ConfiguracionPorcion {
  readonly capacidadMl: string;
  readonly mlPorPorcion?: string;
  readonly porcionesPorContenedor?: string;
}

/** La medida explícita manda. La derivada debe caber exactamente en numeric(14,4). */
export function calcularMlPorPorcion(configuracion: ConfiguracionPorcion): Cantidad {
  const capacidad = cantidad(configuracion.capacidadMl);
  if (capacidad === 0n)
    throw new ErrorDominio('CATALOGO_INVALIDO', 'Falta capacidad del contenedor.');
  let porcion: Cantidad;
  if (configuracion.mlPorPorcion !== undefined) {
    porcion = cantidad(configuracion.mlPorPorcion);
  } else if (configuracion.porcionesPorContenedor !== undefined) {
    porcion = cantidadExacta(
      capacidad * ESCALA_CANTIDAD,
      cantidad(configuracion.porcionesPorContenedor),
    );
  } else {
    throw new ErrorDominio('CATALOGO_INVALIDO', 'Define mililitros o porciones por contenedor.');
  }
  if (porcion === 0n || porcion > capacidad) {
    throw new ErrorDominio(
      'CATALOGO_INVALIDO',
      'La porción debe ser positiva y caber en el contenedor.',
    );
  }
  return porcion;
}
