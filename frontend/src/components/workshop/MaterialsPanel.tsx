// ============================================================================
// Sunday 3D Workshop — Materials & Components Catalog Panel
// Editable unit prices, densities, categories & inventory status (MXN)
// ============================================================================

import React, { useState } from 'react';
import { Package, Search, Plus, Check, Edit2 } from 'lucide-react';
import { MaterialsCatalog, DEFAULT_MATERIALS } from '../../workshop/manufacturing/MaterialsCatalog';
import { MaterialEntry } from '../../workshop/types';

export function MaterialsPanel() {
  const [catalog] = useState<MaterialsCatalog>(() => new MaterialsCatalog(DEFAULT_MATERIALS));
  const [materials, setMaterials] = useState<MaterialEntry[]>(() => catalog.getAll());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<number>(0);

  const categories = [
    { id: 'all', label: 'Todos' },
    { id: 'filamento', label: 'Filamentos' },
    { id: 'acrilico', label: 'Acrílicos' },
    { id: 'pvc', label: 'PVC y Espumados' },
    { id: 'adhesivo', label: 'Vinil y Adhesivos' },
    { id: 'otro', label: 'Otros' },
  ];

  const filtered = materials.filter((m) => {
    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleStartEdit = (m: MaterialEntry) => {
    setEditingId(m.id);
    setPriceDraft(m.pricePerUnit);
  };

  const handleSavePrice = (id: string) => {
    catalog.updatePrice(id, priceDraft);
    setMaterials([...catalog.getAll()]);
    setEditingId(null);
  };

  return (
    <div className="w-80 border-l border-monday-border bg-monday-surface p-4 flex flex-col h-full select-none text-[13px] text-monday-text overflow-y-auto space-y-4">
      <div className="flex items-center gap-2 border-b border-monday-border pb-2.5">
        <Package size={18} className="text-monday-blue" />
        <span className="font-semibold text-[13px] uppercase tracking-wider">
          Catálogo de Materiales
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-monday-subtext" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar material..."
          className="w-full pl-8 pr-2.5 py-1.5 rounded-monday border border-monday-border bg-monday-bg text-[12px] outline-none"
        />
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={`px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
              selectedCategory === c.id
                ? 'bg-monday-blue text-white'
                : 'bg-monday-bg text-monday-subtext hover:text-monday-text'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-1.5 flex-1">
        {filtered.map((mat) => {
          const isEditing = editingId === mat.id;

          return (
            <div
              key={mat.id}
              className="p-2.5 rounded-monday border border-monday-border bg-monday-bg hover:border-monday-blue transition-colors flex items-center justify-between"
            >
              <div className="min-w-0 pr-2">
                <div className="font-medium text-[12px] text-monday-text truncate" title={mat.name}>
                  {mat.name}
                </div>
                <div className="text-[11px] text-monday-subtext">
                  Por {mat.unit} {mat.thickness ? `• ${mat.thickness} mm` : ''}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px]">$</span>
                    <input
                      type="number"
                      step="5"
                      value={priceDraft}
                      autoFocus
                      onChange={(e) => setPriceDraft(parseFloat(e.target.value) || 0)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSavePrice(mat.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-16 px-1 py-0.5 text-[12px] border border-monday-blue rounded bg-white text-right"
                    />
                    <button
                      onClick={() => handleSavePrice(mat.id)}
                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                      title="Guardar"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[12px] text-monday-text">
                      ${mat.pricePerUnit} MXN
                    </span>
                    <button
                      onClick={() => handleStartEdit(mat)}
                      className="p-1 text-monday-subtext hover:text-monday-text hover:bg-monday-hover rounded"
                      title="Editar precio"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
