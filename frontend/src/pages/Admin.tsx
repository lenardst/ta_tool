import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadBackup(filename: string) {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`/api/admin/backups/${encodeURIComponent(filename)}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Admin() {
  const { is_admin } = useAuth();
  const qc = useQueryClient();
  const [backupError, setBackupError] = useState<string | null>(null);

  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['admin', 'classes'],
    queryFn: api.admin.classes,
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.admin.users,
  });
  const { data: backups = [], isLoading: loadingBackups, refetch: refetchBackups } = useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: api.admin.backups,
    enabled: is_admin,
  });

  const add = useMutation({
    mutationFn: ({ class_id, user_id }: { class_id: number; user_id: number }) =>
      api.admin.addMember(class_id, user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'classes'] }),
  });

  const remove = useMutation({
    mutationFn: ({ class_id, user_id }: { class_id: number; user_id: number }) =>
      api.admin.removeMember(class_id, user_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'classes'] }),
  });

  const triggerBackup = useMutation({
    mutationFn: api.admin.triggerBackup,
    onSuccess: () => {
      setBackupError(null);
      refetchBackups();
    },
    onError: (err: Error) => setBackupError(err.message),
  });

  if (loadingClasses || loadingUsers) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-3xl space-y-10">
      {/* ── Class Sharing ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Class Sharing</h1>
        <p className="text-sm text-gray-500 mb-6">Control which users have access to each class.</p>

        {classes.length === 0 && (
          <p className="text-gray-400 text-sm">No classes to manage. Import a class from Settings to share it with others.</p>
        )}

        <div className="space-y-4">
          {classes.map((cls) => (
            <div key={cls.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-3">{cls.name}</h2>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => {
                  const isMember = cls.member_ids.includes(user.id);
                  const isPending =
                    (add.isPending && add.variables?.class_id === cls.id && add.variables?.user_id === user.id) ||
                    (remove.isPending && remove.variables?.class_id === cls.id && remove.variables?.user_id === user.id);
                  return (
                    <button
                      key={user.id}
                      disabled={isPending}
                      onClick={() =>
                        isMember
                          ? remove.mutate({ class_id: cls.id, user_id: user.id })
                          : add.mutate({ class_id: cls.id, user_id: user.id })
                      }
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
                        isMember
                          ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {isMember ? '✓ ' : '+ '}{user.username}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Backups (global admin only) ── */}
      {is_admin && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-2xl font-bold text-gray-900">Backups</h2>
            <button
              onClick={() => triggerBackup.mutate()}
              disabled={triggerBackup.isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {triggerBackup.isPending ? 'Creating…' : 'Create backup now'}
            </button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Daily snapshots of the database stored on the server. Last 14 backups are kept.
          </p>

          {backupError && (
            <p className="text-red-500 text-sm mb-3">{backupError}</p>
          )}
          {triggerBackup.isSuccess && (
            <p className="text-green-600 text-sm mb-3">Backup created: {triggerBackup.data.filename}</p>
          )}

          {loadingBackups ? (
            <p className="text-gray-400 text-sm">Loading backups…</p>
          ) : backups.length === 0 ? (
            <p className="text-gray-400 text-sm">No backups yet. Click "Create backup now" to make one.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              {backups.map((b) => (
                <div key={b.filename} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{b.filename}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(b.created_at).toLocaleString()} · {formatBytes(b.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadBackup(b.filename)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
