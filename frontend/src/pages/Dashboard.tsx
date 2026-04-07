import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  Student,
  Assignment,
  GradeRecord,
  AttendanceSummary,
  ParticipationSummary,
} from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import {
  ChartBarIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  StarIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

function NoClass() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <ChartBarIcon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">No class selected</p>
      <p className="text-sm">Choose a class from the sidebar to see the overview.</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'text-indigo-600',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex items-center gap-4">
      <div className={`rounded-full p-3 bg-gray-50 ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
    </div>
  );
}

function AttendanceBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300 text-sm">—</span>;
  const color =
    pct >= 90 ? 'bg-green-100 text-green-700' :
    pct >= 70 ? 'bg-yellow-100 text-yellow-700' :
    'bg-red-100 text-red-600';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {pct.toFixed(0)}%
    </span>
  );
}

function GradeBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-gray-300 text-sm">—</span>;
  const color =
    pct >= 90 ? 'bg-green-500' :
    pct >= 75 ? 'bg-yellow-400' :
    'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs font-semibold ${pct >= 90 ? 'text-green-700' : pct >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function ContributionScore({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-300 text-sm">—</span>;
  return (
    <span className="text-sm font-semibold text-gray-700">{value.toFixed(2)} / 3</span>
  );
}

export default function Dashboard() {
  const { activeClass } = useActiveClass();

  const { data: students = [] } = useQuery({
    queryKey: ['students', activeClass?.id],
    queryFn: () => api.classes.students(activeClass!.id),
    enabled: !!activeClass,
  });

  const { data: attendanceSummary = [] } = useQuery({
    queryKey: ['attendance-summary', activeClass?.id],
    queryFn: () => api.attendance.summary(activeClass!.id),
    enabled: !!activeClass,
  });

  const { data: participationSummary = [] } = useQuery({
    queryKey: ['participation-summary', activeClass?.id],
    queryFn: () => api.participation.summary(activeClass!.id),
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

  // grade map: studentId → { earned, max } — missing grades count as 0; max is full assignment total
  const gradeMap = useMemo(() => {
    const assignList = assignments as Assignment[];
    const totalMaxPoints = assignList.reduce((s, a) => s + a.max_points, 0);
    const lookup: Record<number, Record<number, number | null>> = {};
    for (const g of grades as GradeRecord[]) {
      if (!lookup[g.student_id]) lookup[g.student_id] = {};
      lookup[g.student_id][g.assignment_id] = g.points;
    }
    const byStudent: Record<number, { earned: number; max: number }> = {};
    for (const student of students as Student[]) {
      let earned = 0;
      let max = 0;
      for (const a of assignList) {
        max += a.max_points;
        const pts = lookup[student.id]?.[a.id];
        earned += pts != null ? pts : 0;
      }
      byStudent[student.id] = { earned, max };
    }
    return { byStudent, totalMaxPoints };
  }, [grades, assignments, students]);

  const attMap = useMemo(
    () => Object.fromEntries((attendanceSummary as AttendanceSummary[]).map((s) => [s.student_id, s])),
    [attendanceSummary],
  );

  const partMap = useMemo(
    () => Object.fromEntries((participationSummary as ParticipationSummary[]).map((s) => [s.student_id, s])),
    [participationSummary],
  );

  // Class-level stats
  const totalStudents = (students as Student[]).length;
  const classAttendancePct = useMemo(() => {
    const sums = attendanceSummary as AttendanceSummary[];
    if (!sums.length) return null;
    const totalPresent = sums.reduce((s, r) => s + r.present + r.late, 0);
    const totalRecorded = sums.reduce((s, r) => s + r.recorded, 0);
    return totalRecorded > 0 ? (totalPresent / totalRecorded) * 100 : null;
  }, [attendanceSummary]);

  const avgContribution = useMemo(() => {
    const sums = participationSummary as ParticipationSummary[];
    const valid = sums.filter((s) => s.avg_contribution !== null);
    if (!valid.length) return null;
    return valid.reduce((a, s) => a + (s.avg_contribution ?? 0), 0) / valid.length;
  }, [participationSummary]);

  const totalInterruptions = useMemo(
    () => (participationSummary as ParticipationSummary[]).reduce((s, r) => s + r.total_interruptions, 0),
    [participationSummary],
  );

  const downloadCsv = () => {
    const headers = [
      'Student', 'Attendance %', 'Present', 'Late', 'Absent', 'Excused',
      'Interruptions', 'Avg Contribution', 'Grade %',
    ];
    const rows = (students as Student[]).map((s) => {
      const att = attMap[s.id];
      const part = partMap[s.id];
      const g = gradeMap.byStudent[s.id];
      const attPct = att && att.recorded > 0
        ? (((att.present + att.late) / att.recorded) * 100).toFixed(1)
        : '';
      const gradePct = g && g.max > 0 ? ((g.earned / g.max) * 100).toFixed(1) : '';
      return [
        s.name,
        attPct,
        att?.present ?? '',
        att?.late ?? '',
        att?.absent ?? '',
        att?.excused ?? '',
        part?.total_interruptions ?? 0,
        part?.avg_contribution !== null && part?.avg_contribution !== undefined ? part.avg_contribution.toFixed(2) : '',
        gradePct,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `overview_${activeClass?.name ?? 'class'}.csv`;
    a.click();
  };

  if (!activeClass) return <NoClass />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{activeClass.name} — Overview</h1>
        <button
          onClick={downloadCsv}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={UserGroupIcon}
          label="Students"
          value={totalStudents}
          color="text-indigo-600"
        />
        <StatCard
          icon={CheckBadgeIcon}
          label="Avg Attendance"
          value={classAttendancePct !== null ? `${classAttendancePct.toFixed(0)}%` : '—'}
          color="text-green-600"
        />
        <StatCard
          icon={StarIcon}
          label="Avg Contribution"
          value={avgContribution !== null ? `${avgContribution.toFixed(2)} / 3` : '—'}
          color="text-amber-500"
        />
        <StatCard
          icon={BoltIcon}
          label="Total Interruptions"
          value={totalInterruptions}
          color="text-red-500"
        />
      </div>

      {/* Per-student overview table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">Student Overview</h2>
        </div>

        {totalStudents === 0 ? (
          <div className="p-10 text-center text-gray-400">
            No students yet. Go to Settings to import a class.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Attendance</th>
                  <th className="px-4 py-3 text-center">P / L / A / E</th>
                  <th className="px-4 py-3">Contribution</th>
                  <th className="px-4 py-3 text-center">Interruptions</th>
                  <th className="px-4 py-3">Grade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(students as Student[]).map((student) => {
                  const att = attMap[student.id];
                  const part = partMap[student.id];
                  const g = gradeMap.byStudent[student.id];
                  const attPct =
                    att && att.recorded > 0
                      ? ((att.present + att.late) / att.recorded) * 100
                      : null;
                  const gradePct = g && g.max > 0 ? (g.earned / g.max) * 100 : null;

                  return (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{student.name}</td>
                      <td className="px-4 py-3">
                        <AttendanceBadge pct={attPct} />
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-gray-500 font-mono whitespace-nowrap">
                        {att ? (
                          <span>
                            <span className="text-green-600 font-semibold">{att.present}</span>
                            {' / '}
                            <span className="text-yellow-600 font-semibold">{att.late}</span>
                            {' / '}
                            <span className="text-red-500 font-semibold">{att.absent}</span>
                            {' / '}
                            <span className="text-gray-400 font-semibold">{att.excused}</span>
                          </span>
                        ) : (
                          <span className="text-gray-300">— / — / — / —</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ContributionScore value={part?.avg_contribution ?? null} />
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-gray-700">
                        {part ? (
                          <span className={part.total_interruptions > 3 ? 'text-red-600' : 'text-gray-700'}>
                            {part.total_interruptions}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <GradeBar pct={gradePct} />
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
