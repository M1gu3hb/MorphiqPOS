import { PackageOpen, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Portado de `historico/restaurante/src/components/common/EmptyState.jsx`.
 * Sin cambios.
 */
interface Props {
  readonly icon?: LucideIcon;
  readonly title?: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export default function EmptyState({
  icon: Icon = PackageOpen,
  title = 'Sin datos',
  description = '',
  action,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-heading font-semibold text-foreground mb-1">{title}</h3>
      {description !== '' && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
