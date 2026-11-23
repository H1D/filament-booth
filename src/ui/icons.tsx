/**
 * icons.tsx: the drawn icons, one stroke weight on a 16 px grid. They are
 * decorative: the button or label next to them carries the name.
 */
import type { ReactNode } from "react";

const PATHS = {
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  open: <path d="M2.5 5.5V12a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1H8L6.5 3.5h-3a1 1 0 0 0-1 1v1Z" />,
  camera: (
    <>
      <path d="M2 5.5h2.2l1.1-1.7h5.4l1.1 1.7H14a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V6A.5.5 0 0 1 2 5.5Z" />
      <circle cx="8" cy="9" r="2.4" />
    </>
  ),
  reset: (
    <>
      <path d="M3 8a5 5 0 1 0 1.6-3.7" />
      <path d="M3 2.5v3h3" />
    </>
  ),
  plus: <path d="M8 3v10M3 8h10" />,
  remove: <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  focus: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" />
    </>
  ),
  save: <path d="M8 2.5v7.5M4.8 7 8 10.2 11.2 7M3 12.5h10" />,
  upload: <path d="M8 10.5V3M4.8 6 8 2.8 11.2 6M3 12.5h10" />,
  link: (
    <>
      <path d="M6.8 9.2 9.2 6.8" />
      <path d="M9 4.5 10.4 3.1a2.4 2.4 0 1 1 3.4 3.4L12.4 7.9" />
      <path d="M7 11.5 5.6 12.9a2.4 2.4 0 1 1-3.4-3.4L3.6 8.1" />
    </>
  ),
  rotate: (
    <>
      <rect x="3" y="2.5" width="6.5" height="9" rx=".8" />
      <path d="M12 6.5v5.5H6.5" />
    </>
  ),
} as const satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** The booth's mark: a six-blade aperture. */
export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 16.5 11M20.2 7.5 11.2 8.6M20.2 16.5 12.7 11.6M12 21 7.5 13M3.8 16.5 12.8 15.4M3.8 7.5 11.3 12.4" />
    </svg>
  );
}
