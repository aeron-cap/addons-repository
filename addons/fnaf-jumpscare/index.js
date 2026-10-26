export default () => {
  let stop
  return {
    start(context) {
      if (stop) return
      const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
      let interacted = false
      let queued = false
      let decided = false
      let timer
      let phase
      let overlay
      let audio
      const eligible = () =>
        !motion.matches && !document.hidden && document.hasFocus()

      function dismiss() {
        clearTimeout(phase)
        audio?.pause()
        audio?.removeAttribute('src')
        audio?.load()
        audio = undefined
        overlay?.remove()
        overlay = undefined
      }

      function show() {
        if (!eligible() || overlay) return
        const el = document.createElement('div')
        el.id = 'hibi-fnaf-jumpscare'
        el.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;background:#000'
        const image = document.createElement('img')
        image.alt = ''
        image.setAttribute('aria-hidden', 'true')
        image.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover'
        audio = document.createElement('audio')
        audio.src = new URL('./assets/audio.mp3', import.meta.url).href
        const close = document.createElement('button')
        close.type = 'button'
        close.textContent = 'dismiss jumpscare (esc)'
        close.style.cssText = 'position:absolute;top:16px;right:16px;pointer-events:auto;background:#000;color:#fff;border:1px solid #fff;border-radius:6px;padding:8px 12px;font:inherit;cursor:pointer'
        close.addEventListener('click', dismiss)
        image.addEventListener('load', () => {
          if (overlay !== el) return
          clearTimeout(phase)
          void audio.play().catch(() => {})
          phase = setTimeout(() => {
            image.src = new URL('./assets/static.gif', import.meta.url).href
            phase = setTimeout(dismiss, 1500)
          }, 1500)
        }, { once: true })
        image.addEventListener('error', () => {
          if (overlay === el) dismiss()
        }, { once: true })
        el.append(image, audio, close)
        overlay = el
        document.body.appendChild(el)
        phase = setTimeout(dismiss, 5000)
        image.src = new URL('./assets/fredbear.gif', import.meta.url).href
      }

      function schedule() {
        clearTimeout(timer)
        if (decided || !eligible()) return
        timer = setTimeout(() => {
          if (!eligible()) return
          if (!queued) {
            queued = Math.random() < 0.03
            schedule()
            return
          }
          if (!interacted) {
            schedule()
            return
          }
          decided = true
          if (Math.random() >= 0.5) show()
        }, Math.floor(Math.random() * (queued ? 5000 : 10000)))
      }

      function markInteracted(event) {
        if (!event.isTrusted) return
        interacted = true
        document.removeEventListener('pointerdown', markInteracted, true)
        document.removeEventListener('keydown', markInteracted, true)
      }
      function onKey(event) {
        if (event.key !== 'Escape' || !overlay) return
        dismiss()
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      function sync() {
        if (!eligible()) dismiss()
        schedule()
      }

      const unregister = context.commands.register({
        id: 'play',
        label: 'play fnaf jumpscare',
        run() {
          if (motion.matches) {
            context.notify('Turn off reduced motion to play the jumpscare.')
            return
          }
          decided = true
          clearTimeout(timer)
          show()
        },
      })
      document.addEventListener('pointerdown', markInteracted, true)
      document.addEventListener('keydown', markInteracted, true)
      document.addEventListener('keydown', onKey, true)
      document.addEventListener('visibilitychange', sync)
      window.addEventListener('focus', sync)
      window.addEventListener('blur', sync)
      motion.addEventListener('change', sync)
      stop = () => {
        decided = true
        clearTimeout(timer)
        dismiss()
        unregister()
        document.removeEventListener('pointerdown', markInteracted, true)
        document.removeEventListener('keydown', markInteracted, true)
        document.removeEventListener('keydown', onKey, true)
        document.removeEventListener('visibilitychange', sync)
        window.removeEventListener('focus', sync)
        window.removeEventListener('blur', sync)
        motion.removeEventListener('change', sync)
      }
      schedule()
    },
    stop() {
      stop?.()
      stop = undefined
    },
  }
}
