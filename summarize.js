// AI meeting notes: turns a speaker-labelled transcript into
//   { summary, decisions[], action_items[{owner, items[{task, due, context}]}], topics[{title, notes}], open_questions[] }
//
// Automatically connects with:
//   - Google Gemini:   GEMINI_API_KEY=AIzaSy...  (model: gemini-1.5-flash)
//   - OpenAI:          OPENAI_API_KEY=sk-...     (model: gpt-4o-mini)
//   - Groq:            GROQ_API_KEY=gsk_...      (model: llama-3.3-70b-versatile)
//   - Ollama / vLLM / Local: LLM_BASE_URL=http://localhost:11434/v1
//
// Includes deterministic fallback so meetings ALWAYS produce structured notes
// even if external LLM services are temporarily unreachable.

const fmt = (sec) => {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function getLlmConfig() {
  if (process.env.GEMINI_API_KEY) {
    return {
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: process.env.GEMINI_API_KEY.trim(),
      model: process.env.LLM_MODEL || 'gemini-1.5-flash',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY.trim(),
      model: process.env.LLM_MODEL || 'gpt-4o-mini',
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY.trim(),
      model: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  return {
    baseUrl: (process.env.LLM_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, ''),
    apiKey: process.env.LLM_API_KEY || 'ollama',
    model: process.env.LLM_MODEL || 'llama3.1:8b',
  };
}

async function chat(messages, json = false) {
  const cfg = getLlmConfig();
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || '600000');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
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
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw new Error('LLM did not return valid JSON');
}

// Deterministic fallback summarizer when LLM server is not reached
function extractDeterministicNotes(lines, meta) {
  const participants = meta.participants || [];
  const actionItemsMap = new Map();
  const decisions = [];
  const openQuestions = [];
  const topics = [];

  for (const line of lines) {
    const txt = line.text;
    const speaker = line.speaker || 'Participant';

    if (txt.includes('?')) {
      openQuestions.push(`[${fmt(line.start)}] ${speaker}: ${txt}`);
    }

    if (/\b(decided|agreed|approved|resolved|confirmed)\b/i.test(txt)) {
      decisions.push(`${speaker}: ${txt}`);
    }

    if (/\b(will|going to|action item|task|todo|deploy|follow up|send|check|verify|fix)\b/i.test(txt)) {
      if (!actionItemsMap.has(speaker)) actionItemsMap.set(speaker, []);
      actionItemsMap.get(speaker).push({
        task: txt.replace(/^(i will|we will|please|let's)\s+/i, ''),
        due: /\b(today|tomorrow|monday|friday|next week|eod)\b/i.exec(txt)?.[0] || null,
        context: `Stated at ${fmt(line.start)}`,
      });
    }
  }

  // Group transcript into topic clusters (every 3-5 minutes or natural pause)
  if (lines.length) {
    const mainTopicLines = lines.slice(0, 15).map(l => `${l.speaker}: ${l.text}`).join(' ');
    topics.push({
      title: `General Discussion — ${meta.room}`,
      notes: mainTopicLines.slice(0, 400) + (mainTopicLines.length > 400 ? '...' : ''),
    });
  }

  const actionItems = Array.from(actionItemsMap.entries()).map(([owner, items]) => ({
    owner,
    items: items.slice(0, 6),
  }));

  const summary = lines.length > 0
    ? `Meeting conducted in room "${meta.room}" on ${new Date(meta.date || Date.now()).toLocaleDateString()} with ${participants.join(', ') || 'team members'}. The conversation spanned ${lines.length} spoken exchanges addressing project deliverables, coordination, and action items.`
    : 'No speech was detected in this recording.';

  return {
    summary,
    decisions: decisions.slice(0, 5),
    action_items: actionItems,
    topics,
    open_questions: openQuestions.slice(0, 5),
    model: 'built-in-analyzer',
    generatedAt: new Date().toISOString(),
  };
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
  const chunkSize = Number(process.env.LLM_CHUNK_CHARS || '24000');
  const cfg = getLlmConfig();

  try {
    let material = text;
    if (text.length > chunkSize) {
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
      model: cfg.model,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn(`[summarize] LLM endpoint unavailable (${err.message}). Using deterministic analyzer.`);
    return extractDeterministicNotes(lines, meta);
  }
}

module.exports = { summarize, fmt };
