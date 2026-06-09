import React from 'react';
import { HelpCircle } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-dashed border-gray-200 rounded-3xl">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 text-blue-600 mb-4 shadow-xs">
        {icon || <HelpCircle className="w-7 h-7" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 tracking-tight">{title}</h3>
      <p className="mt-2 text-sm text-gray-500 max-w-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-6 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-full transition-all shadow-xs hover:shadow-md cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
