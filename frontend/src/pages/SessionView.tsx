import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type {
  Student,
  Session,
  AttendanceStatus,
  AttendanceRecord,
  ParticipationRecord,
} from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import RatingPicker from '../components/RatingPicker';
import { isPastSessionDate, localISODate } from '../utils/calendar';
import {
  CalendarDaysIcon,
  MinusIcon,
  PlusIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  QueueListIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const STATUS_CYCLE: AttendanceStatus[] = ['absent', 'present', 'late', 'excused'];
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-700 border-green-300',
  late:    'bg-yellow-100 text-yellow-700 border-yellow-300',
  absent:  'bg-red-100 text-red-700 border-red-300',
  excused: 'bg-gray-100 text-gray-500 border-gray-300',
};

function NoClass() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <CalendarDaysIcon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">No class selected</p>
      <p className="text-sm">Choose a class from the sidebar to start recording.</p>
    </div>
  );
}

interface StudentRowProps {
  student: Student;
  sessionId: number;
  attendance: AttendanceRecord | undefined;
  participation: ParticipationRecord | undefined;
  readOnly?: boolean;
  onAttendanceChange: (studentId: number, status: AttendanceStatus) => void;
  onParticipationChange: (
    studentId: number,
    patch: Partial<{ interruptions: number; contribution_rating: number; contribution_note: string }>,
    current: ParticipationRecord | undefined,
  ) => void;
}

function StudentRow({
  student,
  attendance,
  participation,
  readOnly = false,
  onAttendanceChange,
  onParticipationChange,
}: StudentRowProps) {
  const status: AttendanceStatus = attendance?.status ?? 'absent';
  const isAbsent = status === 'absent';
  const interruptions = participation?.interruptions ?? 0;
  const rating = isAbsent ? 0 : (participation?.contribution_rating ?? 0);
  const note = participation?.contribution_note ?? '';
  const [editingNote, setEditingNote] = useState(false);
  const [noteVal, setNoteVal] = useState(note);

  const cycleStatus = () => {
    if (readOnly) return;
    const idx = STATUS_CYCLE.indexOf(status);
    onAttendanceChange(student.id, STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
  };

  const changeInterruptions = (delta: number) => {
    if (readOnly) return;
    const next = Math.max(0, interruptions + delta);
    onParticipationChange(student.id, { interruptions: next }, participation);
  };

  const saveNote = () => {
    onParticipationChange(student.id, { contribution_note: noteVal }, participation);
    setEditingNote(false);
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      {/* Name */}
      <td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
        {student.name}
      </td>

      {/* Attendance */}
      <td className="px-4 py-3">
        {readOnly ? (
          <span
            className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLE[status]}`}
          >
            {status}
          </span>
        ) : (
          <button
            type="button"
            onClick={cycleStatus}
            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors ${STATUS_STYLE[status]}`}
          >
            {status}
          </button>
        )}
      </td>

      {/* Interruptions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => changeInterruptions(-1)}
            className="rounded-full bg-gray-100 p-1 text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MinusIcon className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold text-gray-700">
            {interruptions}
          </span>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => changeInterruptions(1)}
            className="rounded-full bg-gray-100 p-1 text-gray-600 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>

      {/* Contribution rating */}
      <td className="px-4 py-3">
        <RatingPicker
          value={rating}
          disabled={readOnly || isAbsent}
          onChange={(v) => onParticipationChange(student.id, { contribution_rating: v }, participation)}
        />
      </td>

      {/* Note */}
      <td className="px-4 py-3 min-w-[180px]">
        {readOnly ? (
          <span className="text-xs text-gray-600">{note || '—'}</span>
        ) : editingNote ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              type="text"
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false); }}
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button onClick={saveNote} className="text-green-600 hover:text-green-700"><CheckIcon className="h-4 w-4" /></button>
            <button onClick={() => setEditingNote(false)} className="text-gray-400 hover:text-gray-500"><XMarkIcon className="h-4 w-4" /></button>
          </div>
        ) : (
          <button
            onClick={() => { setNoteVal(note); setEditingNote(true); }}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 group"
          >
            <PencilSquareIcon className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className={note ? 'text-gray-700' : 'italic text-gray-400'}>
              {note || 'Add note…'}
            </span>
          </button>
        )}
      </td>
    </tr>
  );
}

