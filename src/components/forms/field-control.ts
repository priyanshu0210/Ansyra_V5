import { createContext, useContext } from "react";

export const FieldControlId = createContext<string | null>(null);

export function useFieldControlId(explicitId?: string) {
  const generatedId = useContext(FieldControlId);
  return explicitId ?? generatedId ?? undefined;
}
