import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Student, Assignment, GradeRecord } from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import {
  TableCellsIcon,
  PlusIcon,
  TrashIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

function NoClass() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <TableCellsIcon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">No class selected</p>
      <p className="text-sm">Choose a class from the sidebar.</p>
    </div>
  );
}

interface GradeCellProps {
  value: number | null;
  maxPoints: number;
  onCommit: (v: number | null) => void;
}

function GradeCell({ value, maxPoints, onCommit }: GradeCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setDraft(value !== null && value !== undefined ? String(value) : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commit = () => {
    const parsed = draft === '' ? null : parseFloat(draft);
    onCommit(parsed !== null && isNaN(parsed) ? null : parsed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-full border-0 bg-indigo-50 text-center text-sm font-medium focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 py-0.5"
        style={{ minWidth: 56 }}
      />
    );
  }

  const pct = value !== null && value !== undefined ? Math.round((value / maxPoints) * 100) : null;
  const color =
    pct === null ? 'text-gray-400' :
    pct >= 90 ? 'text-green-700' :
    pct >= 75 ? 'text-yellow-700' :
    'text-red-600';

  return (
    <button
      onClick={start}
      className={`w-full text-center text-sm font-semibold ${color} hover:bg-indigo-50 rounded py-0.5 transition-colors`}
      title={pct !== null ? `${pct}%` : 'Click to enter grade'}
    >
      {value !== null && value !== undefined ? value : <span className="text-gray-300">—</span>}
    </button>
  );
}

interface AssignmentHeaderProps {
  assignment: Assignment;
  onUpdate: (id: number, patch: { name?: string; max_points?: number }) => void;
  onDelete: (id: number) => void;
}

function AssignmentHeader({ assignment, onUpdate, onDelete }: AssignmentHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(assignment.name);
  const [maxPts, setMaxPts] = useState(String(assignment.max_points));

  const save = () => {
    onUpdate(assignment.id, { name, max_points: parseFloat(maxPts) || assignment.max_points });
    setEditing(false);
  };

  if (editing) {
    return (
      <th className="px-3 py-2 text-center min-w-[120px] bg-indigo-50">
        <div className="flex flex-col gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-indigo-300 px-1 py-0.5 text-xs text-center focus:outline-none"
          />
          <div className="flex items-center gap-1 justify-center">
            <span className="text-xs text-gray-500">Max:</span>
            <input
              type="number"
              value={maxPts}
              onChange={(e) => setMaxPts(e.target.value)}
              className="w-14 rounded border border-indigo-300 px-1 py-0.5 text-xs text-center focus:outline-none"
            />
          </div>
          <div className="flex justify-center gap-1">
            <button onClick={save} className="text-green-600"><CheckIcon className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditing(false)} className="text-gray-400"><XMarkIcon className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </th>
    );
  }

  return (
    <th className="px-3 py-2 text-center min-w-[110px] group">
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold text-gray-700 truncate max-w-[80px]" title={assignment.name}>
            {assignment.name}
          </span>
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-indigo-600"
          >
            <PencilSquareIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(assignment.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-xs text-gray-400">/{assignment.max_points}</span>
      </div>
    </th>
  );
}

export default function GradesView() {
  const { activeClass } = useActiveClass();
  const qc = useQueryClient();
  const [newAssignmentName, setNewAssignmentName] = useState('');
  const [newMaxPoints, setNewMaxPoints] = useState('100');
  const [addingAssignment, setAddingAssignment] = useState(false);

  const { data: students = [] } = useQuery({
    queryKey: ['students', activeClass?.id],
    queryFn: () => api.classes.students(activeClass!.id),
    enabled: !!activeClass,
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments', activeClass?.id],
    queryFn: () => api.assignments.list(activeClass!.id),
    enabled: !!activeClass,
  });

  const { data: grades = [] } = useQuery({
    queryKey: ['grades', activeClass?.id],
    queryFn: () => api.grades.list(activeClass!.id),
    enabled: !!activeClass,
  });

  // grade lookup: gradeMap[studentId][assignmentId] = points
  const gradeMap = useMemo(() => {
    const map: Record<number, Record<number, number | null>> = {};
    for (const g of grades as GradeRecord[]) {
      if (!map[g.student_id]) map[g.student_id] = {};
      map[g.student_id][g.assignment_id] = g.points;
    }
    return map;
  }, [grades]);

  const upsertGrade = useMutation({
    mutationFn: api.grades.upsert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grades', activeClass?.id] }),
  });

  const createAssignment = useMutation({
    mutationFn: () =>
      api.assignments.create({
        class_id: activeClass!.id,
        name: newAssignmentName.trim() || 'New Assignment',
        max_points: parseFloat(newMaxPoints) || 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', activeClass?.id] });
      setNewAssignmentName('');
      setNewMaxPoints('100');
      setAddingAssignment(false);
    },
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Parameters<typeof api.assignments.update>[1] }) =>
      api.assignments.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assignments', activeClass?.id] }),
  });

  const deleteAssignment = useMutation({
    mutationFn: (id: number) => api.assignments.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments', activeClass?.id] });
      qc.invalidateQueries({ queryKey: ['grades', activeClass?.id] });
    },
  });

  // Per-student totals — missing grades count as 0 toward earned; max includes every assignment
  const totals = useMemo(() => {
    const out: Record<number, { earned: number; max: number }> = {};
    for (const s of students as Student[]) {
      let earned = 0;
      let max = 0;
      for (const a of assignments as Assignment[]) {
        max += a.max_points;
        const pts = gradeMap[s.id]?.[a.id];
        earned += pts != null && !Number.isNaN(pts) ? pts : 0;
      }
      out[s.id] = { earned, max };
    }
    return out;
  }, [students, assignments, gradeMap]);

  const downloadCsv = () => {
    const headers = ['Student', ...(assignments as Assignment[]).map((a) => a.name), 'Total', '%'];
    const rows = (students as Student[]).map((s) => {
      const cells = (assignments as Assignment[]).map(
        (a) => gradeMap[s.id]?.[a.id] ?? '',
      );
      const { earned, max } = totals[s.id] ?? { earned: 0, max: 0 };
      const pct = max > 0 ? ((earned / max) * 100).toFixed(1) : '';
      return [s.name, ...cells, max > 0 ? earned : '', pct];
    });
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `grades_${activeClass?.name ?? 'class'}.csv`;
    a.click();
  };

  if (!activeClass) return <NoClass />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{activeClass.name} — Grades</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setAddingAssignment(true)}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <PlusIcon className="h-4 w-4" /> Add Assignment
          </button>
          <button
            onClick={downloadCsv}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Add assignment form */}
      {addingAssignment && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <input
            autoFocus
            type="text"
            placeholder="Assignment name"
            value={newAssignmentName}
            onChange={(e) => setNewAssignmentName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createAssignment.mutate(); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="flex items-center gap-1">
            <label className="text-sm text-gray-600">Max pts:</label>
            <input
              type="number"
              value={newMaxPoints}
              onChange={(e) => setNewMaxPoints(e.target.value)}
              className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <button
            onClick={() => createAssignment.mutate()}
            disabled={createAssignment.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Add
          </button>
          <button
            onClick={() => setAddingAssignment(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Grade table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {(students as Student[]).length === 0 ? (
          <div className="p-10 text-center text-gray-400">No students. Import in Settings.</div>
        ) : (assignments as Assignment[]).length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            No assignments yet. Click "Add Assignment" to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[160px]">
                    Student
                  </th>
                  {(assignments as Assignment[]).map((a) => (
                    <AssignmentHeader
                      key={a.id}
                      assignment={a}
                      onUpdate={(id, patch) => updateAssignment.mutate({ id, patch })}
                      onDelete={(id) => {
                        if (confirm('Delete this assignment and all its grades?')) {
                          deleteAssignment.mutate(id);
                        }
                      }}
                    />
                  ))}
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[90px]">
                    Total
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 min-w-[60px]">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(students as Student[]).map((student) => {
                  const { earned, max } = totals[student.id] ?? { earned: 0, max: 0 };
                  const pct = max > 0 ? ((earned / max) * 100).toFixed(1) : null;
                  return (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-800 whitespace-nowrap">
                        {student.name}
                      </td>
                      {(assignments as Assignment[]).map((a) => (
                        <td key={a.id} className="px-2 py-2">
                          <GradeCell
                            value={gradeMap[student.id]?.[a.id] ?? null}
                            maxPoints={a.max_points}
                            onCommit={(v) =>
                              upsertGrade.mutate({
                                assignment_id: a.id,
                                student_id: student.id,
                                points: v,
                              })
                            }
                          />
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-700">
                        {max > 0 ? `${earned}/${max}` : <span className="text-gray-300">—</span>}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-center text-sm font-bold ${
                          pct === null ? 'text-gray-300' :
                          Number(pct) >= 90 ? 'text-green-600' :
                          Number(pct) >= 75 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}
                      >
                        {pct !== null ? `${pct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
