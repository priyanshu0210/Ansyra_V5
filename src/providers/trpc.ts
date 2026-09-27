import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../api/router";

// The typed client, split out of the provider module so that file exports
// components only (react-refresh/only-export-components). This file keeps the
// "@/providers/trpc" specifier the app already imports, so no call site moved.
// It also tightens the landing's code split: a module that only needs `trpc`
// no longer pulls QueryClient and the providers in with it.
export const trpc = createTRPCReact<AppRouter>();
