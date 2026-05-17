/**
 * SessionItem - Item individual de sessão no sidebar
 */

import React, { useState } from 'react';
import { clsx } from 'clsx';
import type { ChatSession } from '../../store/slices/chatSlice';

interface SessionItemProps {
  readonly session: ChatSession;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
}

// Helper function to format timestamp
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function SessionItem({ session, isActive, onSelect, onDelete }: SessionItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Format timestamp
  const timeAgo = formatTimeAgo(session.createdAt);

  // Extract first user message as preview
  const preview = session.messages.find((m) => m.role === 'user')?.content.slice(0, 80) ?? 'Empty session';

  return (
    <div
      className={clsx('session-item', isActive && 'active')}
      onClick={onSelect}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Icon Column */}
      <div className="session-icon">
        <span className="codicon codicon-comment-discussion" />
      </div>

      {/* Main Column */}
      <div className="session-main">
        {/* Title Row */}
        <div className="session-title-row">
          <span className="session-title">{session.title}</span>

          {/* Hover Toolbar */}
          {isHovered && (
            <div className="session-toolbar">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                aria-label="Delete session"
              >
                <span className="codicon codicon-trash" />
              </button>
            </div>
          )}
        </div>

        {/* Details Row */}
        <div className="session-details-row">
          <span className="session-preview">{preview}</span>
          <span className="session-time">{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}
