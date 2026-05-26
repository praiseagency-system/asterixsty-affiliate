"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginContent() {
  const params       = useSearchParams();
  const callbackUrl  = params.get("callbackUrl") || "/";
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);
    await signIn("google", { callbackUrl });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 flex flex-col">

      {/* ── Landing Hero ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">

        {/* Logo / Brand */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Praise Agency</h1>
          <p className="text-indigo-300 mt-1 text-sm">Affiliate Marketing Management Platform</p>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap gap-2 justify-center mb-10 max-w-lg">
          {[
            "📦 Sample Delivery",
            "📣 Campaign Management",
            "🤖 WA Automation",
            "📊 Analytics",
            "🗂️ Affiliate Database",
            "🏢 Multi Workspace",
          ].map((f) => (
            <span key={f}
              className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-slate-300">
              {f}
            </span>
          ))}
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-1">Masuk ke Dashboard</h2>
          <p className="text-slate-400 text-sm mb-6">Gunakan akun Google kamu untuk melanjutkan</p>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold px-5 py-3 rounded-xl transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            {loading ? "Menghubungkan…" : "Continue with Google"}
          </button>

          <p className="text-center text-xs text-slate-500 mt-4">
            Akses terbatas untuk tim internal Praise Agency
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 max-w-3xl w-full px-4">
          {[
            {
              icon: "🏢",
              title: "Multi Workspace",
              desc: "Kelola Asterixsty, Ameena, Naija, dan klien lainnya dalam satu akun.",
            },
            {
              icon: "🤖",
              title: "WA Automation",
              desc: "Reminder otomatis, broadcast engine, dan sample delivery notification.",
            },
            {
              icon: "📊",
              title: "Real-time Analytics",
              desc: "GMV, completion rate, campaign performance, dan analytics per PIC.",
            },
          ].map((f) => (
            <div key={f.title}
              className="bg-white/3 border border-white/8 rounded-xl p-5 text-left">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-6 text-xs text-slate-600">
        © {new Date().getFullYear()} Praise Agency · Powered by Next.js
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginContent />
    </Suspense>
  );
}
