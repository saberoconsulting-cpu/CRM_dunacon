'use client';

import { createContext, useContext } from 'react';

// Fail closed until Layout has resolved the current project's lock.
export const ProjectReadonlyContext = createContext(true);

export function useProjectReadonly() {
  return useContext(ProjectReadonlyContext);
}
