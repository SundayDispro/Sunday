import React from 'react';

interface Props {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

export const LevantamientoForm: React.FC<Props> = ({ value, onChange }) => {
  const update = (updates: Record<string, unknown>) => onChange({ ...value, ...updates });

  return (
    <div className="space-y-4">
      <h3 className="text-[14px] font-semibold text-monday-text">Levantamiento</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] text-monday-subtext mb-1">Proyecto</label>
          <input
            type="text"
            value={(value.proyecto as string) ?? ''}
            onChange={e => update({ proyecto: e.target.value })}
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
          <label className="block text-[12px] text-monday-subtext mb-1">Dirección</label>
          <input
            type="text"
            value={(value.direccion as string) ?? ''}
            onChange={e => update({ direccion: e.target.value })}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[12px] text-monday-subtext mb-1">Descripción</label>
          <textarea
            value={(value.descripcion as string) ?? ''}
            onChange={e => update({ descripcion: e.target.value })}
            rows={3}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue resize-none"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[12px] text-monday-subtext mb-1">Observaciones</label>
          <textarea
            value={(value.observaciones as string) ?? ''}
            onChange={e => update({ observaciones: e.target.value })}
            rows={2}
            className="w-full px-2 py-1.5 border border-monday-border rounded text-[13px] outline-none focus:ring-2 focus:ring-monday-blue resize-none"
          />
        </div>
      </div>
    </div>
  );
};
