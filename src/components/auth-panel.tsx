import { useState } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { useAuth } from "../auth/use-auth";

type AuthMode = "sign-in" | "create";

const AuthPanel = () => {
  const { configured, signInWithPassword, createAccount } = useAuth();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(undefined);
    setPassword("");
  };

  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      if (mode === "create") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        await createAccount(email, password);
      } else {
        await signInWithPassword(email, password);
      }
    } catch (caught) {
      const authError = caught as { code?: string; message?: string };
      if (authError.code === "invalid_credentials") {
        setError("The email or password is incorrect.");
      } else if (authError.code === "user_already_exists" || authError.message?.includes("already exists")) {
        setError("An account with this email already exists. Sign in instead.");
      } else if (authError.code === "weak_password" || authError.message?.startsWith("Use at least")) {
        setError("Use at least 8 characters for your password.");
      } else {
        setError(mode === "create"
          ? "We couldn't create your account. Check the details and try again."
          : "We couldn't sign you in. Check the details and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!configured) {
    return (
      <div className="auth-gate config-gate">
        <span className="auth-icon"><KeyRound /></span>
        <p className="section-kicker">Setup required</p>
        <h3>Connect Supabase<br />to enable scanning.</h3>
        <p>Add the public Supabase URL and publishable key to your environment file. The old public webhook is no longer called.</p>
        <code>Copy .env.example to .env.local</code>
      </div>
    );
  }

  const creating = mode === "create";

  return (
    <div className="auth-gate">
      <div className="auth-heading">
        <span className="auth-icon">{creating ? <UserPlus /> : <ShieldCheck />}</span>
        <div>
          <p className="section-kicker">{creating ? "New account" : "Welcome back"}</p>
          <h3>{creating ? <>Create your account.<br />Start scanning.</> : <>Sign in and scan<br />your next meal.</>}</h3>
        </div>
      </div>

      <p className="auth-intro">
        {creating
          ? "Create a free account with your email and password. No confirmation email is required."
          : "Enter your email and password to continue to your meal scanner."}
      </p>

      <form
        className="email-form password-auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="auth-email">Email address</label>
        <div className="email-field">
          <Mail size={18} aria-hidden="true" />
          <input
            id="auth-email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            spellCheck={false}
            required
          />
        </div>

        <label htmlFor="auth-password">Password</label>
        <div className="email-field password-field">
          <LockKeyhole size={18} aria-hidden="true" />
          <input
            id="auth-password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={creating ? "At least 8 characters" : "Your password"}
            autoComplete={creating ? "new-password" : "current-password"}
            minLength={creating ? 8 : 6}
            required
          />
          <button
            type="button"
            className="password-visibility"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && <p className="auth-message error" role="alert">{error}</p>}

        <button className="magic-link-button" type="submit" disabled={busy || !email.trim() || !password}>
          {busy ? (creating ? "Creating account…" : "Signing in…") : (creating ? "Create account" : "Sign in")}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </form>

      <div className="auth-switch">
        <span>{creating ? "Already have an account?" : "New to Syenxa Calories?"}</span>
        <button type="button" onClick={() => changeMode(creating ? "sign-in" : "create")}>
          {creating ? "Sign in" : "Create an account"}
        </button>
      </div>
      <p className="auth-footnote">Your password stays protected by Supabase Auth. Every account includes 3 scans in a rolling 24-hour window.</p>
    </div>
  );
};

export default AuthPanel;
