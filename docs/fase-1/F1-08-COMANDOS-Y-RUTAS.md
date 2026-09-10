# F1-08 · Los comandos del sistema y cómo se llaman

Generado del CODIGO, no escrito a mano. Cada fila dice el comando, quien puede
ejecutarlo POR SESION, y la ruta HTTP que lo expone.

| Comando | Roles | Ruta HTTP | Entrada |
|---|---|---|---|
| `caja.abrir` | cajero, gerente, administrador, dueno | `/api/caja/abrir` | `entradaAbrirCaja` |
| `caja.cerrar` | cajero, gerente, administrador, dueno | `/api/caja/cerrar` | `entradaCerrarCaja` |
| `caja.eliminar_corte` | dueno | `/api/caja/eliminar-corte` | `entradaEliminarCorte` |
| `caja.estado` | cajero, gerente, administrador, dueno | `/api/caja/estado` | `entradaEstadoCaja` |
| `caja.movimiento` | cajero, gerente, administrador, dueno | `/api/caja/movimiento` | `entradaMovimientoCaja` |
| `catalogo.actualizar_producto` | dueno, administrador, gerente | `/api/catalogo/productos/actualizar` | `entradaActualizarProducto` |
| `catalogo.archivar_producto` | dueno, administrador, gerente | `(sin ruta HTTP)` | `entradaArchivarProducto` |
| `catalogo.asignar_codigo` | dueno, administrador, gerente | `/api/catalogo/productos/codigo` | `entradaAsignarCodigo` |
| `catalogo.cambiar_precio` | dueno, administrador, gerente | `/api/catalogo/productos/precio` | `entradaCambiarPrecio` |
| `catalogo.crear_modificador` | dueno, administrador, gerente | `(sin ruta HTTP)` | `entradaCrearModificador` |
| `catalogo.crear_producto` | dueno, administrador, gerente | `/api/catalogo/crear-producto` | `entradaCrearProducto` |
| `compras.guardar_plantilla` | dueno, administrador, gerente | `/api/compras/plantilla` | `entradaGuardarPlantillaCompra` |
| `compras.registrar` | dueno, administrador, gerente | `/api/compras/registrar` | `entradaRegistrarCompra` |
| `compras.usar_plantilla` | dueno, administrador, gerente | `/api/compras/plantilla/usar` | `entradaUsarPlantillaCompra` |
| `configuracion.cambiar_paquete` | dueno | `/api/configuracion/paquete` | `entradaCambiarPaquete` |
| `configuracion.desbloquear_presentacion` | dueno, administrador | `/api/configuracion/presentacion` | `entradaDesbloquear` |
| `configuracion.fijar_contrasena_presentacion` | dueno | `/api/configuracion/presentacion-contrasena` | `entradaFijarContrasena` |
| `configuracion.guardar` | dueno, administrador | `/api/catalogo/configuracion` | `entradaGuardarConfiguracion` |
| `configuracion.resetear_demo` | dueno, administrador | `/api/catalogo/demostracion/resetear` | `entradaResetearDemo` |
| `gastos.guardar_plantilla` | dueno, administrador, gerente | `/api/gastos/plantilla` | `entradaGuardarPlantillaGasto` |
| `gastos.registrar` | dueno, administrador, gerente | `/api/gastos/registrar` | `entradaRegistrarGasto` |
| `identidad.establecer_pin` | dueno, administrador | `/api/identidad/pin` | `entradaEstablecerPin` |
| `inventario.actualizar_costo` | dueno, administrador, gerente, almacen | `/api/inventario/insumos/costo` | `entradaActualizarCostoInsumo` |
| `inventario.ajustar` | dueno, administrador, gerente, almacen | `/api/inventario/ajustar` | `entradaAjustarStock` |
| `inventario.crear_almacen` | dueno, administrador, gerente, almacen | `/api/inventario/almacenes/crear` | `entradaCrearAlmacen` |
| `inventario.crear_insumo` | dueno, administrador, gerente, almacen | `/api/inventario/insumos/crear` | `entradaCrearInsumo` |
| `inventario.eliminar_receta` | dueno, administrador, gerente | `/api/inventario/recetas/eliminar` | `entradaEliminarReceta` |
| `inventario.guardar_receta` | dueno, administrador, gerente, almacen | `/api/inventario/recetas` | `entradaGuardarReceta` |
| `inventario.inicial` | dueno, administrador, gerente, almacen | `/api/inventario/inicial` | `entradaInventarioInicial` |
| `mantenimiento.purgar_seccion` | dueno | `/api/mantenimiento/purgar-seccion` | `entradaSeccion` |
| `mantenimiento.purgar_ventas` | dueno | `/api/mantenimiento/purgar-ventas` | `entradaPurgarVentas` |
| `mantenimiento.reiniciar_pruebas` | dueno | `/api/mantenimiento/reiniciar-pruebas` | `entradaConfirmada` |
| `mantenimiento.reiniciar_todo` | dueno | `/api/mantenimiento/reiniciar-todo` | `entradaConfirmada` |
| `mantenimiento.vaciar_mesas` | dueno, administrador | `/api/mantenimiento/vaciar-mesas` | `entradaVacia` |
| `portal.abrir_mesa` | PUBLICO (sin sesion) | `/api/publico/qr/[token]/mesa` | `entradaAbrirMesa` |
| `portal.crear_solicitud` | PUBLICO (sin sesion) | `/api/publico/qr/[token]/solicitud` | `entradaCrearSolicitud` |
| `portal.enviar_pedido` | PUBLICO (sin sesion) | `/api/publico/qr/[token]/pedido` | `entradaEnviarPedido` |
| `portal.pedir_cuenta` | PUBLICO (sin sesion) | `/api/publico/qr/[token]/cuenta` | `entradaPedirCuenta` |
| `portal.valorar` | PUBLICO (sin sesion) | `/api/publico/qr/[token]/valoracion` | `entradaValorar` |
| `propinas.liquidar` | dueno, administrador, gerente | `/api/propinas/liquidar` | `entradaLiquidarPropinas` |
| `propinas.pendientes` | dueno, administrador, gerente, cajero | `/api/propinas/pendientes` | `entradaPropinasPendientes` |
| `puente.escribir` | dueno, administrador, gerente | `/api/datos/escribir` | `entradaEscribir` |
| `restaurante.abrir_mesa` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/abrir-mesa` | `entradaAbrirMesa` |
| `restaurante.asignar_mesero` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/asignar-mesero` | `entradaAsignarMesero` |
| `restaurante.atender_solicitud` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/atender-solicitud` | `entradaAtenderSolicitud` |
| `restaurante.cancelar_orden` | cajero, gerente, administrador, dueno | `/api/restaurante/cancelar-orden` | `entradaCancelarOrden` |
| `restaurante.entregar_pedidos` | cocina, mesero, cajero, gerente, administrador, dueno | `/api/restaurante/entregar-pedidos` | `entradaEntregarPedidos` |
| `restaurante.enviar_pedido` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/enviar-pedido` | `entradaEnviarPedido` |
| `restaurante.liberar_mesa` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/liberar-mesa` | `entradaLiberarMesa` |
| `restaurante.limpiar_solicitudes` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/limpiar-solicitudes` | `entradaLimpiarSolicitudes` |
| `restaurante.solicitar_cuenta` | mesero, cajero, gerente, administrador, dueno | `/api/restaurante/solicitar-cuenta` | `entradaSolicitarCuenta` |
| `restaurante.transicionar_pedido` | cocina, mesero, cajero, gerente, administrador, dueno | `/api/restaurante/transicionar-pedido` | `entradaTransicionarPedido` |
| `restaurante.vaciar_solicitudes` | dueno, administrador | `/api/restaurante/vaciar-solicitudes` | `entradaVaciarSolicitudes` |
| `venta.agregar_linea` | cajero, mesero, gerente, administrador, dueno | `/api/venta/agregar-linea` | `entradaAgregarLinea` |
| `venta.buscar` | cajero, mesero, gerente, administrador, dueno | `/api/venta/buscar` | `entradaBuscarCatalogo` |
| `venta.cambiar_cantidad` | cajero, mesero, gerente, administrador, dueno | `/api/venta/cambiar-cantidad` | `entradaCambiarCantidad` |
| `venta.cobrar` | cajero, gerente, administrador, dueno | `/api/venta/cobrar` | `entradaCobrarOrdenConPropina` |
| `venta.crear_orden` | cajero, mesero, gerente, administrador, dueno | `/api/venta/crear-orden` | `entradaCrearOrden` |
| `venta.estado` | cajero, mesero, gerente, administrador, dueno | `/api/venta/estado` | `entradaEstadoVenta` |
| `venta.quitar_linea` | cajero, mesero, gerente, administrador, dueno | `/api/venta/quitar-linea` | `entradaQuitarLinea` |
| `venta.ticket` | cajero, mesero, gerente, administrador, dueno | `/api/venta/ticket` | `entradaTicket` |

