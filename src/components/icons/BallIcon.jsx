/**
 * A pickleball: a circle with the perforations that define the ball.
 * Drawn rather than imported so it inherits currentColor and sits on the same
 * 24px grid as the lucide icons beside it.
 */
export default function BallIcon({ size = 24, strokeWidth = 2, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9.6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.2" cy="14.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="15.2" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
