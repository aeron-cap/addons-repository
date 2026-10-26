// Adapted from Corgi's MIT-licensed sprite follower. See LICENSE.txt.
export function follow({
  id, spriteUrl, size, speed, interval, setSprite, onIdle, onFrame,
}) {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const key = `hibi-${id}-position`
  let x = window.innerWidth / 2
  let y = window.innerHeight / 2
  try {
    const saved = JSON.parse(localStorage.getItem(key))
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
      x = saved.x
      y = saved.y
    }
  } catch {
    // Position persistence is optional.
  }
  const clamp = (value, extent) => {
    const inset = Math.min(size, extent) / 2
    return Math.max(inset, Math.min(extent - inset, value))
  }
  const el = document.createElement('div')
  el.id = `hibi-${id}`
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed', pointerEvents: 'none', zIndex: '2147483647',
    width: `${size}px`, height: `${size}px`, top: '0', left: '0',
    imageRendering: 'pixelated', backgroundRepeat: 'no-repeat',
    backgroundImage: `url("${spriteUrl}")`,
  })
  function draw() {
    x = clamp(x, window.innerWidth)
    y = clamp(y, window.innerHeight)
    el.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`
  }
  draw()
  setSprite(el, 'S', 0)
  document.body.appendChild(el)
  let mouseX = x
  let mouseY = y
  let frameCount = 0
  let lastTime = 0
  let animation = null
  const move = (event) => {
    mouseX = event.clientX
    mouseY = event.clientY
  }
  const save = () => {
    try {
      localStorage.setItem(key, JSON.stringify({ x, y }))
    } catch {
      // Storage can be unavailable or full; cleanup must still finish.
    }
  }
  function tick(time) {
    animation = window.requestAnimationFrame(tick)
    if (time - lastTime < interval) return
    lastTime = time
    frameCount++
    const dx = x - clamp(mouseX, window.innerWidth)
    const dy = y - clamp(mouseY, window.innerHeight)
    const distance = Math.hypot(dx, dy)
    const state = { el, distance }
    const moving = onFrame?.(state) !== false
    if (distance <= 48) {
      onIdle?.(state)
    } else if (moving) {
      let direction = ''
      if (dy / distance > 0.5) direction += 'N'
      else if (dy / distance < -0.5) direction += 'S'
      if (dx / distance > 0.5) direction += 'W'
      else if (dx / distance < -0.5) direction += 'E'
      const step = Math.min(speed, distance)
      x -= dx / distance * step
      y -= dy / distance * step
      setSprite(el, direction, frameCount)
    }
    draw()
  }
  function syncMotion() {
    if (animation !== null) window.cancelAnimationFrame(animation)
    animation = null
    el.hidden = motion.matches
    if (!motion.matches && !document.hidden) {
      lastTime = 0
      animation = window.requestAnimationFrame(tick)
    }
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('visibilitychange', syncMotion)
  window.addEventListener('resize', draw)
  window.addEventListener('beforeunload', save)
  motion.addEventListener('change', syncMotion)
  syncMotion()
  return () => {
    if (animation !== null) window.cancelAnimationFrame(animation)
    document.removeEventListener('mousemove', move)
    document.removeEventListener('visibilitychange', syncMotion)
    window.removeEventListener('resize', draw)
    window.removeEventListener('beforeunload', save)
    motion.removeEventListener('change', syncMotion)
    el.remove()
    save()
  }
}
