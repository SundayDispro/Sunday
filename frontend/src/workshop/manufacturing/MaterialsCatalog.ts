// ============================================================================
// Sunday 3D Workshop — Materials Catalog
// Prices in MXN. Realistic for the Mexican market (2024–2025 estimates).
// ============================================================================

import type { MaterialEntry, MaterialCategory } from '../types.ts';

// ---------------------------------------------------------------------------
// Default catalog — Mexican market prices
// ---------------------------------------------------------------------------

export const DEFAULT_MATERIALS: MaterialEntry[] = [
  // ---- Filaments ----
  {
    id: 'mat-pla-1kg',
    name: 'PLA Filament 1.75 mm',
    category: 'filamento',
    unit: 'kg',
    pricePerUnit: 350,
    density: 1.24,
    color: '#ffffff',
  },
  {
    id: 'mat-petg-1kg',
    name: 'PETG Filament 1.75 mm',
    category: 'filamento',
    unit: 'kg',
    pricePerUnit: 420,
    density: 1.27,
    color: '#ffffff',
  },
  {
    id: 'mat-abs-1kg',
    name: 'ABS Filament 1.75 mm',
    category: 'filamento',
    unit: 'kg',
    pricePerUnit: 380,
    density: 1.04,
    color: '#ffffff',
  },
  // ---- Sheets ----
  {
    id: 'mat-acrylic-3mm',
    name: 'Acrílico transparente 3 mm',
    category: 'acrilico',
    unit: 'm²',
    pricePerUnit: 850,
    density: 1.18,
    thickness: 3,
  },
  {
    id: 'mat-acrylic-5mm',
    name: 'Acrílico transparente 5 mm',
    category: 'acrilico',
    unit: 'm²',
    pricePerUnit: 1350,
    density: 1.18,
    thickness: 5,
  },
  {
    id: 'mat-acrylic-6mm',
    name: 'Acrílico transparente 6 mm',
    category: 'acrilico',
    unit: 'm²',
    pricePerUnit: 1600,
    density: 1.18,
    thickness: 6,
  },
  {
    id: 'mat-pvc-foam-3mm',
    name: 'PVC Foam Board (Sintra) 3 mm',
    category: 'pvc',
    unit: 'm²',
    pricePerUnit: 320,
    density: 0.55,
    thickness: 3,
  },
  {
    id: 'mat-acm-3mm',
    name: 'Aluminio Compuesto (ACM) 3 mm',
    category: 'otro',
    unit: 'm²',
    pricePerUnit: 750,
    density: 1.5,
    thickness: 3,
  },
  // ---- Adhesives ----
  {
    id: 'mat-vinyl-adhesive',
    name: 'Vinil adhesivo impreso',
    category: 'adhesivo',
    unit: 'm²',
    pricePerUnit: 280,
  },
  {
    id: 'mat-silicone-adhesive',
    name: 'Silicón para LED (tubo 280 ml)',
    category: 'adhesivo',
    unit: 'pz',
    pricePerUnit: 85,
  },
  {
    id: 'mat-double-sided-tape',
    name: 'Cinta doble cara VHB 12 mm × 33 m',
    category: 'adhesivo',
    unit: 'rollo',
    pricePerUnit: 180,
  },
];

// ---------------------------------------------------------------------------
// MaterialsCatalog class
// ---------------------------------------------------------------------------

export class MaterialsCatalog {
  private items: MaterialEntry[];

  constructor(initialItems?: MaterialEntry[]) {
    this.items = initialItems
      ? initialItems.map((m) => ({ ...m }))
      : DEFAULT_MATERIALS.map((m) => ({ ...m }));
  }

  // ---- CRUD ----

  getAll(): MaterialEntry[] {
    return this.items.map((m) => ({ ...m }));
  }

  getById(id: string): MaterialEntry | undefined {
    const found = this.items.find((m) => m.id === id);
    return found ? { ...found } : undefined;
  }

  getByCategory(category: MaterialCategory): MaterialEntry[] {
    return this.items.filter((m) => m.category === category).map((m) => ({ ...m }));
  }

  add(entry: MaterialEntry): void {
    if (this.items.some((m) => m.id === entry.id)) {
      throw new Error(`Material with id "${entry.id}" already exists.`);
    }
    this.items.push({ ...entry });
  }

  update(id: string, updates: Partial<Omit<MaterialEntry, 'id'>>): void {
    const idx = this.items.findIndex((m) => m.id === id);
    if (idx === -1) throw new Error(`Material "${id}" not found.`);
    this.items[idx] = { ...this.items[idx], ...updates, id };
  }

  /** Update only the unit price of a material (MXN). */
  updatePrice(id: string, pricePerUnit: number): void {
    this.update(id, { pricePerUnit });
  }

  remove(id: string): boolean {
    const idx = this.items.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  // ---- Serialization ----

  serialize(): MaterialEntry[] {
    return this.getAll();
  }

  static deserialize(data: MaterialEntry[]): MaterialsCatalog {
    return new MaterialsCatalog(data);
  }

  /** Reset to default catalog. */
  resetDefaults(): void {
    this.items = DEFAULT_MATERIALS.map((m) => ({ ...m }));
  }
}
