const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

var GB = 1073741824

function loadPolicy (taskDefs, settingsMap) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'discardInactive.js'), 'utf8')
  var budgetHandler = null
  var observed = {
    destroyed: [],
    keepAliveCalls: [],
    keptAlive: new Set(),
    views: new Set()
  }
  var webviewsStub = {
    hasViewForTab: function (id) { return observed.views.has(id) },
    destroy: function (id) { observed.destroyed.push(id) },
    keepAlive: function (id) { observed.keepAliveCalls.push(id); observed.keptAlive.add(id) },
    keptAlive: observed.keptAlive
  }
  const sandbox = {
    require: function (name) {
      if (name === 'webviews.js') {
        return webviewsStub
      }
      return { get: function (key) { return (settingsMap || {})[key] } }
    },
    ipc: {
      on: function (event, handler) {
        if (event === 'memoryBudget') {
          budgetHandler = handler
        }
      },
      send: function () { }
    },
    module: { exports: {} },
    Date: Date,
    Math: Math,
    tasks: {
      forEach: function (fn) { taskDefs.forEach(fn) },
      on: function () { }
    }
  }
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox)
  sandbox.__setBudget = function (data) {
    assert.ok(budgetHandler, 'memoryBudget handler was not registered at load')
    budgetHandler({}, data)
  }
  return { sandbox: sandbox, observed: observed }
}

function tab (id, options) {
  return Object.assign({ id: id }, options)
}

function task (selectedInWindow, tabs) {
  return {
    selectedInWindow: selectedInWindow,
    tabs: {
      get: function () { return tabs },
      getSelected: function () {
        var sel = tabs.find(function (t) { return t.selected })
        return sel ? sel.id : null
      }
    }
  }
}

test('effectiveSleepMs falls back to 60 minutes when unset', function () {
  var run = loadPolicy([], {})
  assert.equal(run.sandbox.effectiveSleepMs(), 60 * 60 * 1000)
})

test('tabSleepMinutes 0 means never sleep', function () {
  var run = loadPolicy([], { tabSleepMinutes: 0 })
  assert.equal(run.sandbox.effectiveSleepMs(), null)
})

test('the configured minutes are converted to milliseconds', function () {
  var run = loadPolicy([], { tabSleepMinutes: 15 })
  assert.equal(run.sandbox.effectiveSleepMs(), 15 * 60 * 1000)
})

test('sleep time adapts to the memory ratio and is clamped to 0.25x..6x', function () {
  var mid = loadPolicy([], { tabSleepMinutes: 15 })
  mid.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: 2 * GB })
  assert.equal(mid.sandbox.effectiveSleepMs(), 15 * 1.25 * 60 * 1000)

  var low = loadPolicy([], { tabSleepMinutes: 15 })
  low.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: Math.round(0.16 * GB) })
  assert.equal(low.sandbox.effectiveSleepMs(), 15 * 0.25 * 60 * 1000)

  var high = loadPolicy([], { tabSleepMinutes: 15 })
  high.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: 32 * GB })
  assert.equal(high.sandbox.effectiveSleepMs(), 15 * 6 * 60 * 1000)

  var noTotal = loadPolicy([], { tabSleepMinutes: 15 })
  noTotal.sandbox.__setBudget({ totalBytes: 0, availableBytes: 5 * GB })
  assert.equal(noTotal.sandbox.effectiveSleepMs(), 15 * 60 * 1000)
})

test('pressure threshold is 8% of total memory with a 1GB floor', function () {
  var run = loadPolicy([], {})
  assert.equal(run.sandbox.pressureThresholdBytes(), GB)
  run.sandbox.__setBudget({ totalBytes: 25 * GB })
  assert.equal(run.sandbox.pressureThresholdBytes(), 2147483648)
})

test('memory pressure comes from system availability or blowing the budget', function () {
  var none = loadPolicy([], {})
  assert.equal(none.sandbox.underMemoryPressure(), false)

  var tight = loadPolicy([], {})
  tight.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: 1e9 })
  assert.equal(tight.sandbox.underMemoryPressure(), true)

  var roomy = loadPolicy([], {})
  roomy.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: 4 * GB })
  assert.equal(roomy.sandbox.underMemoryPressure(), false)

  var overBudget = loadPolicy([], {})
  overBudget.sandbox.__setBudget({
    totalBytes: 16 * GB,
    availableBytes: 4 * GB,
    budgetBytes: 1e9,
    viewBytes: { a: 6e8, b: 6e8 }
  })
  assert.equal(overBudget.sandbox.underMemoryPressure(), true)
})

