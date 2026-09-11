import { redirect } from 'next/navigation';

/**
 * `/corte-caja` quedó deprecada en su propio sistema: «toda la lógica vive
 * ahora en /caja». Su `App.jsx` la resolvía con un `<Navigate to="/caja" />`;
 * aquí es una redirección de servidor, que además no gasta un render.
 */
export default function CorteCajaDeprecada(): never {
  redirect('/caja');
}
