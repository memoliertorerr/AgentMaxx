// The AgentMaxx mark: a three-quarter gauge ring, the same shape the tray icon draws when nothing
// is pinned (src/main/trayIcon.ts). No upstream artwork.

const C = 16
const R = 11.8
const point = (degrees: number) => {
  const radians = (degrees * Math.PI) / 180
  return `${(C + R * Math.cos(radians)).toFixed(2)} ${(C + R * Math.sin(radians)).toFixed(2)}`
}

export function AppMark({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <svg className="app-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d={`M ${point(45)} A ${R} ${R} 0 0 1 ${point(135)}`} fill="none" stroke="#8C8C8C" strokeOpacity="0.55" strokeWidth="6.4" />
      <path d={`M ${point(135)} A ${R} ${R} 0 1 1 ${point(45)}`} fill="none" stroke="currentColor" strokeWidth="6.4" />
    </svg>
  )
}
