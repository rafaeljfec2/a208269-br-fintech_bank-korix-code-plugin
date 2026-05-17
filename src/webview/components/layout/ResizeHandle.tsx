/**
 * ResizeHandle - Divisor redimensionável entre sidebar e main panel
 */

import React, { useState } from 'react';
import { clsx } from 'clsx';

export default function ResizeHandle() {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);

    const startX = e.clientX;
    const sidebar = document.querySelector('.sidebar') as HTMLElement;
    const startWidth = sidebar?.offsetWidth ?? 250;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(200, Math.min(500, startWidth + delta));
      if (sidebar) {
        sidebar.style.width = `${newWidth}px`;
        // Persist to localStorage
        localStorage.setItem('korix-sidebar-width', newWidth.toString());
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={clsx('resize-handle', isDragging && 'dragging')}
      onMouseDown={handleMouseDown}
      aria-label="Resize sidebar"
    />
  );
}