test('the sweep destroys least-recently-used views under pressure, honoring exclusions', function () {
  var run = loadPolicy([
    task(true, [
      tab('t4', { lastActivity: 3000, selected: true }),
      tab('sib', { lastActivity: 1500 })
    ]),
    task(false, [
      tab('t1', { private: true, lastActivity: 100 }),
      tab('t2', { pinned: true, lastActivity: 100 }),
      tab('t3', { hasAudio: true, lastActivity: 100 }),
      tab('t5', { lastActivity: 100 }),
      tab('t8', { lastActivity: 100 }),
      tab('t9', { lastActivity: 99999 }),
      tab('t7', { lastActivity: 100 })
    ])
  ])
  ;['t5', 't8', 't9', 'sib'].forEach(function (id) { run.observed.views.add(id) })
  run.sandbox.lastSeen = { t5: 1000, t8: 2000, t9: 5000 }
  run.sandbox.__setBudget({
    totalBytes: 16 * GB,
    availableBytes: 1e9,
    viewBytes: { t5: 4e8, sib: 4e8, t8: 4e8, t9: 4e8 }
  })

  run.sandbox.sweepPass(1000000, null)

  assert.deepEqual(run.observed.destroyed, ['t5', 'sib'])
  assert.deepEqual(run.observed.keepAliveCalls, [])
  ;['t8', 't9', 't1', 't2', 't3', 't4', 't7'].forEach(function (id) {
    assert.equal(run.observed.destroyed.indexOf(id), -1, id + ' must survive')
  })
})

test('a tab with no view is not a candidate', function () {
  var run = loadPolicy([
    task(false, [tab('only', { lastActivity: 100 })])
  ])
  run.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: 1e9 })
  run.sandbox.sweepPass(1000000, null)
  assert.deepEqual(run.observed.destroyed, [])
  assert.deepEqual(run.observed.keepAliveCalls, [])
})

test('past the idle limit without pressure, tabs are kept alive instead of destroyed', function () {
  var now = 10000000
  var run = loadPolicy([
    task(false, [
      tab('past', { lastActivity: now - 20 * 60 * 1000 }),
      tab('kept', { lastActivity: now - 20 * 60 * 1000 }),
      tab('recent', { lastActivity: now - 5 * 60 * 1000 }),
      tab('young', { lastActivity: now - 60 * 1000 })
    ])
  ])
  ;['past', 'kept', 'recent', 'young'].forEach(function (id) { run.observed.views.add(id) })
  run.observed.keptAlive.add('kept')
  run.sandbox.__setBudget({
    totalBytes: 16 * GB,
    availableBytes: 8 * GB,
    budgetBytes: 1e12,
    viewBytes: { past: 1e9, kept: 1e9, recent: 1e9, young: 1e9 }
  })

  run.sandbox.sweepPass(now, 15 * 60 * 1000)

  assert.deepEqual(run.observed.keepAliveCalls, ['past'])
  assert.deepEqual(run.observed.destroyed, [])

  run.sandbox.sweepPass(now, 15 * 60 * 1000)
  assert.deepEqual(run.observed.keepAliveCalls, ['past'])
})

test('a null limit keeps idle tabs untouched', function () {
  var now = 10000000
  var run = loadPolicy([
    task(false, [tab('old', { lastActivity: now - 20 * 60 * 1000 })])
  ])
  run.observed.views.add('old')
  run.sandbox.__setBudget({ totalBytes: 16 * GB, availableBytes: 8 * GB, budgetBytes: 1e12 })

  run.sandbox.sweepPass(now, null)
  assert.deepEqual(run.observed.keepAliveCalls, [])
  assert.deepEqual(run.observed.destroyed, [])
})

test('blowing the tab budget destroys oldest views regardless of idle age', function () {
  var now = 10000000
  var run = loadPolicy([
    task(false, [
      tab('c1', { lastActivity: now - 60 * 1000 }),
      tab('c2', { lastActivity: now - 60 * 1000 }),
      tab('c3', { lastActivity: now - 60 * 1000 })
    ])
  ])
  ;['c1', 'c2', 'c3'].forEach(function (id) { run.observed.views.add(id) })
  run.sandbox.__setBudget({
    totalBytes: 16 * GB,
    availableBytes: 8 * GB,
    budgetBytes: 1e9,
    viewBytes: { c1: 4e8, c2: 4e8, c3: 4e8 }
  })

  run.sandbox.sweepPass(now, 60 * 60 * 1000)
  assert.deepEqual(run.observed.destroyed, ['c1'])
})
