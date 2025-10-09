export type PromptParameterType =
  | "string"
  | "text"
  | "enum"
  | "number"
  | "boolean"
  | "date"
  | "array";

export interface PromptParameter {
  name: string;
  type: PromptParameterType;
  label?: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  regex?: string;
  multiline?: boolean;
  delimiter?: string;
}

export interface PromptModelConfig {
  provider: "openai";
  name?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface PromptFrontMatter {
  schema_version: 1;
  title: string;
  description?: string;
  tags?: string[];
  files_to_paste?: string[];
  parameters?: PromptParameter[];
  model?: PromptModelConfig;
  comments?: string[];
}

export interface PromptValidationIssue {
  message: string;
  path?: string;
}

export interface PromptRecord {
  id: string;
  filePath: string;
  relativePath: string;
  rootPath: string;
  tags: string[];
  frontMatter?: PromptFrontMatter;
  content: string;
  excerpt: string;
  modifiedAt: Date;
  validationIssues: PromptValidationIssue[];
}
