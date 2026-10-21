module.exports = function (newTabPage) {
  function updateClock () {
    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const dateStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    if (newTabPage.clockTime) newTabPage.clockTime.textContent = timeStr
    if (newTabPage.clockDate) newTabPage.clockDate.textContent = dateStr
  }

  function startClock () {
    if (newTabPage.clockTimer) {
      return
    }
    updateClock()
    var schedule = function () {
      newTabPage.clockTimer = setTimeout(function () {
        newTabPage.clockTimer = null
        if (!document.body.classList.contains('is-ntp')) {
          return
        }
        updateClock()
        schedule()
      }, 60000 - (Date.now() % 60000) + 50)
    }
    schedule()
  }

  function stopClock () {
    clearTimeout(newTabPage.clockTimer)
    newTabPage.clockTimer = null
  }

  function buildSection (page) {
    const clockSection = document.createElement('div')
    clockSection.className = 'ntp-clock-section'

    page.clockTime = document.createElement('div')
    page.clockTime.className = 'ntp-clock-time'

    page.clockDate = document.createElement('div')
    page.clockDate.className = 'ntp-clock-date'

    clockSection.appendChild(page.clockTime)
    clockSection.appendChild(page.clockDate)
    page.mainEl.appendChild(clockSection)
  }

  return {
    methods: {
      updateClock,
      startClock,
      stopClock
    },
    buildSection
  }
}
