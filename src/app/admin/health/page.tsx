import Link from 'next/link';

import { getOperationsHealthDashboard } from '@/modules/monitoring/readiness-server';

export default async function AdminHealthPage() {
  try {
    const dashboard = await getOperationsHealthDashboard();
    return (
      <main>
        <h1>Service health</h1>
        <p>
          Overall readiness: <strong>{dashboard.readiness.status}</strong>
        </p>
        <p>Checked at {dashboard.readiness.checkedAt}</p>
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Status</th>
              <th>Latency</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.readiness.services.map((service) => (
              <tr key={service.service}>
                <td>{service.service}</td>
                <td>{service.status}</td>
                <td>{service.latencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Recent failure counts</h2>
        <p>
          Content-free failures observed by this application process during the
          last {dashboard.failureWindowMinutes} minutes.
        </p>
        {dashboard.recentFailures.length === 0 ? (
          <p>No recent failures recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentFailures.map((failure) => (
                <tr key={failure.event}>
                  <td>{failure.event}</td>
                  <td>{failure.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          <Link href="/admin">Back to operations area</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Service health</h1>
        <p>Service health is unavailable.</p>
        <p>
          <Link href="/admin">Back to operations area</Link>
        </p>
      </main>
    );
  }
}
