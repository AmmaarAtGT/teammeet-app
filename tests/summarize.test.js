// Tests the AI-notes logic against a fake OpenAI-compatible LLM (no real model needed).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

let server, calls = [];
const FINAL = {
  summary: 'Team agreed to ship the meeting app.',
  decisions: ['Use LiveKit'],
  action_items: [
    { owner: 'Ammar', items: [{ task: 'Deploy to server', due: 'tomorrow', context: 'go-live' }] },
    { owner: 'Nobody', items: [] },
  ],
  topics: [{ title: 'Deployment', notes: 'Ammar will deploy.' }],
  open_questions: [],
};

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body);
      calls.push(j);
      const content = j.response_format ? '```json\n' + JSON.stringify(FINAL) + '\n```' : 'partial notes';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.LLM_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.LLM_MODEL = 'fake-model';
  process.env.LLM_CHUNK_CHARS = '200';
});
after(() => server.close());

test('short meeting: one LLM call, speaker-labelled transcript, cleaned output', async () => {
  calls = [];
  delete require.cache[require.resolve('../summarize')];
  process.env.LLM_CHUNK_CHARS = '100000';
  const { summarize } = require('../summarize');
  const n = await summarize(
    [{ speaker: 'Amit', start: 3, text: 'Ammar please deploy tomorrow.' }, { speaker: 'Ammar', start: 65, text: 'Will do.' }],
    { room: 'team', date: '2026-10-12', participants: ['Amit', 'Ammar'] }
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[1].content, /\[00:03\] Amit: Ammar please deploy tomorrow\./);
  assert.match(calls[0].messages[1].content, /\[01:05\] Ammar: Will do\./);
  assert.equal(n.summary, FINAL.summary);
  assert.equal(n.action_items.length, 1, 'owners with no items are dropped');
  assert.equal(n.action_items[0].owner, 'Ammar');
  assert.equal(n.model, 'fake-model');
});

test('long meeting: transcript is chunked (map) then combined (reduce)', async () => {
  calls = [];
  delete require.cache[require.resolve('../summarize')];
  process.env.LLM_CHUNK_CHARS = '200';
  const { summarize } = require('../summarize');
  const lines = Array.from({ length: 30 }, (_, i) => ({ speaker: i % 2 ? 'Akhtar' : 'Ammar', start: i * 10, text: `Point number ${i} about the rollout plan.` }));
  await summarize(lines, { room: 'team', date: 'x', participants: ['Ammar', 'Akhtar'] });
  assert.ok(calls.length > 2, `expected several chunk calls + 1 final, got ${calls.length}`);
  assert.ok(calls.at(-1).response_format, 'last call asks for JSON');
  assert.match(calls.at(-1).messages[1].content, /Notes for part 1/);
});

test('empty transcript returns a clear message without calling the LLM', async () => {
  calls = [];
  const { summarize } = require('../summarize');
  const n = await summarize([], { room: 't', date: 'x', participants: [] });
  assert.equal(calls.length, 0);
  assert.match(n.summary, /No speech/);
});
