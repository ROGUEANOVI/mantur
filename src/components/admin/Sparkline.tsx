type SparklineProps = {
  data: number[]
  color?: string
  width?: number
  height?: number
}

// Server-renderable inline SVG — no charting library, no client JS. Values
// are plotted min-to-max within the viewBox; a flat/all-equal series (e.g.
// zero revenue every day) draws a flat line through the middle instead of
// collapsing to one edge.
export default function Sparkline({ data, color = 'var(--chart-1)', width = 64, height = 20 }: SparklineProps) {
  if (data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min
  const step = width / (data.length - 1)

  const points = data
    .map((v, i) => {
      const y = range === 0 ? height / 2 : height - ((v - min) / range) * height
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
