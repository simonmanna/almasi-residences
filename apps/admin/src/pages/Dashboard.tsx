import { useEffect, useState } from 'react';
import { api } from '../api';

export function Dashboard() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null);

  useEffect(() => {
    void api.dashboard().then(setData);
  }, []);

  if (!data) return <main>Loading…</main>;

  return (
    <main>
      <section>
        <h2>Inventory</h2>
        <ul className="tiles">
          {Object.entries(data.units).map(([status, count]) => (
            <li key={status}>
              <span className="tile-value">{count}</span>
              <span className="tile-label">{status.toLowerCase().replace('_', ' ')}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Enquiries</h2>
        <ul className="tiles">
          {Object.entries(data.enquiries).map(([status, count]) => (
            <li key={status}>
              <span className="tile-value">{count}</span>
              <span className="tile-label">{status.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Recent status changes</h2>
        {data.recentChanges.length === 0 ? (
          <p>No changes yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Change</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recentChanges.map((c) => (
                <tr key={c.id}>
                  <td>{c.unit.code}</td>
                  <td>
                    {c.from.toLowerCase()} → {c.to.toLowerCase()}
                  </td>
                  <td>{new Date(c.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
