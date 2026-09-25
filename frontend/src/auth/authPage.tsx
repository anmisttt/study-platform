import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authRequest, request, safeReturnTo } from "./client";
import { useAuth } from "./context";

type Mode = "login" | "register" | "verify" | "forgot" | "reset";
const titles: Record<Mode, string> = { login: "Welcome back", register: "Create your account", verify: "Verify your email", forgot: "Reset your password", reset: "Choose a new password" };
export default function AuthPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(params.get("error") ? "This link is invalid or has expired. Request a new email." : "");
  const [message, setMessage] = useState("");
  const [options, setOptions] = useState({ google: false, github: false, email: true });
  const loginUrl = `/login?returnTo=${encodeURIComponent(returnTo)}`;
  const callbackURL = `${window.location.origin}${loginUrl}&verified=1`;
  useEffect(() => { void request<typeof options>("/auth-options").then(setOptions).catch(() => {}); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setMessage("");
    try {
      if (mode === "login") {
        await authRequest("/sign-in/email", { email, password });
        setPassword(""); await refresh(); navigate(returnTo, { replace: true });
      } else if (mode === "register") {
        await authRequest("/sign-up/email", { email, password, callbackURL });
        setPassword(""); navigate(`/verify-email?email=${encodeURIComponent(email)}&returnTo=${encodeURIComponent(returnTo)}`);
      } else if (mode === "verify") {
        await authRequest("/send-verification-email", { email, callbackURL });
        setMessage("If verification is needed, a new link has been sent. Check your inbox.");
      } else if (mode === "forgot") {
        await authRequest("/request-password-reset", { email, redirectTo: `${window.location.origin}/reset-password?returnTo=${encodeURIComponent(returnTo)}` });
        setMessage("If an account exists for this email, a password reset link has been sent.");
      } else {
        await authRequest("/reset-password", { newPassword: password, token: params.get("token") });
        setPassword(""); navigate(`${loginUrl}&reset=1`, { replace: true });
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Please try again."); }
    finally { setPending(false); }
  }
  async function social(provider: "google" | "github") {
    setPending(true); setError("");
    try {
      const result = await authRequest<{ url: string }>("/sign-in/social", {
        provider, callbackURL: `${window.location.origin}${returnTo}`, errorCallbackURL: `${window.location.origin}${loginUrl}`,
      });
      window.location.assign(result.url);
    } catch (error) { setError(error instanceof Error ? error.message : "Sign-in failed."); setPending(false); }
  }
  return <section className="account-page auth-page">
    <p className="account-eyebrow">Study Platform</p><h1>{titles[mode]}</h1>
    {mode === "verify" && <p>Check your inbox and follow the verification link before signing in.</p>}
    {params.get("verified") === "1" && !error && <p className="account-notice">Email verified. You can now sign in.</p>}
    {params.get("reset") === "1" && <p className="account-notice">Password updated. Sign in with your new password.</p>}
    {error && <p role="alert" className="account-error">{error}</p>}
    {message && <p role="status" className="account-notice">{message}</p>}
    {(mode === "login" || mode === "register") && (options.google || options.github) && <div className="account-social">
      {options.google && <button type="button" className="secondary-button" disabled={pending} onClick={() => void social("google")}>Continue with Google</button>}
      {options.github && <button type="button" className="secondary-button account-social-button" disabled={pending} onClick={() => void social("github")}>
        <svg className="account-social-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        Continue with GitHub
      </button>}
    </div>}
    <form onSubmit={event => void submit(event)} className="account-form">
      {mode !== "reset" && <label>Email<input name="email" type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {(mode === "login" || mode === "register" || mode === "reset") && <label>Password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={event => setPassword(event.target.value)} /></label>}
      <button className="primary-button" disabled={pending || (!options.email && mode !== "login") || (mode === "reset" && !params.get("token"))}>
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "verify" ? "Resend verification email" : mode === "forgot" ? "Send reset link" : "Update password"}
      </button>
      {!options.email && <p>Email registration and recovery are temporarily unavailable.</p>}
    </form>
    <div className="account-links">
      {mode === "login" ? <><Link to={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Create an account</Link><Link to={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}>Forgot password?</Link><Link to={`/verify-email?returnTo=${encodeURIComponent(returnTo)}`}>Resend verification</Link></> : <Link to={loginUrl}>Back to sign in</Link>}
    </div>
  </section>;
}
