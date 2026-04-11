import { useState, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { GroupAssignment } from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import {
  SparklesIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  Squares2X2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PaperClipIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  fileBase64: string | null;
  fileName: string | null;
  fileType: string | null;
}

// ─── Role colour palette ──────────────────────────────────────────────────────

const ROLE_COLOURS = [
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-teal-100 text-teal-800 border-teal-200',
];

function roleColour(roleName: string, roleIndex: Map<string, number>) {
  let idx = roleIndex.get(roleName);
  if (idx === undefined) {
    idx = roleIndex.size;
    roleIndex.set(roleName, idx);
  }
  return ROLE_COLOURS[idx % ROLE_COLOURS.length];
}

// ─── Personalise a template string with student data ─────────────────────────
// Mirrors the server-side personalize() function in backend/routes/groups.js

function personalizeTemplate(
  template: string,
  a: GroupAssignment,
  date: string,
): string {
  const parts = a.student_sortable_name.split(',');
  const lastName = parts[0]?.trim() || a.student_name;
  const firstName = parts[1]?.trim() || a.student_name.split(' ')[0] || a.student_name;
  return template
    .replace(/\{\{name\}\}/g, a.student_name)
    .replace(/\{\{first_name\}\}/g, firstName)
    .replace(/\{\{last_name\}\}/g, lastName)
    .replace(/\{\{group_number\}\}/g, String(a.group_number))
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{role\}\}/g, a.role)
    .replace(/\{\{group_members\}\}/g, a.group_members);
}

// ─── File reader helper ───────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      resolve(dataUrl.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Group visualisation card ─────────────────────────────────────────────────

interface GroupCardProps {
  groupNumber: number;
  members: GroupAssignment[];
  roleIndex: Map<string, number>;
}

