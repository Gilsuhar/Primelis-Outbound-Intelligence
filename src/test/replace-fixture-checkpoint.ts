/** Test-only disk harness: Windows can briefly deny replacement of a recently closed file.
 * Keep the transaction lock and retry only the atomic rename, never the queue mutation.
 * A persistent failure propagates; the last committed checkpoint is never deleted.
 */
import { renameSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

export async function replaceFixtureCheckpoint(
  pending: string,
  committed: string,
  io: {
    rename: (pending: string, committed: string) => void;
    wait: (ms: number) => Promise<void>;
    platform: string;
  } = {
    rename: renameSync,
    wait: (ms: number) => setTimeout(ms),
    platform: process.platform as string,
  },
) {
  for (let attempt = 0; ; attempt++) {
    try {
      io.rename(pending, committed);
      return;
    } catch (error) {
      if (
        io.platform !== "win32" ||
        (error as NodeJS.ErrnoException).code !== "EPERM" ||
        attempt >= 5
      )
        throw error;
      await io.wait(25 * (attempt + 1));
    }
  }
}
