import type { ReactNode } from 'react';

/**
 * Portado de `historico/restaurante/src/components/common/PageHeader.jsx`.
 * Sin cambios: mismo `text-2xl font-heading font-bold`, mismo `mb-6`.
 */
interface Props {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export default function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">{title}</h1>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
