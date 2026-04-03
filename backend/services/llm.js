const fetch = require('node-fetch');

const STANFORD_API_URL = 'https://aiapi-prod.stanford.edu/v1/chat/completions';

/**
 * Strip HTML tags and decode common entities so the LLM receives plain text.
 */
function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Given free-form course text (modules list + syllabus), ask the LLM to
 * extract an ordered list of class sessions.
 *
 * @param {string} text  Raw course content (modules + syllabus, pre-formatted)
 * @returns {Promise<Array<{session_number:number, date:string|null, title:string}>>}
 */
async function extractSessionsFromText(text) {
  const apiKey = process.env.STANFORD_API_KEY;
  if (!apiKey) {
    throw new Error('STANFORD_API_KEY is not set. Add it to backend/.env');
  }

  const prompt = `You are a course-schedule extractor for a teaching assistant tool.

Given the Canvas content below (module names, module items, and/or syllabus text), extract the list of **individual class sessions** (= actual class meetings).

Rules:
- Each entry represents ONE class meeting.
- Assign sequential session_number values starting at 1.
- Extract the date if you can clearly infer it (format: YYYY-MM-DD). Otherwise use null.
- Write a concise title (≤ 70 characters) describing the session topic.
- If a Canvas module spans multiple meetings, split it into separate sessions.
- Ignore administrative items (holidays, no-class weeks, office hours, etc.) unless the course explicitly counts them as sessions.
- Return ONLY a valid JSON array — no markdown fences, no explanation.

Example output:
[
  {"session_number":1,"date":"2024-01-10","title":"Course Introduction & Overview"},
  {"session_number":2,"date":"2024-01-17","title":"Foundations of the Subject"},
  {"session_number":3,"date":null,"title":"Deep Dive: Core Concepts"}
]

Canvas content:
${text.slice(0, 14000)}`;

  const resp = await fetch(STANFORD_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      stream: false,
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Stanford API error ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content ?? '';

  // Extract JSON array (handles occasional markdown fences)
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(`LLM did not return a JSON array. Raw response: ${content.slice(0, 300)}`);
  }

  const sessions = JSON.parse(match[0]);

  // Validate and normalise
  return sessions
    .filter((s) => typeof s.session_number === 'number' && typeof s.title === 'string')
    .map((s) => ({
      session_number: Math.round(s.session_number),
      date: typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) ? s.date : null,
      title: s.title.trim().slice(0, 120),
    }));
}

module.exports = { extractSessionsFromText, stripHtml };
