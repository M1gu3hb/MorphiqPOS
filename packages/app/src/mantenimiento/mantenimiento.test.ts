import { describe, expect, it } from 'vitest';

import {
  purgarSeccionDelHistorico,
  purgarVentas,
  reiniciarPruebas,
  reiniciarTodo,
  vaciarMesas,
} from './comandos.ts';
import { claveDeTexto } from './confirmacion.ts';
import { SECCIONES_DEL_HISTORICO, TABLAS_DEL_CATALOGO, TABLAS_POR_SECCION } from './purgas.ts';

/**
 * Las pruebas del mantenimiento destructivo (F1-02 E10-4).
 *
 * Lo que se afirma aquí NO es que borre bien —eso necesita base y vive en las
 * de integración—: es que NO SE PUEDE AUTORIZAR DESDE EL CUERPO, que es el
 * defecto que estas seis rutas existen para cerrar.
 */

const LOS_SEIS = [
  vaciarMesas,
  purgarSeccionDelHistorico,
  purgarVentas,
  reiniciarPruebas,
  reiniciarTodo,
];

/** Las claves que un comando jamás puede aceptar del cliente (R16). */
const CLAVES_DE_AMBITO = [
  'rol',
  'posRol',
  'organizacion_id',
  'organizacionId',
  'sucursal_id',
  'sucursalId',
  'empleo_id',
  'empleoId',
  'identidad_id',
  'identidadId',
  'terminal_id',
  'terminalId',
  'usuario',
  'user',
];

describe('la autorización no puede venir del cuerpo', () => {
  it('ningún comando de mantenimiento acepta un rol ni un ámbito', () => {
    for (const comando of LOS_SEIS) {
      // Se prueba sobre el esquema REAL, parseando: si algún día alguien añade
      // `rol` a la entrada, `definirComando` ni siquiera dejaría cargar el
      // módulo — pero esta prueba lo dice con el nombre del comando delante.
      for (const clave of CLAVES_DE_AMBITO) {
        const conAtaque: Record<string, unknown> = {
          confirmacionNombreNegocio: 'lo que sea',
          seccion: 'ventas',
          [clave]: 'administrador',
        };
        const resultado = comando.entrada.safeParse(conAtaque);
        if (!resultado.success) continue;
        expect(
          Object.keys(resultado.data as Record<string, unknown>),
          `${comando.nombre} deja pasar «${clave}» del cuerpo`,
        ).not.toContain(clave);
      }
    }
  });

  it('las cinco irreversibles exigen DUEÑO, no administrador', () => {
    // `puente/roles.ts` traduce dueno, administrador Y gerente al
    // «administrador» de su interfaz. Si estas aceptaran `administrador`, un
    // gerente podría borrar el negocio y su pantalla le enseñaría el botón.
    for (const comando of [
      purgarSeccionDelHistorico,
      purgarVentas,
      reiniciarPruebas,
      reiniciarTodo,
    ]) {
      expect(comando.roles, comando.nombre).toEqual(['dueno']);
    }
  });

  it('las reversibles admiten administrador, y ninguna admite mesero ni cocina', () => {
    expect(vaciarMesas.roles).toContain('administrador');
    for (const comando of LOS_SEIS) {
      expect(comando.roles, comando.nombre).not.toContain('mesero');
      expect(comando.roles, comando.nombre).not.toContain('cocina');
      expect(comando.roles, comando.nombre).not.toContain('cajero');
    }
  });

  it('las cinco escriben, y por tanto exigen clave de idempotencia', () => {
    // `comando()` rechaza toda escritura sin clave de ocho caracteres o más.
    // En `purgar_ventas` no es burocracia: sin ella un reintento de red suma el
    // stock DOS VECES, que es lo que hacía `limpiarVentas`.
    for (const comando of LOS_SEIS) expect(comando.escribe, comando.nombre).toBe(true);
  });
});

