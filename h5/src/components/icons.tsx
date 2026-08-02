type IconProps = {size?: number; color?: string}

export function IconEye({size = 15, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7Z"
        stroke={color}
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3.2" stroke={color} strokeWidth="1.6" />
    </svg>
  )
}

export function IconEyeOff({size = 15, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 3l18 18M10.6 10.7a2.8 2.8 0 0 0 3.7 3.7M9.5 5.3A10.5 10.5 0 0 1 12 5c5 0 9.3 3.1 11 7a12.8 12.8 0 0 1-4.1 4.8M6.2 6.3A12.8 12.8 0 0 0 1 12c1.1 2.5 3.1 4.6 5.6 5.9"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconPlus({size = 15, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconEdit({size = 17, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20h4l10-10-4-4L4 16v4ZM14 6l4 4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconDelete({size = 17, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M9 7V5h6v2M8 7l1 12h6l1-12"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function IconSetting({size = 15, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.6" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconChart({size = 13, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 18V6M10 18V10M16 18V8M22 18H2"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconCert({size = 12, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="10" r="6" stroke={color} strokeWidth="1.6" />
      <path d="M9.5 10.2 11.2 12l3.4-3.6" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 15.5 8 21l4-2 4 2-1-5.5" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function IconQuestion({size = 14, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path
        d="M9.6 9.2c.3-1.4 1.4-2.2 2.5-2.2 1.3 0 2.3.9 2.3 2.2 0 1.3-1 1.8-1.8 2.3-.7.4-1.1.8-1.1 1.6V14"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill={color} />
    </svg>
  )
}

export function IconInfo({size = 16, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path d="M12 11v5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1.1" fill={color} />
    </svg>
  )
}

export function IconClock({size = 18, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
      <path d="M12 7v6l3.5 2" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconCoin({size = 18, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="12" rx="8" ry="8" stroke={color} strokeWidth="1.6" />
      <path d="M12 7v10M9 9.5c.6-.8 1.6-1.2 3-1.2s2.4.4 2.4 1.5S13.5 11 12 11s-2.6.4-2.6 1.6.9 1.6 2.6 1.6 2.4-.4 3-1.1" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconCart({size = 18, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 5h2l2.2 11h10.6L21 8H7" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="19" r="1.4" fill={color} />
      <circle cx="17" cy="19" r="1.4" fill={color} />
    </svg>
  )
}

export function IconFriends({size = 18, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3" stroke={color} strokeWidth="1.6" />
      <circle cx="17" cy="9" r="2.4" stroke={color} strokeWidth="1.6" />
      <path d="M3.5 18c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4M14 14c1.8 0 3.3.8 4 2.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconCalendar({size = 18, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" stroke={color} strokeWidth="1.6" />
      <path d="M8 3.5V7M16 3.5V7M3.5 10h17" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconWarning({size = 16, color = 'currentColor'}: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 4 21 20H3L12 4Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 10v5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1" fill={color} />
    </svg>
  )
}
