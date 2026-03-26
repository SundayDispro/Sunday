import React from 'react';
import type { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
};

export function EmptyState({ icon: Icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className}`}>
      <div className="w-16 h-16 rounded-full bg-monday-hover flex items-center justify-center mb-4 text-monday-subtext">
        <Icon size={28} className="opacity-70" aria-hidden />
      </div>
      <p className="text-[15px] font-medium text-monday-text">{title}</p>
      {description && <p className="text-[13px] text-monday-subtext mt-1 max-w-sm">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-monday bg-monday-blue text-white text-[13px] font-medium hover:bg-monday-blue/90"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
