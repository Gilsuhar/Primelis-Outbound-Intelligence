// @vitest-environment node
import { expect, it, vi } from "vitest";
import { replaceFixtureCheckpoint } from "./replace-fixture-checkpoint";

it("retries only a transient Windows rename without discarding the committed checkpoint", async () => {
  let committed = "previous checkpoint";
  const rename = vi.fn((pending: string, destination: string) => {
    expect([pending, destination]).toEqual(["pending", "committed"]);
    expect(committed).toBe("previous checkpoint");
    if (rename.mock.calls.length === 1)
      throw Object.assign(new Error("synthetic sharing conflict"), { code: "EPERM" });
    committed = "next checkpoint";
  });
  const wait = vi.fn(async () => {
    expect(committed).toBe("previous checkpoint");
  });
  await replaceFixtureCheckpoint("pending", "committed", { rename, wait, platform: "win32" });
  expect(committed).toBe("next checkpoint");
  expect(rename).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledTimes(1);
});

it.each([
  ["win32", "EPERM", 6],
  ["win32", "ENOENT", 1],
  ["linux", "EPERM", 1],
])("propagates %s %s failures after %i attempts", async (platform, code, attempts) => {
  const failure = Object.assign(new Error("synthetic filesystem failure"), { code });
  const rename = vi.fn(() => {
    throw failure;
  });
  const wait = vi.fn(async () => {});
  await expect(
    replaceFixtureCheckpoint("pending", "committed", { rename, wait, platform }),
  ).rejects.toBe(failure);
  expect(rename).toHaveBeenCalledTimes(attempts);
  expect(wait).toHaveBeenCalledTimes(Number(attempts) - 1);
});
