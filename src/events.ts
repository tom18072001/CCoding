import { EventEmitter } from 'node:events';
import type { AgentState, ChatMessage, LogEntry, Task, UsageRecord } from './types.js';

export type BusEvent =
  | { type: 'agent'; agent: AgentState }
  | { type: 'task'; task: Task }
  | { type: 'message'; message: ChatMessage }
  | { type: 'log'; entry: LogEntry }
  | { type: 'usage'; record: UsageRecord }
  | { type: 'output'; taskId: string; agentId: string; chunk: string };

/** Bus sự kiện nội bộ — server phát lại qua SSE cho giao diện. */
export class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }
  publish(ev: BusEvent): void {
    this.emit('event', ev);
  }
  subscribe(fn: (ev: BusEvent) => void): () => void {
    this.on('event', fn);
    return () => this.off('event', fn);
  }
}
