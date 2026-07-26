type Props = {
  fill?: boolean
}

export default function FortuneWatermark({fill = false}: Props) {
  return (
    <div className={`fortune-wm${fill ? ' is-fill' : ''}`} aria-hidden>
      <span className="fortune-mark">来财</span>
      <span className="fortune-seal">進寶</span>
      <div className="fortune-ingot fortune-ingot-a" />
      <div className="fortune-ingot fortune-ingot-b" />
    </div>
  )
}
