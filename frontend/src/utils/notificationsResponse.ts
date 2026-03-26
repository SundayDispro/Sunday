/**
 * Normaliza la respuesta de GET /api/notifications tras el cambio a forma paginada
 * `{ items, hasMore, nextSkip }` (el shape antiguo era un array plano).
 */
export type NotificationsPagePayload = {
  items: unknown[];
  hasMore: boolean;
  nextSkip: number;
};

export function parseNotificationsListPayload(
  data: unknown,
  fallbackSkip: number
): NotificationsPagePayload {
  if (Array.isArray(data)) {
    return {
      items: data,
      hasMore: false,
      nextSkip: fallbackSkip + data.length,
    };
  }
  if (data && typeof data === 'object' && 'items' in data) {
    const o = data as { items?: unknown; hasMore?: unknown; nextSkip?: unknown };
    const items = Array.isArray(o.items) ? o.items : [];
    const hasMore = Boolean(o.hasMore);
    const nextSkip =
      typeof o.nextSkip === 'number' && Number.isFinite(o.nextSkip)
        ? o.nextSkip
        : fallbackSkip + items.length;
    return { items, hasMore, nextSkip };
  }
  return { items: [], hasMore: false, nextSkip: fallbackSkip };
}
