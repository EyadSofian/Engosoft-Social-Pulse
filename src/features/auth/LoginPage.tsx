import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Loader2, LogIn } from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../i18n/I18nProvider';

export function LoginPage({ onSignedIn }: { onSignedIn: () => void | Promise<void> }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await api('/api/auth/login', { body: { email, password } }); await onSignedIn(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return <div className="auth-screen">
    <div className="auth-orb auth-orb--a" aria-hidden /><div className="auth-orb auth-orb--b" aria-hidden />
    <motion.form className="auth-card glass" onSubmit={(e) => void submit(e)} initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      <img src="/brand/logos/engosoft-lockup-reversed.svg" alt="Engosoft" className="auth-logo" />
      <h1>{t('Social Pulse', 'سوشيال بالس')}</h1>
      <p>{t('Sign in to create, review and track Engosoft content.', 'سجّل دخولك عشان تصمم وتراجع وتتابع محتوى إنجوسوفت.')}</p>
      <label>{t('Email', 'الإيميل')}<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></label>
      <label>{t('Password', 'كلمة المرور')}<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" /></label>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <button type="submit" className="auth-submit" disabled={busy}>{busy ? <Loader2 className="auth-spin" size={18} /> : <LogIn size={18} />}{t('Sign in', 'دخول')}</button>
      <small>{t('Accounts are created by your administrator.', 'الحسابات بيعملها مسؤول النظام.')}</small>
    </motion.form>
  </div>;
}
