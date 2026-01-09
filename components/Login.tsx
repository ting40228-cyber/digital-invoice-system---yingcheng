import React, { useState, useEffect } from 'react';
import { COMPANY_INFO } from '../types';
import { Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import { login } from '../services/db';

interface LoginProps {
  onLogin: (role: 'owner' | 'staff') => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('login_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      // Use simple auth for now (checking against Firestore 'settings/auth' document)
      // This is a temporary solution until Firebase Auth is fully configured
      const role = await login(email, password);
      
      if (rememberMe) {
        localStorage.setItem('login_email', email);
      } else {
        localStorage.removeItem('login_email');
      }

      onLogin(role);
    } catch (err: any) {
      console.error("Login error:", err);
      if (err.message === 'Invalid credentials' || err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('帳號或密碼錯誤');
      } else if (err.code === 'auth/too-many-requests') {
        setError('嘗試次數過多，請稍後再試');
      } else {
        setError('登入失敗，請檢查網路連線');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-brand-600 p-8 text-center">
            <div className="w-16 h-16 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                 <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" onError={(e) => {
                     const target = e.currentTarget as HTMLImageElement;
                     target.style.display = 'none';
                 }} />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{COMPANY_INFO.name}</h1>
            <p className="text-brand-100 text-sm mt-1">數位對帳單管理系統</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 block">電子郵件 Email</label>
            <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                  placeholder="請輸入 Email"
                  required
                />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 block">密碼 Password</label>
            <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                  placeholder="請輸入密碼"
                  required
                />
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 text-brand-600 border-slate-300 rounded focus:ring-brand-500 cursor-pointer"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer select-none">
              記住帳號
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center font-medium animate-shake">
                {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 text-white py-3.5 rounded-xl font-bold text-lg hover:bg-brand-700 transition-all transform hover:scale-[1.02] shadow-lg shadow-brand-500/30 flex items-center justify-center group disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                登入中...
              </>
            ) : (
              <>
                登入系統
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
          
        </form>
      </div>
    </div>
  );
};

export default Login;
