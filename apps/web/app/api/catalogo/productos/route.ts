import { ROLES } from '@morphiqpos/contracts';
import { entradaBuscarProductos } from '@morphiqpos/app/catalogo';
import { consultarProductosProduccion } from '@morphiqpos/app/consultas-produccion';

import { responderConsulta } from '../../../../src/servidor/http';

export const dynamic = 'force-dynamic';

export function GET(peticion: Request): Promise<Response> {
  const parametros = new URL(peticion.url).searchParams;
  const limiteTexto = parametros.get('limite');
  const entrada = entradaBuscarProductos.safeParse({
    busqueda: parametros.get('busqueda') ?? undefined,
    categoriaId: parametros.get('categoriaId') ?? undefined,
    limite: limiteTexto === null ? 50 : Number(limiteTexto),
  });
  if (!entrada.success) {
    return Promise.resolve(
      Response.json(
        { ok: false, error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'Filtros inválidos.' } },
        { status: 400 },
      ),
    );
  }
  return responderConsulta(
    (sesion) => consultarProductosProduccion(sesion.organizacionId, entrada.data, sesion.rol),
    { roles: ROLES },
  );
}
