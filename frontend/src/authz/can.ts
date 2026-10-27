import type { User } from '../types';

export type Action =
  | 'billing.view'
  | 'board.create'
  | 'board.delete'
  | 'group.delete'
  | 'column.delete'
  | 'item.delete'
  | 'workshop.access';

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

    // Taller 3D: mismos roles que el backend. TALLER queda fuera a propósito.
    case 'workshop.access':
      return role === 'ADMIN' || role === 'VENTAS' || role === 'DISENO' || role === 'USER';

    // POST /api/boards — mismo conjunto que el backend.
    case 'board.create':
      return role === 'VENTAS';

    // Misma capacidad de edición de tablero que add_group / rename_group (socket BOARD_EDIT_ROLES).
    case 'group.delete':
      return role === 'VENTAS' || role === 'DISENO' || role === 'USER' || role === 'TALLER';

    // Destructivos globales del tablero / columnas: solo ADMIN en backend.
    case 'board.delete':
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

