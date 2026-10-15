// AI meeting notes: turns a speaker-labelled transcript into
//   { summary, decisions[], action_items[{owner, items[{task, due, context}]}], topics[{title, notes}], open_questions[] }
//
// Works with ANY OpenAI-compatible chat-completions endpoint:
//   - Ollama (free, local, default):  LLM_BASE_URL=http://ollama:11434/v1   LLM_MODEL=llama3.1:8b
//   - OpenAI:                          LLM_BASE_URL=https://api.openai.com/v1  LLM_API_KEY=sk-...  LLM_MODEL=gpt-4o-mini
//   - vLLM / LM Studio / OpenRouter / Groq / Together etc. — same three variables.
//
// Long meetings are handled map-reduce style: the transcript is split into chunks,
// each chunk is condensed to notes, then the notes are combined into the final result.

const {
  LLM_BASE_URL = 'http://localhost:11434/v1',
  LLM_API_KEY = 'ollama',
  LLM_MODEL = 'llama3.1:8b',
  LLM_CHUNK_CHARS = '24000',     // transcript characters per chunk (lower this for small-context models)
  LLM_TIMEOUT_MS = '600000',
} = process.env;

const fmt = (sec) => {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

async function chat(messages, json = false) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(LLM_TIMEOUT_MS));
  try {
    const r = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.2,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return data.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/); // models sometimes wrap JSON in prose or ``` fences
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error('LLM did not return valid JSON');
}

const SYSTEM = `You are an expert meeting note-taker for a business team.
You receive a transcript where every line is "[time] Speaker: text". Speaker names are exact and reliable.
Be factual: only include what was actually said. Never invent tasks, owners or dates.
An action item belongs to the person who agreed to do it or was clearly asked to do it.
If a due date/time was mentioned, include it as said ("today", "Friday", "Oct 15"); otherwise use null.`;

const FINAL_SCHEMA = `Return ONLY a JSON object with exactly these keys:
{
  "summary": "5-10 sentence overview of the meeting: purpose, what was discussed, outcomes",
  "decisions": ["each decision that was made"],
  "action_items": [
    { "owner": "<participant name exactly as in transcript, or 'Unassigned'>",
      "items": [ { "task": "clear actionable task", "due": "<due date as said, or null>", "context": "one short line on why / related discussion" } ] }
  ],
  "topics": [ { "title": "topic name", "notes": "2-5 sentences of detailed notes on that topic, mentioning who said what" } ],
  "open_questions": ["unresolved questions or items needing follow-up"]
}
Include EVERY participant who has at least one action item. Use empty arrays when nothing applies.`;

async function summarize(lines, meta) {
  if (!lines.length) {
    return { summary: 'No speech was detected in this recording.', decisions: [], action_items: [], topics: [], open_questions: [] };
  }
  const text = lines.map((l) => `[${fmt(l.start)}] ${l.speaker}: ${l.text}`).join('\n');
  const header = `Meeting room: ${meta.room}\nDate: ${meta.date}\nParticipants: ${meta.participants.join(', ')}\n`;
  const chunkSize = Number(LLM_CHUNK_CHARS);

  let material = text;
  if (text.length > chunkSize) {
    // MAP: condense each chunk to detailed notes (keeping who-said-what and every commitment)
    const chunks = [];
    let cur = '';
    for (const line of text.split('\n')) {
      if (cur.length + line.length > chunkSize && cur) { chunks.push(cur); cur = ''; }
      cur += line + '\n';
    }
    if (cur) chunks.push(cur);
    const partials = [];
    for (let i = 0; i < chunks.length; i++) {
      partials.push(
        await chat([
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: `${header}This is part ${i + 1} of ${chunks.length} of the transcript.\n` +
              `Write detailed notes for this part: topics discussed with who said what, decisions, and EVERY commitment/action item with its owner and any due date.\n\n${chunks[i]}`,
          },
        ])
      );
    }
    material = partials.map((p, i) => `--- Notes for part ${i + 1} ---\n${p}`).join('\n\n');
  }

  // REDUCE: final structured notes
  const raw = await chat(
    [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${header}\n${material}\n\n${FINAL_SCHEMA}` },
    ],
    true
  );
  const n = parseJson(raw);
  return {
    summary: n.summary || '',
    decisions: Array.isArray(n.decisions) ? n.decisions : [],
    action_items: (Array.isArray(n.action_items) ? n.action_items : [])
      .filter((p) => p && p.owner && Array.isArray(p.items) && p.items.length),
    topics: Array.isArray(n.topics) ? n.topics : [],
    open_questions: Array.isArray(n.open_questions) ? n.open_questions : [],
    model: LLM_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { summarize, fmt };
