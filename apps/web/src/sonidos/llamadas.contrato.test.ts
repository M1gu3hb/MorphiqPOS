import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DP-11.3 · CONTRATO: LOS MOMENTOS QUE EL DOM NO DICE, SONANDO DONDE TOCA.
 *
 * El oyente único cubre los toques, las pestañas, los interruptores, los diálogos y los avisos.
 * Lo demás —un cobro hecho, un pedido que llegó a cocina, el ticket— lo pide cada pantalla con
 * `sonar(…)`, y casi nada de eso se puede recorrer en el navegador en cada vuelta (cobrar exige
 * caja abierta, turno y fondo). Este contrato lee el código y exige cada llamada en su lugar: en
 * el camino del ÉXITO (después del aviso o del comando que lo confirma), no en el clic.
 */

const WEB = join(__dirname, '..', '..');

function fuente(ruta: string): string {
  return readFileSync(join(WEB, ruta), 'utf8');
}

/** `antes` y luego, a menos de `distancia` caracteres, `despues`. */
function seguido(texto: string, antes: RegExp, despues: string, distancia = 240): boolean {
  for (const encontrado of texto.matchAll(new RegExp(antes.source, 'g'))) {
    const desde = (encontrado.index ?? 0) + encontrado[0].length;
    if (texto.slice(desde, desde + distancia).includes(despues)) return true;
  }
  return false;
}

interface Llamada {
  readonly archivo: string;
  readonly que: string;
  /** Lo que confirma el éxito y va justo antes de la llamada. */
  readonly tras: RegExp;
  readonly llamada: string;
}

