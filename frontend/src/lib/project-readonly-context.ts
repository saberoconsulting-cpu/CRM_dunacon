'use client';

import { createContext, useContext } from 'react';

// Fail closed until Layout has resolved the current project's lock.
export const ProjectReadonlyContext = createContext(true);
export const ProjectEditAccessContext = createContext<{ enableEditing: () => Promise<void>; busy: boolean } | null>(null);

export function useProjectReadonly() {
  return useContext(ProjectReadonlyContext);
}
