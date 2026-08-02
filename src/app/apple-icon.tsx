import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#0e7a54',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Pin logo: white teardrop body, green mountain line, amber sun */}
      <svg width="108" height="132" viewBox="0 0 68 84" fill="none">
        <path
          d="M34 0C15.22 0 0 15.22 0 34C0 59.5 34 84 34 84C34 84 68 59.5 68 34C68 15.22 52.78 0 34 0Z"
          fill="white"
        />
        <path
          d="M14 46 L23 30 L30 40 L37 24 L54 46"
          stroke="#0e7a54"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="52" cy="20" r="5" fill="#e8a020" />
      </svg>
    </div>,
    { ...size },
  )
}
