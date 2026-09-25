export type AppConfig = {
  publicOrigin: string;
  trustedOrigins: string[];
  authSecret: string;
  encryptionSecret: string;
  production: boolean;
  google?: { clientId: string; clientSecret: string };
  github?: { clientId: string; clientSecret: string };
  smtp?: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const production = env.NODE_ENV === "production";
  const publicOrigin = new URL(env.PUBLIC_APP_URL ?? "http://localhost:5173").origin;
  if (production && !publicOrigin.startsWith("https://")) throw new Error("PUBLIC_APP_URL must use HTTPS in production.");
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  if (!env.LLM_KEY_ENCRYPTION_SECRET) throw new Error("LLM_KEY_ENCRYPTION_SECRET is required.");
  const trustedOrigins = Array.from(new Set([publicOrigin, ...(env.CORS_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean)]));
  if (trustedOrigins.some(origin => origin === "*" || new URL(origin).origin !== origin)) throw new Error("CORS_ORIGINS must contain explicit origins without paths.");
  const provider = (prefix: string) => env[`${prefix}_CLIENT_ID`] && env[`${prefix}_CLIENT_SECRET`]
    ? { clientId: env[`${prefix}_CLIENT_ID`]!, clientSecret: env[`${prefix}_CLIENT_SECRET`]! } : undefined;
  if (production && (!env.SMTP_HOST || !env.SMTP_FROM)) throw new Error("SMTP_HOST and SMTP_FROM are required for verification and password recovery.");
  return {
    publicOrigin, trustedOrigins, production, authSecret: env.BETTER_AUTH_SECRET,
    encryptionSecret: env.LLM_KEY_ENCRYPTION_SECRET,
    google: provider("GOOGLE"), github: provider("GITHUB"),
    smtp: env.SMTP_HOST && env.SMTP_FROM ? {
      host: env.SMTP_HOST, port: Number(env.SMTP_PORT ?? 587), secure: env.SMTP_SECURE === "true",
      user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.SMTP_FROM,
    } : undefined,
  };
}
