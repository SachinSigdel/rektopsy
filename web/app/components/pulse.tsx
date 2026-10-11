// The brand mark: a heartbeat line.
export function Pulse({ size = 22, color = "var(--fail)" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  );
}
