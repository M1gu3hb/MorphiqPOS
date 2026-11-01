import { expect, type Page, type Response } from '@playwright/test';

/**
 * ENVIAR EL PEDIDO DE LA MESA desde un teléfono (DP-9.5): abre «Pedido de la mesa», toca
 * «Enviar a cocina» y, si la mesa es de dos o más —el aviso «Esperen a que todos…» está a la
 * vista—, confirma «¿Ya pidieron todos?». Devuelve la respuesta del envío.
 */
export async function enviarElPedidoDeLaMesa(telefono: Page, token: string): Promise<Response> {
  await telefono.getByRole('button', { name: /^Pedido de la mesa/ }).click();
  const hoja = telefono.getByRole('dialog', { name: 'El pedido de la mesa' });
  await expect(hoja).toBeVisible();
  const hayQueConfirmar = await hoja.getByText('Esperen a que todos agreguen').isVisible();
  const enviado = telefono.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === `/api/publico/qr/${token}/carrito/enviar` &&
      r.request().method() === 'POST',
  );
  await hoja.getByRole('button', { name: 'Enviar a cocina' }).click();
  if (hayQueConfirmar) {
    const confirmar = telefono.getByRole('alertdialog', { name: '¿Ya pidieron todos?' });
    await confirmar.getByRole('button', { name: 'Enviar', exact: true }).click();
  }
  return enviado;
}
