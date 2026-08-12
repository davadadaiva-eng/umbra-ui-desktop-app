import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../stores/appStore';

const RESEND_AFTER = 30;

// Module-level so React StrictMode's double-mount in dev doesn't send two codes.
const autoSentEmails = new Set<string>();

export function VerifyCodeBox({ email }: { email: string }) {
  const { verifyCode, sendCode } = useAppStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_AFTER);
  const autoSendRef = useRef(false);

  // Send the initial code as soon as this screen appears (signup, unverified sign-in,
  // or an unverified session at launch). The resend button covers later resends.
  useEffect(() => {
    if (autoSendRef.current) return;
    autoSendRef.current = true;
    const target = email.trim();
    if (!target || autoSentEmails.has(target)) return;
    autoSentEmails.add(target);
    setLoading(true);
    void sendCode(target).then((res) => {
      setLoading(false);
      if (res.ok) {
        setInfo('A 6-digit code is on its way — check your inbox.');
        setResendIn(RESEND_AFTER);
      } else {
        setError(res.error ?? 'Could not send the code — use “Resend code” below.');
        setResendIn(0);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendIn]);

  const submit = async () => {
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setLoading(true);
    const res = await verifyCode(email.trim(), code);
    setLoading(false);
    if (!res.ok) setError(res.error ?? 'That code did not work.');
  };

  const resend = async () => {
    setError('');
    setLoading(true);
    const res = await sendCode(email.trim());
    setLoading(false);
    if (res.ok) {
      setInfo('A new code has been sent to your email.');
      setResendIn(RESEND_AFTER);
    } else {
      setError(res.error ?? 'Could not send the code.');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-light" style={{ color: 'var(--text-dim)' }}>
          Type in the 6-digit verification code sent to <span style={{ color: 'var(--text-primary)' }}>{email}</span>, so we know this account is yours.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium uppercase tracking-widest mb-2" style={{ color: 'var(--text-dim)' }}>
          Verification code
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="000000"
          className="input-field tracking-[0.5em] text-center text-lg"
        />
      </div>

      <div className="flex items-center justify-between" style={{ minHeight: 22 }}>
        {error ? (
          <p className="text-sm" style={{ color: '#FF6B6B' }}>
            {error}
          </p>
        ) : info ? (
          <p className="text-sm" style={{ color: '#81C784' }}>
            {info}
          </p>
        ) : (
          <span />
        )}
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={loading}
        className="btn-primary w-full"
        style={{ height: 46 }}
      >
        {loading ? (
          <span className="inline-block w-4 h-4 rounded-full border border-current border-t-transparent animate-spin" />
        ) : (
          'Verify account'
        )}
      </button>

      <div className="text-center">
        {resendIn > 0 ? (
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            Resend code in {resendIn}s
          </p>
        ) : (
          <button type="button" onClick={resend} className="text-xs" style={{ color: '#60A5FA', fontFamily: 'var(--font)' }}>
            Resend code
          </button>
        )}
      </div>

      <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
        Sender name shows as <b>Umbra OS</b> — set in Supabase → Authentication → SMTP.
      </p>
    </div>
  );
}