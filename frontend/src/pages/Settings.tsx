import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CanvasCourse, CanvasSection, Class } from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusCircleIcon,
  TrashIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Per-course row with optional section expansion ───────────────────────────

interface CourseRowProps {
  course: CanvasCourse;
  baseUrl: string;
  importedKeys: Set<string>;
  onImport: (course: CanvasCourse, section?: CanvasSection) => void;
  importing: boolean;
}

function CourseRow({ course, importedKeys, onImport, importing }: CourseRowProps) {
  const [expanded, setExpanded] = useState(false);

  const {
    data: sections,
    isFetching: loadingSections,
    error: sectionsError,
    refetch: fetchSections,
  } = useQuery({
    queryKey: ['canvas-sections', course.id],
    queryFn: () => api.canvas.sections(course.id),
    enabled: false,
    retry: false,
    staleTime: Infinity,
  });

  const toggleExpand = () => {
    if (!expanded && !sections) fetchSections();
    setExpanded((v) => !v);
  };

  const wholeImported = importedKeys.has(`${course.id}:null`);

  return (
    <li className="bg-white">
      {/* Course header row */}
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={toggleExpand}
            className="text-gray-400 hover:text-indigo-600 flex-shrink-0"
            title="Show sections"
          >
            {expanded
              ? <ChevronDownIcon className="h-4 w-4" />
              : <ChevronRightIcon className="h-4 w-4" />}
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{course.name}</p>
            <p className="text-xs text-gray-400">{course.course_code} · ID {course.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {wholeImported ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircleIcon className="h-4 w-4" /> Added
            </span>
          ) : (
            <button
              onClick={() => onImport(course)}
              disabled={importing}
              className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <PlusCircleIcon className="h-4 w-4" />
              Import all
            </button>
          )}
        </div>
      </div>

      {/* Sections panel */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
          {loadingSections && (
            <p className="flex items-center gap-1 text-xs text-gray-500 py-2">
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Loading sections…
            </p>
          )}
          {sectionsError && (
            <p className="flex items-center gap-1 text-xs text-red-500 py-2">
              <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              {(sectionsError as Error).message}
            </p>
          )}
          {sections && sections.length === 0 && (
            <p className="text-xs text-gray-400 py-2 italic">No sections found.</p>
          )}
          {sections && sections.length > 0 && (
            <ul className="space-y-1 py-1">
              {sections.map((section) => {
                const sectionImported = importedKeys.has(`${course.id}:${section.id}`);
                return (
                  <li
                    key={section.id}
                    className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-700">{section.name}</p>
                      <p className="text-xs text-gray-400">Section ID {section.id}</p>
                    </div>
                    {sectionImported ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <CheckCircleIcon className="h-3.5 w-3.5" /> Added
                      </span>
                    ) : (
                      <button
                        onClick={() => onImport(course, section)}
                        disabled={importing}
                        className="flex items-center gap-1 rounded-md bg-indigo-50 border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        <PlusCircleIcon className="h-3.5 w-3.5" />
                        Import section
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export default function Settings() {
  const qc = useQueryClient();
  const { setActiveClass } = useActiveClass();

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  // Email settings state
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpSecure, setSmtpSecure] = useState('');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [emailFrom, setEmailFrom] = useState('');
  const [emailSavedMsg, setEmailSavedMsg] = useState('');

  const saveEmailSettingsMutation = useMutation({
    mutationFn: async () => {
      const updates: [string, string][] = [
        ['smtp_host', smtpHost.trim()],
        ['smtp_port', smtpPort.trim()],
        ['smtp_secure', smtpSecure],
        ['smtp_user', smtpUser.trim()],
        ['smtp_pass', smtpPass],
        ['email_from', emailFrom.trim()],
      ];
      for (const [key, value] of updates) {
        if (value !== '') await api.settings.set(key, value);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setEmailSavedMsg('Saved!');
      setTimeout(() => setEmailSavedMsg(''), 2000);
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (baseUrl.trim()) await api.settings.set('canvas_base_url', baseUrl.trim());
      if (token.trim()) await api.settings.set('canvas_token', token.trim());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSavedMsg('Saved!');
      setTimeout(() => setSavedMsg(''), 2000);
    },
  });

  const {
    data: canvasCourses,
    refetch: fetchCourses,
    isFetching: loadingCourses,
    error: coursesError,
  } = useQuery({
    queryKey: ['canvas-courses'],
    queryFn: api.canvas.courses,
    enabled: false,
    retry: false,
  });

  const { data: localClasses = [] } = useQuery({
    queryKey: ['classes'],
    queryFn: api.classes.list,
  });

  // Set keyed as "courseId:sectionId" (sectionId = "null" for whole-course imports)
  const importedKeys = new Set(
    (localClasses as Class[]).map(
      (c) => `${c.canvas_course_id}:${c.canvas_section_id ?? 'null'}`,
    ),
  );

  const importMutation = useMutation({
    mutationFn: async ({
      course,
      section,
    }: {
      course: CanvasCourse;
      section?: CanvasSection;
    }) => {
      const name = section ? `${course.name} — ${section.name}` : course.name;
      const cls = await api.classes.create({
        canvas_course_id: String(course.id),
        name,
        canvas_base_url: settings?.canvas_base_url ?? '',
        ...(section
          ? { canvas_section_id: String(section.id), canvas_section_name: section.name }
          : {}),
      });
      const canvasStudents = await api.canvas.students(course.id, section?.id);
      await api.classes.syncStudents(
        cls.id,
        canvasStudents.map((s) => ({
          canvas_user_id: String(s.id),
          name: s.name,
          email: s.email ?? s.login_id ?? '',
          sortable_name: s.sortable_name ?? s.name,
        })),
      );
      return cls;
    },
    onSuccess: (cls) => {
      qc.invalidateQueries({ queryKey: ['classes'] });
      setActiveClass(cls);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.classes.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['classes'] }),
  });

  const syncStudentsMutation = useMutation({
    mutationFn: async (cls: Class) => {
      const canvasStudents = await api.canvas.students(
        Number(cls.canvas_course_id),
        cls.canvas_section_id ? Number(cls.canvas_section_id) : undefined,
      );
      return api.classes.syncStudents(
        cls.id,
        canvasStudents.map((s) => ({
          canvas_user_id: String(s.id),
          name: s.name,
          email: s.email ?? s.login_id ?? '',
          sortable_name: s.sortable_name ?? s.name,
        })),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] }),
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Canvas credentials */}
      <SectionCard title="Canvas API Connection">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Canvas Base URL</label>
            <input
              type="url"
              placeholder={settings?.canvas_base_url || 'https://your-institution.instructure.com'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
            <input
              type="password"
              placeholder={settings?.canvas_token ? '••••••••••••' : 'Paste your Canvas token'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Generate a token in Canvas under Account → Settings → New Access Token.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            {savedMsg && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircleIcon className="h-4 w-4" /> {savedMsg}
              </span>
            )}
            {settings?.canvas_base_url && (
              <span className="text-xs text-gray-400">Connected to: {settings.canvas_base_url}</span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Browse Canvas courses */}
      <SectionCard title="Browse Canvas Courses">
        <div className="space-y-4">
          <button
            onClick={() => fetchCourses()}
            disabled={loadingCourses}
            className="flex items-center gap-2 rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loadingCourses ? 'animate-spin' : ''}`} />
            {loadingCourses ? 'Loading…' : 'Fetch my Canvas courses'}
          </button>

          {coursesError && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <ExclamationTriangleIcon className="h-4 w-4" />
              {(coursesError as Error).message}
            </div>
          )}

          {canvasCourses && canvasCourses.length === 0 && (
            <p className="text-sm text-gray-500">No courses found.</p>
          )}

          {canvasCourses && canvasCourses.length > 0 && (
            <>
              <p className="text-xs text-gray-400">
                Click ▶ next to a course to browse its sections.
              </p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                {canvasCourses.map((course) => (
                  <CourseRow
                    key={course.id}
                    course={course}
                    baseUrl={settings?.canvas_base_url ?? ''}
                    importedKeys={importedKeys}
                    onImport={(course, section) => importMutation.mutate({ course, section })}
                    importing={importMutation.isPending}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </SectionCard>

      {/* Email / SMTP settings */}
      <SectionCard title="Email Settings">
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            Configure your outgoing mail server. These credentials are stored in your profile and used when sending emails to students.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
              <input
                type="text"
                placeholder={settings?.smtp_host || 'smtp.example.com'}
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Port</label>
              <input
                type="number"
                placeholder={settings?.smtp_port || '587'}
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="smtp-secure"
              type="checkbox"
              checked={smtpSecure === '1' || (smtpSecure === '' && settings?.smtp_secure === '1')}
              onChange={(e) => setSmtpSecure(e.target.checked ? '1' : '0')}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="smtp-secure" className="text-sm font-medium text-gray-700">
              Use TLS/SSL
              <span className="ml-1 text-xs text-gray-400">(enable for port 465)</span>
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Username</label>
            <input
              type="text"
              placeholder={settings?.smtp_user || 'you@example.com'}
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Password</label>
            <input
              type="password"
              placeholder={settings?.smtp_pass ? '••••••••••••' : 'SMTP password or app password'}
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input
              type="email"
              placeholder={settings?.email_from || 'you@example.com'}
              value={emailFrom}
              onChange={(e) => setEmailFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              The sender address that appears in the student's inbox.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => saveEmailSettingsMutation.mutate()}
              disabled={saveEmailSettingsMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save
            </button>
            {emailSavedMsg && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircleIcon className="h-4 w-4" /> {emailSavedMsg}
              </span>
            )}
            {settings?.smtp_host && (
              <span className="text-xs text-gray-400">Connected to: {settings.smtp_host}</span>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Manage local classes */}
      <SectionCard title="Manage Classes">
        {(localClasses as Class[]).length === 0 ? (
          <p className="text-sm text-gray-500">No classes imported yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            {(localClasses as Class[]).map((cls) => (
              <li key={cls.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{cls.name}</p>
                  <p className="text-xs text-gray-400">
                    Course {cls.canvas_course_id}
                    {cls.canvas_section_id && ` · Section ${cls.canvas_section_id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => syncStudentsMutation.mutate(cls)}
                    disabled={syncStudentsMutation.isPending}
                    title="Re-sync students from Canvas"
                    className="flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    Sync students
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${cls.name}" and all its data?`)) {
                        deleteMutation.mutate(cls.id);
                      }
                    }}
                    className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete class"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
