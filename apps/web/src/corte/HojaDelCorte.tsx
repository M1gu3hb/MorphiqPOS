import { Cifra, Dinero, Tabla, type ColumnaDeTabla } from '@morphiqpos/ui/sistema';
import type { Ref } from 'react';

import type { Celda, Columna, DocumentoDelCorte, Seccion, Valor } from './hoja.ts';

/**
 * LA HOJA DEL CORTE, pintada como la imprime el corte de Miguel (`CorteTicket`).
 *
 * El nodo lleva `id="cash-cut-pdf-document"` y la clase `printable-doc`: la protección de
 * impresión de `heredado/index.css` lo deja en papel en cualquier estilo —fondo blanco,
 * texto oscuro y los tokens redefinidos en claro (C.16)—, y `generatePDFBlobFromNode` lo
 * captura a 210 mm con márgenes de 14 mm, que es lo que piden los cinco §9.3.
 */

const ANCHO_DE_HOJA = {
  width: '210mm',
  maxWidth: '210mm',
  padding: '14mm',
  boxSizing: 'border-box',
} as const;
const LOGO = { height: '80px', width: '80px', objectFit: 'contain' } as const;

function ValorPintado({ valor, fuerte }: { readonly valor: Valor; readonly fuerte?: boolean }) {
  const clase = fuerte === true ? 'font-bold' : undefined;
  switch (valor.tipo) {
    case 'dinero':
      return <Dinero centavos={valor.centavos} tamano="sm" className={clase} />;
    case 'porcentaje':
      return (
        <Cifra
          valor={valor.puntosBase / 100}
          unidad="%"
          decimales={1}
          tamano="sm"
          className={clase}
        />
      );
    case 'texto':
      return <span className={clase}>{valor.texto}</span>;
    case 'nada':
      return <span className="text-texto-sutil">—</span>;
  }
}

function CeldaPintada({ celda }: { readonly celda: Celda }) {
  return (
    <div className="rounded border border-borde p-(--espacio-2)">
      <div className="text-xs text-texto-sutil uppercase">{celda.etiqueta}</div>
      <div>
        <ValorPintado valor={celda.valor} {...(celda.fuerte === true ? { fuerte: true } : {})} />
      </div>
    </div>
  );
}

/** Una fila del documento: su posición es su identidad, porque un corte no se reordena. */
interface FilaDelDocumento {
  readonly clave: string;
  readonly valores: readonly Valor[];
}

function TablaDelDocumento({
  titulo,
  columnas,
  filas,
  total,
}: {
  readonly titulo: string;
  readonly columnas: readonly Columna[];
  readonly filas: readonly (readonly Valor[])[];
  readonly total?: readonly Valor[] | undefined;
}) {
  const columnasDeTabla: readonly ColumnaDeTabla<FilaDelDocumento>[] = columnas.map(
    (columna, j) => ({
      clave: String(j),
      titulo: columna.titulo,
      ...(columna.numerica === true ? { numerica: true } : {}),
      celda: (fila: FilaDelDocumento) => (
        <ValorPintado valor={fila.valores[j] ?? { tipo: 'nada' }} />
      ),
    }),
  );
  const pie =
    total === undefined
      ? undefined
      : Object.fromEntries(
          total.map((valor, j) => [String(j), <ValorPintado key={j} valor={valor} fuerte />]),
        );
  return (
    <Tabla
      etiqueta={titulo}
      columnas={columnasDeTabla}
      filas={filas.map((valores, i) => ({ clave: String(i), valores }))}
      claveDe={(fila) => fila.clave}
      alto="max-h-none"
      pie={pie}
    />
  );
}

