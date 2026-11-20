import { Component, lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { authorizeSession, contentResponse, getStimuli, isApproved, passwordSetupRequested, resetAuthorization, setStimuli, sitePath, supabase } from "../lib/content-supabase";
import type { StimulusDocument } from "../lib/content-types";
import { ThemeToggle } from "../components/student/theme-toggle";

function AuthHeader() {
  return <header className="ca-auth-header"><span className="ca-auth-brand">ChemAtlas</span>
    <div className="ca-auth-header-actions"><ThemeToggle /><span className="ca-auth-access"><LockKeyhole size={18} aria-hidden="true" />Student access</span></div>
  </header>;
}

const ChemAtlas = lazy(() => import("../components/student-app").then(module => ({ default: module.ChemAtlas })));

class StudentAppBoundary extends Component<{ children: ReactNode; onSignOut: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="ca-auth-shell"><AuthHeader /><section className="ca-auth-card" aria-labelledby="load-error-title">
      <div className="ca-auth-mark">ChemAtlas</div>
      <h1 id="load-error-title">ChemAtlas could not open</h1>
      <p role="alert">The application could not finish loading. Reload to try again. Your session and saved progress will stay in this browser.</p>
      <button className="primary" onClick={() => location.reload()}>Reload ChemAtlas</button>
      <button className="ca-auth-text" onClick={this.props.onSignOut}>Log out</button>
    </section></main>;
  }
}
type Access = { phase: "checking" | "signed-out" | "pending" | "ready" | "error"; user?: string; error?: string };

