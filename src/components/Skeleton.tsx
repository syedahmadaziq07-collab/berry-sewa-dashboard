import React from 'react';

export function CardSkeleton() {
  return (
    <div className="bg-white border border-gray-100/80 rounded-2xl p-6 shadow-sm animate-pulse space-y-4">
      <div className="flex justify-between items-center">
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
        <div className="h-8 bg-gray-200 rounded-full w-8"></div>
      </div>
      <div className="h-8 bg-gray-200 rounded w-2/3"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-6">
        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
      </div>
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex space-x-4 items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="h-4 bg-gray-200 rounded w-12"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 4, 5].map((n) => (
          <div key={n} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-3">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="h-10 bg-gray-200 rounded w-full"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
