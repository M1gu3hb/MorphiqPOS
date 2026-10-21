# Morphiq POS · objetivo vigente del sistema maestro

Aclaración expresa de Miguel, 19/20 de octubre de 2026. A-52 / D-42 prevalecen
sobre cualquier planeación anterior contradictoria.

Morphiq POS pertenece a Miguel y su equipo. Es un punto de venta completo para mostrar
operaciones reales desde navegador, teléfono y tablet, y una base de desarrollo para
entregar sistemas personalizados. No es un SaaS compartido entre sus clientes.

## Recorrido

1. Abrir el enlace central → login por cuenta y PIN.
2. Equipo Morphiq → cuenta personal de dueño general → dashboard.
3. Modelos de negocio, en Configuración → Presentación (ya no en el menú lateral, D-52) → verificar
   el PIN del dueño general → cambiar de giro sin otra dirección, nueva cuenta o despliegue.
4. Recorrer todas las pantallas autorizadas del modelo. Restaurante tiene dashboard,
   mesas, cocina, caja, inventario, gestión, distribución de mesas y apariencia.
5. Salir → mismo login central → elegir un modelo y su usuario de operación para demostrar
   mesero, cocina, caja u otro puesto. El puesto conserva permisos limitados en servidor.
6. Restaurante: un solo restaurante visible, «Restaurante MH» (D-52). En Configuración →
   Presentación, debajo del selector, el switch «Modo presentación al cliente» (D-54):
   apagado, Miguel opera con sus datos; encendido, todo el personal entra con su PIN de
   siempre a un contexto aparte con treinta días de historial, y al apagarlo sus datos vuelven
   tal cual.

Hoy sólo se creó la cuenta nueva de Miguel solicitada. Cada integrante futuro tendrá
su propia credencial y concesión general. Los PIN no se documentan en el repositorio.

Los contextos de datos internos permiten cambiar de demostración sin mezclar stock,
caja o ventas. Esa separación técnica no implica un producto SaaS ni direcciones
obligatorias por cliente. Un dueño general puede recorrer los destinos concedidos que
sirve el despliegue; los administradores de un modelo no heredan ese acceso general.

## Entrega de un proyecto de cliente

Se abre un repositorio y proyecto independientes. Se extraen/copían las piezas del
modelo elegido, el núcleo común y funciones útiles de otros giros. Se adaptan diseño,
operación y requerimientos específicos, y se desarrollan las piezas que falten.

La extracción debe incluir dependencias, contratos, migraciones, permisos, configuración
sin secretos, pruebas y documentación de las funciones elegidas. No debe llevar datos
operativos ni credenciales de otro negocio. Registrar el commit de origen permite
rastrear correcciones y decidir qué mejoras genéricas vuelven al maestro.

Se permite usar paquetes versionados cuando convenga. No se exige un registro de paquetes,
no se prohíbe copiar código y no se construye un generador antes de que sea necesario.
Las reglas de seguridad, transacciones, exactitud del dinero y permisos siguen vigentes.
La evidencia histórica de sistemas externos sigue siendo evidencia: esta autorización
se refiere a reutilizar las piezas propias del Master POS en proyectos de Morphiq.

## Prioridad inmediata

Restaurante presentable y utilizable para el 21 de octubre: entrada confiable, dueño
con dashboard y todas sus pantallas, navegación clara por puesto, mapa configurable con
estados distinguibles y acceso visible a los ocho estilos existentes. Cerrar su jornada
operativa real y reportar fallos sin convertir un build exitoso en certificación del producto.
