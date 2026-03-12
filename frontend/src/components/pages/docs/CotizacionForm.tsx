import React from 'react';

interface CotizacionItem {
  descripcion: string;
  cantidad: string;
  precio: string;
  total: string;
}

interface CotizacionValue {
  cliente?: string;
  fecha?: string;
  vigencia?: string;
  items?: CotizacionItem[];
  subtotal?: string;
  iva?: string;
  total?: string;
  notas?: string;
}

interface Props {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

function getItems(value: Record<string, unknown>): CotizacionItem[] {
  const items = value.items;
  if (Array.isArray(items) && items.length > 0) return items as CotizacionItem[];
  return [{ descripcion: '', cantidad: '', precio: '', total: '' }];
}

export const CotizacionForm: React.FC<Props> = ({ value, onChange }) => {
  const items = getItems(value);

  const update = (updates: Partial<CotizacionValue>) => {
    onChange({ ...value, ...updates });
  };

  const setItem = (index: number, field: keyof CotizacionItem, val: string) => {
    const next = [...items];
    if (!next[index]) next[index] = { descripcion: '', cantidad: '', precio: '', total: '' };
    next[index] = { ...next[index], [field]: val };
    if (field === 'cantidad' || field === 'precio') {
      const q = field === 'cantidad' ? parseFloat(val) || 0 : parseFloat((next[index].cantidad || '0')) || 0;
      const p = field === 'precio' ? parseFloat(val) || 0 : parseFloat((next[index].precio || '0')) || 0;
      next[index].total = (q * p).toFixed(2);
    }
    update({ items: next });
  };

  const addRow = () => update({ items: [...items, { descripcion: '', cantidad: '', precio: '', total: '' }] });
  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    update({ items: items.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-[14px] font-semibold text-monday-text">Cotización</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] text-monday-subtext mb-1">Cliente</label>
          <input
            type="text"
            value={(value.cliente as string) ?? ''}
            onChange={e => update({ cliente: e.target.value })}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
        <div>
          <label className="block text-[12px] text-monday-subtext mb-1">Fecha</label>
          <input
            type="date"
            value={(value.fecha as string) ?? ''}
            onChange={e => update({ fecha: e.target.value })}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[12px] text-monday-subtext mb-1">Vigencia</label>
          <input
            type="text"
            value={(value.vigencia as string) ?? ''}
            onChange={e => update({ vigencia: e.target.value })}
            placeholder="Ej. 15 días"
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] text-monday-subtext">Ítems</label>
          <button type="button" onClick={addRow} className="text-[12px] text-monday-blue hover:underline">
            + Añadir ítem
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-monday-border">
                <th className="text-left py-1.5 font-medium text-monday-subtext">Descripción</th>
                <th className="text-right py-1.5 font-medium text-monday-subtext w-20">Cant.</th>
                <th className="text-right py-1.5 font-medium text-monday-subtext w-24">Precio</th>
                <th className="text-right py-1.5 font-medium text-monday-subtext w-24">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i} className="border-b border-monday-border/60">
                  <td className="py-1">
                    <input
                      value={row.descripcion}
                      onChange={e => setItem(i, 'descripcion', e.target.value)}
                      className="w-full px-2 py-1 border border-monday-border rounded outline-none focus:ring-1 focus:ring-monday-blue"
                    />
                  </td>
                  <td className="py-1 text-right">
                    <input
                      type="number"
                      min={0}
                      value={row.cantidad}
                      onChange={e => setItem(i, 'cantidad', e.target.value)}
                      className="w-full px-2 py-1 border border-monday-border rounded text-right outline-none focus:ring-1 focus:ring-monday-blue"
                    />
                  </td>
                  <td className="py-1 text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.precio}
                      onChange={e => setItem(i, 'precio', e.target.value)}
                      className="w-full px-2 py-1 border border-monday-border rounded text-right outline-none focus:ring-1 focus:ring-monday-blue"
                    />
                  </td>
                  <td className="py-1 text-right text-monday-subtext">{row.total || '0.00'}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={items.length <= 1}
                      className="text-monday-subtext hover:text-monday-red disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-[12px] text-monday-subtext mb-1">Subtotal</label>
          <input
            type="text"
            value={(value.subtotal as string) ?? ''}
            onChange={e => update({ subtotal: e.target.value })}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
        <div>
          <label className="block text-[12px] text-monday-subtext mb-1">IVA</label>
          <input
            type="text"
            value={(value.iva as string) ?? ''}
            onChange={e => update({ iva: e.target.value })}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
        <div>
          <label className="block text-[12px] text-monday-subtext mb-1">Total</label>
          <input
            type="text"
            value={(value.total as string) ?? ''}
            onChange={e => update({ total: e.target.value })}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
      </div>
      <div>
        <label className="block text-[12px] text-monday-subtext mb-1">Notas</label>
        <textarea
          value={(value.notas as string) ?? ''}
          onChange={e => update({ notas: e.target.value })}
          rows={2}
          className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue resize-none"
        />
      </div>
    </div>
  );
};
