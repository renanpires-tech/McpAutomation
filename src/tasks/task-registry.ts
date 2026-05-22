import { TASK_DEFINITIONS } from "./task-definitions.js";

export interface TaskSummary {
  id:          string;
  name:        string;
  description: string;
  inputSchema: unknown;
}

export class TaskRegistry {
  static list(): { tasks: TaskSummary[] } {
    return {
      tasks: TASK_DEFINITIONS.map(t => ({
        id:          t.name,
        name:        t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    };
  }

  static get(id: string): TaskSummary | undefined {
    const def = TASK_DEFINITIONS.find(t => t.name === id);
    if (!def) return undefined;
    return { id: def.name, name: def.name, description: def.description, inputSchema: def.inputSchema };
  }
}
