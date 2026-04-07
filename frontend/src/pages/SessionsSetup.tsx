import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Session } from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import {
  QueueListIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { isPastSessionDate } from '../utils/calendar';

function NoClass() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <QueueListIcon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">No class selected</p>
      <p className="text-sm">Choose a class from the sidebar.</p>
    </div>
  );
}

// ─── Inline-editable cell ─────────────────────────────────────────────────────

interface EditableCellProps {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  className?: string;
  type?: 'text' | 'date';
  readOnly?: boolean;
}

function EditableCell({
  value,
  placeholder,
  onSave,
  className = '',
  type = 'text',
  readOnly = false,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  if (readOnly) {
    return (
      <span
        className={`block w-full rounded px-1 py-0.5 text-gray-800 ${className} ${
          value ? '' : 'italic text-gray-400'
        }`}
      >
        {value || placeholder || '—'}
      </span>
    );
  }

  const start = () => {
    setDraft(value);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          className={`rounded border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400 ${className}`}
        />
        <button onClick={commit} className="text-green-600 hover:text-green-700 flex-shrink-0">
          <CheckIcon className="h-4 w-4" />
        </button>
        <button onClick={cancel} className="text-gray-400 hover:text-gray-500 flex-shrink-0">
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={start}
      className={`text-left w-full rounded px-1 py-0.5 hover:bg-indigo-50 transition-colors ${
        value ? 'text-gray-800' : 'text-gray-400 italic'
      } ${className}`}
    >
      {value || placeholder || '—'}
    </button>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

interface SessionRowProps {
  session: Session;
  rowLocked: boolean;
  onUpdate: (id: number, patch: { date?: string | null; label?: string | null }) => void;
  onDelete: (id: number) => void;
}

function SessionRow({ session, rowLocked, onUpdate, onDelete }: SessionRowProps) {
  return (
    <tr className="hover:bg-gray-50 group">
      <td className="px-4 py-2 text-sm font-semibold text-gray-500 w-16 text-center">
        {session.session_number}
      </td>
      <td className="px-4 py-2 w-44">
        <EditableCell
          type="date"
          readOnly={rowLocked}
          value={session.date ?? ''}
          placeholder="Set date"
          onSave={(v) => onUpdate(session.id, { date: v || null })}
        />
      </td>
      <td className="px-4 py-2">
        <EditableCell
          readOnly={rowLocked}
          value={session.label ?? ''}
          placeholder="Click to add title…"
          onSave={(v) => onUpdate(session.id, { label: v || null })}
          className="w-full"
        />
      </td>
      <td className="px-4 py-2 w-10">
        {!rowLocked && (
          <button
            type="button"
            onClick={() => onDelete(session.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 rounded p-1"
            title="Delete session"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SessionsSetup() {
  const { activeClass } = useActiveClass();
  const qc = useQueryClient();
  const [extractMsg, setExtractMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const setupUnlockKey = activeClass ? `sessionsSetupPastUnlocked:${activeClass.id}` : '';
  const [pastSetupUnlocked, setPastSetupUnlocked] = useState(false);

  useEffect(() => {
    if (!setupUnlockKey) {
      setPastSetupUnlocked(false);
      return;
    }
    setPastSetupUnlocked(sessionStorage.getItem(setupUnlockKey) === '1');
  }, [setupUnlockKey]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', activeClass?.id],
    queryFn: () => api.sessions.list(activeClass!.id),
    enabled: !!activeClass,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sessions', activeClass?.id] });

  const createMutation = useMutation({
    mutationFn: () => api.sessions.create({ class_id: activeClass!.id }),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { date?: string | null; label?: string | null } }) =>
      api.sessions.update(id, patch),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.sessions.delete(id),
    onSuccess: invalidate,
  });

  const extractMutation = useMutation({
    mutationFn: () => api.sessions.extractFromCanvas(activeClass!.id),
    onSuccess: (data) => {
      invalidate();
      setExtractMsg({
        type: 'ok',
        text: `Extracted ${data.extracted_count} session${data.extracted_count !== 1 ? 's' : ''} from Canvas.`,
      });
      setTimeout(() => setExtractMsg(null), 5000);
    },
    onError: (err: Error) => {
      setExtractMsg({ type: 'err', text: err.message });
    },
  });

  if (!activeClass) return <NoClass />;

  const sessionList = sessions as Session[];
  const hasPastLockedRows = sessionList.some((s) => isPastSessionDate(s.date) && !pastSetupUnlocked);

  const unlockSetupPast = () => {
    if (!setupUnlockKey) return;
    sessionStorage.setItem(setupUnlockKey, '1');
    setPastSetupUnlocked(true);
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sessions</h1>
          <p className="text-sm text-gray-500">{activeClass.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (
                sessionList.length > 0 &&
                !confirm(
                  'Extracting from Canvas will update existing sessions and add new ones. Continue?'
                )
              )
                return;
              extractMutation.mutate();
            }}
            disabled={extractMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {extractMutation.isPending ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            {extractMutation.isPending ? 'Extracting…' : 'Extract from Canvas (AI)'}
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" />
            Add session
          </button>
        </div>
      </div>

      {/* Extraction feedback */}
      {extractMsg && (
        <div
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            extractMsg.type === 'ok'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {extractMsg.type === 'err' && <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />}
          {extractMsg.text}
          <button onClick={() => setExtractMsg(null)} className="ml-auto opacity-60 hover:opacity-100">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Info banner when no sessions */}
      {!isLoading && sessionList.length === 0 && (
        <div className="rounded-xl border border-dashed border-indigo-300 bg-indigo-50 p-8 text-center">
          <SparklesIcon className="h-8 w-8 text-indigo-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-indigo-700 mb-1">No sessions yet</p>
          <p className="text-xs text-indigo-500">
            Click <strong>Extract from Canvas (AI)</strong> to auto-import sessions from the
            course modules or syllabus, or add sessions manually.
          </p>
        </div>
      )}

      {/* Session table */}
      {sessionList.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {hasPastLockedRows && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-center gap-2 min-w-0">
                <LockClosedIcon className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
                <span>
                  Sessions with a date in the past are locked. Unlock to edit dates, titles, or delete
                  them.
                </span>
              </div>
              <button
                type="button"
                onClick={unlockSetupPast}
                className="shrink-0 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-950"
              >
                Unlock
              </button>
            </div>
          )}
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-center">#</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessionList.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  rowLocked={isPastSessionDate(s.date) && !pastSetupUnlocked}
                  onUpdate={(id, patch) => updateMutation.mutate({ id, patch })}
                  onDelete={(id) => {
                    if (confirm('Delete this session and all its attendance/participation data?')) {
                      deleteMutation.mutate(id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>

          {/* Footer: add session inline */}
          <div className="border-t border-gray-100 px-4 py-3">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              Add session
            </button>
          </div>
        </div>
      )}

      {/* Link to recording view */}
      {sessionList.length > 0 && (
        <p className="text-xs text-gray-400">
          Sessions are ready.{' '}
          <Link to="/session" className="text-indigo-600 hover:underline">
            Go to Session Recording →
          </Link>
        </p>
      )}
    </div>
  );
}
