/**
 * EL ASPECTO DEL PORTAL DEL COMENSAL, del lado de la pantalla (DP-9.7).
 *
 * Por tokens, sin colores ni fuentes sueltos: el estilo se aplica con `data-estilo` sobre el
 * portal (los estilos cuelgan de ese atributo en cualquier elemento), la tipografía con
 * `data-tipografia` (que reasigna `--fuente-ui` en `globals.css`) y el fondo decide si va la
 * marca de agua del negocio. La forma la valida el servidor (`portal/tema-del-portal.ts`).
 */

export type Tipografia = 'sistema' | 'redonda' | 'clasica';
export type Fondo = 'liso' | 'marca';

export interface TemaDelPortal {
  readonly estilo: string | null;
  readonly tipografia: Tipografia;
  readonly fondo: Fondo;
}

export const TIPOGRAFIAS_DEL_PORTAL: readonly {
  readonly valor: Tipografia;
  readonly nombre: string;
}[] = [
  { valor: 'sistema', nombre: 'La del sistema' },
  { valor: 'redonda', nombre: 'Redonda' },
  { valor: 'clasica', nombre: 'Clásica, con patines' },
];

export const FONDOS_DEL_PORTAL: readonly { readonly valor: Fondo; readonly nombre: string }[] = [
  { valor: 'marca', nombre: 'Con la marca de agua' },
  { valor: 'liso', nombre: 'Liso' },
];

const esUnoDe = <T extends string>(
  lista: readonly { readonly valor: T }[],
  valor: unknown,
): valor is T => lista.some((o) => o.valor === valor);

/** El tema tal como llega (del portal o de la configuración); lo que no tiene forma, el de siempre. */
export function temaDelPortal(valor: unknown): TemaDelPortal {
  const t = typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {};
  return {
    estilo: typeof t['estilo'] === 'string' && t['estilo'] !== '' ? t['estilo'] : null,
    tipografia: esUnoDe(TIPOGRAFIAS_DEL_PORTAL, t['tipografia']) ? t['tipografia'] : 'sistema',
    fondo: esUnoDe(FONDOS_DEL_PORTAL, t['fondo']) ? t['fondo'] : 'marca',
  };
}

/** Los atributos del contenedor del portal: sólo los que cambian algo. */
export function atributosDelTema(tema: TemaDelPortal): Readonly<Record<string, string>> {
  return {
    ...(tema.estilo === null ? {} : { 'data-estilo': tema.estilo }),
    ...(tema.tipografia === 'sistema' ? {} : { 'data-tipografia': tema.tipografia }),
  };
}
