import type { User } from '../types';

export type Action =
  | 'billing.view'
  | 'board.delete'
  | 'group.delete'
  | 'column.delete'
  | 'item.delete';

/**
 * Frontend guard (UX): el backend es la fuente de verdad.
 * Esta función solo controla visibilidad/UX para reducir confusión y tentación.
 */
export function can(user: User | null | undefined, action: Action): boolean {
  const role = user?.role;
  if (!role) return false;
  if (role === 'ADMIN') return true;

  switch (action) {
    case 'billing.view':
      return role === 'VENTAS';

    // Destructivos (alineado con hardening backend actual: deletes estrictos)
    case 'board.delete':
    case 'group.delete':
    case 'column.delete':
      return false;

    case 'item.delete':
      return role === 'VENTAS';

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

