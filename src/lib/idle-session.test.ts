// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activityKey, IDLE_MS, monitorIdleSession, WARNING_MS } from "./idle-session";
let stop: () => void;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-21T12:00:00Z")); localStorage.clear(); });
afterEach(() => { stop?.(); vi.useRealTimers(); });
it("warns after 55 minutes and expires once after 60", () => {
  const warn = vi.fn(), expire = vi.fn(); stop = monitorIdleSession("a", warn, expire);
  vi.advanceTimersByTime(WARNING_MS); expect(warn).toHaveBeenLastCalledWith(true);
  vi.advanceTimersByTime(IDLE_MS - WARNING_MS); expect(expire).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("click")); expect(expire).toHaveBeenCalledTimes(1);
});
it.each(["pointermove", "pointerdown", "keydown", "touchstart", "click", "ansyra-navigation"])("resets warning and deadline on %s", (event) => {
  const warn = vi.fn(), expire = vi.fn(); stop = monitorIdleSession("a", warn, expire);
  vi.advanceTimersByTime(WARNING_MS); window.dispatchEvent(new Event(event));
  expect(warn).toHaveBeenLastCalledWith(false);
  vi.advanceTimersByTime(IDLE_MS - 1); expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(expire).toHaveBeenCalledOnce();
});
it("reads activity from another tab before expiring", () => {
  const expire = vi.fn(); stop = monitorIdleSession("a", vi.fn(), expire);
  vi.advanceTimersByTime(WARNING_MS);
  localStorage.setItem(activityKey("a"), String(Date.now()));
  window.dispatchEvent(new StorageEvent("storage", { key: activityKey("a") }));
  vi.advanceTimersByTime(5 * 60_000); expect(expire).not.toHaveBeenCalled();
});
it("does not reset an expired session on refresh or returning from sleep", () => {
  localStorage.setItem(activityKey("a"), String(Date.now() - IDLE_MS));
  const expire = vi.fn(); stop = monitorIdleSession("a", vi.fn(), expire);
  expect(expire).toHaveBeenCalledOnce();
});
it("a new login has a new independent session key", () => {
  localStorage.setItem(activityKey("old"), String(Date.now() - IDLE_MS));
  const expire = vi.fn(); stop = monitorIdleSession("new", vi.fn(), expire);
  expect(expire).not.toHaveBeenCalled();
});
it("removes timers and activity listeners on unmount", () => {
  const expire = vi.fn(); stop = monitorIdleSession("a", vi.fn(), expire);
  const saved = localStorage.getItem(activityKey("a")); stop();
  vi.advanceTimersByTime(IDLE_MS); window.dispatchEvent(new Event("click"));
  expect(expire).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  expect(localStorage.getItem(activityKey("a"))).toBe(saved);
});
