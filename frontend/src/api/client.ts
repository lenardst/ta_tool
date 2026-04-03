// ─── Types ────────────────────────────────────────────────────────────────────

export interface Settings {
  canvas_base_url?: string;
  canvas_token?: string;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
}

export interface CanvasSection {
  id: number;
  name: string;
  course_id: number;
}

export interface CanvasStudent {
  id: number;
  name: string;
  sortable_name: string;
  email: string;
  login_id: string;
}

export interface Class {
  id: number;
  canvas_course_id: string;
  name: string;
  canvas_base_url: string;
  canvas_section_id: string | null;
  canvas_section_name: string | null;
}

export interface Student {
  id: number;
  class_id: number;
  canvas_user_id: string;
  name: string;
  email: string;
  sortable_name: string;
}

export interface Session {
  id: number;
  class_id: number;
  session_number: number;
  date: string | null;
  label: string | null;
  notes: string | null;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: number;
  session_id: number;
  student_id: number;
  status: AttendanceStatus;
}

export interface AttendanceSummary {
  student_id: number;
  name: string;
  sortable_name: string;
  recorded: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export interface ParticipationRecord {
  id: number;
  session_id: number;
  student_id: number;
  interruptions: number;
  contribution_rating: number | null;
  contribution_note: string;
}

export interface ParticipationSummary {
  student_id: number;
  name: string;
  sortable_name: string;
  total_interruptions: number;
  avg_contribution: number | null;
}

export interface Assignment {
  id: number;
  class_id: number;
  name: string;
  max_points: number;
  description: string;
  sort_order: number;
}

export interface GradeRecord {
  assignment_id: number;
  student_id: number;
  points: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export const api = {
  settings: {
    get: () => apiFetch<Settings>('/api/settings'),
    set: (key: string, value: string) =>
      apiFetch<{ key: string; value: string }>(`/api/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      }),
  },

  // ─── Canvas ───────────────────────────────────────────────────────────────

  canvas: {
    courses: () => apiFetch<CanvasCourse[]>('/api/canvas/courses'),
    sections: (courseId: number) =>
      apiFetch<CanvasSection[]>(`/api/canvas/courses/${courseId}/sections`),
    students: (courseId: number, sectionId?: number) =>
      apiFetch<CanvasStudent[]>(
        `/api/canvas/courses/${courseId}/students${sectionId ? `?section_id=${sectionId}` : ''}`,
      ),
  },

  // ─── Classes ──────────────────────────────────────────────────────────────

  classes: {
    list: () => apiFetch<Class[]>('/api/classes'),
    create: (payload: {
      canvas_course_id: string;
      name: string;
      canvas_base_url: string;
      canvas_section_id?: string;
      canvas_section_name?: string;
    }) => apiFetch<Class>('/api/classes', { method: 'POST', body: JSON.stringify(payload) }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/classes/${id}`, { method: 'DELETE' }),
    students: (classId: number) =>
      apiFetch<Student[]>(`/api/classes/${classId}/students`),
    syncStudents: (
      classId: number,
      students: { canvas_user_id: string; name: string; email: string; sortable_name: string }[],
    ) =>
      apiFetch<Student[]>(`/api/classes/${classId}/sync-students`, {
        method: 'POST',
        body: JSON.stringify({ students }),
      }),
  },

  // ─── Sessions ─────────────────────────────────────────────────────────────

  sessions: {
    list: (classId: number) =>
      apiFetch<Session[]>(`/api/sessions?class_id=${classId}`),
    create: (payload: { class_id: number; session_number?: number; date?: string; label?: string; notes?: string }) =>
      apiFetch<Session>('/api/sessions', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, patch: { date?: string | null; label?: string | null; notes?: string | null }) =>
      apiFetch<Session>(`/api/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
    extractFromCanvas: (classId: number) =>
      apiFetch<{ sessions: Session[]; extracted_count: number }>('/api/sessions/extract', {
        method: 'POST',
        body: JSON.stringify({ class_id: classId }),
      }),
  },

  // ─── Attendance ───────────────────────────────────────────────────────────

  attendance: {
    list: (sessionId: number) =>
      apiFetch<AttendanceRecord[]>(`/api/attendance?session_id=${sessionId}`),
    upsert: (payload: { session_id: number; student_id: number; status: AttendanceStatus }) =>
      apiFetch<AttendanceRecord>('/api/attendance', { method: 'PUT', body: JSON.stringify(payload) }),
    summary: (classId: number) =>
      apiFetch<AttendanceSummary[]>(`/api/attendance/summary?class_id=${classId}`),
  },

  // ─── Participation ────────────────────────────────────────────────────────

  participation: {
    list: (sessionId: number) =>
      apiFetch<ParticipationRecord[]>(`/api/participation?session_id=${sessionId}`),
    upsert: (payload: {
      session_id: number;
      student_id: number;
      interruptions: number;
      contribution_rating: number;
      contribution_note: string;
    }) =>
      apiFetch<ParticipationRecord>('/api/participation', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    summary: (classId: number) =>
      apiFetch<ParticipationSummary[]>(`/api/participation/summary?class_id=${classId}`),
  },

  // ─── Assignments ──────────────────────────────────────────────────────────

  assignments: {
    list: (classId: number) =>
      apiFetch<Assignment[]>(`/api/assignments?class_id=${classId}`),
    create: (payload: { class_id: number; name: string; max_points: number; description?: string }) =>
      apiFetch<Assignment>('/api/assignments', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, patch: { name?: string; max_points?: number; description?: string }) =>
      apiFetch<Assignment>(`/api/assignments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    delete: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/assignments/${id}`, { method: 'DELETE' }),
  },

  // ─── Grades ───────────────────────────────────────────────────────────────

  grades: {
    list: (classId: number) =>
      apiFetch<GradeRecord[]>(`/api/grades?class_id=${classId}`),
    upsert: (payload: { assignment_id: number; student_id: number; points: number | null }) =>
      apiFetch<GradeRecord>('/api/grades', { method: 'PUT', body: JSON.stringify(payload) }),
  },
};
