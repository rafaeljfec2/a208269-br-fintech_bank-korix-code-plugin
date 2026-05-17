/**
 * SessionList - Lista de sessões de chat no sidebar
 */

import React from 'react';
import SessionItem from './SessionItem';
import type { ChatSession } from '../../store/slices/chatSlice';

interface SessionListProps {
  readonly sessions: ChatSession[];
  readonly activeSessionId: string | null;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => void;
}

function EmptySessionList() {
  return (
    <div className="flex items-center justify-center h-full px-6 py-8 text-center">
      <div className="text-sm opacity-60">
        <p>No sessions yet</p>
        <p className="text-xs opacity-75 mt-2">Start a new chat to create your first session</p>
      </div>
    </div>
  );
}

export default function SessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
}: SessionListProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {sessions.length === 0 ? (
        <EmptySessionList />
      ) : (
        sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onSelect={() => onSelectSession(session.id)}
            onDelete={() => onDeleteSession(session.id)}
          />
        ))
      )}
    </div>
  );
}
