import React from 'react';

interface TableProps {
  headers: string[];
  children: React.ReactNode;
  className?: string;
}

export default function Table({ headers, children, className = '' }: TableProps) {
  return (
    <div className={`overflow-x-auto border border-gray-300 rounded ${className}`}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 border-b-2 border-gray-300">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 border-r border-gray-200 last:border-r-0"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-gray-200 [&>tr:last-child]:border-b-0 [&>tr:nth-child(even)]:bg-gray-50 [&>tr:hover]:bg-blue-50 [&>tr>td]:px-3 [&>tr>td]:py-1.5 [&>tr>td]:border-r [&>tr>td]:border-gray-200 [&>tr>td:last-child]:border-r-0">
          {children}
        </tbody>
      </table>
    </div>
  );
}
