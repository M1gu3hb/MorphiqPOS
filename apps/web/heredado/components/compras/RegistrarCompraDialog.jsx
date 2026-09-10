'use client';
import React, { useState, useRef } from 'react';
import { api, nuevaClave } from '@/api/cliente';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useConfig } from '@/lib/ConfigContext';
import { formatCurrency } from '@/utils/financialUtils';
import {
  getUnidadesCompra,
  UNIDADES_BASE,
  esUnidadEstandar,
  validarCompatibilidad,
  convertirAUnidadBase,
  canonicalUnidad,
} from '@/utils/unidadesMedida';
import IngredienteAutocomplete from '@/components/recetas/IngredienteAutocomplete';
import RepetirCompraDialog from '@/components/compras/RepetirCompraDialog';
import { History, Star, ChevronDown, ChevronUp, Bell } from 'lucide-react';
import StockMinCritInput from '@/components/inventario/StockMinCritInput';
import { textoDecimal } from '@/components/inventario/comandos';

/** Cada línea: ingrediente existente o nuevo; cantidad/unidad/costo. */
export default function RegistrarCompraDialog({ open, onClose, ingredientes = [] }) {
  // Ni `posUser` ni el costo por unidad base se calculan aquí: quién compra sale
  // de la sesión y el costo promedio ponderado lo hace `compras.registrar` con
  // enteros. La fórmula estaba copiada en tres pantallas y en una, mal (D-13).
  const { config } = useConfig();
  const queryClient = useQueryClient();
  // Unidades disponibles — combinan las del admin (Configuración) + defaults inalterables.
  const UNIDADES = getUnidadesCompra(config);
  const [lines, setLines] = useState([emptyLine()]);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [metodoPago, setMetodoPago] = useState('efectivo');
  // proveedor: 'directa' (sin proveedor), o el ID del Proveedor seleccionado, o '__libre__' (texto manual).
  const [proveedorMode, setProveedorMode] = useState('directa');
  const [proveedor, setProveedor] = useState(''); // texto libre cuando proveedorMode === '__libre__'
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [showRepetir, setShowRepetir] = useState(false);
  const [guardarPlantilla, setGuardarPlantilla] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  // Clave de idempotencia mientras el diálogo esté abierto: una compra mueve
  // dinero y stock, y un doble clic en «Guardar compra» —o un reintento de red
  // sobre una petición que sí llegó— la registraría dos veces. Se crea
  // perezosamente y `reset()` la anula al cerrar.
  const claveDelDialogo = useRef(null);
  if (claveDelDialogo.current === null) claveDelDialogo.current = nuevaClave();

  // Proveedores activos para el selector. Solo se cargan cuando el dialog está abierto.
  const { data: proveedoresActivos = [] } = useQuery({
    queryKey: ['proveedores_activos'],
    queryFn: () => api.entidades.Proveedor.filter({ activo: true }),
    initialData: [],
    enabled: open,
  });
  const safeProveedores = Array.isArray(proveedoresActivos) ? proveedoresActivos : [];

  function emptyLine() {
    return {
      tipo: 'existente', // 'existente' | 'nuevo'
      ingrediente: null,
      // Para "nuevo":
      nuevo_nombre: '',
      nuevo_unidad_base: 'g',
      cantidad: '',
      unidad_compra: 'kg',
      costo_total: '',
      piezas_por_paquete: '',
      // Alertas (solo aplican cuando tipo === 'nuevo'). Ya en UNIDAD BASE
      // porque StockMinCritInput convierte antes de retornar.
      // Si el usuario no las toca, quedan en 0 (comportamiento previo).
      stock_minimo_base: 0,
      stock_critico_base: 0,
      // UI: sección visible por defecto. Las alertas son IMPORTANTES para un
      // restaurante, no se esconden como si fueran opcionales sin valor.
      alertasOpen: true,
    };
  }

  const reset = () => {
    setLines([emptyLine()]);
    setProveedorMode('directa');
    setProveedor('');
    setNotas('');
    setMetodoPago('efectivo');
    setFecha(new Date().toISOString().slice(0, 10));
    setGuardarPlantilla(false);
    setNombrePlantilla('');
    claveDelDialogo.current = null;
  };

  // Al repetir compra, intenta mapear el nombre histórico al proveedor activo
  // actual. Si no hay match (proveedor desactivado o no existente), cae a
  // "Otro" con el nombre histórico para que NO se pierda el dato.
  const handleSelectedFromHistory = ({ lineas, proveedor: prov, metodoPago: mp }) => {
    if (lineas?.length) setLines(lineas);
    if (mp) setMetodoPago(mp);
    const provName = String(prov || '').trim();
    if (!provName || provName.toLowerCase() === 'compra directa') {
      setProveedorMode('directa');
      setProveedor('');
    } else {
      const match = safeProveedores.find(
        (p) =>
          String(p?.nombre || '')
            .trim()
            .toLowerCase() === provName.toLowerCase(),
      );
      if (match?.id) {
        setProveedorMode(match.id);
        setProveedor('');
      } else {
        setProveedorMode('__libre__');
        setProveedor(provName);
      }
    }
    toast.success(`${lineas?.length || 0} línea(s) cargadas — revisa y ajusta antes de guardar`);
  };

  const close = () => {
    reset();
    onClose();
  };

  const updateLine = (idx, patch) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));

  const totalCompra = lines.reduce((s, l) => s + (parseFloat(l.costo_total) || 0), 0);

  const handleSelectExistente = (idx, ing) => {
    updateLine(idx, {
      ingrediente: ing,
      tipo: 'existente',
      unidad_compra: ing.unidad_compra_default || 'kg',
    });
  };

  const handleCreateNew = (idx, query) => {
    updateLine(idx, {
      tipo: 'nuevo',
      ingrediente: null,
      nuevo_nombre: query,
    });
  };

  // Una unidad requiere equivalencia si NO es estándar directa (kg/g/litro/ml/pieza/alias).
  // Empaques (caja/paquete/bolsa) y unidades personalizadas la requieren.
  const requiereEquivalencia = (u) => {
    const canon = canonicalUnidad(u);
    return canon === null; // null = personalizada o empaque
  };

  const handleSave = async () => {
    const baseValid = lines.filter(
      (l) =>
        (l.tipo === 'existente' ? l.ingrediente : l.nuevo_nombre.trim()) &&
        parseFloat(l.cantidad) > 0 &&
        parseFloat(l.costo_total) > 0,
    );
    if (baseValid.length === 0) {
      toast.error('Agrega al menos una línea válida con cantidad y costo');
      return;
    }

    // Validar equivalencia + compatibilidad por línea (mensajes específicos)
    for (const l of baseValid) {
      if (requiereEquivalencia(l.unidad_compra) && !(parseFloat(l.piezas_por_paquete) > 0)) {
        toast.error(`Falta indicar a cuánto equivale 1 ${l.unidad_compra} en unidad base.`);
        return;
      }
      const unidadBase = l.tipo === 'existente' ? l.ingrediente?.unidad_base : l.nuevo_unidad_base;
      const { compatible, mensaje } = validarCompatibilidad(l.unidad_compra, unidadBase);
      if (!compatible) {
        toast.error(mensaje || 'La unidad seleccionada no es compatible con la unidad base.');
        return;
      }
    }

    const validLines = baseValid;

    setSaving(true);
    try {
      // Resolver proveedor antes de guardar:
      //  - 'directa'      → sin proveedor, snapshot = 'Compra directa'
      //  - id de Proveedor → guardar id + nombre como snapshot (para que sobreviva si lo desactivan)
      //  - '__libre__'    → texto manual, sin id
      let provIdFinal = '';
      let provNombreFinal = 'Compra directa';
      if (proveedorMode === '__libre__') {
        provIdFinal = '';
        provNombreFinal = String(proveedor || '').trim() || 'Compra directa';
      } else if (proveedorMode && proveedorMode !== 'directa') {
        const sel = safeProveedores.find((p) => p.id === proveedorMode);
        if (sel?.id) {
          provIdFinal = sel.id;
          provNombreFinal = sel.nombre || 'Compra directa';
        }
      }

      // ── D-12: cabecera y líneas, o nada ──────────────────────────────────
      // Antes esto creaba la `CompraInsumo` con el total de las cinco líneas y
      // el bucle de líneas iba DESPUÉS: si fallaba la línea 3 de 5 quedaba una
      // compra con el total correcto y tres líneas, un asiento que no cuadra
      // consigo mismo. Y cada línea hacía además su `Ingrediente.update(stock)`
      // y su `MovimientoInventario.create` a mano — los dos se van, porque
      // `compras.registrar` mueve la existencia y escribe el ledger él mismo;
      // dejarlos aquí descontaría dos veces.
      //
      // El total tampoco viaja: es Σ de las líneas y lo suma el servidor. El
      // endpoint no acepta importes de cabecera.
      const lineasDeLaCompra = validLines.map((l) => {
        // La equivalencia —cuántas unidades base trae UNA unidad de compra— es
        // obligatoria y ahora SE GUARDA, así que dentro de seis meses «3 cajas»
        // sigue diciendo que una caja traía 12 kg. Para una unidad estándar la
        // fija el catálogo (1 kg = 1000 g) y el servidor rechaza una distinta;
        // para un empaque la captura quien compra.
        const equivalencia = requiereEquivalencia(l.unidad_compra)
          ? parseFloat(l.piezas_por_paquete)
          : convertirAUnidadBase(1, l.unidad_compra, 1);

        const comun = {
          cantidadCapturada: textoDecimal(parseFloat(l.cantidad)),
          unidadCapturada: l.unidad_compra,
          equivalencia: textoDecimal(equivalencia),
          costoTotal: textoDecimal(parseFloat(l.costo_total)),
        };

        if (l.tipo !== 'nuevo') return { ...comun, insumoId: l.ingrediente.id };

        // Un insumo que todavía no existe se declara aquí y lo resuelve el
        // servidor DENTRO de la transacción, contra `insumos_nombre_unico`
        // —sin acentos, sin mayúsculas—. Es lo que sustituye al anti-duplicado
        // que descargaba el catálogo entero al navegador: entre aquella lectura
        // y la escritura cabía otra caja creando el mismo insumo. El servidor
        // también es quien frena si el nombre pertenece a uno desactivado.
        const nuevo = {
          nombre: l.nuevo_nombre.trim(),
          unidadBase: l.nuevo_unidad_base,
        };
        const minimo = Math.max(0, Number(l.stock_minimo_base) || 0);
        const critico = Math.max(0, Number(l.stock_critico_base) || 0);
        if (minimo > 0) nuevo.stockMinimo = textoDecimal(minimo);
        if (critico > 0) nuevo.stockCritico = textoDecimal(critico);
        return { ...comun, nuevo };
      });

      const cabecera = {
        fecha,
        metodoPago,
        ...(provIdFinal ? { proveedorId: provIdFinal } : {}),
        // Sólo cuando la compra NO apunta a un proveedor del catálogo: con id,
        // el nombre lo pone el servidor con el del catálogo.
        ...(!provIdFinal && provNombreFinal ? { proveedorNombre: provNombreFinal } : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      };

      const resultado = await api.comandos.ejecutar(
        '/api/compras/registrar',
        { ...cabecera, lineas: lineasDeLaCompra },
        claveDelDialogo.current,
      );

      // Guardar como plantilla recurrente.
      //
      // Va después y con su propia llamada porque son dos decisiones distintas:
      // la compra ya está registrada pase lo que pase con la plantilla. El
      // `.catch(() => {})` que envolvía esto hacía que el usuario marcara
      // «guardar como plantilla», la compra entrara y la plantilla no, sin un
      // solo aviso. Ahora, si falla, se dice.
      //
      // `veces_usada` y `ultima_fecha_uso` ya no se mandan: son contadores que
      // sube `compras.usar_plantilla` en la misma transacción que registra la
      // compra repetida. Escribirlos desde aquí los dejaba clavados en 1.
      if (guardarPlantilla && nombrePlantilla.trim()) {
        // Una plantilla apunta a insumos que ya existen: es una sugerencia para
        // precargar el formulario, no un asiento, y no puede referirse a un
        // insumo que se acaba de crear en esta compra y cuyo id no vuelve.
        const lineasDePlantilla = validLines
          .filter((l) => l.ingrediente?.id)
          .map((l) => ({
            insumoId: l.ingrediente.id,
            cantidad: textoDecimal(parseFloat(l.cantidad)),
            unidadCompra: l.unidad_compra,
            equivalencia: textoDecimal(
              requiereEquivalencia(l.unidad_compra)
                ? parseFloat(l.piezas_por_paquete)
                : convertirAUnidadBase(1, l.unidad_compra, 1),
            ),
            costoTotal: textoDecimal(parseFloat(l.costo_total)),
          }));

        if (lineasDePlantilla.length === 0) {
          toast.error(
            'La compra se registró, pero la plantilla no: sus líneas son insumos nuevos. Vuelve a guardarla cuando ya existan en el inventario.',
          );
        } else {
          try {
            await api.comandos.ejecutar('/api/compras/plantilla', {
              nombre: nombrePlantilla.trim(),
              ...(provNombreFinal === 'Compra directa' ? {} : { proveedorNombre: provNombreFinal }),
              activa: true,
              lineas: lineasDePlantilla,
            });
          } catch (errPlantilla) {
            // Se captura aquí, y no en el `catch` de abajo, para no decirle al
            // usuario que falló la compra cuando la compra sí entró. Lo que
            // falló fue la plantilla, y se dice cuál de las dos cosas fue.
            toast.error(
              `La compra se registró, pero la plantilla no se guardó: ${errPlantilla?.message || 'error desconocido'}`,
            );
          }
        }
      }

      [
        'ingredientes_all',
        'compras_all',
        'movimientos_inv',
        'registros_compras',
        'registros_movimientos',
      ].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      // El total que se enseña es el que sumó y guardó la transacción, en
      // centavos exactos, no el que la pantalla acumuló en coma flotante.
      const totalGuardado = Number(resultado?.totalCentavos ?? 0) / 100;
      toast.success(
        `Compra registrada — ${resultado?.lineas ?? validLines.length} línea(s) · ${formatCurrency(totalGuardado)}`,
      );
      close();
    } catch (e) {
      // El dominio ya dice qué línea y por qué —«Una unidad de kg son 1000 g,
      // no 12», ««Harina» está desactivado. Reactívalo desde Inventario»—, y
      // ese texto es lo único que permite corregir la captura.
      toast.error(e?.message || 'No se pudo registrar la compra.');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">Registrar compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Repetir compra anterior */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowRepetir(true)}
            className="w-full justify-start gap-2"
          >
            <History className="w-4 h-4" /> Repetir compra anterior o usar plantilla recurrente
          </Button>
          {/* Datos secundarios — colapsados arriba */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/40">
            <div>
              <Label className="text-[10px] uppercase">Fecha</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase">Pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] uppercase">Proveedor</Label>
              <Select
                value={proveedorMode}
                onValueChange={(v) => {
                  setProveedorMode(v);
                  if (v !== '__libre__') setProveedor('');
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecciona proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="directa">Compra directa / Sin proveedor</SelectItem>
                  {safeProveedores.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                  <SelectItem value="__libre__">Otro (escribir manualmente)</SelectItem>
                </SelectContent>
              </Select>
              {proveedorMode === '__libre__' && (
                <Input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="h-8 text-xs mt-1.5"
                />
              )}
            </div>
          </div>

          {/* Líneas */}
          <div className="space-y-3">
            {lines.map((line, idx) => (
              <div
                key={idx}
                className="rounded-xl border bg-card text-card-foreground p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Línea {idx + 1}</p>
                  {lines.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeLine(idx)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {/* Toggle existente / nuevo */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateLine(idx, { tipo: 'existente', ingrediente: null, nuevo_nombre: '' })
                    }
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${line.tipo === 'existente' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Existente
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLine(idx, { tipo: 'nuevo', ingrediente: null })}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${line.tipo === 'nuevo' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    Nuevo
                  </button>
                </div>

                {/* Selector */}
                {line.tipo === 'existente' ? (
                  <div>
                    <Label className="text-xs">Buscar ingrediente</Label>
                    <IngredienteAutocomplete
                      ingredientes={ingredientes}
                      value={line.ingrediente}
                      onSelect={(ing) => handleSelectExistente(idx, ing)}
                      onCreateNew={(q) => handleCreateNew(idx, q)}
                    />
                    {line.ingrediente && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Stock actual: {Number(line.ingrediente.stock_actual || 0).toLocaleString()}{' '}
                        {line.ingrediente.unidad_base}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Nombre del ingrediente</Label>
                      <Input
                        value={line.nuevo_nombre}
                        onChange={(e) => updateLine(idx, { nuevo_nombre: e.target.value })}
                        placeholder="Ej: Café molido"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Unidad base (cómo se usa)</Label>
                      <Select
                        value={line.nuevo_unidad_base}
                        onValueChange={(v) => updateLine(idx, { nuevo_unidad_base: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIDADES_BASE.map((u) => (
                            <SelectItem key={u.value} value={u.value}>
                              {u.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Cantidad / unidad / costo */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Cantidad comprada</Label>
                    <Input
                      type="number"
                      value={line.cantidad}
                      onChange={(e) => updateLine(idx, { cantidad: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unidad de compra</Label>
                    <Select
                      value={line.unidad_compra}
                      onValueChange={(v) => updateLine(idx, { unidad_compra: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIDADES.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Costo total ($)</Label>
                    <Input
                      type="number"
                      value={line.costo_total}
                      onChange={(e) => updateLine(idx, { costo_total: e.target.value })}
                      placeholder="$0"
                    />
                  </div>
                </div>

                {/* Alertas de inventario — SOLO cuando se crea ingrediente nuevo.
                    Sección colapsable para no ensuciar el flujo rápido de compra.
                    NO aparece en ingredientes existentes para no sobrescribir sus umbrales. */}
                {line.tipo === 'nuevo' && (
                  <div className="rounded-lg border border-dashed bg-muted/30 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => updateLine(idx, { alertasOpen: !line.alertasOpen })}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Bell
                          className="w-3.5 h-3.5"
                          style={{ color: 'var(--brand-accent, hsl(var(--primary)))' }}
                        />
                        Alertas de inventario
                      </span>
                      {line.alertasOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {line.alertasOpen && (
                      <div className="px-3 pb-3 pt-1 space-y-2">
                        <p className="text-[11px] text-muted-foreground">
                          Define cuándo el sistema debe avisarte que este ingrediente está bajo o
                          crítico.
                        </p>
                        <StockMinCritInput
                          unidadBase={line.nuevo_unidad_base || 'g'}
                          valoresEnBase={{
                            stock_minimo: Number(line.stock_minimo_base) || 0,
                            stock_critico: Number(line.stock_critico_base) || 0,
                          }}
                          onChange={({ stock_minimo, stock_critico }) =>
                            updateLine(idx, {
                              stock_minimo_base: stock_minimo,
                              stock_critico_base: stock_critico,
                            })
                          }
                          compact
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Validación de compatibilidad inline + equivalencia si aplica */}
                {(() => {
                  const unidadBase =
                    line.tipo === 'existente'
                      ? line.ingrediente?.unidad_base
                      : line.nuevo_unidad_base;
                  const compat = unidadBase
                    ? validarCompatibilidad(line.unidad_compra, unidadBase)
                    : { compatible: true };
                  const necesitaEq = requiereEquivalencia(line.unidad_compra);
                  return (
                    <>
                      {!compat.compatible && (
                        <div className="rounded-lg p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200">
                          {compat.mensaje}
                        </div>
                      )}
                      {necesitaEq && (
                        <div className="rounded-lg p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                          <Label className="text-xs">
                            ¿A cuánto equivale 1 {line.unidad_compra} en unidad base (
                            {unidadBase || 'g/ml/pieza'})? *
                          </Label>
                          <Input
                            type="number"
                            value={line.piezas_por_paquete}
                            onChange={(e) =>
                              updateLine(idx, { piezas_por_paquete: e.target.value })
                            }
                            placeholder={
                              unidadBase === 'g'
                                ? 'Ej: 1000 (gramos por bolsa)'
                                : unidadBase === 'ml'
                                  ? 'Ej: 20000 (ml por garrafón)'
                                  : 'Ej: 24 (piezas por caja)'
                            }
                            className="h-8"
                          />
                          <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-1">
                            {esUnidadEstandar(line.unidad_compra)
                              ? 'Esta unidad es un empaque — indica cuánto trae cada uno.'
                              : 'Esta es una unidad personalizada. Necesitamos su equivalencia para calcular costos.'}
                          </p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={addLine} className="w-full">
            <Plus className="w-4 h-4 mr-1" /> Agregar otra línea
          </Button>

          <div>
            <Label className="text-xs">Notas</Label>
            <Input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {/* Guardar como plantilla recurrente — dark-aware */}
          <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/40 space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={guardarPlantilla}
                onChange={(e) => setGuardarPlantilla(e.target.checked)}
                className="mt-1"
              />
              <div className="flex-1">
                <p className="text-sm font-medium flex items-center gap-1 text-amber-900 dark:text-amber-200">
                  <Star className="w-3.5 h-3.5 text-amber-500" /> Guardar como plantilla recurrente
                </p>
                <p className="text-[11px] text-amber-800/80 dark:text-amber-300/70">
                  Para repetir esta compra rápidamente la próxima vez.
                </p>
              </div>
            </label>
            {guardarPlantilla && (
              <Input
                value={nombrePlantilla}
                onChange={(e) => setNombrePlantilla(e.target.value)}
                placeholder='Ej: "Compra semanal panadería"'
                className="h-9 text-sm"
              />
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
            <span className="text-sm font-medium">Total compra</span>
            <span className="font-heading font-black text-xl text-primary">
              {formatCurrency(totalCompra)}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" /> {saving ? 'Guardando...' : 'Guardar compra'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <RepetirCompraDialog
        open={showRepetir}
        onClose={() => setShowRepetir(false)}
        onSelected={handleSelectedFromHistory}
      />
    </Dialog>
  );
}
