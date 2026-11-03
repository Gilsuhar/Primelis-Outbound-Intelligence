// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readFile: vi.fn(), stat: vi.fn(), config: vi.fn() }));
vi.mock("node:fs/promises", () => mocks);
vi.mock("@/lib/auth/local-development", () => ({
  localDevelopmentUser: { id: "local-user" },
  localDevelopmentHost: (host: string) => host === "localhost:3000",
  localDevelopmentConfig: mocks.config,
}));
import { loadLocalProspectReview } from "./local-prospect-review";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockReturnValue({ token: "fictional" });
});
it.each([
  ["other-user", "localhost:3000"],
  ["local-user", "external.example"],
])("never reads private local evidence for unauthorized user/host", async (id, host) => {
  expect(await loadLocalProspectReview(id, host)).toBeNull();
  expect(mocks.stat).not.toHaveBeenCalled();
});
it("does not read when localhost configuration is disabled", async () => {
  mocks.config.mockReturnValue(null);
  expect(await loadLocalProspectReview("local-user", "localhost:3000")).toBeNull();
  expect(mocks.stat).not.toHaveBeenCalled();
});
it("rejects oversized files without reading contents", async () => {
  mocks.stat.mockResolvedValue({ size: 40_000 });
  expect(await loadLocalProspectReview("local-user", "localhost:3000")).toBeNull();
  expect(mocks.readFile).not.toHaveBeenCalled();
});
it("fails closed for missing files and malformed private packets", async () => {
  mocks.stat.mockRejectedValueOnce(new Error("missing"));
  expect(await loadLocalProspectReview("local-user", "localhost:3000")).toBeNull();
  mocks.stat.mockResolvedValue({ size: 2 });
  mocks.readFile.mockResolvedValue("{}");
  expect(await loadLocalProspectReview("local-user", "localhost:3000")).toBeNull();
});
