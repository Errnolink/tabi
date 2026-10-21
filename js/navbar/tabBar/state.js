const EventEmitter = require('events')

const rows = new Map()
const buckets = new Map()
const leaving = new Set()
const flags = {
  renamingTaskId: null,
  dragging: false
}
const events = new EventEmitter()

module.exports = { rows, buckets, leaving, flags, events }