const LLAMADAS: readonly Llamada[] = [
  {
    archivo: 'heredado/pages/Caja.jsx',
    que: 'el cobro en Caja, tras «¡Venta cobrada!»',
    tras: /toast\.success\(`¡Venta cobrada!/,
    llamada: "sonar('cobro')",
  },
  {
    archivo: 'heredado/pages/Caja.jsx',
    que: 'el ticket en Caja, antes de imprimir',
    tras: /try \{\s*/,
    llamada: "sonar('ticket');\n                  printDocument(",
  },
  {
    archivo: 'heredado/pages/POS.jsx',
    que: 'el cobro en el POS, tras su aviso',
    tras: /cobrada: \$\{formatCurrency/,
    llamada: "sonar('cobro')",
  },
  {
    archivo: 'heredado/pages/POS.jsx',
    que: 'agregar en el POS, tras recargar el carrito',
    tras: /await refrescarCarrito\(\);\s*/,
    llamada: "sonar('agregar')",
  },
  {
    archivo: 'heredado/pages/POS.jsx',
    que: 'quitar en el POS, tras recargar el carrito',
    tras: /await refrescarCarrito\(\);\s*/,
    llamada: "sonar('quitar')",
  },
  {
    archivo: 'heredado/pages/Mesero.jsx',
    que: 'enviar a cocina, tras «¡Pedido enviado a cocina!»',
    tras: /toast\.success\('¡Pedido enviado a cocina!'\);\s*/,
    llamada: "sonar('enviarACocina')",
  },
  {
    archivo: 'heredado/pages/Mesero.jsx',
    que: 'la precuenta impresa',
    tras: /sonar\('ticket'\);\s*/,
    llamada: 'printDocument(',
  },
  {
    archivo: 'heredado/pages/Cocina.jsx',
    que: 'la comanda lista, tras «¡Pedido listo!»',
    tras: /toast\.success\('¡Pedido listo!'\);\s*/,
    llamada: "sonar('comandaLista')",
  },
  {
    archivo: 'heredado/components/tickets/TicketViewerDialog.jsx',
    que: 'el ticket del visor',
    tras: /sonar\('ticket'\);\s*/,
    llamada: 'printDocument(',
  },
  {
    archivo: 'heredado/components/mesero/SolicitudesQRCardList.jsx',
    que: 'la solicitud atendida (tarjetas del mesero)',
    tras: /toast\.success\('Solicitud actualizada'\);\s*/,
    llamada: "if (accionTipo === 'atender') sonar('solicitudAtendida')",
  },
  {
    archivo: 'heredado/components/portalqr/SolicitudesQRTab.jsx',
    que: 'la solicitud atendida (portal QR)',
    tras: /toast\.success\('Solicitud actualizada'\);\s*/,
    llamada: "if (accionTipo === 'atender') sonar('solicitudAtendida')",
  },
  {
    archivo: 'heredado/pages/POSLogin.jsx',
    que: 'entrar con PIN: suena ANTES de cambiar la sesión (si no, navega dos veces)',
    tras: /await sonarAntesDeIrse\('entrar'\);\s*/,
    llamada: 'entrandoConPin.current = true;\n      login(entrado);',
  },
  {
    archivo: 'heredado/lib/POSAuthContext.jsx',
    que: 'salir: tras cerrar la sesión en el servidor, ANTES de soltarla en la pantalla',
    tras: /await sonarAntesDeIrse\('salir'\);\s*/,
    llamada: 'version.current += 1;\n    setSesion((n) => n + 1);\n    setPosUser(null);',
  },
  {
    archivo: 'src/restaurante/AccesoPorPin.tsx',
    que: 'entrar con PIN en el acceso nuevo, antes de recargar',
    tras: /await sonarAntesDeIrse\('entrar'\);[\s\S]{0,200}?/,
    llamada: "window.location.assign('/')",
  },
  {
    archivo: 'src/restaurante/Cobro.tsx',
    que: 'el cobro en la pantalla nueva, tras el comando',
    tras: /setCambio\(Number\(hecho\.cambioCentavos\)\);\s*/,
    llamada: "sonar('cobro')",
  },
  {
    archivo: 'src/restaurante/MesaActiva.tsx',
    que: 'enviar a cocina en la mesa activa, tras el comando',
    tras: /await invocarComando\('\/api\/restaurante\/enviar-pedido'[^;]*;\s*/,
    llamada: "sonar('enviarACocina')",
  },
  {
    archivo: 'src/restaurante/Cocina.tsx',
    que: 'la comanda lista en la cocina nueva, tras el comando',
    tras: /await invocarComando\(RUTA_TRANSICION[^;]*;\s*/,
    llamada: "if (destino === 'listo') sonar('comandaLista')",
  },
  {
    archivo: 'src/restaurante/atender-solicitud.ts',
    que: 'la solicitud atendida (globo y vista Solicitudes), tras el comando',
    tras: /estado: 'atendida' \}\);\s*/,
    llamada: "sonar('solicitudAtendida')",
  },
  {
    archivo: 'src/espera/PantallaDeEspera.tsx',
    que: 'despertar al TOCAR (no con un aviso)',
    tras: /const tocar = \(\): void => \{[\s\S]{0,200}?/,
    llamada: "if (!despertando) sonar('despertar')",
  },
  {
    archivo: 'src/espera/ModoEspera.tsx',
    que: 'dormir al pasar a «dormida»',
    tras: /antes !== 'dormida' && fase === 'dormida'\)\s*/,
    llamada: "sonar('dormir')",
  },
];

const TECLADOS = [
  'heredado/pages/POSLogin.jsx',
  'src/restaurante/AccesoPorPin.tsx',
  'src/espera/PedirPinAlDespertar.tsx',
] as const;

describe('las llamadas a `sonar` de cada pantalla', () => {
  for (const { archivo, que, tras, llamada } of LLAMADAS) {
    it(que, () => {
      expect(seguido(fuente(archivo), tras, llamada), `${archivo}: falta ${llamada}`).toBe(true);
    });
  }

  it('agregar suena en los tres caminos del mesero (directo, cantidad variable y personalizado)', () => {
    const mesero = fuente('heredado/pages/Mesero.jsx');
    expect(mesero.match(/sonar\('agregar'\);\n\s*setCarrito\(/g)?.length).toBe(3);
  });

  it('agregar suena en los dos caminos del POS (el producto y el de cantidad variable)', () => {
    const pos = fuente('heredado/pages/POS.jsx');
    expect(pos.match(/await refrescarCarrito\(\);\s*sonar\('agregar'\);/g)?.length).toBe(2);
  });

  it('los teclados de PIN suenan con el sonido de teclado del negocio', () => {
    for (const archivo of TECLADOS)
      expect(fuente(archivo), archivo).toMatch(/data-sonido=(?:"tecla"|\{[^}]*'tecla'[^}]*\})/);
  });
});
