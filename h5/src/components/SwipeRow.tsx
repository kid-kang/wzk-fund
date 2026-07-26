import {useRef, useState, type ReactNode, type TouchEvent} from 'react'

export type SwipeAction = {
  key: string
  label: string
  className?: string
  onClick: () => void
  icon?: ReactNode
}

type Props = {
  children: ReactNode
  actions: SwipeAction[]
  rightWidth?: number
}

/**
 * 操作按钮绝对定位在右侧；内容层带实色底左滑揭开。
 * 内容层保持直角铺满，避免圆角裁切露出背后按钮边线。
 */
export default function SwipeRow({children, actions, rightWidth = 130}: Props) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const startOffset = useRef(0)
  const locked = useRef<'x' | 'y' | null>(null)

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    startX.current = t.clientX
    startY.current = t.clientY
    startOffset.current = offset
    locked.current = null
    setDragging(true)
  }

  const onTouchMove = (e: TouchEvent) => {
    const t = e.touches[0]
    const dx = t.clientX - startX.current
    const dy = t.clientY - startY.current
    if (!locked.current) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      locked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (locked.current !== 'x') return
    e.preventDefault()
    const next = Math.min(0, Math.max(-rightWidth, startOffset.current + dx))
    setOffset(next)
  }

  const onTouchEnd = () => {
    setDragging(false)
    if (locked.current !== 'x') {
      locked.current = null
      return
    }
    const open = offset < -rightWidth / 2
    setOffset(open ? -rightWidth : 0)
    locked.current = null
  }

  // 收起时隐藏操作区，杜绝亚像素/圆角漏色
  const actionsVisible = dragging || offset < -0.5

  return (
    <div className="swipe-row">
      <div
        className="swipe-actions"
        aria-hidden={!actionsVisible}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: rightWidth,
          zIndex: 0,
          opacity: actionsVisible ? 1 : 0,
          visibility: actionsVisible ? 'visible' : 'hidden',
          pointerEvents: actionsVisible ? 'auto' : 'none',
        }}
      >
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className={`swipe-btn ${a.className || ''}`}
            tabIndex={actionsVisible ? 0 : -1}
            onClick={() => {
              setOffset(0)
              a.onClick()
            }}
          >
            {a.icon}
            <span className="swipe-label">{a.label}</span>
          </button>
        ))}
      </div>
      <div
        className="swipe-content"
        style={{
          // 多铺 2px 盖住右侧亚像素缝
          width: 'calc(100% + 2px)',
          marginRight: -2,
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
          position: 'relative',
          zIndex: 1,
          background: 'var(--bg)',
          willChange: 'transform',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
