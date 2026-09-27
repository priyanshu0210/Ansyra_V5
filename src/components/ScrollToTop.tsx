import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router";

// Scroll management for client-side navigation.
//
// React Router does not reset scroll position on navigation, and this app uses
// the declarative <Routes> API under BrowserRouter, so the built-in
// <ScrollRestoration /> is not available to it (that one requires a data router
// from createBrowserRouter). Without this, the browser keeps whatever scroll
// offset the previous page had: clicking an instrument from the landing's
// platform register, which sits ~2200px down, opened the shorter tool page
// already scrolled near its bottom.
//
// Three behaviours, in order:
//
//   POP (back/forward)  leave the offset alone. The browser and the user both
//                       expect to return to where they were, and overriding it
//                       is more disorienting than the bug this file fixes.
//   a hash target       scroll that element into view. Links like "/#platform"
//                       from the tool pages and the footer are cross-document,
//                       so the browser's native fragment handling never runs.
//   anything else       top of the document.
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") return;

    if (hash) {
      // Runs after commit, so the destination route's DOM is already mounted.
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
      // Unknown fragment: fall through to top rather than stranding the reader
      // wherever the previous page happened to be.
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, hash, navigationType]);

  return null;
}
