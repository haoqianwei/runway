import React from 'react';
import { cn } from '../lib/utils';

export function RunwayLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-label="Runway"
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id="rw-bg-ui" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#090E1A" />
        </linearGradient>
        <linearGradient id="rw-wing-ui" x1="32" y1="10" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
        <linearGradient id="rw-rail-ui" x1="32" y1="30" x2="32" y2="53" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8FAFC" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#rw-bg-ui)" />
      <rect
        x="0.75"
        y="0.75"
        width="62.5"
        height="62.5"
        rx="15.25"
        stroke="#FFFFFF"
        strokeOpacity="0.08"
        strokeWidth="1.5"
      />
      <path
        d="M32 10.5L44 25.5C44.5 26.1 43.9 27 43.1 26.7L32 22.8L20.9 26.7C20.1 27 19.5 26.1 20 25.5L32 10.5Z"
        fill="url(#rw-wing-ui)"
      />
      <path
        d="M24.5 31L13 52"
        stroke="url(#rw-rail-ui)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M39.5 31L51 52"
        stroke="url(#rw-rail-ui)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <rect x="30.7" y="32.5" width="2.6" height="6" rx="1.3" fill="#7DD3FC" />
      <rect x="30.2" y="42" width="3.6" height="9.5" rx="1.8" fill="#F8FAFC" />
    </svg>
  );
}