export function AuthApp() {
  const [access, setAccess] = useState<Access>({ phase: "checking" });
  const [passwordSetup, setPasswordSetup] = useState(passwordSetupRequested);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const current = useRef<Session | null>(null);
  const verifiedUser = useRef<string | undefined>(undefined);
  const sequence = useRef(0);
  const retry = useRef<() => void>(() => {});

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    async function check(session: Session | null) {
      const revision = ++sequence.current;
      current.current = session;
      if (!session) {
        setPasswordSetup(false);
        verifiedUser.current = undefined;
        resetAuthorization();
        setAccess({ phase: "signed-out" });
        return;
      }
      if (verifiedUser.current !== session.user.id) {
        resetAuthorization();
        setAccess({ phase: "checking" });
      }
      try {
        const approved = await isApproved(session, controller.signal);
        if (disposed || revision !== sequence.current) return;
        if (!approved) {
          verifiedUser.current = undefined;
          resetAuthorization();
          setAccess({ phase: "pending", user: session.user.id });
          return;
        }
        authorizeSession(session);
        let loaded = false;
        try { getStimuli(); loaded = true; } catch { /* First authorized session. */ }
        if (!loaded) {
          const response = await contentResponse("/stimuli.json", controller.signal);
          const document = await response.json() as StimulusDocument;
          if (disposed || revision !== sequence.current) return;
          setStimuli(document);
        }
        verifiedUser.current = session.user.id;
        setAccess({ phase: "ready", user: session.user.id });
      } catch {
        if (disposed || revision !== sequence.current) return;
        verifiedUser.current = undefined;
        resetAuthorization();
        setAccess({ phase: "error", user: session.user.id, error: "Access could not be verified or protected content is unavailable. Retry or contact the owner." });
      }
    }
    retry.current = () => { void check(current.current); };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordSetup(true);
      // Supabase callbacks must return before issuing further SDK requests.
      queueMicrotask(() => { if (!disposed) void check(session); });
    });
    const visibility = () => { if (document.visibilityState === "visible") retry.current(); };
    const denied = () => {
      sequence.current++;
      resetAuthorization();
      verifiedUser.current = undefined;
      setAccess({ phase: "error", user: current.current?.user.id, error: "Protected content was denied. Check your access again or contact the owner." });
    };
    const interval = window.setInterval(() => retry.current(), 60_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("chematlas:access-denied", denied);
    return () => {
      disposed = true;
      controller.abort();
      subscription.unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("chematlas:access-denied", denied);
      resetAuthorization();
    };
  }, []);

  async function logout() {
    sequence.current++;
    current.current = null;
    verifiedUser.current = undefined;
    resetAuthorization();
    setPasswordSetup(false);
    setAccess({ phase: "checking" });
    setMessage("");
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      // A network error must not restore this session when the page reloads.
      localStorage.removeItem("chematlas-supabase-auth-v1");
      await supabase.auth.stopAutoRefresh();
      setMessage("Signed out on this device. Server sign-out could not be confirmed.");
    }
    setAccess({ phase: "signed-out" });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setMessage("");
    try {
      if (passwordSetup && current.current) {
        const { error } = await supabase.auth.updateUser({ password: String(values.get("password")) });
        if (error) throw error;
        setPasswordSetup(false);
        setMessage("Password saved.");
        retry.current();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: String(values.get("email")), password: String(values.get("password")) });
        if (error) throw new Error("Unable to sign in. Check your email and password, and confirm your invitation.");
        await supabase.auth.startAutoRefresh();
      }
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Unable to complete sign-in."); }
    finally { setBusy(false); }
  }

  if (access.phase === "ready" && !passwordSetup) return <div className="ca-pages-student">
    <StudentAppBoundary key={access.user} onSignOut={() => void logout()}>
      <Suspense fallback={<div className="ca-auth-loading"><p role="status">Opening ChemAtlas…</p><button className="ca-auth-text" onClick={() => void logout()}>Log out</button></div>}>
        <ChemAtlas onSignOut={() => void logout()} />
      </Suspense>
    </StudentAppBoundary>
  </div>;
  const signedIn = !!access.user;
  return <main className="ca-auth-shell">
    <AuthHeader />
    <section className="ca-auth-card" aria-labelledby="auth-title">
    <p className="ca-auth-eyebrow">CHEMATLAS / STUDENT PORTAL</p>
    <h1 id="auth-title">{passwordSetup && signedIn ? "Set your password" : access.phase === "pending" ? "Approval required" : "Welcome back"}</h1>
    {access.phase === "checking" ? <p role="status">Checking your access…</p> : <>
      {access.phase === "pending" ? <p>Your account is signed in. The owner must approve it before questions and PDFs are available.</p>
        : access.phase === "error" ? <p role="alert">{access.error}</p> : <p className="ca-auth-intro">Sign in to continue your AP Chemistry practice.</p>}
      {(!signedIn || passwordSetup) && <form onSubmit={event => void submit(event)}>
        {!passwordSetup && <label>Email address<input aria-label="Email" name="email" type="email" placeholder="you@example.com" autoComplete="username" required /></label>}
        <label htmlFor="student-password">Password</label>
        <div className="ca-auth-password"><input id="student-password" name="password" type={showPassword ? "text" : "password"} autoComplete={passwordSetup ? "new-password" : "current-password"} minLength={passwordSetup ? 12 : undefined} required />
          <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={22} aria-hidden="true" /> : <Eye size={22} aria-hidden="true" />}</button>
        </div>
        <button className="primary" disabled={busy}>{busy ? "Please wait…" : passwordSetup ? "Save password" : "Log in"}</button>
      </form>}
      {!signedIn && <button className="ca-auth-text" disabled={busy} onClick={async () => {
        const email = document.querySelector<HTMLInputElement>('input[name="email"]');
        if (!email?.reportValidity() || !email.value) { setMessage("Enter your email first."); return; }
        setBusy(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email.value, { redirectTo: new URL(sitePath(), location.origin).href });
        setMessage(error ? "Could not send a reset email. Try again later." : "If this account is eligible, a password reset email will arrive shortly.");
        setBusy(false);
      }}>Forgot password?</button>}
      {signedIn && <div className="ca-auth-actions"><button className="outline" onClick={() => retry.current()}>Check access again</button><button className="outline" onClick={() => void logout()}>Log out</button></div>}
    </>}
    {message && <p role="status">{message}</p>}
    <div className="ca-auth-footnote"><ShieldCheck size={26} aria-hidden="true" /><div><b>Access is limited to approved students.</b><p>Worksheets and progress are saved in this browser.</p><small>Use a personal browser profile on shared devices.</small></div></div>
  </section><footer className="ca-auth-footer">ChemAtlas · AP Chemistry practice studio</footer></main>;
}
