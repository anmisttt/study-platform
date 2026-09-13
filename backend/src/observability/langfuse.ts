import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | undefined;
let spanProcessor: LangfuseSpanProcessor | undefined;

function tracingEnvironment(): string {
  if (process.env.LANGFUSE_TRACING_ENVIRONMENT) {
    return process.env.LANGFUSE_TRACING_ENVIRONMENT;
  }
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function initializeLangfuseTracing(): void {
  if (sdk) {
    return;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST;
  if (!publicKey || !secretKey || !baseUrl) {
    throw new Error(
      "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL (or LANGFUSE_HOST) must be set",
    );
  }

  spanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    environment: tracingEnvironment(),
    release: process.env.LANGFUSE_RELEASE,
  });
  sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();
}

export async function flushLangfuseTracing(): Promise<void> {
  await spanProcessor?.forceFlush();
}

export async function shutdownLangfuseTracing(): Promise<void> {
  await sdk?.shutdown();
}
