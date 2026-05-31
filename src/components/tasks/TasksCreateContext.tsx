'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type TasksCreateContextValue = {
  createTrigger: number;
  requestCreate:   () => void;
};

const TasksCreateContext = createContext<TasksCreateContextValue | null>(null);

export function TasksCreateProvider({ children }: { children: ReactNode }) {
  const [createTrigger, setCreateTrigger] = useState(0);

  return (
    <TasksCreateContext.Provider
      value={{
        createTrigger,
        requestCreate: () => setCreateTrigger((n) => n + 1),
      }}
    >
      {children}
    </TasksCreateContext.Provider>
  );
}

export function useTasksCreate(): TasksCreateContextValue {
  const ctx = useContext(TasksCreateContext);
  if (!ctx) {
    throw new Error('useTasksCreate must be used within TasksCreateProvider');
  }
  return ctx;
}
