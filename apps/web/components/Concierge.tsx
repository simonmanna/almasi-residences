'use client';

import { useState } from 'react';
import { formatArea, formatMoney, STATUS_LABEL, type UnitStatus } from '@avida/types';
import { track } from '../lib/analytics';

/**
 * §9 Phase 5 — the concierge's interface.
 *
 * Note what is rendered where: `answer` is prose and goes in a paragraph; every
 * number on this screen comes from the structured `units` array and is
 * formatted by our own formatter. That split is the feature. If narration is
 * unavailable or was rejected, the deterministic sentence takes its place and
 * the visitor is none the wiser — the answer was always the data.
 */

interface ConciergeUnit {
  id: string;
  code: string;
  priceMinor: number;
  currency: string;
  areaSqm: number;
  orientation: string;
  status: UnitStatus;
  viewTags: string[];
  floor: { label: string };
  typology: { name: string };
}

interface ConciergeAnswer {
  answer: string;
  matched: number;
  total: number;
  currency: string;
  narrated: boolean;
  narrationRejected?: boolean;
  units: ConciergeUnit[];
}

const EXAMPLES = [
  'Two bedrooms under $200,000',
  'One bedroom with a city view',
  'What penthouses are still available',
];

export function Concierge({ developmentSlug, onPick }: { developmentSlug: string; onPick?: (unitId: string) => void }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<ConciergeAnswer | null>(null);
  const [state, setState] = useState<'idle' | 'asking' | 'error'>('idle');

  async function ask(q: string) {
    if (q.trim().length < 2) return;
    setState('asking');
    setQuestion(q);
    try {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${api}/api/v1/concierge/${developmentSlug}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, narrate: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setResult((await res.json()) as ConciergeAnswer);
      setState('idle');
      track('unit_filtered', { source: 'concierge' });
    } catch {
      setState('error');
    }
  }

  return (
    <section className="concierge" id="concierge">
      <h2 className="head">Ask about the apartments</h2>
      <p className="prose">
        Describe what you are looking for. Answers come from the live inventory, so what you see is
        what is actually for sale.
      </p>

      <form
        className="concierge-form"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <label htmlFor="concierge-q" className="visually-hidden">
          Your question
        </label>
        <input
          id="concierge-q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Two bedrooms under $250,000 with a valley view"
        />
        <button type="submit" className="button" disabled={state === 'asking'}>
          {state === 'asking' ? 'Looking' : 'Ask'}
        </button>
      </form>

      <ul className="concierge-examples">
        {EXAMPLES.map((e) => (
          <li key={e}>
            <button type="button" className="button-quiet" onClick={() => void ask(e)}>
              {e}
            </button>
          </li>
        ))}
      </ul>

      {state === 'error' && (
        <p className="field-error">The concierge is not answering right now. The availability
          drawing has the same information.</p>
      )}

      {result && (
        <div className="concierge-result" aria-live="polite">
          <p className="lead">{result.answer}</p>

          {result.units.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Unit</th>
                  <th scope="col">Type</th>
                  <th scope="col">Floor</th>
                  <th scope="col" className="align-right">Area</th>
                  <th scope="col" className="align-right">Price</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.units.map((u) => (
                  <tr key={u.id}>
                    <th scope="row" data-numeric>
                      {onPick ? (
                        <button type="button" className="button-quiet" onClick={() => onPick(u.id)}>
                          {u.code}
                        </button>
                      ) : (
                        u.code
                      )}
                    </th>
                    <td>{u.typology.name}</td>
                    <td data-numeric>{u.floor.label}</td>
                    <td data-numeric className="align-right">{formatArea(u.areaSqm)}</td>
                    <td data-numeric className="align-right">
                      {formatMoney({ amountMinor: u.priceMinor, currency: u.currency })}
                    </td>
                    <td>{STATUS_LABEL[u.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
