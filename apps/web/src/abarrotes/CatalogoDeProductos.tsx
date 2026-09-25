'use client';

import { Button } from '@morphiqpos/ui/primitivas/button';
import { Input } from '@morphiqpos/ui/primitivas/input';
import { Label } from '@morphiqpos/ui/primitivas/label';
import {
  Dinero,
  ErrorDePantalla,
  EsqueletoDeLista,
  TablaAdaptable,
  Vacio,
  type ColumnaDeTabla,
} from '@morphiqpos/ui/sistema';
import { PackageSearch, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { consultarPuente } from '~/cliente/api';
import { centavosDe } from '~/cliente/dinero-del-puente';
import { useVocabulario } from '~/cliente/vocabulario';

import { BasculaDeEtiquetas } from './BasculaDeEtiquetas.tsx';

/**
 * EL CATÁLOGO DE LA TIENDA, del que se abre cada ficha (C.10 de la 2.4).
 *
 * «Productos» montaba la ficha con el id vacío y enseñaba «se llega desde el catálogo»,
 * apuntando a una pantalla que no enlaza a ninguna ficha: el precio, el costo y las
 * presentaciones de la tienda no se podían tocar desde ningún sitio. Ahora la pantalla es
 * el catálogo mismo —se busca por nombre o por código, que es como se busca con la caja en
 * la mano— y cada renglón abre su ficha por la dirección (`?producto=`), para que se pueda
 * guardar y compartir.
 */

export interface RenglonDeCatalogo {
  readonly id: string;
  readonly nombre: string | null;
  readonly codigo_barras: string | null;
  readonly precio_venta: number | null;
  readonly precio_por_unidad_variable: number | null;
  readonly unidad_variable: string | null;
  readonly tipo_venta: string | null;
  readonly existencia: number | null;
  readonly categoria_nombre: string | null;
}

const LIMITE = 2_000;

export function precioDelRenglon(fila: RenglonDeCatalogo): number | null {
  return fila.tipo_venta === 'variable_medida'
    ? centavosDe('ProductoTerminado', 'precio_por_unidad_variable', fila.precio_por_unidad_variable)
    : centavosDe('ProductoTerminado', 'precio_venta', fila.precio_venta);
}

/** Por nombre, por código o por categoría: sin acentos ni mayúsculas. */
export function coincide(fila: RenglonDeCatalogo, busqueda: string): boolean {
  const plano = (t: string) =>
    t
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es-MX');
  const aguja = plano(busqueda.trim());
  if (aguja === '') return true;
  return [fila.nombre, fila.codigo_barras, fila.categoria_nombre].some(
    (campo) => campo !== null && plano(campo).includes(aguja),
  );
}

export function CatalogoDeProductos() {
  const voc = useVocabulario();
  const router = useRouter();
  const [filas, setFilas] = useState<readonly RenglonDeCatalogo[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const control = new AbortController();
    consultarPuente<RenglonDeCatalogo>('ProductoTerminado', {
      limite: LIMITE,
      orden: 'nombre',
      signal: control.signal,
    })
      .then((leidas) => {
        if (!control.signal.aborted) setFilas(leidas);
      })
      .catch((error: unknown) => {
        if (!control.signal.aborted) {
          setFallo(error instanceof Error ? error.message : 'No se pudo leer el catálogo.');
        }
      });
    return () => {
      control.abort();
    };
  }, [intento]);

  const visibles = useMemo(
    () => (filas ?? []).filter((fila) => coincide(fila, busqueda)),
    [filas, busqueda],
  );

  const abrir = (id: string) => {
    router.push(`/abarrotes/producto?producto=${encodeURIComponent(id)}`);
  };

  const columnas: readonly ColumnaDeTabla<RenglonDeCatalogo>[] = [
    {
      clave: 'nombre',
      titulo: voc.titulo('producto'),
      orden: (f) => f.nombre ?? '',
      celda: (f) => (
        <a
          className="font-medium underline-offset-2 hover:underline"
          href={`/abarrotes/producto?producto=${encodeURIComponent(f.id)}`}
        >
          {f.nombre ?? 'Sin nombre'}
        </a>
      ),
    },
    {
      clave: 'codigo',
      titulo: 'Código',
      desde: 'md',
      celda: (f) => (
        <span className="font-numeros text-texto-sutil tabular-nums">{f.codigo_barras ?? '—'}</span>
      ),
    },
    {
      clave: 'categoria',
      titulo: 'Categoría',
      desde: 'lg',
      celda: (f) => (
        <span className="text-texto-sutil">{f.categoria_nombre ?? 'Sin categoría'}</span>
      ),
    },
    {
      clave: 'precio',
      titulo: 'Precio',
      numerica: true,
      orden: (f) => precioDelRenglon(f) ?? -1,
      celda: (f) => {
        const precio = precioDelRenglon(f);
        return precio === null ? (
          <span className="text-texto-sutil">sin precio</span>
        ) : (
          <span className="inline-flex items-baseline gap-(--espacio-1)">
            <Dinero centavos={precio} tamano="sm" />
            {f.tipo_venta === 'variable_medida' ? (
              <span className="text-xs text-texto-sutil">/ {f.unidad_variable ?? 'kg'}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      clave: 'existencia',
      titulo: 'Hay',
      numerica: true,
      desde: 'sm',
      orden: (f) => f.existencia ?? -1,
      celda: (f) =>
        f.existencia === null ? (
          <span className="text-texto-sutil">—</span>
        ) : (
          <span className="font-numeros tabular-nums">{f.existencia}</span>
        ),
    },
  ];

  if (fallo !== null) {
    return (
      <ErrorDePantalla
        titulo="No se pudo leer el catálogo"
        queHacer="Sin él no hay ficha que abrir. Revisa la conexión y vuelve a intentarlo."
        detalle={fallo}
        reintentar={
          <Button
            onClick={() => {
              setFallo(null);
              setFilas(null);
              setIntento((n) => n + 1);
            }}
          >
            Volver a intentar
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-(--espacio-4)">
      <header className="flex flex-wrap items-end justify-between gap-(--espacio-3)">
        <div>
          <h1 className="text-2xl font-bold">{voc.titulo('producto', true)}</h1>
          <p className="text-sm text-texto-sutil">
            Toca {voc.enFraseCon('un', 'producto')} para abrir su ficha: precio, costo, margen,
            impuesto, caducidad y presentaciones.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/abarrotes/alta-rapida-de-producto">
            <Plus aria-hidden="true" />
            Alta rápida
          </a>
        </Button>
      </header>

      <div className="flex flex-col gap-(--espacio-1)">
        <Label htmlFor="catalogo-busqueda">Buscar por nombre, código o categoría</Label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-(--espacio-3) size-4 -translate-y-1/2 text-texto-sutil"
          />
          <Input
            id="catalogo-busqueda"
            value={busqueda}
            className="pl-(--espacio-10)"
            onChange={(evento) => {
              setBusqueda(evento.target.value);
            }}
          />
        </div>
      </div>

      {filas === null ? (
        <EsqueletoDeLista filas={8} />
      ) : (
        <TablaAdaptable
          etiqueta={`Catálogo de ${voc.plural('producto')}`}
          principal="nombre"
          desde="md"
          columnas={columnas}
          filas={visibles}
          claveDe={(f) => f.id}
          alActivar={abrir}
          etiquetaDeFila={(f) => `Abrir la ficha de ${f.nombre ?? 'sin nombre'}`}
          alto="max-h-[60vh]"
          vacio={
            <Vacio
              icono={<PackageSearch />}
              titulo={
                filas.length === 0
                  ? `Todavía no hay ${voc.plural('producto')} en el catálogo`
                  : `Ningún ${voc.singular('producto')} coincide con «${busqueda.trim()}»`
              }
              explicacion={
                filas.length === 0
                  ? 'El catálogo se llena solo al cobrar: el código que no está abre el alta rápida.'
                  : 'Prueba con otra parte del nombre, o con el código de barras.'
              }
            />
          }
        />
      )}

      <BasculaDeEtiquetas />
    </div>
  );
}
