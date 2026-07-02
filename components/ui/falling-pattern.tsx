import type { CSSProperties } from "react"

type FallingPatternProps = {
  className?: string
  color?: string
  duration?: number
  blurIntensity?: string
  density?: number
}

function buildItems(density: number) {
  const count = Math.max(24, Math.round(density * 42))
  return Array.from({ length: count }, (_, index) => {
    const column = index % 14
    const row = Math.floor(index / 14)
    const left = (column / 13) * 100
    const top = (row / Math.max(1, Math.ceil(count / 14) - 1)) * 100
    const delay = -(index * 1.7)
    const scale = 0.72 + ((index * 17) % 10) / 20
    const duration = 44 + (index % 5) * 8
    return { left, top, delay, scale, duration, index }
  })
}

export function FallingPattern({
  className,
  color = "#00ff88",
  duration = 80,
  blurIntensity = "0.5rem",
  density = 2,
}: FallingPatternProps) {
  const items = buildItems(density)

  return (
    <div
      aria-hidden="true"
      className={className ? `falling-pattern ${className}` : "falling-pattern"}
      style={{
        "--falling-pattern-color": color,
        "--falling-pattern-duration": `${duration}s`,
        "--falling-pattern-blur": blurIntensity,
      } as CSSProperties}
    >
      {items.map((item) => (
        <span
          key={item.index}
          className="falling-pattern-item"
          style={
            {
              left: `${item.left}%`,
              top: `${item.top}%`,
              animationDelay: `${item.delay}s`,
              animationDuration: `${item.duration}s, ${item.duration}s`,
              "--falling-pattern-scale": `${item.scale}`,
            } as CSSProperties & Record<string, string>
          }
        >
          $
        </span>
      ))}
    </div>
  )
}