export default function SessionView() {
  const { activeClass } = useActiveClass();
  const qc = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const prevClassIdRef = useRef<number | undefined>(undefined);
  const [editingDate, setEditingDate] = useState<number | null>(null);
  const [dateVal, setDateVal] = useState('');
  const [quickSearch, setQuickSearch] = useState('');
  const [quickContributionSearch, setQuickContributionSearch] = useState('');
  const [sessionNotesVal, setSessionNotesVal] = useState('');
  const quickSearchRef = useRef<HTMLInputElement | null>(null);
  const quickContributionRef = useRef<HTMLInputElement | null>(null);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions', activeClass?.id],
    queryFn: () => api.sessions.list(activeClass!.id),
    enabled: !!activeClass,
  });

  const { data: students = [] } = useQuery({
    queryKey: ['students', activeClass?.id],
    queryFn: () => api.classes.students(activeClass!.id),
    enabled: !!activeClass,
  });

  const currentSession = useMemo(
    () => sessions.find((s: Session) => s.id === selectedSessionId) ?? sessions[0] ?? null,
    [sessions, selectedSessionId],
  );

  const pastLocked = currentSession ? isPastSessionDate(currentSession.date) : false;
  const [pastUnlocked, setPastUnlocked] = useState(false);

  useEffect(() => {
    if (!currentSession?.id) {
      setPastUnlocked(false);
      return;
    }
    setPastUnlocked(sessionStorage.getItem(`pastSessionUnlocked:${currentSession.id}`) === '1');
  }, [currentSession?.id]);

  const readOnly = pastLocked && !pastUnlocked;

  const unlockPastSession = () => {
    if (!currentSession) return;
    sessionStorage.setItem(`pastSessionUnlocked:${currentSession.id}`, '1');
    setPastUnlocked(true);
  };

  useEffect(() => {
    if (isLoading || !activeClass) return;
    const list = sessions as Session[];
    if (list.length === 0) return;
    const today = localISODate();
    const todaySess = list.find((s: Session) => s.date === today);
    const classChanged = prevClassIdRef.current !== activeClass.id;
    if (classChanged) {
      prevClassIdRef.current = activeClass.id;
      if (todaySess) setSelectedSessionId(todaySess.id);
      else setSelectedSessionId(null);
    } else if (selectedSessionId === null && todaySess) {
      setSelectedSessionId(todaySess.id);
    }
  }, [activeClass?.id, isLoading, sessions, selectedSessionId]);

  const { data: attendanceList = [] } = useQuery({
    queryKey: ['attendance', currentSession?.id],
    queryFn: () => api.attendance.list(currentSession!.id),
    enabled: !!currentSession,
  });

  const { data: participationList = [] } = useQuery({
    queryKey: ['participation', currentSession?.id],
    queryFn: () => api.participation.list(currentSession!.id),
    enabled: !!currentSession,
  });

  const attendanceMap = useMemo(
    () => Object.fromEntries((attendanceList as AttendanceRecord[]).map((a) => [a.student_id, a])),
    [attendanceList],
  );

  const participationMap = useMemo(
    () => Object.fromEntries((participationList as ParticipationRecord[]).map((p) => [p.student_id, p])),
    [participationList],
  );

  const attendanceCounts = useMemo(() => {
    const list = students as Student[];
    let present = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;

    for (const student of list) {
      const status: AttendanceStatus = attendanceMap[student.id]?.status ?? 'absent';
      if (status === 'present') present += 1;
      else if (status === 'late') late += 1;
      else if (status === 'excused') excused += 1;
      else absent += 1;
    }

    return {
      total: list.length,
      present,
      late,
      excused,
      absent,
      attending: present + late + excused,
    };
  }, [students, attendanceMap]);

  const updateAttendance = useMutation({
    mutationFn: (payload: { session_id: number; student_id: number; status: AttendanceStatus }) =>
      api.attendance.upsert(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance', currentSession?.id] }),
  });

  const updateParticipation = useMutation({
    mutationFn: (payload: {
      session_id: number;
      student_id: number;
      interruptions: number;
      contribution_rating: number;
      contribution_note: string;
    }) => api.participation.upsert(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['participation', currentSession?.id] }),
  });

  const updateSession = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { date?: string; label?: string; notes?: string | null } }) =>
      api.sessions.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions', activeClass?.id] }),
  });

  const handleAttendanceChange = (studentId: number, status: AttendanceStatus) => {
    if (!currentSession || readOnly) return;
    updateAttendance.mutate({ session_id: currentSession.id, student_id: studentId, status });
    if (status === 'absent') {
      const current = participationMap[studentId];
      updateParticipation.mutate({
        session_id: currentSession.id,
        student_id: studentId,
        interruptions: current?.interruptions ?? 0,
        contribution_rating: 0,
        contribution_note: current?.contribution_note ?? '',
      });
    }
  };

  const handleParticipationChange = (
    studentId: number,
    patch: Partial<{ interruptions: number; contribution_rating: number; contribution_note: string }>,
    current: ParticipationRecord | undefined,
  ) => {
    if (!currentSession || readOnly) return;
    updateParticipation.mutate({
      session_id: currentSession.id,
      student_id: studentId,
      interruptions: patch.interruptions ?? current?.interruptions ?? 0,
      contribution_rating: patch.contribution_rating !== undefined ? patch.contribution_rating : (current?.contribution_rating ?? 0),
      contribution_note: patch.contribution_note ?? current?.contribution_note ?? '',
    });
  };

  const quickMatches = useMemo(() => {
    const list = students as Student[];
    const query = quickSearch.trim().toLowerCase();
    if (!query) return [];
    return list.filter((student) => student.name.toLowerCase().includes(query)).slice(0, 6);
  }, [students, quickSearch]);

  const quickContributionMatches = useMemo(() => {
    const list = students as Student[];
    const query = quickContributionSearch.trim().toLowerCase();
    if (!query) return [];
    return list.filter((student) => student.name.toLowerCase().includes(query)).slice(0, 6);
  }, [students, quickContributionSearch]);

  const quickMarkPresent = () => {
    if (!currentSession || readOnly) return;
    if (quickMatches.length === 0) return;
    handleAttendanceChange(quickMatches[0].id, 'present');
    setQuickSearch('');
    requestAnimationFrame(() => quickSearchRef.current?.focus());
  };

  const quickIncreaseContribution = (studentId: number) => {
    if (readOnly) return;
    const current = participationMap[studentId];
    const status: AttendanceStatus = attendanceMap[studentId]?.status ?? 'absent';
    if (status === 'absent') return;
    const nextRating = Math.min(3, (current?.contribution_rating ?? 0) + 1);
    handleParticipationChange(studentId, { contribution_rating: nextRating }, current);
  };

  const quickIncreaseTopContribution = () => {
    if (quickContributionMatches.length === 0) return;
    quickIncreaseContribution(quickContributionMatches[0].id);
    setQuickContributionSearch('');
    requestAnimationFrame(() => quickContributionRef.current?.focus());
  };

  useEffect(() => {
    setSessionNotesVal(currentSession?.notes ?? '');
  }, [currentSession?.id, currentSession?.notes]);

  if (!activeClass) return <NoClass />;

  if (!isLoading && (sessions as Session[]).length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <QueueListIcon className="h-12 w-12 mb-3 opacity-40" />
        <p className="text-lg font-medium">No sessions configured</p>
        <p className="text-sm mb-4">Set up sessions before recording attendance.</p>
        <Link
          to="/sessions"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Go to Sessions Setup →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{activeClass.name}</h1>
      </div>

      {/* Session tabs */}
      <div className="flex flex-wrap gap-2">
        {(sessions as Session[]).map((s) => (
          <button
            key={s.id}
            onClick={() => setSelectedSessionId(s.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors border ${
              currentSession?.id === s.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-indigo-50'
            }`}
          >
            Session {s.session_number}
            {s.date && <span className="ml-1 text-xs opacity-70">{s.date}</span>}
          </button>
        ))}
      </div>

      {currentSession && (
        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          {pastLocked && !pastUnlocked && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <div className="flex items-center gap-2 min-w-0">
                <LockClosedIcon className="h-5 w-5 shrink-0 text-amber-800" aria-hidden />
                <span>
                  This session&apos;s date is in the past. Editing is locked to avoid accidental changes.
                </span>
              </div>
              <button
                type="button"
                onClick={unlockPastSession}
                className="shrink-0 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-950"
              >
                Unlock
              </button>
            </div>
          )}
          {/* Session header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <CalendarDaysIcon className="h-5 w-5 text-indigo-500" />
              <span className="font-semibold text-gray-700">
                Session {currentSession.session_number}
                {currentSession.label && ` — ${currentSession.label}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {editingDate === currentSession.id && !readOnly ? (
                <>
                  <input
                    type="date"
                    value={dateVal}
                    onChange={(e) => setDateVal(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => {
                      updateSession.mutate({ id: currentSession.id, patch: { date: dateVal } });
                      setEditingDate(null);
                    }}
                    className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingDate(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </>
              ) : readOnly ? (
                <span className="text-xs text-gray-500">
                  {currentSession.date ? `Date: ${currentSession.date}` : 'No date set'}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => { setDateVal(currentSession.date ?? ''); setEditingDate(currentSession.id); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                  {currentSession.date ? `Date: ${currentSession.date}` : 'Set date'}
                </button>
              )}
            </div>
          </div>

          <div className="px-6 py-4 border-b border-gray-100 bg-white">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  Live attendance: {attendanceCounts.attending}/{attendanceCounts.total}
                </span>
                <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700">
                  Present {attendanceCounts.present}
                </span>
                <span className="rounded-full bg-yellow-50 px-2.5 py-1 text-xs text-yellow-700">
                  Late {attendanceCounts.late}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                  Excused {attendanceCounts.excused}
                </span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700">
                  Absent {attendanceCounts.absent}
                </span>
              </div>
              <label htmlFor="quick-attendance" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Quick mark present
              </label>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  id="quick-attendance"
                  ref={quickSearchRef}
                  type="text"
                  value={quickSearch}
                  disabled={readOnly}
                  placeholder="Type a student name, then press Enter"
                  onChange={(e) => setQuickSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      quickMarkPresent();
                    }
                    if (e.key === 'Escape') setQuickSearch('');
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 md:max-w-md disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                />
                <p className="text-xs text-gray-500">
                  Enter marks the first match as present.
                </p>
              </div>
              {quickSearch.trim() && !readOnly && (
                quickMatches.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {quickMatches.map((student) => {
                      const currentStatus = attendanceMap[student.id]?.status ?? 'absent';
                      return (
                        <button
                          type="button"
                          key={student.id}
                          onClick={() => handleAttendanceChange(student.id, 'present')}
                          className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-indigo-50 hover:border-indigo-300"
                        >
                          {student.name} ({currentStatus})
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No matching students.</p>
                )
              )}
              <label htmlFor="quick-contribution" className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Quick increase contribution
              </label>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <input
                  id="quick-contribution"
                  ref={quickContributionRef}
                  type="text"
                  value={quickContributionSearch}
                  disabled={readOnly}
                  placeholder="Type a student name, then press Enter"
                  onChange={(e) => setQuickContributionSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      quickIncreaseTopContribution();
                    }
                    if (e.key === 'Escape') setQuickContributionSearch('');
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 md:max-w-md disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                />
                <p className="text-xs text-gray-500">
                  Enter increases the first match by +1 (max 3, not for absent students).
                </p>
              </div>
              {quickContributionSearch.trim() && !readOnly && (
                quickContributionMatches.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {quickContributionMatches.map((student) => {
                      const currentStatus: AttendanceStatus = attendanceMap[student.id]?.status ?? 'absent';
                      const currentRating = participationMap[student.id]?.contribution_rating ?? 0;
                      const disabled = currentStatus === 'absent';
                      return (
                        <button
                          type="button"
                          key={`contrib-${student.id}`}
                          onClick={() => quickIncreaseContribution(student.id)}
                          disabled={disabled}
                          className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-indigo-50 hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {student.name} ({currentRating} {'->'} {Math.min(3, currentRating + 1)})
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No matching students.</p>
                )
              )}
            </div>
          </div>

          {/* Table */}
          {(students as Student[]).length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              No students found. Import students in Settings.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Attendance</th>
                    <th className="px-4 py-3">Interruptions</th>
                    <th className="px-4 py-3">Contribution</th>
                    <th className="px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(students as Student[]).map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      sessionId={currentSession.id}
                      attendance={attendanceMap[student.id]}
                      participation={participationMap[student.id]}
                      readOnly={readOnly}
                      onAttendanceChange={handleAttendanceChange}
                      onParticipationChange={handleParticipationChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Session notes */}
          <div className="px-6 py-4 border-t border-gray-100 bg-white">
            <label htmlFor="session-notes" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Session notes
            </label>
            <textarea
              id="session-notes"
              value={sessionNotesVal}
              onChange={(e) => setSessionNotesVal(e.target.value)}
              rows={4}
              disabled={readOnly}
              placeholder="Add notes for this session..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                These notes are saved per session.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => setSessionNotesVal(currentSession.notes ?? '')}
                  className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() =>
                    updateSession.mutate({
                      id: currentSession.id,
                      patch: { notes: sessionNotesVal.trim() ? sessionNotesVal : null },
                    })
                  }
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
                >
                  Save notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
