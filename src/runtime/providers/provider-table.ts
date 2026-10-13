import { ProviderRef } from "../../parser/ast.js";
import { gemini } from "./gemini.js";
import { openai, openrouter, groq, cerebras } from "./openai.js";
import { anthropic } from "./anthropic.js";
import { makeCustomProvider } from "./custom.js";
import { mock } from "./mock.js";
import { demo } from "./demo.js";
import { ProviderAdapter } from "./types.js";

const BUILTIN: Record<string, ProviderAdapter> = {
  gemini,
  openai,
  openrouter,
  groq,
  cerebras,
  anthropic,
  mock,
  demo
};

export function resolveProvider(ref: ProviderRef): ProviderAdapter {
  if (ref.kind === "custom") {
    return makeCustomProvider({
      endpoint: ref.endpoint,
      authHeader: ref.authHeader,
      requestFormat: ref.requestFormat
    });
  }
  const adapter = BUILTIN[ref.name];
  if (!adapter) {
    throw new Error(
      `unknown ai-provider '${ref.name}' (expected one of: ${Object.keys(BUILTIN).join(", ")}, custom)`
    );
  }
  return adapter;
}
