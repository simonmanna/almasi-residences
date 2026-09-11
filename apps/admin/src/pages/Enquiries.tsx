import { useEffect, useState } from 'react';
import { api, type AdminEnquiry, type AdminUser } from '../api';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST', 'SPAM'];

export function Enquiries({ role }: { role: AdminUser['role'] }) {
  const [rows, setRows] = useState<AdminEnquiry[]>([]);

  useEffect(() => {
    void api.enquiries().then((r) => setRows(r.data));
  }, []);

  async function setStatus(id: string, status: string) {
    await api.updateEnquiry(id, status);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  // §5.9 — only OWNER and MARKETING may export the whole customer list.
  const canExport = role === 'OWNER' || role === 'MARKETING';

  return (
    <main>
      <h2>Enquiries</h2>

      {canExport ? (
        <p>
          <a href={api.exportUrl}>Export all as CSV</a>{' '}
          <small>Exports are recorded in the audit log.</small>
        </p>
      ) : (
        <p>
          <small>Bulk export is limited to owners and marketing.</small>
        </p>
      )}

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Name</th>
            <th>Contact</th>
            <th>Units</th>
            <th>Intent</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.createdAt).toLocaleDateString()}</td>
              <td>
                {e.name}
                {/* §6.7 — Turnstile was unreachable when this arrived. */}
                {e.verificationSkipped && <span className="flag" title="Not bot-verified">unverified</span>}
              </td>
              <td>
                <a href={`mailto:${e.email}`}>{e.email}</a>
                <br />
                <a href={`tel:${e.phone}`}>{e.phone}</a>
              </td>
              <td>{e.units.map((u) => u.unit.code).join(', ') || '—'}</td>
              <td>{e.intent.toLowerCase()}</td>
              <td>
                <select value={e.status} onChange={(ev) => void setStatus(e.id, ev.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
