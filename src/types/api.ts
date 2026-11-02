/** message roles (User, Assistant) */
export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
}

/** Message structure with role and content */
export type ApiMessage = {
  role: string;
  content: string;
};

/** Request payload for memory API calls */
export type ApiMemoryRequest = {
  messages: ApiMessage[];
  user_id: string;
  metadata: {
    provider: string;
    category: string;
    page_url?: string;
    engine?: string;
  };
  source?: string;
  org_id?: string;
  project_id?: string;
};

/** Array of memory search results */
export type MemorySearchResponse = Array<{
  id: string;
  memory: string;
  text?: string;
  created_at?: string;
  user_id?: string;
  categories?: string[];
}>;

/** User authentication data structure */
export type LoginData = Partial<{
  apiKey: string;
  userId: string;
  user_id: string;
  access_token: string;
}>;

/** Defaults for a new self-hosted installation */
export const OSS_API_BASE_DEFAULT = 'http://127.0.0.1:8888';
export const DEFAULT_USER_ID = '';

/** Extension source identifier */
export const SOURCE = 'OPENMEMORY_CHROME_EXTENSION';
