type Size = 'sm' | 'md' | 'lg'

const sizes: Record<Size, { w: number; h: number; fs: string; sw: string; cr: number }> = {
  sm: { w: 20, h: 26, fs: '0.9rem',  sw: '3',   cr: 5   },
  md: { w: 26, h: 34, fs: '1.1rem',  sw: '2.8', cr: 4.5 },
  lg: { w: 44, h: 57, fs: '1.85rem', sw: '2.4', cr: 4   },
}

export default function ManturLogo({ size = 'md' }: { size?: Size }) {
  const { w, h, fs, sw, cr } = sizes[size]

  return (
    <span className="flex items-center gap-1.5 select-none">
      <svg width={w} height={h} viewBox="0 0 56 72" fill="none" aria-hidden="true">
        <defs>
          <clipPath id="mt-pin-clip">
            <circle cx="28" cy="28" r="21" />
          </clipPath>
        </defs>
        {/* Pin teardrop */}
        <path
          d="M28,69 C20,58 7,47 7,28 A21,21 0 0 1 49,28 C49,47 36,58 28,69 Z"
          fill="#0e7a54"
        />
        {/* Mountain line art clipped to pin circle */}
        <path
          d="M10,36 L18,14 L25,28 L28,8 L36,24 L44,36"
          fill="none"
          stroke="rgba(255,255,255,.85)"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath="url(#mt-pin-clip)"
        />
        {/* Amber sun dot */}
        <circle cx="38" cy="11" r={cr} fill="#e8a020" />
      </svg>
      <span
        className="font-black leading-none"
        style={{ letterSpacing: '-0.03em', fontSize: fs }}
      >
        <span style={{ color: '#0e7a54' }}>Man</span>
        <span style={{ color: '#e8a020' }}>Tur</span>
      </span>
    </span>
  )
}
