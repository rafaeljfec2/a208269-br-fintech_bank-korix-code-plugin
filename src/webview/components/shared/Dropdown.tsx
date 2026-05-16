/**
 * Dropdown - Reusable dropdown menu component
 */

import React, { useEffect, useRef } from 'react';

interface DropdownProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly align?: 'left' | 'right';
}

export default function Dropdown({ isOpen, onClose, children, align = 'left' }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className={`absolute bottom-full mb-1 ${
        align === 'right' ? 'right-0' : 'left-0'
      } min-w-56 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-widget-border)] rounded-sm shadow-[0_2px_8px_rgba(0,0,0,0.32)] z-50 py-1`}
    >
      {children}
    </div>
  );
}
