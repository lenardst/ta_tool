import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export default function Admin() {
  const qc = useQueryClient();
  const { data: classes = [], isLoading: loadingClasses } = useQuery({
    queryKey: ['admin', 'classes'],
    queryFn: api.admin.classes,
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: api.admin.users,
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

  if (loadingClasses || loadingUsers) {
    return <div className="text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Class Sharing</h1>
      <p className="text-sm text-gray-500 mb-6">Control which users have access to each class.</p>

      {classes.length === 0 && (
        <p className="text-gray-400 text-sm">No classes yet. Import one from Settings.</p>
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
  );
}
