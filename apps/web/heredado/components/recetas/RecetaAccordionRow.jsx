'use client';
import React, { useState } from 'react';
import { ChevronDown, Pencil, Printer, Trash2, Info } from 'lucide-react';
import { formatCurrency, formatPercent } from '@/utils/financialUtils';
import { MARGIN_CONFIG } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { esProductoVariable, TIPO_VENTA, mlPorPorcionEfectivo } from '@/utils/tipoVentaUtils';
import FichaResumenVariable from '@/components/productos/FichaResumenVariable';
import { useConfig } from '@/lib/ConfigContext';
import { getMarginLevel } from '@/utils/financialUtils';
import { lineaTieneCosto } from '~/inventario/costo-del-platillo';
import {
  CELDA_DE_LA_FLECHA,
  CIFRAS_DE_FILA,
  CifraDeFila,
  REJILLA_DE_FILA,
} from '@/components/recetas/RejillaDeRecetas';

/**
 * Lo que se tecleó, o —si el puente no lo trae— lo que quedó guardado ya convertido a la
 * unidad base del insumo. `guardar_receta` escribe sólo `cantidad` y `unidad`, así que
 * `cantidad_usada` / `unidad_usada` (lo capturado) llegan nulos y la ficha salía en blanco.
 */
const cantidadDeLaLinea = (l) => l.cantidad_usada ?? l.cantidad_convertida_unidad_base;
const unidadDeLaLinea = (l) => l.unidad_usada ?? l.unidad;

/** Las columnas del escandallo cuando la lista es tabla; en tarjeta sólo nombre e importe. */
const COLUMNAS_DEL_ESCANDALLO = '@xl:grid-cols-[minmax(0,1fr)_5rem_3.5rem_6rem_6rem]';

/**
 * Un importe que puede no existir: sin costo es «—», nunca «$0.00». El margen y la
 * utilidad de un platillo sin costo conocido no valen cero, no valen nada todavía.
 */