## Los esquemas de entrada, literales

NINGUNO acepta un importe, un total, un precio ni un rol: `definirComando` lo
rechaza al cargar el modulo. Lo que no este aqui, no se manda.

### `entradaAbrirCaja`

```ts
export const entradaAbrirCaja = z.object({
  fondoInicialCentavos: centavosNoNegativos,
}
```

### `entradaAbrirMesa`

```ts
export const entradaAbrirMesa = z.object({
  personas: z.number().int().min(1).max(MAXIMO_PERSONAS),
  clienteNombre: z.string().trim().max(MAXIMO_NOMBRE).default(''),
  notas: notaCorta,
  notasAlergias: notaCorta,
  celebracionEspecial: z.boolean().default(false),
  tipoCelebracion: z.string().trim().max(MAXIMO_NOMBRE).default(''),
}
```

### `entradaActualizarCostoInsumo`

```ts
export const entradaActualizarCostoInsumo = z.object({
  insumoId: z.uuid(),
  costoUnitario: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
}
```

### `entradaActualizarProducto`

```ts
export const entradaActualizarProducto = z.object({
  productoId: id,
  nombre: texto,
  descripcion: z.string().trim().max(500).nullable(),
  imagenUrl: z.url().nullable(),
  categoriaId: id.nullable(),
  marca: z.string().trim().min(1).max(100).nullable(),
  visibleEnPos: z.boolean(),
  permiteVentaSinStock: z.boolean(),
  stockMinimo: cantidad,
}
```

