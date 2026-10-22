export type HistoryEntry = { id: number; text: string; saved_at: string };
export type Server = {
  id: string;
  pkf: string;
  sn: string;
  model: string | null;
  os: string | null;
  status: string;
  stage: number;
  progress_state: string;
  lifecycle: "Active" | "History" | "Deleted";
  generation: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  status_history: HistoryEntry[];
};
export type Snapshot = {
  servers: Server[];
  pkfs: { pkf: string; position: string; note: string }[];
  revision: number;
  timezone: string;
  models: string[];
  systems: string[];
  stages: string[];
  pkf_default_prefix: string;
  validation_reminders: {
    default: string[];
    by_model_os: Record<string, Record<string, string[]>>;
  };
};
export type Draft = {
  value: string;
  base: string;
  generation: number;
  pkf: string;
};
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public record?: Server,
  ) {
    super(message);
  }
}
