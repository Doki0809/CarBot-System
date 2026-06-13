// LoginView.jsx — CarBot Premium Login (Redesign)
import { useState, useEffect } from 'react';
import { supabase, SUPABASE_FUNCTIONS_URL } from '../supabase.js';
import { useI18n } from '../i18n/I18nContext.jsx';

const STEP = { EMAIL: 1, CONFIRM: 2, PASSWORD: 3, HELP: 4 };

const getSeenEmails = () => {
  try { return new Set(JSON.parse(localStorage.getItem('carbot-seen-emails') || '[]')); }
  catch { return new Set(); }
};
const markEmailSeen = (emailAddr) => {
  try {
    const seen = getSeenEmails();
    seen.add(emailAddr.trim().toLowerCase());
    localStorage.setItem('carbot-seen-emails', JSON.stringify([...seen]));
  } catch { /* ignore */ }
};

export default function LoginView({ onLoginSuccess }) {
  const { t } = useI18n();

  // ─── Password Validator ──────────────────────────────────────────
  const validatePassword = (pwd) => {
    if (pwd.length < 8) return t('login_min_chars');
    if (!/[A-Z]/.test(pwd)) return t('login_need_uppercase');
    if (!/[0-9]/.test(pwd)) return t('login_need_number');
    if (!/[^A-Za-z0-9]/.test(pwd)) return t('login_need_special');
    return null;
  };

  const PHRASES = [
    t('login_tagline_1'),
    t('login_tagline_2'),
    t('login_tagline_3'),
    t('login_tagline_4'),
    t('login_tagline_5'),
    t('login_tagline_6'),
    t('login_tagline_7'),
    t('login_tagline_8'),
  ];

  const [step, setStep] = useState(STEP.EMAIL);
  const [email, setEmail] = useState('');
  const [ghlUser, setGhlUser] = useState(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [savedUser, setSavedUser] = useState(null); // { name, email, lastLoginAt }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('carbot-last-user');
      if (raw) setSavedUser(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [phraseVisible, setPhraseVisible] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Rotating tagline every 3.2s
  useEffect(() => {
    const interval = setInterval(() => {
      setPhraseVisible(false);
      setTimeout(() => {
        setPhraseIdx(i => (i + 1) % PHRASES.length);
        setPhraseVisible(true);
      }, 500);
    }, 3200);
    return () => clearInterval(interval);
  }, []);


  // Reset error on step change
  useEffect(() => { setError(''); }, [step]);

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const saveLastUser = (name, emailAddr, refreshToken) => {
    try {
      const existing = JSON.parse(localStorage.getItem('carbot-last-user') || '{}');
      localStorage.setItem('carbot-last-user', JSON.stringify({
        ...existing,
        name: name || emailAddr,
        email: emailAddr,
        lastLoginAt: Date.now(),
        quickAccessUntil: Date.now() + SEVEN_DAYS_MS,
        ...(refreshToken ? { rt: refreshToken } : {}),
      }));
    } catch { /* ignore */ }
  };

  // ── Acceso rápido con usuario guardado ────────────────────────
  const handleQuickAccess = async () => {
    if (!savedUser) return;
    setEmail(savedUser.email);
    setLoading(true);
    setError('');

    try {
      // 1) Sesión activa en memoria
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing?.user) {
        saveLastUser(savedUser.name, savedUser.email, existing.refresh_token);
        onLoginSuccess?.(existing.user);
        return;
      }

      // 2) Refresh silencioso — Supabase usa el token almacenado en carbot-session
      const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
      if (!refreshErr && refreshed?.session?.user) {
        markEmailSeen(savedUser.email);
        saveLastUser(savedUser.name, savedUser.email, refreshed.session.refresh_token);
        onLoginSuccess?.(refreshed.session.user);
        return;
      }

      // 3) Sesión expirada → pedir contraseña (renovará quickAccessUntil al entrar)
      setGhlUser({ name: savedUser.name, email: savedUser.email });
      setIsNewUser(false);
      setStep(STEP.PASSWORD);
    } catch {
      setGhlUser({ name: savedUser.name, email: savedUser.email });
      setIsNewUser(false);
      setStep(STEP.PASSWORD);
    } finally {
      setLoading(false);
    }
  };

  // ── PASO 1 ──────────────────────────────────────────────────────
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/lookup-ghl-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!data.found) {
        setError(data.error?.message || t('login_user_not_found'));
      } else {
        if (email.trim().toLowerCase() === 'jeancarlosgf13@gmail.com') {
          data.name = 'Super Admin';
          data.dealerName = 'CarBot System (Todas las Agencias)';
        }
        setGhlUser(data);
        setIsNewUser(data.isNew || data.needsPassword);
        const isFirstTime = !getSeenEmails().has(email.trim().toLowerCase());
        setStep(isFirstTime ? STEP.CONFIRM : STEP.PASSWORD);
      }
    } catch {
      setError(t('login_connection_error'));
    } finally {
      setLoading(false);
    }
  };

  // ── PASO 2 ──────────────────────────────────────────────────────
  const handleConfirmYes = async () => {
    // Si isNewUser es true, el usuario ya no existe en la BD de Supabase.
    // O si ya existe (Auto-Onboarding), isNewUser será false.
    setStep(STEP.PASSWORD);
  };

  // ── PASO 3A: Registro ────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    const pwdError = validatePassword(password);
    if (pwdError) return setError(pwdError);
    if (password !== confirmPwd) return setError(t('login_passwords_mismatch'));
    setLoading(true);
    setError('');

    try {
      // 1) Caso: Es usuario sincronizado pero que nunca puso password
      if (!ghlUser.isNew && ghlUser.needsPassword) {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/set-initial-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
        });
        const respData = await res.json();
        if (!res.ok) throw new Error(respData.error || 'Error al configurar contraseña.');

        // Entrar directo
        const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (loginErr) throw loginErr;
        if (!rememberMe) localStorage.removeItem('carbot-session');
        markEmailSeen(email.trim().toLowerCase());
        saveLastUser(ghlUser?.name, email.trim().toLowerCase(), loginData.session?.refresh_token);
        onLoginSuccess?.({ ...loginData.user, ...ghlUser });
        return;
      }

      // 2) Caso: Usuario completamente nuevo (GHL pero sin cuenta local)
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/register-new-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
          name: ghlUser.name,
          dealerName: ghlUser.dealerName,
          locationId: ghlUser.locationId
        }),
      });
      const respData = await res.json();
      if (!res.ok) throw new Error(respData.error || 'Error al crear la cuenta en el servidor.');

      // Iniciar sesión ahora que la cuenta y el perfil existen en DB
      const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginErr) throw loginErr;
      if (!rememberMe) localStorage.removeItem('carbot-session');
      markEmailSeen(email.trim().toLowerCase());
      saveLastUser(ghlUser?.name, email.trim().toLowerCase(), loginData.session?.refresh_token);
      onLoginSuccess?.({ ...loginData.user, ...ghlUser });
    } catch (err) {
      setError(err.message || 'Error al crear cuenta.');
    } finally {
      setLoading(false);
    }
  };

  // ── PASO 3B: Login ───────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password) return setError(t('login_password_required'));
    setLoading(true);
    setError('');
    try {
      const { data, error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (loginErr) throw loginErr;
      if (!rememberMe) localStorage.removeItem('carbot-session');
      markEmailSeen(email.trim().toLowerCase());
      saveLastUser(ghlUser?.name || data.user?.email, email.trim().toLowerCase(), data.session?.refresh_token);
      onLoginSuccess?.(data.user);
    } catch (err) {
      setError(t('login_invalid_credentials'));
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = { 1: 'Email', 2: 'Identidad', 3: 'Acceso' };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800;900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes bgPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 0.9; transform: scale(1.08); }
        }
        @keyframes gridMove {
          from { background-position: 0 0; }
          to   { background-position: 60px 60px; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0px) rotate(-1deg); }
          50%       { transform: translateY(-8px) rotate(1deg); }
        }
        @keyframes glowPulse {
          0%, 100% { box-shadow: 0 0 20px rgba(220,38,38,0.3), 0 0 60px rgba(220,38,38,0.1); }
          50%       { box-shadow: 0 0 40px rgba(220,38,38,0.6), 0 0 100px rgba(220,38,38,0.2); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0%   { left: -100%; }
          100% { left: 200%; }
        }

        .login-root {
          min-height: 100vh;
          background: #060608;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Outfit', system-ui, sans-serif;
          position: relative;
          overflow: hidden;
        }

        /* Animated background blobs */
        .blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
        }
        .blob-1 {
          width: 700px; height: 700px;
          top: -20%; left: -15%;
          background: radial-gradient(circle, rgba(220,38,38,0.22) 0%, transparent 70%);
          animation: bgPulse 7s ease-in-out infinite;
        }
        .blob-2 {
          width: 500px; height: 500px;
          bottom: -15%; right: -10%;
          background: radial-gradient(circle, rgba(185,28,28,0.18) 0%, transparent 70%);
          animation: bgPulse 9s ease-in-out infinite reverse;
        }
        .blob-3 {
          width: 300px; height: 300px;
          top: 40%; left: 55%;
          background: radial-gradient(circle, rgba(239,68,68,0.1) 0%, transparent 70%);
          animation: bgPulse 5s ease-in-out infinite 1s;
        }

        /* Grid overlay */
        .grid-overlay {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(220,38,38,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(220,38,38,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          animation: gridMove 8s linear infinite;
          pointer-events: none;
        }

        /* Main layout */
        .login-layout {
          position: relative; z-index: 10;
          display: flex;
          width: 100%; max-width: 1100px;
          min-height: 640px;
          border-radius: 32px;
          overflow: hidden;
          box-shadow: 0 40px 120px rgba(0,0,0,0.8);
          animation: fadeUp 0.7s cubic-bezier(.16,1,.3,1) both;
          margin: 24px;
        }

        /* Left panel */
        .login-left {
          flex: 1;
          background: linear-gradient(135deg, #1a0202 0%, #0d0d0d 40%, #180000 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 40px;
          position: relative;
          border-right: 1px solid rgba(220,38,38,0.15);
        }
        .login-left::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 40%, rgba(220,38,38,0.12) 0%, transparent 65%);
          pointer-events: none;
        }

        .logo-container {
          animation: logoFloat 4s ease-in-out infinite;
          margin-bottom: 28px;
        }
        .logo-img {
          width: 220px;
          filter: drop-shadow(0 8px 32px rgba(220,38,38,0.5));
          mix-blend-mode: multiply;
        }

        .brand-tagline {
          text-align: center;
          color: rgba(255,255,255,0.55);
          font-size: 15px;
          font-weight: 400;
          letter-spacing: 0.01em;
          line-height: 1.6;
          max-width: 260px;
          min-height: 52px;
          transition: opacity 0.4s;
        }
        .brand-tagline.hidden-phrase { opacity: 0; transform: translateY(6px); }
        .brand-tagline.show-phrase   { opacity: 1; transform: translateY(0); transition: opacity 0.4s, transform 0.4s; }

        .left-decoration {
          position: absolute;
          bottom: 40px;
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .dot-active { width: 20px; height: 5px; background: #DC2626; border-radius: 99px; transition: all 0.4s; }
        .dot        { width: 5px;  height: 5px; background: rgba(255,255,255,0.18); border-radius: 50%; transition: all 0.4s; }

        /* Right panel */
        .login-right {
          flex: 1; max-width: 460px;
          background: rgba(12, 12, 14, 0.95);
          backdrop-filter: blur(40px);
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 56px 52px;
          position: relative;
        }

        /* Step indicator */
        .step-bar {
          display: flex;
          gap: 6px;
          margin-bottom: 40px;
        }
        .step-seg {
          height: 3px;
          border-radius: 99px;
          flex: 1;
          background: rgba(255,255,255,0.08);
          transition: background 0.4s;
          position: relative;
          overflow: hidden;
        }
        .step-seg.active { background: #DC2626; }
        .step-seg.active::after {
          content: '';
          position: absolute;
          top: 0; bottom: 0; width: 50%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
          animation: shimmer 1.5s ease-in-out infinite;
        }
        .step-seg.done { background: rgba(220,38,38,0.4); }

        /* Form area */
        .form-area {
          animation: slideInRight 0.35s cubic-bezier(.16,1,.3,1) both;
        }

        h2.login-title {
          color: #fff;
          font-size: 30px;
          font-weight: 800;
          line-height: 1.2;
          margin-bottom: 6px;
          letter-spacing: -0.02em;
        }
        .login-subtitle {
          color: rgba(255,255,255,0.35);
          font-size: 14px;
          font-weight: 400;
          margin-bottom: 28px;
          line-height: 1.5;
        }
        .accent { color: #EF4444; }

        /* Input */
        .input-wrap { position: relative; margin-bottom: 12px; }
        .login-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 16px 18px;
          color: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          font-weight: 500;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }
        .login-input::placeholder { color: rgba(255,255,255,0.2); }
        .login-input:focus {
          border-color: rgba(220,38,38,0.6);
          background: rgba(220,38,38,0.04);
          box-shadow: 0 0 0 3px rgba(220,38,38,0.1);
        }
        .eye-btn {
          position: absolute; right: 8px; top: 50%;
          transform: translateY(-50%);
          background: rgba(255,255,255,0.08); border: none;
          color: rgba(255,255,255,0.7);
          cursor: pointer; padding: 6px; border-radius: 8px;
          transition: background 0.2s, color 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .eye-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }

        /* Buttons */
        .btn-primary {
          width: 100%;
          background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%);
          color: #fff;
          border: none; border-radius: 14px;
          padding: 17px;
          font-family: 'Outfit', sans-serif;
          font-size: 15px; font-weight: 700;
          cursor: pointer; margin-top: 8px;
          position: relative; overflow: hidden;
          transition: transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 8px 24px rgba(220,38,38,0.35);
        }
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 12px 32px rgba(220,38,38,0.5);
        }
        .btn-primary:active:not(:disabled) { transform: scale(0.98); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary::after {
          content: '';
          position: absolute; top: 0; left: -100%;
          width: 60%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
          animation: shimmer 2s ease-in-out infinite;
        }

        .btn-secondary {
          width: 100%;
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.6);
          border: 1.5px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 15px;
          font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 600;
          cursor: pointer; margin-top: 8px;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .btn-secondary:hover {
          background: rgba(255,255,255,0.08);
          color: #fff;
          border-color: rgba(255,255,255,0.15);
        }

        .btn-link {
          background: none; border: none;
          color: rgba(255,255,255,0.3);
          font-family: 'Outfit', sans-serif;
          font-size: 13px; font-weight: 500;
          cursor: pointer;
          margin-top: 12px;
          transition: color 0.2s;
          display: block; text-align: center; width: 100%;
        }
        .btn-link:hover { color: rgba(255,255,255,0.7); }

        /* Error */
        .error-msg {
          color: #FCA5A5;
          font-size: 13px; font-weight: 500;
          background: rgba(220,38,38,0.1);
          border: 1px solid rgba(220,38,38,0.2);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 8px;
          animation: fadeUp 0.25s ease;
        }

        /* Identity card */
        .identity-card {
          display: flex; align-items: center; gap: 14px;
          background: rgba(220,38,38,0.06);
          border: 1.5px solid rgba(220,38,38,0.2);
          border-radius: 18px;
          padding: 18px 20px;
          margin-bottom: 16px;
          animation: glowPulse 3s ease-in-out infinite;
        }
        .avatar {
          width: 52px; height: 52px; border-radius: 50%;
          background: linear-gradient(135deg, #DC2626, #7F1D1D);
          color: #fff; font-size: 22px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 4px 14px rgba(220,38,38,0.4);
        }
        .identity-name { color: #fff; font-weight: 700; font-size: 16px; }
        .identity-dealer {
          color: rgba(255,255,255,0.45); font-size: 13px; margin-top: 2px;
          display: flex; align-items: center; gap: 5px;
        }
        .dealer-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #DC2626; display: inline-block;
        }

        /* Password strength */
        .pwd-rules {
          display: flex; flex-wrap: wrap; gap: 6px;
          margin-bottom: 12px;
        }
        .pwd-rule {
          font-size: 11px; font-weight: 600;
          padding: 3px 8px; border-radius: 99px;
          transition: all 0.25s;
        }
        .pwd-rule.ok  { background: rgba(34,197,94,0.15); color: #86efac; }
        .pwd-rule.bad { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.3); }

        /* Help screen */
        .help-icon {
          font-size: 56px; text-align: center; margin-bottom: 16px;
          animation: logoFloat 3s ease-in-out infinite;
          display: block;
        }

        /* Loading spinner */
        .spinner {
          width: 18px; height: 18px;
          border: 2.5px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
          display: inline-block; vertical-align: middle; margin-right: 8px;
        }

        /* Mobile */
        @media (max-width: 640px) {
          .login-root { align-items: stretch; }
          .login-layout {
            flex-direction: column;
            margin: 0;
            border-radius: 0;
            min-height: 100vh;
            box-shadow: none;
          }
          .login-left {
            padding: 48px 28px 32px;
            border-right: none;
            border-bottom: 1px solid rgba(220,38,38,0.2);
            flex: none;
          }
          .logo-img { width: 150px; }
          .brand-tagline {
            font-size: 13px;
            min-height: 40px;
            max-width: 100%;
            color: rgba(255,255,255,0.65);
          }
          .login-right { padding: 36px 28px 48px; max-width: 100%; flex: 1; }
          h2.login-title { font-size: 24px; }
          .left-decoration { bottom: 24px; }
        }
      `}</style>

      <div className="login-root">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
        <div className="grid-overlay" />

        <div className="login-layout" style={{ opacity: mounted ? 1 : 0 }}>

          {/* ── PANEL IZQUIERDO ── */}
          <div className="login-left">
            <div className="logo-container">
              <img src="/logo.png" alt="CarBot" className="logo-img" />
            </div>
            <p className={`brand-tagline ${phraseVisible ? 'show-phrase' : 'hidden-phrase'}`}>
              {PHRASES[phraseIdx]}
            </p>
            <div className="left-decoration">
              {PHRASES.map((_, i) => (
                <div key={i} className={i === phraseIdx ? 'dot-active' : 'dot'} />
              ))}
            </div>
          </div>

          {/* ── PANEL DERECHO ── */}
          <div className="login-right">

            {/* Step bar (solo pasos 1-3) */}
            {step <= 3 && (
              <div className="step-bar">
                {[1, 2, 3].map(s => (
                  <div
                    key={s}
                    className={`step-seg ${step === s ? 'active' : step > s ? 'done' : ''}`}
                  />
                ))}
              </div>
            )}

            {/* ── PASO 1: Email ── */}
            {step === STEP.EMAIL && (
              <div className="form-area" key="email">
                <h2 className="login-title">{t('welcomeBack').split(' ').slice(0, -1).join(' ')} <span className="accent">{t('welcomeBack').split(' ').slice(-1)[0]}</span></h2>
                <p className="login-subtitle">{t('login_verify_identity')}</p>
                <form onSubmit={handleEmailSubmit}>
                  <div className="input-wrap">
                    <input
                      className="login-input"
                      type="email"
                      placeholder={t('emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  {error && <p className="error-msg">{error}</p>}
                  <button className="btn-primary" disabled={loading}>
                    {loading ? <><span className="spinner" />{t('login_verifying')}</> : `${t('login_continue')} →`}
                  </button>
                </form>

                {/* ── Acceso rápido: usuario guardado ── */}
                {savedUser && (
                  <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                    {/* Divider */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>acceso rápido</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                    </div>
                    {/* Pill button */}
                    <button
                      type="button"
                      onClick={handleQuickAccess}
                      disabled={loading}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '10px',
                        padding: '8px 20px 8px 8px',
                        borderRadius: '999px',
                        border: '1.5px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        cursor: 'pointer', transition: 'all 0.18s',
                        backdropFilter: 'blur(8px)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    >
                      {/* Avatar: foto real o inicial */}
                      {savedUser.avatar ? (
                        <img
                          src={savedUser.avatar}
                          alt={savedUser.name}
                          style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: '0 0 0 2px rgba(227,28,37,0.35)' }}
                          onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%', background: '#E31C25',
                        display: savedUser.avatar ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: 800, color: 'white', flexShrink: 0,
                        boxShadow: '0 0 0 2px rgba(227,28,37,0.25)',
                      }}>
                        {savedUser.name?.charAt(0).toUpperCase()}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                        Continuar como <strong style={{ color: '#E31C25' }}>{savedUser.name?.split(' ')[0]}</strong>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { localStorage.removeItem('carbot-last-user'); setSavedUser(null); }}
                      style={{ fontSize: '11px', color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px' }}
                    >
                      No soy yo
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── PASO 2: Confirmar identidad ── */}
            {step === STEP.CONFIRM && ghlUser && (
              <div className="form-area" key="confirm">
                <h2 className="login-title">{t('login_is_you').split(' ').slice(0, -1).join(' ')} <span className="accent">{t('login_is_you').split(' ').slice(-1)[0]}</span></h2>
                <p className="login-subtitle">{t('login_found_profile')}</p>
                <div className="identity-card">
                  <div className="avatar">{ghlUser.name?.charAt(0)}</div>
                  <div>
                    <div className="identity-name">{ghlUser.name}</div>
                    <div className="identity-dealer">
                      <span className="dealer-dot" />
                      {ghlUser.dealerName}
                    </div>
                  </div>
                </div>
                {error && <p className="error-msg">{error}</p>}
                <button className="btn-primary" onClick={handleConfirmYes} disabled={loading}>
                  {loading ? <><span className="spinner" />{t('login_verifying')}</> : `✓ ${t('login_yes_me')}`}
                </button>
                <button className="btn-secondary" onClick={() => setStep(STEP.HELP)}>
                  {t('login_not_me')}
                </button>
                <button className="btn-link" onClick={() => setStep(STEP.EMAIL)}>← {t('login_change_email')}</button>
              </div>
            )}

            {/* ── PASO 3: Password ── */}
            {step === STEP.PASSWORD && (
              <div className="form-area" key="password">
                <h2 className="login-title">
                  {isNewUser
                    ? <>{t('login_create_password').split(' ').slice(0, -1).join(' ')} <span className="accent">{t('login_create_password').split(' ').slice(-1)[0]}</span></>
                    : <>{t('login_enter_password').split(' ').slice(0, -1).join(' ')} <span className="accent">{t('login_enter_password').split(' ').slice(-1)[0]}</span></>}
                </h2>
                <p className="login-subtitle">
                  {isNewUser
                    ? `Hola ${ghlUser?.name?.split(' ')[0]}, ${t('login_setup_access')}`
                    : `${t('welcomeBack')}, ${ghlUser?.name?.split(' ')[0]}.`}
                </p>

                {isNewUser && (
                  <div className="pwd-rules">
                    {[
                      { label: t('login_pwd_chars'), ok: password.length >= 8 },
                      { label: t('login_pwd_upper'), ok: /[A-Z]/.test(password) },
                      { label: t('login_pwd_number'), ok: /[0-9]/.test(password) },
                      { label: t('login_pwd_symbol'), ok: /[^A-Za-z0-9]/.test(password) },
                    ].map(r => (
                      <span key={r.label} className={`pwd-rule ${r.ok ? 'ok' : 'bad'}`}>
                        {r.ok ? '✓' : '·'} {r.label}
                      </span>
                    ))}
                  </div>
                )}

                <form onSubmit={isNewUser ? handleRegister : handleLogin}>
                  <div className="input-wrap">
                    <input
                      className="login-input"
                      type={showPwd ? 'text' : 'password'}
                      placeholder={t('passwordPlaceholder')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required autoFocus
                    />
                    <button
                      type="button" className="eye-btn"
                      onClick={() => setShowPwd(v => !v)}
                    >
                      {showPwd ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                          <line x1="2" y1="2" x2="22" y2="22"></line>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>
                  </div>

                  {isNewUser && (
                    <div className="input-wrap">
                      <input
                        className="login-input"
                        type={showPwd ? 'text' : 'password'}
                        placeholder={t('login_confirm_password')}
                        value={confirmPwd}
                        onChange={(e) => setConfirmPwd(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  {!isNewUser && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: '4px 0 8px', userSelect: 'none' }}>
                      <span
                        onClick={() => setRememberMe(v => !v)}
                        style={{
                          width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                          border: `2px solid ${rememberMe ? '#E31C25' : 'rgba(255,255,255,0.2)'}`,
                          background: rememberMe ? '#E31C25' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                      >
                        {rememberMe && (
                          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                            <path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <input type="checkbox" checked={rememberMe} onChange={() => setRememberMe(v => !v)} style={{ display: 'none' }} />
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', fontWeight: 500 }}>
                        Recuérdame en este dispositivo
                      </span>
                    </label>
                  )}

                  {error && <p className="error-msg">{error}</p>}

                  <button className="btn-primary" disabled={loading}>
                    {loading
                      ? <><span className="spinner" />{t('login_processing')}</>
                      : isNewUser ? t('login_create_account') : `${t('login_enter_system')} →`}
                  </button>
                </form>

                <button className="btn-link" onClick={() => setStep(STEP.EMAIL)}>← {t('login_back_start')}</button>
              </div>
            )}

            {/* ── PASO 4: Ayuda ── */}
            {step === STEP.HELP && (
              <div className="form-area" key="help">
                <span className="help-icon">🆘</span>
                <h2 className="login-title">{t('login_contact_support').split(' ').slice(0, -1).join(' ')} <span className="accent">{t('login_contact_support').split(' ').slice(-1)[0]}</span></h2>
                <p className="login-subtitle">
                  {t('login_contact_admin')}{' '}
                  <a href="mailto:soporte@carbot.com" style={{ color: '#EF4444' }}>soporte@carbot.com</a>.{' '}
                  {t('login_happy_help')}
                </p>
                <button className="btn-primary" onClick={() => { setStep(STEP.EMAIL); setEmail(''); }}>
                  ← {t('login_try_another')}
                </button>
                <button className="btn-secondary" onClick={() => setStep(STEP.EMAIL)}>
                  {t('login_back')}
                </button>
              </div>
            )}

            {/* Footer */}
            <p style={{
              position: 'absolute', bottom: 24, left: 0, right: 0,
              textAlign: 'center', color: 'rgba(255,255,255,0.12)',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase'
            }}>
              CarBot System · v3.0 · © 2026
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
