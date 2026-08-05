import { EventEmitter } from 'node:events'

export interface ImportProgressEvent {
  type: string
  status: 'running' | 'done' | 'error'
  count?: number
  message?: string
}

// One emitter, jobId-namespaced events — SSE connections subscribe to a
// specific job's progress. Every update also writes through to the
// ImportJob DB row (see orchestrator.ts), so a reconnect after a dropped
// SSE stream can recover state from GET /api/import/history instead of
// missing events permanently.
class ImportEventBus extends EventEmitter {
  emitProgress(jobId: string, event: ImportProgressEvent): void {
    this.emit(jobId, event)
  }

  emitComplete(jobId: string, status: string): void {
    this.emit(jobId, { type: 'DONE', status })
  }
}

export const importEvents = new ImportEventBus()
importEvents.setMaxListeners(50)