function GroupCard({ groupNumber, members, roleIndex }: GroupCardProps) {
  const isObserver = groupNumber === 0;
  const title = isObserver ? 'Observers' : `Group ${groupNumber}`;
  return (
    <div className="flex-shrink-0 w-44 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div
        className={`px-3 py-2 text-xs font-semibold ${
          isObserver ? 'bg-gray-100 text-gray-600' : 'bg-indigo-600 text-white'
        }`}
      >
        {title}
      </div>
      <ul className="divide-y divide-gray-100">
        {members.map((m) => (
          <li key={m.student_id} className="px-3 py-2">
            <p className="text-xs font-medium text-gray-800 truncate">{m.student_name}</p>
            <span
              className={`inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleColour(m.role, roleIndex)}`}
            >
              {m.role}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Individual email editor row ──────────────────────────────────────────────

interface EmailRowProps {
  assignment: GroupAssignment;
  subject: string;
  body: string;
  selected: boolean;
  hasAttachment: boolean;
  attachmentName: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onToggle: () => void;
  roleIndex: Map<string, number>;
}

function EmailRow({
  assignment,
  subject,
  body,
  selected,
  hasAttachment,
  attachmentName,
  onSubjectChange,
  onBodyChange,
  onToggle,
  roleIndex,
}: EmailRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isObserver = assignment.group_number === 0;

  return (
    <li className={`border border-gray-200 rounded-xl overflow-hidden ${!selected ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3 bg-white">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{assignment.student_name}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleColour(assignment.role, roleIndex)}`}>
              {assignment.role}
            </span>
            <span className="text-xs text-gray-400">
              {isObserver ? 'Observer' : `Group ${assignment.group_number}`}
            </span>
            {hasAttachment && (
              <span className="flex items-center gap-0.5 text-[10px] text-indigo-500" title={`Attachment: ${attachmentName}`}>
                <PaperClipIcon className="h-3 w-3" />
                {attachmentName}
              </span>
            )}
          </div>
          {assignment.student_email && (
            <p className="text-xs text-gray-400 truncate">{assignment.student_email}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-indigo-600 flex-shrink-0"
          title={expanded ? 'Collapse' : 'Expand to edit'}
        >
          {expanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Subject</span>
            <input
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Body</span>
            <textarea
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono min-h-[140px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </li>
  );
}

// ─── No class guard ───────────────────────────────────────────────────────────

function NoClass() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <Squares2X2Icon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">No class selected</p>
      <p className="text-sm">Choose a class from the sidebar.</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const DEFAULT_SUBJECT_TPL = 'Group assignment';
const DEFAULT_BODY_TPL =
  'Hi {{first_name}},\n\nFor the group exercise in the class on {{date}}, you are assigned to role {{role}}. Your group is {{group_members}}.';

export default function Groups() {
  const { activeClass } = useActiveClass();

  // Step 1 — request
  const [prompt, setPrompt] = useState('');
  const [exerciseDate, setExerciseDate] = useState('');
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Shared email template
  const [subjectTpl, setSubjectTpl] = useState(DEFAULT_SUBJECT_TPL);
  const [bodyTpl, setBodyTpl] = useState(DEFAULT_BODY_TPL);

  // Role definitions (descriptions + attachments, optional)
  const [roleDefs, setRoleDefs] = useState<RoleDefinition[]>([]);
  const [showRoleDefs, setShowRoleDefs] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Step 2 — assignments + local email edits
  const [assignments, setAssignments] = useState<GroupAssignment[]>([]);
  const [interpretation, setInterpretation] = useState('');
  const [missedStudents, setMissedStudents] = useState<{ id: number; name: string }[]>([]);
  // Individual email overrides (subject/body per student_id)
  const [subjects, setSubjects] = useState<Record<number, string>>({});
  const [bodies, setBodies] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Step 3 — send
  const [smtpPass, setSmtpPass] = useState('');
  const [sendNote, setSendNote] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: emailStatus } = useQuery({
    queryKey: ['email-status'],
    queryFn: api.email.status,
    staleTime: 60_000,
  });

  // ── Role def helpers ──────────────────────────────────────────────────────

  function addRoleDef(name = '') {
    const id = crypto.randomUUID();
    setRoleDefs((prev) => [...prev, { id, name, description: '', fileBase64: null, fileName: null, fileType: null }]);
    setShowRoleDefs(true);
  }

  function removeRoleDef(id: string) {
    setRoleDefs((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRoleDef(id: string, patch: Partial<RoleDefinition>) {
    setRoleDefs((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleFileChange(roleId: string, file: File | null) {
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`"${file.name}" is too large. Max 5 MB per attachment.`);
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      updateRoleDef(roleId, { fileBase64: base64, fileName: file.name, fileType: file.type || 'application/octet-stream' });
    } catch {
      setFileError('Could not read file. Please try again.');
    }
  }

  // ── Template helper ───────────────────────────────────────────────────────

  /** Re-apply the shared template to all students using current exerciseDate. */
  function applyTemplate(currentAssignments: GroupAssignment[], currentDate: string) {
    const subj: Record<number, string> = {};
    const bod: Record<number, string> = {};
    for (const a of currentAssignments) {
      subj[a.student_id] = personalizeTemplate(subjectTpl, a, currentDate);
      bod[a.student_id] = personalizeTemplate(bodyTpl, a, currentDate);
    }
    setSubjects(subj);
    setBodies(bod);
  }

  // ── Generate mutation ─────────────────────────────────────────────────────

  const generateMutation = useMutation({
    mutationFn: () => {
      const roleDescriptionsToSend = roleDefs
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          description: r.description.trim(),
          has_attachment: Boolean(r.fileBase64),
        }));
      return api.groups.generate(activeClass!.id, prompt, {
        date: exerciseDate.trim() || undefined,
        emailTemplate: { subject: subjectTpl, body: bodyTpl },
        roleDescriptions: roleDescriptionsToSend.length > 0 ? roleDescriptionsToSend : undefined,
      });
    },
    onSuccess: (result) => {
      setGenerateError(null);
      setAssignments(result.assignments);
      setInterpretation(result.interpretation);
      setMissedStudents(result.missed_students ?? []);

      // Use the already-personalized values from the backend
      const subj: Record<number, string> = {};
      const bod: Record<number, string> = {};
      const sel = new Set<number>();
      for (const a of result.assignments) {
        subj[a.student_id] = a.email_subject;
        bod[a.student_id] = a.email_body;
        sel.add(a.student_id);
      }
      setSubjects(subj);
      setBodies(bod);
      setSelected(sel);
      setSendNote(null);
      setSendError(null);

      // Auto-populate role defs for any newly detected roles
      const detectedRoles = [...new Set(result.assignments.map((a) => a.role))];
      setRoleDefs((prev) => {
        const existingNames = new Set(prev.map((r) => r.name.toLowerCase().trim()));
        const toAdd = detectedRoles.filter((name) => !existingNames.has(name.toLowerCase().trim()));
        if (toAdd.length === 0) return prev;
        setShowRoleDefs(true);
        return [
          ...prev,
          ...toAdd.map((name) => ({
            id: crypto.randomUUID(),
            name,
            description: '',
            fileBase64: null,
            fileName: null,
            fileType: null,
          })),
        ];
      });
    },
    onError: (err: Error) => {
      setGenerateError(err.message);
    },
  });

  // ── Send mutation ─────────────────────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: () => {
      const emails = assignments
        .filter((a) => selected.has(a.student_id))
        .map((a) => ({
          student_id: a.student_id,
          subject: subjects[a.student_id] ?? a.email_subject,
          body: bodies[a.student_id] ?? a.email_body,
          role: a.role,
        }));

      const roleAttachments = roleDefs
        .filter((r) => r.name.trim() && r.fileBase64)
        .map((r) => ({
          role: r.name.trim(),
          filename: r.fileName!,
          content: r.fileBase64!,
          content_type: r.fileType || 'application/octet-stream',
        }));

      return api.groups.send(
        activeClass!.id,
        emails,
        smtpPass || undefined,
        roleAttachments.length > 0 ? roleAttachments : undefined,
      );
    },
    onSuccess: (result) => {
      setSendError(null);
      const failCount = result.failed.length;
      if (failCount === 0) {
        setSendNote(`Sent to ${result.sent.length} student(s).`);
      } else {
        setSendNote(
          `Sent to ${result.sent.length}; ${failCount} failed (${result.failed.map((f) => f.error).join('; ')}).`,
        );
      }
    },
    onError: (err: Error) => {
      setSendNote(null);
      setSendError(err.message);
    },
  });

  // ── Derived ───────────────────────────────────────────────────────────────

  const roleIndex = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      if (!map.has(a.role)) map.set(a.role, map.size);
    }
    return map;
  }, [assignments]);

  const groupMap = useMemo(() => {
    const map = new Map<number, GroupAssignment[]>();
    for (const a of assignments) {
      const list = map.get(a.group_number) ?? [];
      list.push(a);
      map.set(a.group_number, list);
    }
    return new Map(
      [...map.entries()].sort(([a], [b]) => {
        if (a === 0) return 1;
        if (b === 0) return -1;
        return a - b;
      }),
    );
  }, [assignments]);

  const attachmentByRole = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roleDefs) {
      if (r.name && r.fileBase64 && r.fileName) {
        map.set(r.name.toLowerCase().trim(), r.fileName);
      }
    }
    return map;
  }, [roleDefs]);

  const allSelected = assignments.length > 0 && selected.size === assignments.length;
  const smtpOk = emailStatus?.smtp_configured === true;
  const canSend = smtpOk && selected.size > 0 && smtpPass.trim() && assignments.length > 0 && !sendMutation.isPending;

  if (!activeClass) return <NoClass />;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Squares2X2Icon className="h-8 w-8 text-indigo-600" />
          Group Assignment
        </h1>
        <p className="text-gray-500 mt-1">
          Describe your grouping in plain English. The AI assigns students to groups;
          emails are generated from the template below.
        </p>
      </div>

      {/* ── Step 1: Request ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-indigo-500" />
          Describe the grouping
        </h2>

        {/* Date */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">
            Exercise date <span className="font-normal text-gray-400">(used in email as <code className="bg-gray-100 px-1 rounded">{'{{date}}'}</code>)</span>
          </span>
          <input
            type="text"
            className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Tuesday, April 15"
            value={exerciseDate}
            onChange={(e) => setExerciseDate(e.target.value)}
          />
        </label>

        {/* Prompt */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Grouping request</span>
          <textarea
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Assign everyone to triads. In each triad randomly assign one of three roles: Michael, Phuc, and Georg. Put the extras as observers."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>

        {/* Email template */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Email template
          </p>
          <p className="text-xs text-gray-400">
            Placeholders: <code className="bg-gray-100 px-1 rounded">{'{{first_name}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{date}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{role}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{group_members}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{group_number}}'}</code>
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Subject</span>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={subjectTpl}
              onChange={(e) => setSubjectTpl(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Body</span>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono min-h-[100px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={bodyTpl}
              onChange={(e) => setBodyTpl(e.target.value)}
            />
          </label>
          {assignments.length > 0 && (
            <button
              type="button"
              onClick={() => applyTemplate(assignments, exerciseDate)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Re-apply template to all emails
            </button>
          )}
        </div>

        {/* Role definitions (optional, collapsible) */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
          <button
            type="button"
            onClick={() => setShowRoleDefs((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            {showRoleDefs ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
            Role descriptions &amp; attachments
            <span className="text-xs font-normal text-gray-400">(optional — fills automatically after generating)</span>
          </button>

          {showRoleDefs && (
            <div className="space-y-3 pt-1">
              {roleDefs.map((role) => (
                <div key={role.id} className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Role name (e.g. Michael)"
                      value={role.name}
                      onChange={(e) => updateRoleDef(role.id, { name: e.target.value })}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => removeRoleDef(role.id)} className="text-gray-400 hover:text-red-500" title="Remove role">
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    placeholder="Describe this role's responsibilities (context for AI)…"
                    value={role.description}
                    onChange={(e) => updateRoleDef(role.id, { description: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm min-h-[70px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[role.id]?.click()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      <PaperClipIcon className="h-3.5 w-3.5" />
                      {role.fileName ? 'Change file' : 'Attach file'}
                    </button>
                    {role.fileName && (
                      <>
                        <span className="text-xs text-gray-600 truncate max-w-[180px]">{role.fileName}</span>
                        <button
                          type="button"
                          onClick={() => updateRoleDef(role.id, { fileBase64: null, fileName: null, fileType: null })}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </>
                    )}
                    <input
                      type="file"
                      className="sr-only"
                      ref={(el) => { fileInputRefs.current[role.id] = el; }}
                      onChange={(e) => void handleFileChange(role.id, e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>
              ))}

              {fileError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                  {fileError}
                </p>
              )}

              <button
                type="button"
                onClick={() => addRoleDef()}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add role
              </button>
            </div>
          )}
        </div>

        {/* Generate */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={!prompt.trim() || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${generateMutation.isPending ? 'animate-spin' : ''}`} />
            {generateMutation.isPending ? 'Generating…' : assignments.length > 0 ? 'Re-generate' : 'Generate groups'}
          </button>
          {assignments.length > 0 && (
            <span className="text-xs text-gray-400">{assignments.length} student(s) assigned</span>
          )}
        </div>

        {generateError && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {generateError}
          </div>
        )}
      </div>

      {/* ── Step 2: Review ──────────────────────────────────────────────────── */}
      {assignments.length > 0 && (
        <>
          {interpretation && (
            <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
              <SparklesIcon className="h-5 w-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">AI summary: </span>
                {interpretation}
              </div>
            </div>
          )}

          {missedStudents.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{missedStudents.length} student(s) not assigned:</span>{' '}
                {missedStudents.map((s) => s.name).join(', ')}. Try re-generating.
              </div>
            </div>
          )}

          {/* Group grid */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Groups</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {[...groupMap.entries()].map(([groupNum, members]) => (
                <GroupCard key={groupNum} groupNumber={groupNum} members={members} roleIndex={roleIndex} />
              ))}
            </div>
          </div>

          {/* Individual email list */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Draft emails
              </h2>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    if (allSelected) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(assignments.map((a) => a.student_id)));
                    }
                  }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                Select all ({selected.size}/{assignments.length})
              </label>
            </div>
            <ul className="space-y-2">
              {assignments.map((a) => {
                const roleLower = a.role.toLowerCase().trim();
                const attName = attachmentByRole.get(roleLower) ?? '';
                return (
                  <EmailRow
                    key={a.student_id}
                    assignment={a}
                    subject={subjects[a.student_id] ?? a.email_subject}
                    body={bodies[a.student_id] ?? a.email_body}
                    selected={selected.has(a.student_id)}
                    hasAttachment={attachmentByRole.has(roleLower)}
                    attachmentName={attName}
                    onSubjectChange={(v) => setSubjects((prev) => ({ ...prev, [a.student_id]: v }))}
                    onBodyChange={(v) => setBodies((prev) => ({ ...prev, [a.student_id]: v }))}
                    onToggle={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        next.has(a.student_id) ? next.delete(a.student_id) : next.add(a.student_id);
                        return next;
                      })
                    }
                    roleIndex={roleIndex}
                  />
                );
              })}
            </ul>
          </div>

          {/* ── Step 3: Send ──────────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <PaperAirplaneIcon className="h-4 w-4 text-indigo-500" />
              Send emails
            </h2>

            {!smtpOk && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                SMTP is not configured (<code className="text-amber-900">SMTP_HOST</code>,{' '}
                <code className="text-amber-900">EMAIL_FROM</code> in{' '}
                <code className="text-amber-900">backend/.env</code>). Sending is disabled.
              </p>
            )}

            <label className="flex flex-col gap-1 max-w-xs">
              <span className="text-xs font-medium text-gray-500">Stanford password (not stored)</span>
              <input
                type="password"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="SUNet password"
                autoComplete="current-password"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!canSend}
                onClick={() => sendMutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                <PaperAirplaneIcon className={`h-4 w-4 ${sendMutation.isPending ? 'animate-pulse' : ''}`} />
                {sendMutation.isPending ? 'Sending…' : `Send to ${selected.size} student(s)`}
              </button>
            </div>

            {sendNote && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                {sendNote}
              </div>
            )}
            {sendError && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {sendError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
