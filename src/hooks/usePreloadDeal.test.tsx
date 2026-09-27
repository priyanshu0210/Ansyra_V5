// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import superjson from "superjson";
import { TRPCProvider } from "@/providers/TRPCProvider";
import { trpc } from "@/providers/trpc";
import { usePreloadDeal } from "./usePreloadDeal";

vi.mock("@/routes/preload", () => ({ loadDealDetail: vi.fn().mockResolvedValue({}) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("reuses a focus-prefetched deal when navigating instead of requesting it again", async () => {
  const fetch = vi.fn(async () => Response.json({ result: { data: superjson.serialize({ id: 42, name: "Prepared deal" }) } }));
  vi.stubGlobal("fetch", fetch);
  function Detail() {
    const deal = trpc.deals.get.useQuery({ id: 42 });
    return <p>{deal.data?.name ?? "Loading"}</p>;
  }
  function Harness() {
    const preload = usePreloadDeal();
    const [open, setOpen] = useState(false);
    return <><button onFocus={() => preload(42)} onClick={() => { preload(42); setOpen(true); }}>Open deal</button>{open && <Detail />}</>;
  }
  render(<TRPCProvider><Harness /></TRPCProvider>);
  fireEvent.focus(screen.getByRole("button"));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("Prepared deal");
  expect(fetch).toHaveBeenCalledTimes(1);
});