function Importe({ valor, className = '' }) {
  if (valor === null || valor === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className={className}>{formatCurrency(valor)}</span>;
}

/** El margen con su pastilla de color; sin margen, un guion que no pinta nada. */
function Margen({ margen }) {
  if (margen === null || margen === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  const cfg = MARGIN_CONFIG[getMarginLevel(margen)];
  return (
    <Badge variant="outline" className={`${cfg.bg} ${cfg.color} border-0 tabular-nums`}>
      {formatPercent(margen)}
    </Badge>
  );
}

/** Lo que se escribe donde iría el costo cuando no se conoce. */
function CostoDesconocido({ etiqueta }) {
  return <span className="text-xs font-semibold leading-tight text-advertencia">{etiqueta}</span>;
}

export default function RecetaAccordionRow({
  producto,
  onEdit,
  onPrint,
  onDelete,
  readOnly = false,
  defaultOpen = false,
  ingredienteBase = null,
}) {
  const { config } = useConfig();
  const useMoneyColor = config?.colorear_importes_monetarios !== false;
  const priceColor = useMoneyColor ? 'text-primary' : 'text-foreground';
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [open, setOpen] = useState(!!defaultOpen);

  // Si cambia defaultOpen (p. ej. navegamos a Recetas?producto=X) abrir automáticamente.
  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const lines = producto.recetaLines || [];
  const eco = producto.economia;
  const sinCosto = eco.estado !== 'conocido';
  // 6B / Hotfix visual — Para productos variables (variable_medida o porcion_contenedor)
  // el escandallo clásico no aplica: el costo/utilidad/margen reales viven en
  // FichaResumenVariable por unidad vendible o por porción.
  const esVar = esProductoVariable(producto);

  // === Métricas por unidad vendible (para cabecera variable) ===
  // Mismo cálculo que FichaResumenVariable pero inline para mostrar las 4
  // cifras en la cabecera del acordeón (igual que Productos).
  let varMetrics = null;
  if (esVar) {
    const costoBase = Number(ingredienteBase?.costo_por_unidad_base) || 0;
    if (producto.tipo_venta === TIPO_VENTA.VARIABLE_MEDIDA) {
      const u = producto.unidad_variable || 'g';
      const factor = u === 'kg' || u === 'l' ? 1000 : 1;
      const precio = Number(producto.precio_por_unidad_variable) || 0;
      const costoUnit = costoBase > 0 ? costoBase * factor : 0;
      const hay = costoUnit > 0;
      const util = hay ? precio - costoUnit : 0;
      const marg = hay && precio > 0 ? (util / precio) * 100 : 0;
      varMetrics = { u, precio, costo: costoUnit, util, marg, hay };
    } else {
      const np = producto.nombre_porcion || 'porción';
      const mlPorcion = mlPorPorcionEfectivo({
        ml_por_porcion: producto.ml_por_porcion,
        capacidad_contenedor_ml: producto.capacidad_contenedor_ml,
        porciones_por_contenedor: producto.porciones_por_contenedor,
      });
      const precio = Number(producto.precio_por_porcion) || 0;
      const costoUnit = costoBase > 0 && mlPorcion > 0 ? costoBase * mlPorcion : 0;
      const hay = costoUnit > 0;
      const util = hay ? precio - costoUnit : 0;
      const marg = hay && precio > 0 ? (util / precio) * 100 : 0;
      varMetrics = { u: np, precio, costo: costoUnit, util, marg, hay };
    }
  }

  // Lo que dice la cabecera. Un solo juego de cuatro cifras para fijos y variables, para
  // que las dos clases de fila compartan columnas.
  const cabecera = varMetrics
    ? {
        precio: varMetrics.precio,
        etiquetaPrecio: `Precio / ${varMetrics.u}`,
        etiquetaCosto: `Costo / ${varMetrics.u}`,
        etiquetaUtilidad: `Utilidad / ${varMetrics.u}`,
        unidad: `/ ${varMetrics.u}`,
        costo: varMetrics.hay ? varMetrics.costo : null,
        utilidad: varMetrics.hay ? varMetrics.util : null,
        margen: varMetrics.hay ? varMetrics.marg : null,
        etiquetaDelCosto: null,
        pista: varMetrics.hay
          ? null
          : `Costo por ${varMetrics.u} no disponible hasta registrar inventario del ingrediente base.`,
      }
    : {
        precio: producto.precio_venta,
        etiquetaPrecio: 'Precio',
        etiquetaCosto: 'Costo',
        etiquetaUtilidad: 'Utilidad',
        unidad: null,
        costo: eco.costo,
        utilidad: eco.utilidad,
        margen: eco.margen,
        etiquetaDelCosto: eco.etiqueta,
        pista: eco.pista,
      };
  const nivelDelMargen = cabecera.margen === null ? null : MARGIN_CONFIG[getMarginLevel(cabecera.margen)];

  return (
    <Card
      className="overflow-hidden transition-shadow hover:shadow-md"
      style={{
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 2px 6px rgba(0,0,0,0.06)',
      }}
    >
      {/* Cabecera (resumen): nombre y cuatro cifras en columnas FIJAS. Ver RejillaDeRecetas. */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`w-full p-4 text-left transition-colors hover:bg-muted/30 ${REJILLA_DE_FILA}`}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 truncate font-heading font-semibold" title={producto.nombre}>
              {producto.nombre}
            </p>
            {esVar && (
              <Badge
                variant="outline"
                className="shrink-0 border-primary/30 bg-primary/10 text-[10px] text-primary"
              >
                {producto.tipo_venta === 'variable_medida' ? 'Variable por medida' : 'Por porción'}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {producto.categoria_nombre || 'Sin categoría'}
            {esVar
              ? ` · ${producto?.ingrediente_base_nombre || ingredienteBase?.nombre || 'Ingrediente base'}`
              : eco.origen === 'producto'
                ? ' · Se vende sin receta'
                : ` · ${lines.length} ingredientes`}
          </p>
          {cabecera.pista && <p className="mt-0.5 text-xs text-advertencia">{cabecera.pista}</p>}
        </div>

        <div className={CIFRAS_DE_FILA}>
          <CifraDeFila clave="precio" etiqueta={cabecera.etiquetaPrecio} nota={cabecera.unidad} notaSoloEnTabla>
            <span className={priceColor}>
              <Importe valor={cabecera.precio ?? 0} />
            </span>
          </CifraDeFila>
          <CifraDeFila clave="costo" etiqueta={cabecera.etiquetaCosto} nota={cabecera.unidad} notaSoloEnTabla>
            {cabecera.etiquetaDelCosto ? (
              <CostoDesconocido etiqueta={cabecera.etiquetaDelCosto} />
            ) : (
              <span className="text-advertencia">
                <Importe valor={cabecera.costo} />
              </span>
            )}
          </CifraDeFila>
          <CifraDeFila clave="utilidad" etiqueta={cabecera.etiquetaUtilidad} nota={cabecera.unidad} notaSoloEnTabla>
            <span className="text-exito">
              <Importe valor={cabecera.utilidad} />
            </span>
          </CifraDeFila>
          <CifraDeFila clave="margen" etiqueta="Margen" nota={nivelDelMargen?.label}>
            <Margen margen={cabecera.margen} />
          </CifraDeFila>
        </div>

        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center justify-self-end rounded-full border bg-superficie transition-transform ${CELDA_DE_LA_FLECHA}`}
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.9) inset, 0 2px 4px rgba(0,0,0,0.08)',
          }}
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </div>
      </button>

      {/* Contenido expandido */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t bg-muted/20 px-4 pb-5 pt-3 @2xl:px-5">
            {esVar ? (
              <>
                <FichaResumenVariable
                  producto={producto}
                  ingrediente={ingredienteBase}
                  variant="full"
                  coloresMonetarios={useMoneyColor}
                />
                {lines.length > 0 && (
                  <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">
                      Este producto usa <strong>venta variable</strong>. El escandallo clásico no se
                      usa mientras este tipo de venta esté activo. (No se borraron las líneas
                      anteriores; solo se ignoran visualmente.)
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {lines.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Sin ingredientes capturados todavía.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border bg-superficie">
                    <div
                      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 bg-muted/50 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground ${COLUMNAS_DEL_ESCANDALLO}`}
                    >
                      <div>Ingrediente</div>
                      <div className="hidden text-right @xl:block">Cantidad</div>
                      <div className="hidden @xl:block">Unidad</div>
                      <div className="hidden text-right @xl:block">Costo unit.</div>
                      <div className="text-right">Costo línea</div>
                    </div>
                    {lines.map((l, i) => {
                      const conCosto = lineaTieneCosto(l);
                      return (
                        <div
                          key={l.id ?? i}
                          className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t px-3 py-2 text-sm ${COLUMNAS_DEL_ESCANDALLO}`}
                        >
                          <div className="min-w-0">
                            <p className="truncate" title={l.ingrediente_nombre}>
                              {l.ingrediente_nombre}
                            </p>
                            <p className="text-xs tabular-nums text-muted-foreground @xl:hidden">
                              {cantidadDeLaLinea(l)} {unidadDeLaLinea(l)}
                            </p>
                          </div>
                          <div className="hidden text-right tabular-nums @xl:block">
                            {cantidadDeLaLinea(l)}
                          </div>
                          <div className="hidden text-muted-foreground @xl:block">
                            {unidadDeLaLinea(l)}
                          </div>
                          <div className="hidden text-right tabular-nums text-muted-foreground @xl:block">
                            {conCosto ? (
                              formatCurrency(l.costo_unitario_base_snapshot)
                            ) : (
                              <span className="text-advertencia">Sin costo</span>
                            )}
                          </div>
                          <div className="text-right font-medium tabular-nums">
                            {conCosto ? (
                              formatCurrency(l.costo_linea_calculado)
                            ) : (
                              <span className="text-advertencia">Sin costo</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Un producto que se revende no tiene líneas pero sí costo (el suyo): las
                    cuatro cifras se enseñan igual. Sin líneas y sin costo no hay nada que sumar. */}
                {(lines.length > 0 || eco.costo !== null) && (
                  <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
                    <Stat
                      label="Costo producción"
                      value={eco.costo === null ? eco.etiqueta : formatCurrency(eco.costo)}
                      color="text-advertencia"
                      pequeno={eco.costo === null}
                    />
                    <Stat label="Precio venta" value={formatCurrency(producto.precio_venta)} />
                    <Stat
                      label="Utilidad"
                      value={eco.utilidad === null ? '—' : formatCurrency(eco.utilidad)}
                      color={eco.utilidad === null ? 'text-muted-foreground' : 'text-exito'}
                    />
                    <Stat
                      label="Margen"
                      value={eco.margen === null ? '—' : formatPercent(eco.margen)}
                      color={eco.margen === null ? 'text-muted-foreground' : ''}
                    />
                  </div>
                )}
                {sinCosto && eco.pista && (
                  <div className="flex items-start gap-2 rounded-lg border border-advertencia/30 bg-advertencia/10 px-3 py-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-advertencia" />
                    <p className="text-xs text-advertencia">{eco.pista}</p>
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col gap-2 pt-1 @md:flex-row @md:justify-end">
              <Button
                variant="outline"
                size="sm"
                className="w-full @md:w-auto"
                onClick={() => onPrint?.(producto)}
              >
                <Printer className="mr-1 h-4 w-4" /> Imprimir ficha
              </Button>
              {!readOnly && onEdit && (
                <Button size="sm" className="w-full @md:w-auto" onClick={() => onEdit?.(producto)}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar receta
                </Button>
              )}
              {!readOnly && onDelete && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full @md:w-auto"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Eliminar receta
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar receta de "{producto.nombre}"?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Esto eliminará la receta y retirará el producto del catálogo (POS / Mesero).
              </span>
              <span className="block text-xs">
                No se borran ingredientes del inventario ni ventas históricas.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onDelete(producto);
                setConfirmOpen(false);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value, color, pequeno = false }) {
  return (
    <div
      className="rounded-xl border bg-superficie p-3 text-center"
      style={{ boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`font-heading font-bold tabular-nums ${pequeno ? 'text-xs leading-tight' : ''} ${color || ''}`}
      >
        {value}
      </p>
    </div>
  );
}