### `entradaAgregarLinea`

```ts
export const entradaAgregarLinea = z.object({
  ordenId: z.uuid(),
  productoId: z.uuid(),
  cantidad: cantidadDecimal,
  unidad: z.string().min(1).max(10).optional(),
}
```

### `entradaAjustarStock`

```ts
export const entradaAjustarStock = z.object({
  almacenId: id,
  insumoId: id,
  cantidad: cantidadConSigno,
  motivo: z.string().trim().min(4).max(300),
}
```

### `entradaArchivarProducto`

```ts
export const entradaArchivarProducto = z.object({ productoId: id }
```

### `entradaAsignarCodigo`

```ts
export const entradaAsignarCodigo = z.object({
  productoId: id,
  codigoBarras: z.string().trim().min(6).max(80).nullable(),
  sku: z.string().trim().min(1).max(80).nullable(),
}
```

### `entradaAsignarMesero`

```ts
export const entradaAsignarMesero = z.object({
  mesaId: z.uuid(),
}
```

### `entradaAtenderSolicitud`

```ts
export const entradaAtenderSolicitud = z.object({
  solicitudId: z.uuid(),
  estado: z.enum(['atendida', 'resuelta', 'cancelada']),
}
```

### `entradaBuscarCatalogo`

```ts
export const entradaBuscarCatalogo = z.object({
  busqueda: z.string().max(60).optional(),
  limite: z.number().int().min(1).max(100).default(40),
}
```

### `entradaCambiarCantidad`

```ts
export const entradaCambiarCantidad = z.object({
  ordenId: z.uuid(),
  lineaId: z.uuid(),
  cantidad: cantidadDecimal,
}
```

### `entradaCambiarPaquete`

```ts
const entradaCambiarPaquete = z.object({
  paquete: z.enum(PAQUETES_MH),
}
```

### `entradaCancelarOrden`

```ts
export const entradaCancelarOrden = z.object({
  ordenId: z.uuid(),
  motivo: z.string().trim().min(3).max(300),
}
```

### `entradaCerrarCaja`

```ts
export const entradaCerrarCaja = z.object({
  efectivoContadoCentavos: centavosNoNegativos,
  notas: z.string().max(500).optional(),
}
```

### `entradaConfirmada`

```ts
const entradaConfirmada = z.object({ confirmacionNombreNegocio: confirmacion }
```

### `entradaCrearAlmacen`

```ts
export const entradaCrearAlmacen = z.object({ nombre: z.string().trim().min(2).max(120) }
```

### `entradaCrearInsumo`

```ts
export const entradaCrearInsumo = z.object({
  nombre: z.string().trim().min(2).max(160),
  unidad,
  costoUnitario: importe,
  stockMinimo: z.string().regex(/^\d{1,10}(?:\.\d{1,4})?$/),
}
```

