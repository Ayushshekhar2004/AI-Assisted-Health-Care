export function IntakeSafetyBanner() {
  return (
    <aside
      aria-labelledby="intake-safety-title"
      className="intake-safety-banner"
      role="note"
    >
      <h2 id="intake-safety-title">Intake assistant — not emergency care</h2>
      <p>
        This tool collects information for intake. It does not provide a
        diagnosis or prescription and is not continuously monitored.
      </p>
      <p>
        If you may be experiencing an emergency, contact local emergency
        services or seek urgent in-person care now. Do not wait for a response
        here.
      </p>
    </aside>
  );
}
