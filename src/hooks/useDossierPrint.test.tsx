// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useDossierPrint } from "./useDossierPrint";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("mounts unopened export content and waits for its data before printing", async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  let release!: (value: string) => void;
  const data = new Promise<string>(resolve => { release = resolve; });
  function Content() {
    const query = useQuery({queryKey:[['documents','list'],{input:{dealId:42}}],queryFn:()=>data});
    return <p>{query.data ?? 'Loading documents'}</p>;
  }
  function Page() {
    const state = useDossierPrint(42);
    return <><button onClick={state.prepare}>Export</button>{state.preparing && <Content />}{state.error}</>;
  }
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Page /></QueryClientProvider>);
  fireEvent.click(screen.getByText('Export'));
  await screen.findByText('Loading documents');
  expect(print).not.toHaveBeenCalled();
  release('Loaded document');
  await waitFor(()=>expect(print).toHaveBeenCalledOnce());
});