describe('la confirmación por nombre del negocio', () => {
  it('no exige acentos ni mayúsculas exactos', () => {
    // Exigir «Café Jacarandá» con el acento correcto convierte una medida de
    // seguridad en una trampa de ortografía, y la gente acaba copiando y
    // pegando, que es justo lo que la anula.
    expect(claveDeTexto('Café Jacarandá')).toBe(claveDeTexto('cafe jacaranda'));
    expect(claveDeTexto('  Restaurante   MH  ')).toBe(claveDeTexto('restaurante mh'));
  });

  it('sí distingue nombres distintos', () => {
    expect(claveDeTexto('Restaurante MH')).not.toBe(claveDeTexto('Restaurante MG'));
    expect(claveDeTexto('Café')).not.toBe(claveDeTexto('Cafés'));
  });

  it('las palabras públicas de su sistema ya no confirman nada', () => {
    // `BORRAR TODO`, `BORRAR PRUEBAS`, `ELIMINAR` y `LIMPIAR` estaban impresas
    // en la propia pantalla. Que no coincidan con un nombre de negocio real es
    // el punto: el atacante las lee del HTML, el nombre no.
    for (const publica of ['BORRAR TODO', 'BORRAR PRUEBAS', 'ELIMINAR', 'LIMPIAR']) {
      expect(claveDeTexto(publica)).not.toBe(claveDeTexto('Restaurante MH'));
    }
  });

  it('las cuatro irreversibles la exigen en su esquema', () => {
    for (const comando of [
      purgarSeccionDelHistorico,
      purgarVentas,
      reiniciarPruebas,
      reiniciarTodo,
    ]) {
      const sinConfirmar = comando.entrada.safeParse({ seccion: 'ventas' });
      expect(sinConfirmar.success, `${comando.nombre} se ejecuta sin confirmar`).toBe(false);
    }
  });

  it('vaciar mesas NO la exige: es reversible', () => {
    // Borrado suave y con negativa si hay venta abierta. Pedir el nombre del
    // negocio para algo que se deshace desactiva la señal: si todo pide lo
    // mismo, el aviso deja de significar «esto no se deshace».
    expect(vaciarMesas.entrada.safeParse({}).success).toBe(true);
  });
});

describe('qué borra cada sección', () => {
  it('los hijos van antes que los padres', () => {
    // Un orden mal puesto ya no borra a medias: la llave foránea `restrict`
    // aborta la transacción entera. Pero fallar siempre tampoco sirve.
    const ventas = TABLAS_POR_SECCION.ventas;
    expect(ventas.indexOf('orden_lineas')).toBeLessThan(ventas.indexOf('ordenes'));
    expect(ventas.indexOf('comanda_items')).toBeLessThan(ventas.indexOf('comandas'));
    expect(ventas.indexOf('pagos')).toBeLessThan(ventas.indexOf('ordenes'));
    const compras = TABLAS_POR_SECCION.compras;
    expect(compras.indexOf('compra_lineas')).toBeLessThan(compras.indexOf('compras'));
    const cortes = TABLAS_POR_SECCION.cortes;
    expect(cortes.indexOf('cortes_turno')).toBeLessThan(cortes.indexOf('sesiones_caja'));
  });

  it('el histórico cubre las cinco secciones', () => {
    expect([...SECCIONES_DEL_HISTORICO].sort()).toEqual(
      ['compras', 'cortes', 'gastos', 'movimientos', 'ventas'].sort(),
    );
  });

  it('el catálogo NO se lleva la estación de preparación', () => {
    // La estación general (`es_general`) es el respaldo obligatorio de la regla
    // 10, y la base impide desactivarla. Borrarla dejaría al restaurante sin
    // sitio al que mandar la primera comanda.
    expect(TABLAS_DEL_CATALOGO).not.toContain('estaciones_preparacion');
  });

  it('el catálogo trata igual a las dos plantillas', () => {
    // Su `reiniciarSistema` borraba `PlantillaCompra` y se olvidaba de
    // `PlantillaGasto`. La asimetría no respondía a ninguna razón.
    expect(TABLAS_DEL_CATALOGO).toContain('plantillas_compra');
    expect(TABLAS_DEL_CATALOGO).toContain('plantillas_gasto');
  });

  it('el catálogo NO toca personas, empleos ni credenciales', () => {
    // Quien ejecuta tiene sesión, luego existe. Y su `reiniciarSistema` creaba
    // un administrador con PIN `1234` cuando el padrón quedaba vacío: una
    // puerta abierta con contraseña conocida justo después de borrar todo.
    for (const prohibida of [
      'personas',
      'empleos',
      'identidades',
      'credenciales_pin',
      'organizaciones',
      'sucursales',
      'auditoria',
    ]) {
      expect(TABLAS_DEL_CATALOGO, prohibida).not.toContain(prohibida);
    }
  });

  it('ninguna purga toca la auditoría', () => {
    // Es lo único que queda cuando alguien borra el negocio: quién lo hizo.
    for (const tablas of Object.values(TABLAS_POR_SECCION)) {
      expect(tablas).not.toContain('auditoria');
      expect(tablas).not.toContain('comandos_ejecutados');
    }
  });
});
