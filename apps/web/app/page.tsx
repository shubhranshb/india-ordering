'use client';

import { useState } from 'react';

interface Option {
  provider: string;
  displayName: string;
  deeplink: string;
  result?: { items: { name: string; price?: number }[]; etaMinutes?: number };
}

interface Turn {
  you: string;
  reply?: string;
  options?: Option[];
}

export default function Page() {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setInput('');
    setBusy(true);
    setTurns((prev) => [...prev, { you: message }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json()) as { reply?: string; options?: Option[]; error?: string };
      setTurns((prev) =>
        prev.map((turn, i) =>
          i === prev.length - 1
            ? { ...turn, reply: data.reply ?? data.error ?? 'No response', options: data.options }
            : turn,
        ),
      );
    } catch {
      setTurns((prev) =>
        prev.map((turn, i) => (i === prev.length - 1 ? { ...turn, reply: 'Request failed' } : turn)),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>india-ordering</h1>
      <p style={{ fontSize: 13, opacity: 0.6, marginTop: 0 }}>
        I find the items and hand you a link. You make the final tap in the app.
      </p>

      {turns.map((turn, i) => (
        <div key={i} style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 600 }}>{turn.you}</div>
          {turn.reply && (
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 8, opacity: 0.9 }}>{turn.reply}</div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {turn.options?.map((option) => (
              <a
                key={option.provider}
                href={option.deeplink}
                target="_blank"
                rel="noreferrer"
                style={{
                  border: '1px solid #2c3038',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 14,
                  color: '#e8eaed',
                  textDecoration: 'none',
                }}
              >
                {option.displayName}
                {option.result?.items[0]?.price !== undefined && (
                  <span style={{ opacity: 0.6 }}> · ₹{option.result.items[0].price}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      ))}

      <form onSubmit={send} style={{ marginTop: 32, display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="2L amul milk and a dozen eggs to home"
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #2c3038',
            background: '#15181d',
            color: '#e8eaed',
          }}
        />
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: busy ? '#2c3038' : '#3b82f6',
            color: '#fff',
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </main>
  );
}
