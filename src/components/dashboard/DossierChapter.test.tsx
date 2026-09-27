// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DossierChapter } from "./DossierChapter";
afterEach(cleanup);
it("defers a closed chapter, then preserves its mounted content when closed again", () => {
  const view = render(<DossierChapter id="execution" title="Execution" summary="Details"><input aria-label="Draft" defaultValue="" /></DossierChapter>);
  expect(screen.queryByLabelText("Draft")).toBeNull();
  const details = view.container.querySelector('details')!;
  details.open = true; fireEvent(details, new Event('toggle'));
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved" } });
  details.open = false; fireEvent(details, new Event('toggle'));
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("Unsaved");
});
it("mounts unopened chapters for export and opens direct section links", () => {
  const view = render(<DossierChapter id="documents" title="Documents" summary="Files" forceMount><p>Document record</p></DossierChapter>);
  expect(screen.getByText("Document record")).toBeTruthy();
  expect(view.container.querySelector('details')!.open).toBe(false);
  window.history.replaceState(null, '', '#documents');
  fireEvent(window, new Event('hashchange'));
  expect(view.container.querySelector('details')!.open).toBe(true);
  window.history.replaceState(null, '', '/');
});
