export function EmergencyGuidance() {
  return (
    <section
      aria-labelledby="emergency-guidance-title"
      className="emergency-guidance"
      role="alert"
    >
      <h1 id="emergency-guidance-title">Seek urgent in-person help now</h1>
      <p>
        Your answers identified an emergency warning sign. This app cannot
        determine whether it is safe to wait and cannot rule out an emergency.
      </p>
      <ul>
        <li>Contact your local emergency services now.</li>
        <li>
          Go to the nearest appropriate emergency department or urgent in-person
          service.
        </li>
        <li>
          If possible, ask a trusted person to stay with you and help you reach
          care. Do not drive yourself if it may be unsafe.
        </li>
      </ul>
      <p>
        Do not wait for an AI response, online appointment, or clinician reply
        in this app. This application is not an emergency response service and
        does not provide continuous monitoring.
      </p>
    </section>
  );
}
