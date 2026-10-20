/* Sea Glass Pointer-Driven Light & Interactive Springs
 * Material 3 Expressive x Liquid Glass
 */

let rAFPending = false
let latestX = 0.5
let latestY = 0.5

function updateLight () {
  rAFPending = false
  const root = document.documentElement
  const lx = Math.max(0, Math.min(1, latestX))
  const ly = Math.max(0, Math.min(1, latestY))

  root.style.setProperty('--lx', lx.toFixed(3))
  root.style.setProperty('--ly', ly.toFixed(3))

  // Derived shadow offsets: range -8px..+8px horizontally, -4px..+16px vertically
  const sx = ((lx - 0.5) * 16).toFixed(1) + 'px'
  const sy = ((ly - 0.5) * 20 + 6).toFixed(1) + 'px'
  root.style.setProperty('--sx', sx)
  root.style.setProperty('--sy', sy)
}

function onPointerMove (e) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return
  }
  latestX = e.clientX / window.innerWidth
  latestY = e.clientY / window.innerHeight
  if (!rAFPending) {
    rAFPending = true
    requestAnimationFrame(updateLight)
  }
}

function initialize () {
  window.addEventListener('pointermove', onPointerMove, { passive: true })

  // Press feedback springs for sea glass elements
  document.addEventListener('pointerdown', function (e) {
    const target = e.target.closest('.sea-glass-pill, .tab-item, .navbar-action-button, .sidebar-action-button, .pebble')
    if (target) {
      target.classList.add('is-pressed')
    }
  }, { passive: true })

  function clearPressed () {
    document.querySelectorAll('.is-pressed').forEach(el => el.classList.remove('is-pressed'))
  }

  document.addEventListener('pointerup', clearPressed, { passive: true })
  document.addEventListener('pointercancel', clearPressed, { passive: true })
}

module.exports = { initialize }