### `entradaCrearModificador`

```ts
export const entradaCrearModificador = z.object({
  productoId: id,
  nombre: texto,
  obligatorio: z.boolean(),
  tipo: z.enum(['unica', 'multiple']),
  opciones: z
    .array(z.object({ nombre: texto, precioExtra: importe }))
    .min(1)
    .max(30),
}
```

### `entradaCrearOrden`

```ts
export const entradaCrearOrden = z.object({}
```

### `entradaCrearSolicitud`

```ts
export const entradaCrearSolicitud = z.object({
  tipo: z.enum(['ordenar', 'cuenta', 'ayuda']),
}
```

### `entradaDesbloquear`

```ts
const entradaDesbloquear = z.object({
  contrasena: z.string().min(1).max(200),
}
```

### `entradaEliminarCorte`

```ts
export const entradaEliminarCorte = z.object({ corteId: z.uuid() }
```

### `entradaEliminarReceta`

```ts
export const entradaEliminarReceta = z.object({ productoId: z.uuid() }
```

### `entradaEntregarPedidos`

```ts
export const entradaEntregarPedidos = z.object({
  ordenId: z.uuid(),
}
```

### `entradaEnviarPedido`

```ts
export const entradaEnviarPedido = z.object({
  items: z.array(itemDelCarrito).min(1).max(MAXIMO_LINEAS),
  notaGeneral: notaCorta,
}
```

### `entradaEscribir`

```ts
const entradaEscribir = z.object({
  entidad: z.string().min(1).max(60),
  operacion: z.enum(['create', 'update', 'delete']),
  id: z.string().min(1).max(64).optional(),
  datos: z.record(z.string(), z.unknown()).optional(),
}
```

### `entradaEstablecerPin`

```ts
export const entradaEstablecerPin = z.object({
  empleado: z.uuid(),
  pin: z.string().regex(FORMA_PIN, 'El PIN son de 4 a 8 dígitos.'),
}
```

### `entradaEstadoCaja`

```ts
export const entradaEstadoCaja = z.object({}
```

### `entradaEstadoVenta`

```ts
export const entradaEstadoVenta = z.object({
  ordenId: z.uuid().optional(),
}
```

### `entradaFijarContrasena`

```ts
const entradaFijarContrasena = z.object({
  contrasena: z.string().min(4).max(200),
}
```

### `entradaGuardarConfiguracion`

```ts
export const entradaGuardarConfiguracion = z.object({
  version: z.number().int().min(0),
  nombreNegocio: z.string().trim().min(2).max(160),
  telefono: z.string().trim().min(7).max(40).nullable(),
  direccion: z.string().trim().min(5).max(300).nullable(),
  logoUrl: urlONull,
  colorPrimario: color,
  colorAcento: color,
  estilo: z.enum(['base', 'editorial', 'premium']),
  paquete: z.enum(PAQUETES),
  impuestoPuntosBase: z.number().int().min(0).max(3500),
  impuestoIncluidoEnPrecio: z.boolean(),
}
```

### `entradaGuardarPlantillaCompra`

```ts
export const entradaGuardarPlantillaCompra = z.object({
  plantillaId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  proveedorNombre: z.string().trim().max(160).optional(),
  notas: nota.optional(),
  activa: z.boolean().optional(),
  lineas: z.array(lineaDePlantillaCompra).min(1).max(MAXIMO_LINEAS_DE_COMPRA),
}
```

### `entradaGuardarPlantillaGasto`

```ts
export const entradaGuardarPlantillaGasto = z.object({
  plantillaId: z.uuid().optional(),
  nombre: z.string().trim().min(2).max(120),
  categoria: categoriaGasto,
  montoSugerido: importePositivo,
  metodoPago,
  periodicidad: z.enum(['mensual', 'semanal', 'quincenal', 'anual', 'unico']),
  diaPagoSugerido: z.number().int().min(1).max(31).optional(),
  notas: nota.optional(),
  activa: z.boolean().optional(),
}
```

### `entradaGuardarReceta`

```ts
export const entradaGuardarReceta = z.object({
  productoId: z.uuid(),
  ingredientes: z.array(ingrediente).min(1).max(50),
}
```

### `entradaInventarioInicial`

```ts
export const entradaInventarioInicial = z.object({
  almacenId: id,
  insumoId: id,
  cantidad: cantidadPositiva,
}
```

### `entradaLiberarMesa`