function SeccionPintada({ seccion }: { readonly seccion: Seccion }) {
  return (
    <section className="mb-(--espacio-4) break-inside-avoid">
      <h2 className="mb-(--espacio-2) border-b border-borde-fuerte text-sm font-bold uppercase">
        {seccion.titulo}
      </h2>
      {seccion.tipo === 'celdas' ? (
        <div className="grid grid-cols-3 gap-(--espacio-2) text-xs">
          {seccion.celdas.map((celda) => (
            <CeldaPintada key={celda.etiqueta} celda={celda} />
          ))}
        </div>
      ) : null}
      {seccion.tipo === 'tabla' ? (
        <TablaDelDocumento
          titulo={seccion.titulo}
          columnas={seccion.columnas}
          filas={seccion.filas}
          total={seccion.total}
        />
      ) : null}
      {/* La cascada: cada movimiento con su signo, y el esperado al pie. */}
      {seccion.tipo === 'cascada' ? (
        <TablaDelDocumento
          titulo={seccion.titulo}
          columnas={[{ titulo: 'Movimiento' }, { titulo: 'Importe', numerica: true }]}
          filas={seccion.pasos.map((paso) => [
            { tipo: 'texto', texto: paso.etiqueta },
            { tipo: 'dinero', centavos: paso.centavos },
          ])}
          total={[
            { tipo: 'texto', texto: seccion.resultado.etiqueta },
            seccion.resultado.centavos === null
              ? { tipo: 'nada' }
              : { tipo: 'dinero', centavos: seccion.resultado.centavos },
          ]}
        />
      ) : null}
      {seccion.tipo !== 'cascada' && seccion.nota !== undefined ? (
        <p className="mt-(--espacio-1) text-xs text-texto-sutil">{seccion.nota}</p>
      ) : null}
    </section>
  );
}

export interface HojaDelCorteProps {
  readonly documento: DocumentoDelCorte;
  readonly generadoEn: Date;
  readonly ref?: Ref<HTMLDivElement>;
}

export function HojaDelCorte({ documento, generadoEn, ref }: HojaDelCorteProps) {
  const { negocio } = documento;
  return (
    <div
      ref={ref}
      id="cash-cut-pdf-document"
      className="printable-doc mx-auto bg-superficie text-sm text-texto"
      style={ANCHO_DE_HOJA}
    >
      <header className="mb-(--espacio-4) flex items-center gap-(--espacio-4) border-b-2 border-borde-fuerte pb-(--espacio-4)">
        {negocio.logoUrl === null ? null : (
          // Un <img> y no `next/image`: html2canvas captura el nodo tal cual, y el logo
          // viene del almacén del negocio con CORS.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={negocio.logoUrl} alt={negocio.nombre} crossOrigin="anonymous" style={LOGO} />
        )}
        <div className="flex-1">
          <h1 className="text-3xl font-black tracking-wider">{negocio.nombre}</h1>
          {negocio.rfc === null ? null : <p className="text-xs">RFC: {negocio.rfc}</p>}
          {negocio.direccion === null ? null : <p className="text-xs">{negocio.direccion}</p>}
          {negocio.telefono === null ? null : <p className="text-xs">Tel: {negocio.telefono}</p>}
          {negocio.correo === null ? null : <p className="text-xs">{negocio.correo}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-black">{documento.titulo}</p>
          <p className="text-xs">
            Folio: <span className="font-mono font-bold">{documento.folio}</span>
          </p>
          <p className="mt-(--espacio-1) text-xs text-texto-sutil">{negocio.marca}</p>
        </div>
      </header>

      {documento.secciones.map((seccion, i) => (
        <SeccionPintada key={`${seccion.titulo}-${String(i)}`} seccion={seccion} />
      ))}

      <section className="mt-(--espacio-8) grid grid-cols-2 gap-(--espacio-8) break-inside-avoid text-xs">
        <div className="border-t border-borde-fuerte pt-(--espacio-1) text-center">
          {documento.firmaDeCaja}
          {documento.responsable === null ? null : (
            <div className="font-semibold">{documento.responsable}</div>
          )}
        </div>
        <div className="border-t border-borde-fuerte pt-(--espacio-1) text-center">
          Administrador
        </div>
      </section>

      <footer className="mt-(--espacio-4) border-t border-borde pt-(--espacio-2) text-center text-xs text-texto-sutil">
        {negocio.pie === null ? null : <p>{negocio.pie}</p>}
        <p>
          Documento interno · {negocio.marca} · Generado{' '}
          {new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(
            generadoEn,
          )}
        </p>
      </footer>
    </div>
  );
}
