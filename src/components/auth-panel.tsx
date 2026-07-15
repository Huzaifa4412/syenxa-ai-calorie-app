import { useState } from "react";
import { ArrowRight, CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/use-auth";

const AuthPanel = () => {
  const { configured, sendMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign in failed. Please try again.");
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

  return (
    <div className="auth-gate">
      <div className="auth-heading">
        <span className="auth-icon"><ShieldCheck /></span>
        <div>
          <p className="section-kicker">Free account</p>
          <h3>Sign in to scan<br />your next meal.</h3>
        </div>
      </div>

      <p className="auth-intro">Enter your email and we’ll send a secure sign-in link. Every account includes three AI meal analyses in a rolling 24-hour window.</p>

      <form
        className="email-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await sendMagicLink(email.trim());
            setMessage(`A secure sign-in link was sent to ${email.trim()}.`);
          });
        }}
      >
        <label htmlFor="auth-email">Email address</label>
        <div className="email-field">
          <Mail size={18} aria-hidden="true" />
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </div>

        <button
          className="magic-link-button"
          type="submit"
          disabled={busy || !email.trim()}
        >
          {busy ? "Sending link…" : "Email me a sign-in link"}
          <ArrowRight size={17} />
        </button>
      </form>

      {message && <p className="auth-message success"><CheckCircle2 size={17} /> {message}</p>}
      {error && <p className="auth-message error" role="alert">{error}</p>}
      <p className="auth-footnote">No password to remember. Usage limits protect the service and keep the free tier available.</p>
    </div>
  );
};

export default AuthPanel;
