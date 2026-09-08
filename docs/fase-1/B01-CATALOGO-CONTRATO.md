# B-01 · Contrato de catálogo para ambos carriles

Estado: implementación y pruebas verificadas; cierre PRS pendiente. Ruta real del
monorepo: `packages/domain/src/catalogo/` (se conserva el `src` existente).

## Consumir desde el servidor

```ts
import { precioDeLinea } from '@morphiqpos/domain/catalogo';
import { centavos } from '@morphiqpos/domain/dinero';

const resultado = precioDeLinea(
  {
    tipoVenta: 'variable_medida',
    unidadVariable: 'kg',
    precioCentavos: centavos(18990),
    minimo: '0.1',
    maximo: '5',
    incremento: '0.05',
  },
  { cantidad: '250', unidad: 'g' },
);
// subtotalCentavos = 4748n; precioUnitarioCentavos = 18990n; esMayoreo = false.
```

El primer argumento proviene del catálogo vigente cargado por el servidor. El
segundo contiene únicamente cantidad y unidad. El comando del carril A debe
comprobar sesión, organización, producto activo, rol y paquete antes de llamar al
dominio. Esta función pura no sustituye esos controles ni protege un endpoint.

| Tipo                 | Campo SQL que alimenta `precioCentavos` | Unidad de la captura            |
| -------------------- | --------------------------------------- | ------------------------------- |
| `precio_fijo`        | `precio_venta_centavos`                 | Compatible con `unidadVenta`    |
| `variable_medida`    | `precio_por_unidad_variable_centavos`   | Compatible con `unidadVariable` |
| `porcion_contenedor` | `precio_por_porcion_centavos`           | `porcion`, cantidad entera      |
| `servicio`           | `precio_venta_centavos`                 | Compatible con `unidadVenta`    |

`subtotalCentavos` es mercancía, antes de impuestos, descuentos y modificadores.
Esos conceptos permanecen en la cotización del carril A. El tercer argumento,
`mayoreoActivo`, lo obtiene el servidor de la configuración; por omisión es falso.
El umbral se compara en la unidad del precio, después de convertir la captura.
No se agrupan distintas líneas aquí: el comando decide la cantidad cotizada.

## Cantidades y conversiones

- `cantidad('1.2345')` representa 12345 diezmilésimas mediante `bigint` con marca.
- `cantidadATexto` devuelve un decimal canónico, apto para columnas `numeric(14,4)`.
- Rango: cero a 9999999999.9999; la venta exige una cantidad positiva.
- Se rechaza la pérdida de precisión de inventario, no se redondea silenciosamente.
- `convertirUnidad(cantidad('3'), 'caja', 'pieza', '24')` devuelve 72 piezas.
  La equivalencia debe venir del catálogo; no hay contenido supuesto por empaque.
- Los alias se normalizan a `kg`, `g`, `l`, `ml`, `m`, `pieza`, `caja`, `paquete`.
  Las unidades personalizadas sin definición son rechazadas.
- `calcularMlPorPorcion` utiliza los ml explícitos o deriva capacidad/porciones.
  Si la división no cabe exactamente en cuatro decimales, exige una medida explícita.
- Los incrementos se interpretan como múltiplos desde cero, en la unidad del precio.
- Precios y cantidades cero no son lo mismo: precio cero explícito es válido;
  cantidad cero no lo es. El esquema vigente permite productos gratuitos.

## Evidencia y continuidad

Se leyeron las tres utilidades de catálogo del restaurante y los usos de unidades
y mayoreo de la tienda como especificación; se escribió TypeScript nuevo.

```sh
pnpm test:unit packages/domain/src/catalogo
node scripts/verificar-catalogo-codex.mjs
pnpm --filter @morphiqpos/domain typecheck
```

Resultado: 62 pruebas de catálogo y 18 mutaciones detectadas. Se verificó que las
pruebas fallaran antes de implementar y que la versión restaurada volviera a verde.
`consumo.ts` y `stock.ts` aún no se entregan: B-02 y B-03 siguen pendientes.
