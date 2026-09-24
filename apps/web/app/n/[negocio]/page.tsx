import { rutaDeEntrada, slugValido } from '@morphiqpos/app/negocio';
import { notFound, redirect } from 'next/navigation';

/**
 * `/n/<slug>` a secas lleva a la entrada de ese negocio. Quien decide si se sirve es la
 * entrada misma (404 si no), para que la regla viva en un solo sitio.
 */
export default async function Pagina({ params }: { params: Promise<{ negocio: string }> }) {
  const slug = slugValido((await params).negocio);
  if (slug === null) notFound();
  redirect(rutaDeEntrada(slug));
}
