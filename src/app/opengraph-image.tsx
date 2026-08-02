import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        background: 'linear-gradient(135deg, #0a2b1e 0%, #0e4f35 50%, #0a2b1e 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative circles */}
      <div style={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: 'rgba(14, 122, 84, 0.12)', top: -280, right: -180,
        display: 'flex',
      }} />
      <div style={{
        position: 'absolute', width: 450, height: 450, borderRadius: '50%',
        background: 'rgba(14, 122, 84, 0.08)', bottom: -180, left: -120,
        display: 'flex',
      }} />

      {/* Pin logo */}
      <div style={{ display: 'flex', marginBottom: 28 }}>
        <svg width="68" height="84" viewBox="0 0 68 84" fill="none">
          <path
            d="M34 0C15.22 0 0 15.22 0 34C0 59.5 34 84 34 84C34 84 68 59.5 68 34C68 15.22 52.78 0 34 0Z"
            fill="#0e7a54"
          />
          <path
            d="M14 46 L23 30 L30 40 L37 24 L54 46"
            stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none"
          />
          <circle cx="52" cy="20" r="5" fill="#e8a020" />
        </svg>
      </div>

      {/* Brand name */}
      <div style={{
        fontSize: 88,
        fontWeight: 800,
        color: 'white',
        letterSpacing: '-3px',
        lineHeight: 1,
        marginBottom: 18,
        display: 'flex',
      }}>
        ManTur
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 30,
        color: '#e8a020',
        fontWeight: 600,
        letterSpacing: '0.5px',
        marginBottom: 52,
        display: 'flex',
      }}>
        Turismo con alma local
      </div>

      {/* Location */}
      <div style={{
        fontSize: 17,
        color: 'rgba(255,255,255,0.45)',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        display: 'flex',
      }}>
        Manaure · Balcón del Cesar · Colombia
      </div>
    </div>,
    { ...size },
  )
}