```ts
export const entradaLiberarMesa = z.object({
  mesaId: z.uuid(),
}
```

### `entradaLimpiarSolicitudes`

```ts
export const entradaLimpiarSolicitudes = z.object({}
```

### `entradaLiquidarPropinas`

```ts
export const entradaLiquidarPropinas = z.object({
  rangoTipo: z.enum(RANGOS_DE_LIQUIDACION),
  desde: z.string().min(4).max(40),
  hasta: z.string().min(4).max(40),
  meseroId: identificador.nullish(),
  ordenIds: z.array(identificador).min(1).max(500).optional(),
  notas: z.string().trim().max(500).optional(),
}
```

### `entradaMovimientoCaja`

```ts
export const entradaMovimientoCaja = z.object({
  tipo: z.enum(['gasto', 'retiro', 'deposito', 'ajuste']),
  montoCentavos: z.number().int().max(Number.MAX_SAFE_INTEGER),
  motivo: z.string().min(3).max(200),
}
```

### `entradaPedirCuenta`

```ts
export const entradaPedirCuenta = z.object({
  propinaTipo: z.enum(['sin_propina', 'porcentaje', 'decidir_en_caja']),
  propinaPorcentaje: z.number().int().min(0).max(100).default(0),
}
```

### `entradaPropinasPendientes`

```ts
export const entradaPropinasPendientes = z.object({
  desde: z.string().min(4).max(40),
  hasta: z.string().min(4).max(40),
  meseroId: identificador.nullish(),
  limite: z.number().int().min(1).max(200).default(50),
}
```

### `entradaPurgarVentas`

```ts
const entradaPurgarVentas = z.object({
  confirmacionNombreNegocio: confirmacion,
  revertirInventario: z.boolean().default(false),
}
```

### `entradaQuitarLinea`

```ts
export const entradaQuitarLinea = z.object({
  ordenId: z.uuid(),
  lineaId: z.uuid(),
}
```

### `entradaRegistrarCompra`

```ts
export const entradaRegistrarCompra = z.object({
  ...cabeceraDeCompra,
  plantillaCompraId: z.uuid().optional(),
  lineas: z.array(lineaDeCompra).min(1).max(MAXIMO_LINEAS_DE_COMPRA),
}
```

### `entradaRegistrarGasto`

```ts
export const entradaRegistrarGasto = z.object({
  fecha: z.iso.date().optional(),
  categoria: categoriaGasto,
  descripcion: z.string().trim().min(2).max(200),
  monto: importePositivo,
  metodoPago,
  esRecurrente: z.boolean().optional(),
  plantillaGastoId: z.uuid().optional(),
  notas: nota.optional(),
}
```

### `entradaResetearDemo`

```ts
export const entradaResetearDemo = z.object({ confirmacion: z.literal('RESETEAR') }
```

### `entradaSeccion`

```ts
const entradaSeccion = z.object({
  seccion: z.enum(SECCIONES),
  confirmacionNombreNegocio: confirmacion,
}
```

### `entradaSolicitarCuenta`

```ts
export const entradaSolicitarCuenta = z.object({
  ordenId: z.uuid(),
  propinaPuntosBase: z.number().int().min(0).max(10_000).optional(),
  propinaTipo: z
    .enum([
      'sin_propina',
      'porcentaje',
      'monto_manual',
      'pendiente',
      'pendiente_cliente',
      'decidir_en_caja',
    ])
    .optional(),
}
```

### `entradaTicket`

```ts
export const entradaTicket = z.object({
  ordenId: z.uuid(),
}
```

### `entradaTransicionarPedido`

```ts
export const entradaTransicionarPedido = z.object({
  comandaId: z.uuid(),
  comandaItemId: z.uuid().optional(),
  estado: z.enum(['en_preparacion', 'listo', 'entregado', 'cancelado']),
}
```

### `entradaUsarPlantillaCompra`

```ts
export const entradaUsarPlantillaCompra = z.object({
  ...cabeceraDeCompra,
  plantillaId: z.uuid(),
}
```

### `entradaVacia`

```ts
const entradaVacia = z.object({}
```

### `entradaVaciarSolicitudes`

```ts
export const entradaVaciarSolicitudes = z.object({}
```

### `entradaValorar`

```ts
export const entradaValorar = z.object({
  score: z.number().int().min(1).max(5),
  comentario: z.string().trim().max(MAXIMO_COMENTARIO).default(''),
}
```

