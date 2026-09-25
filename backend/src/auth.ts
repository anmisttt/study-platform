import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { createAuthMiddleware, APIError } from "better-auth/api";
import type Database from "better-sqlite3";
import nodemailer from "nodemailer";
import type { AppConfig } from "./config.js";

export type AuthEmail = { to: string; subject: string; text: string };
export type SendEmail = (email: AuthEmail) => Promise<void>;

export function smtpMailer(config: AppConfig): SendEmail {
  const smtp = config.smtp;
  if (!smtp) return async () => { throw new Error("SMTP is not configured."); };
  const transport = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    requireTLS: config.production && !smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
  });
  return async email => { await transport.sendMail({ ...email, from: smtp.from }); };
}

export function createAuth(database: Database.Database, config: AppConfig, emailSender?: SendEmail) {
  const sendEmail = emailSender ?? smtpMailer(config);
  return betterAuth({
    appName: "Study Platform", database, baseURL: config.publicOrigin, basePath: "/api/auth",
    secret: config.authSecret, trustedOrigins: config.trustedOrigins,
    // Better Auth 1.x requires a logical name field. The compatibility view
    // supplies an empty value without persisting a personal name in the user table.
    user: { modelName: "auth_user", fields: { name: "auth_placeholder" } },
    session: { cookieCache: { enabled: false }, expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendEmail({ to: user.email, subject: "Reset your Study Platform password", text: `Reset your password: ${url}` }),
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: true, autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => sendEmail({ to: user.email, subject: "Verify your Study Platform email", text: `Verify your email: ${url}` }),
    },
    socialProviders: {
      ...(config.google ? { google: config.google } : {}),
      ...(config.github ? { github: config.github } : {}),
    },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: true, allowDifferentEmails: false } },
    advanced: {
      useSecureCookies: config.production,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: config.production },
    },
    logger: { disabled: true },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (["/sign-up/email", "/request-password-reset", "/send-verification-email"].includes(ctx.path) && !config.smtp && !emailSender) {
          throw new APIError("SERVICE_UNAVAILABLE", { message: "Email delivery is not configured." });
        }
        if (ctx.path === "/sign-up/email") return { context: { ...ctx, body: { ...ctx.body, name: ctx.body?.name ?? "" } } };
      }),
    },
    databaseHooks: {
      user: {
        create: { before: async user => {
          const id = randomUUID();
          return { data: { ...user, id, name: "", image: null } };
        } },
        update: { before: async user => ({ data: { ...user, name: "", image: null } }) },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
