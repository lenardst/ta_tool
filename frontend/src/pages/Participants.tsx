import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Student } from '../api/client';
import { useActiveClass } from '../context/ClassContext';
import { UserGroupIcon, PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';

const SYSTEM_PROMPT = `You help a teaching assistant draft emails to students. Be warm, concise, and professional.
When you write message text, make it ready to paste into an email body (no meta-commentary unless asked).
The TA's app supports these personalization tags: {{name}} (full name), {{first_name}} (first name only), {{last_name}} (last name only). You may use any of these in your drafts.`;

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

function NoClass() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
      <UserGroupIcon className="h-12 w-12 mb-3 opacity-40" />
      <p className="text-lg font-medium">No class selected</p>
      <p className="text-sm">Choose a class from the sidebar.</p>
    </div>
  );
}

export default function Participants() {
  const { activeClass } = useActiveClass();
  const [selectionMode, setSelectionMode] = useState<'random' | 'manual'>('random');
  const [sampleCount, setSampleCount] = useState(5);
  const [onlyWithEmail, setOnlyWithEmail] = useState(true);
  const [sampled, setSampled] = useState<Student[]>([]);
  const [manualSearch, setManualSearch] = useState('');
  const [manualSelected, setManualSelected] = useState<Set<number>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'system', content: SYSTEM_PROMPT },
  ]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [smtpPass, setSmtpPass] = useState('');
  const [sendToSelf, setSendToSelf] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNote, setSendNote] = useState<string | null>(null);

  const { data: allStudents = [] } = useQuery({
    queryKey: ['students', activeClass?.id],
    queryFn: () => api.classes.students(activeClass!.id),
    enabled: !!activeClass,
    staleTime: 60_000,
  });

  const { data: emailStatus } = useQuery({
    queryKey: ['email-status'],
    queryFn: () => api.email.status(),
    staleTime: 60_000,
  });

  const sampleMutation = useMutation({
    mutationFn: () =>
      api.classes.sampleStudents(activeClass!.id, {
        count: sampleCount,
        only_with_email: onlyWithEmail,
      }),
    onSuccess: (rows) => {
      setSampled(rows);
      setManualSelected(new Set());
      setSendError(null);
      setSendNote(null);
    },
  });

  const recipients = selectionMode === 'manual'
    ? allStudents.filter((s) => manualSelected.has(s.id))
    : sampled;

  const sendMutation = useMutation({
    mutationFn: () =>
      api.email.send({
        class_id: activeClass!.id,
        student_ids: recipients.map((s) => s.id),
        subject,
        body,
        smtp_pass: smtpPass || undefined,
        self_email: sendToSelf ? 'lenardst@stanford.edu' : undefined,
      }),
    onSuccess: (result) => {
      void refetchHistory();
      setSendError(null);
      const failed = result.failed.length;
      if (failed === 0) {
        setSendNote(`Sent to ${result.sent.length} student(s).`);
      } else {
        setSendNote(
          `Sent to ${result.sent.length}; ${failed} failed (${result.failed.map((f) => f.error).join('; ')}).`,
        );
      }
    },
    onError: (err: Error) => {
      setSendNote(null);
      setSendError(err.message);
    },
  });

  const mailtoHref = useMemo(() => {
    const emails = recipients.map((s) => s.email.trim()).filter(Boolean);
    if (!emails.length || !subject) return null;
    const bcc = emails.join(',');
    const params = new URLSearchParams({
      bcc,
      subject: subject.trim(),
    });
    if (body.trim()) params.set('body', body
      .replace(/\{\{name\}\}/g, '[name]')
      .replace(/\{\{first_name\}\}/g, '[first name]')
      .replace(/\{\{last_name\}\}/g, '[last name]'));
    return `mailto:?${params.toString()}`;
  }, [recipients, subject, body]);

  const lastAssistant = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'assistant') return chatMessages[i].content;
    }
    return null;
  }, [chatMessages]);

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || !activeClass || llmLoading) return;
    setChatError(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatInput('');
    setLlmLoading(true);
    try {
      const { message } = await api.llm.chat(history);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: message }]);
    } catch (err) {
      setChatMessages((prev) => prev.slice(0, -1));
      setChatInput(text);
      setChatError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setLlmLoading(false);
    }
  }

  function applyLastReply(replace: boolean) {
    if (!lastAssistant) return;
    if (replace) setBody(lastAssistant);
    else setBody((b) => (b.trim() ? `${b.trim()}\n\n${lastAssistant}` : lastAssistant));
  }

  if (!activeClass) return <NoClass />;

  const smtpOk = emailStatus?.smtp_configured === true;
  const canSend = smtpOk && recipients.length > 0 && subject.trim() && smtpPass.trim() && sendMutation.isPending === false;

  const filteredStudents = allStudents.filter((s) =>
    s.name.toLowerCase().includes(manualSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(manualSearch.toLowerCase()),
  );

  const { data: emailHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ['email-history', activeClass?.id],
    queryFn: () => api.email.history(activeClass!.id),
    enabled: !!activeClass,
    staleTime: 0,
  });
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserGroupIcon className="h-8 w-8 text-indigo-600" />
          Participants
        </h1>
        <p className="text-gray-500 mt-1">
          Select students, draft a message with the assistant, then send via SMTP or your mail app.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Recipients</h2>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setSelectionMode('random')}
              className={`px-3 py-1 ${selectionMode === 'random' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Random
            </button>
            <button
              type="button"
              onClick={() => setSelectionMode('manual')}
              className={`px-3 py-1 ${selectionMode === 'manual' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Manual
            </button>
          </div>
        </div>

        {selectionMode === 'random' ? (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">How many</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="rounded-lg border border-gray-300 px-3 py-2 w-28 text-sm"
                  value={sampleCount}
                  onChange={(e) => setSampleCount(Number(e.target.value) || 1)}
                />
              </label>
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={onlyWithEmail}
                  onChange={(e) => setOnlyWithEmail(e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Only students with an email</span>
              </label>
              <button
                type="button"
                disabled={sampleMutation.isPending}
                onClick={() => sampleMutation.mutate()}
                className="rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {sampleMutation.isPending ? 'Sampling…' : 'Sample'}
              </button>
            </div>
            {sampleMutation.isError && (
              <p className="text-sm text-red-600">
                {sampleMutation.error instanceof Error ? sampleMutation.error.message : 'Sample failed'}
              </p>
            )}
            {sampled.length > 0 ? (
              <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg max-h-48 overflow-y-auto">
                {sampled.map((s) => (
                  <li key={s.id} className="px-3 py-2 text-sm flex justify-between gap-4">
                    <span className="font-medium text-gray-800">{s.name}</span>
                    <span className="text-gray-500 truncate">{s.email || '—'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">No sample yet. Adjust the count and click Sample.</p>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Search by name or email…"
              value={manualSearch}
              onChange={(e) => setManualSearch(e.target.value)}
            />
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg max-h-64 overflow-y-auto">
              {filteredStudents.map((s) => (
                <li
                  key={s.id}
                  className="px-3 py-2 text-sm flex items-center gap-3 cursor-pointer hover:bg-gray-50"
                  onClick={() =>
                    setManualSelected((prev) => {
                      const next = new Set(prev);
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                      return next;
                    })
                  }
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={manualSelected.has(s.id)}
                    className="rounded border-gray-300 text-indigo-600 pointer-events-none"
                  />
                  <span className="font-medium text-gray-800 flex-1">{s.name}</span>
                  <span className="text-gray-500 truncate">{s.email || '—'}</span>
                </li>
              ))}
              {filteredStudents.length === 0 && (
                <li className="px-3 py-2 text-sm text-gray-400">No students match.</li>
              )}
            </ul>
            <p className="text-xs text-gray-400">{manualSelected.size} student(s) selected</p>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Email</h2>
          {!smtpOk && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              SMTP is not configured (<code className="text-amber-900">SMTP_HOST</code>,{' '}
              <code className="text-amber-900">EMAIL_FROM</code> in{' '}
              <code className="text-amber-900">backend/.env</code>). You can still draft here and open your mail
              client below.
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Subject</span>
            <input
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Quick check-in"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Body</span>
            <textarea
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[200px] font-mono"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{name}}, …"
            />
          </label>
          <p className="text-xs text-gray-400">
            Use{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{name}}'}</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{first_name}}'}</code>, or{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{last_name}}'}</code>{' '}
            to personalize each email.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Stanford password (not stored)</span>
            <input
              type="password"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={smtpPass}
              onChange={(e) => setSmtpPass(e.target.value)}
              placeholder="SUNet password"
              autoComplete="current-password"
            />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={sendToSelf}
              onChange={(e) => setSendToSelf(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Also send to me (lenardst@stanford.edu)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canSend}
              onClick={() => sendMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
              {sendMutation.isPending ? 'Sending…' : 'Send via SMTP'}
            </button>
            {mailtoHref && (
              <a
                href={mailtoHref}
                className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Open in mail app (BCC)
              </a>
            )}
          </div>
          {sendError && <p className="text-sm text-red-600">{sendError}</p>}
          {sendNote && <p className="text-sm text-green-700">{sendNote}</p>}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col h-[min(520px,70vh)]">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <SparklesIcon className="h-5 w-5 text-indigo-500" />
            Draft with LLM
          </h2>
          <p className="text-xs text-gray-400 mt-1 mb-3">
            Describe what you want to say; copy the reply into the body or use the buttons below.
          </p>
          <div className="flex-1 overflow-y-auto space-y-3 min-h-0 border border-gray-100 rounded-lg p-3 bg-gray-50">
            {chatMessages
              .filter((m) => m.role !== 'system')
              .map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`text-sm rounded-lg px-3 py-2 max-w-[95%] whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'ml-auto bg-indigo-100 text-indigo-900'
                      : 'mr-auto bg-white border border-gray-200 text-gray-800'
                  }`}
                >
                  {m.content}
                </div>
              ))}
            {llmLoading && (
              <div className="text-xs text-gray-400 italic mr-auto">Waiting for reply…</div>
            )}
          </div>
          {chatError && <p className="text-xs text-red-600 mt-2">{chatError}</p>}
          <div className="flex gap-2 mt-3">
            <input
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. Draft a short reminder about office hours"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleChatSend();
                }
              }}
            />
            <button
              type="button"
              disabled={!chatInput.trim() || llmLoading}
              onClick={() => void handleChatSend()}
              className="rounded-lg bg-gray-800 text-white px-4 py-2 text-sm font-medium hover:bg-gray-900 disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              disabled={!lastAssistant}
              onClick={() => applyLastReply(true)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
            >
              Replace body with last reply
            </button>
            <button
              type="button"
              disabled={!lastAssistant}
              onClick={() => applyLastReply(false)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-40"
            >
              Append last reply to body
            </button>
          </div>
        </div>
      </div>

      {emailHistory.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Email history</h2>
          <ul className="divide-y divide-gray-100">
            {emailHistory.map((log) => (
              <li key={log.id} className="py-3 space-y-1">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800">{log.subject}</span>
                    <span className="ml-3 text-xs text-gray-400">
                      {new Date(log.sent_at).toLocaleString()} · {log.recipients.length} recipient(s)
                      {log.self_copy ? ' · test copy sent' : ''}
                    </span>
                  </div>
                  <span className="text-xs text-indigo-500">{expandedLog === log.id ? 'hide' : 'show'}</span>
                </div>
                {expandedLog === log.id && (
                  <ul className="mt-2 divide-y divide-gray-50 border border-gray-100 rounded-lg">
                    {log.recipients.map((r) => (
                      <li key={r.student_id} className="px-3 py-1.5 text-sm flex justify-between gap-4">
                        <span className="text-gray-800">{r.name}</span>
                        <span className="text-gray-500">{r.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
