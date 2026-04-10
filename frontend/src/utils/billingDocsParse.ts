/** Valor almacenado en columna tipo billing_docs (JSON). Soporta un documento legacy o varios. */

export type BillingDocEntry = { id: string; url: string; label: string };

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function parseBillingDocsEntries(raw: string | undefined | null): BillingDocEntry[] {
  const s = raw?.trim() ?? '';
  if (!s) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch {
    if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/')) {
      return [{ id: newId(), url: s, label: 'Documento' }];
    }
    return [];
  }

  if (typeof parsed === 'string') {
    const url = parsed.trim();
    return url ? [{ id: newId(), url, label: 'Documento' }] : [];
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj.docs)) {
    const out: BillingDocEntry[] = [];
    for (const row of obj.docs) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      const r = row as Record<string, unknown>;
      const url = typeof r.url === 'string' ? r.url.trim() : '';
      if (!url) continue;
      const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : newId();
      const label =
        (typeof r.label === 'string' && r.label.trim()) ||
        (typeof r.name === 'string' && r.name.trim()) ||
        'Documento';
      out.push({ id, url, label });
    }
    return out;
  }

  const url = typeof obj.url === 'string' ? obj.url.trim() : '';
  if (!url) return [];
  const label =
    (typeof obj.label === 'string' && obj.label.trim()) ||
    (typeof obj.name === 'string' && obj.name.trim()) ||
    'Documento de facturación';
  return [{ id: newId(), url, label }];
}

export function serializeBillingDocsEntries(docs: BillingDocEntry[]): string {
  const clean = docs
    .filter((d) => d.url.trim())
    .map((d) => ({ id: d.id, url: d.url.trim(), label: d.label.trim() || 'Documento' }));
  return JSON.stringify({ docs: clean });
}

/** Compat: primer doc o null (p. ej. resúmenes que solo necesitan un enlace). */
export function firstBillingDoc(raw: string | undefined | null): BillingDocEntry | null {
  const list = parseBillingDocsEntries(raw);
  return list[0] ?? null;
}
