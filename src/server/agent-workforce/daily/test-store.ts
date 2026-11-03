/** Isolated fictional fixtures only. Never imported by operational code. */
import { initialDailyState, type DailyState } from "@/features/agent-workforce/daily/contracts";
import { DailyStore } from "./state";
export class MemoryDailyStore extends DailyStore {
  private rows = new Map<string, DailyState>();
  private queue = Promise.resolve();
  override async get(actor: string) {
    return structuredClone(this.rows.get(actor) ?? initialDailyState());
  }
  override async change<T>(actor: string, change: (state: DailyState) => T): Promise<T> {
    const task = this.queue.then(async () => {
      const state = await this.get(actor),
        result = change(state);
      this.rows.set(actor, structuredClone(state));
      return result;
    });
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
}
