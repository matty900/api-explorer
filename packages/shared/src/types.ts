// This file contains shared types used across the application.
export type AuthType = "none" | "apiKey" | "oauth2" | "bearer" | "basic";

export interface ApiEntry {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: AuthType;
  baseUrl: string;
  docsUrl: string;
  tags: string[];
  endpoints: ApiEndpoint[];
}

export interface ApiEndpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  summary: string;
  params?: ApiParam[];
}

export interface ApiParam {
  name: string;
  in: "query" | "header" | "path" | "body" | "formData";
  required: boolean;
  description: string;
  example?: string;
}

export interface SearchResult {
  apis: ApiEntry[];
  total: number;
  query: string;
}

export interface ProxyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ProxyResponse {
  status: number;
  statusText: string;
  body: string;
  durationMs: number;
}
