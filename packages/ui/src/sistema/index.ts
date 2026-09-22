/**
 * EL SISTEMA · lo que se construye ENCIMA de las 36 primitivas.
 *
 * Una primitiva de shadcn es un botón, un campo, un diálogo. Eso es un juego de
 * piezas, y un juego de piezas no es un lenguaje: en un punto de venta hacen falta
 * además una escala de profundidad con una sola lógica de luz, una tabla densa que
 * se opere con teclado, un importe que no baile en columna, gráficas con la paleta
 * del estilo activo, navegación distinta por dispositivo y estados de vacío, carga
 * y error que no se improvisen en cada pantalla.
 *
 * Todo lo de aquí cumple tres reglas, sin excepción:
 *
 *   1 · **Ni un color, ni una sombra, ni una altura literal.** Todo sale de los
 *       tokens, que es lo que hace que los ocho estilos existan sin reescribir un
 *       componente. `verify:primitivas` lo comprueba.
 *   2 · **El color nunca es el único portador de significado.** Cada estado lleva
 *       además su forma, su icono o su palabra.
 *   3 · **Se opera con teclado.** Foco visible siempre, y en dos capas para que se
 *       vea sobre cualquier fondo.
 */
export { Dinero, Cifra, dineroEnTexto, type DineroProps, type TamanoDeDinero } from './dinero';
export {
  Superficie,
  Isla,
  BarraFija,
  type SuperficieProps,
  type NivelDeElevacion,
} from './superficie';
export { Vacio, Esqueleto, EsqueletoDeLista, ErrorDePantalla } from './estados';
export { Tabla, ListaDeTarjetas, type ColumnaDeTabla, type TablaProps } from './tabla';
export {
  GraficaDeBarras,
  GraficaDeLineas,
  GraficaDeAreaApilada,
  GraficaDeDona,
  MapaDeCalorPorHora,
  type GraficaProps,
  type SerieDeGrafica,
} from './grafica';
export {
  BarraLateral,
  AbanicoInferior,
  Migas,
  type DestinoDeNavegacion,
  type GrupoDeNavegacion,
} from './navegacion';
export {
  Progreso,
  IndicadorDeGuardado,
  ConfirmacionDestructiva,
  Aviso,
  type EstadoDeGuardado,
} from './retroalimentacion';
export { VIAJE, viaje, conTransicion } from './movimiento';
