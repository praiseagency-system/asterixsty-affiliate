"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import type { TokenValidation } from "@/lib/invite-token";

const ROLE_COLOR: Record<string, string> = {
  OWNER:      "bg-violet-100 text-violet-700",
  ADMIN:      "bg-blue-100 text-blue-700",
  OPERATIONS: "bg-amber-100 text-amber-700",
  SPECIALIST: "bg-emerald-100 text-emerald-700",
  ANALYST:    "bg-cyan-100 text-cyan-700",
  VIEWER:     "bg-gray-100 text-gray-700",
  CLIENT:     "bg-pink-100 text-pink-700",
};

interface Props {
  token:            string;
  validation:       TokenValidation;
  currentUserEmail: string | null;
  currentUserId:    string | null;
  appUrl:           string;
}

export function AcceptInviteClient({
  token, validation, currentUserEmail, currentUserId, appUrl,
}: Props) {
  const [accepting, setAccepting] = useState(false);
  const [accepted,  setAccepted]  = useState(false);
  const [error,     setError]     = useState("");

  // ── Expired / revoked / not found ─────────────────────────────────────────
  if (!validation.ok) {
    const msgs: Record<string, { icon: string; title: string; body: string }> = {
      not_found:        { icon: "🔍", title: "Invitation Not Found",  body: "This invitation link is invalid or has already been used." },
      expired:          { icon: "⏰", title: "Invitation Expired",    body: "This invitation has expired. Please ask to be re-invited." },
      revoked:          { icon: "🚫", title: "Invitation Revoked",    body: "This invitation has been cancelled by the workspace admin." },
      already_accepted: { icon: "✅", title: "Already a Member",     body: "You are already a member of this workspace. Sign in to access it." },
    };
    const msg = msgs[validation.error ?? "not_found"] ?? msgs.not_found;

    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 text-center">
          <div className="text-5xl mb-4">{msg.icon}</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{msg.title}</h1>
          <p className="text-sm text-gray-500 mb-8">{msg.body}</p>
          <a href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const { member } = validation;
  const ws         = member!.workspace;
  const isLoggedInUser = currentUserEmail?.toLowerCase() === member!.inviteEmail.toLowerCase();

  // ── Accepted state ─────────────────────────────────────────────────────────
  if (accepted) {
    return (
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re in! 🎉</h1>
          <p className="text-sm text-gray-500 mb-8">
            Welcome to <strong>{ws.name}</strong>. Your account is now active.
          </p>
          <a href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
            Open Dashboard →
          </a>
        </div>
      </div>
    );
  }

  // ── Accept handler (for already-logged-in users) ───────────────────────────
  async function acceptAsCurrentUser() {
    if (!isLoggedInUser) return;
    setAccepting(true); setError("");
    try {
      const res  = await fetch(`/api/workspace/invitations/accept`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (res.ok) { setAccepted(true); }
      else        { setError(data.error || "Failed to accept invitation"); }
    } catch { setError("Network error. Please try again."); }
    finally   { setAccepting(false); }
  }

  // ── Main invite card ───────────────────────────────────────────────────────
  const daysLeft = member!.inviteExpiresAt
    ? Math.max(0, Math.ceil((new Date(member!.inviteExpiresAt).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="w-full max-w-md">
      {/* Card */}
      <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">

        {/* Gradient header */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-8 py-8">
          <div className="flex items-center gap-4">
            {ws.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ws.logoUrl} alt={ws.name}
                className="w-14 h-14 rounded-2xl border-2 border-white/30 object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-white text-xl font-bold">{ws.name.slice(0, 2).toUpperCase()}</span>
              </div>
            )}
            <div>
              <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wider">Workspace Invitation</p>
              <h1 className="text-white text-2xl font-bold mt-0.5">{ws.name}</h1>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-7">
          <p className="text-gray-600 text-sm leading-relaxed mb-5">
            You&apos;ve been invited to join <strong className="text-gray-900">{ws.name}</strong> as:
          </p>

          <div className="flex items-center gap-3 mb-6">
            <span className={`inline-flex px-3 py-1.5 rounded-full text-sm font-bold ${ROLE_COLOR[member!.role] ?? "bg-gray-100 text-gray-700"}`}>
              {member!.role}
            </span>
            {daysLeft !== null && (
              <span className="text-xs text-gray-400">
                {daysLeft > 0 ? `Expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}` : "Expires today"}
              </span>
            )}
          </div>

          {/* Email being invited */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6">
            <p className="text-xs text-gray-400 mb-0.5">Invitation for</p>
            <p className="text-sm font-medium text-gray-700">{member!.inviteEmail}</p>
          </div>

          {error && (
            <div className="mb-4 text-xs text-red-600 bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl">
              {error}
            </div>
          )}

          {/* CTA */}
          {isLoggedInUser && currentUserId ? (
            // Already logged in with the right email → one-click accept
            <button onClick={acceptAsCurrentUser} disabled={accepting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {accepting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Accepting…
                </>
              ) : "✓ Accept Invitation"}
            </button>
          ) : currentUserId && !isLoggedInUser ? (
            // Logged in but wrong account
            <div className="space-y-3">
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2.5 rounded-xl">
                You&apos;re signed in as <strong>{currentUserEmail}</strong>, but this invitation is for <strong>{member!.inviteEmail}</strong>.
                Sign out and sign in with the correct account.
              </div>
              <button
                onClick={() => signIn("google", { callbackUrl: `/invite?token=${token}` })}
                className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white border-2 border-gray-200 text-gray-700 text-sm font-semibold hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with different Google account
              </button>
            </div>
          ) : (
            // Not logged in → Google OAuth
            <button
              onClick={() => signIn("google", { callbackUrl: `/invite?token=${token}` })}
              className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#fff" fillOpacity=".9"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" fillOpacity=".7"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#fff" fillOpacity=".7"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" fillOpacity=".7"/>
              </svg>
              Sign in with Google to Accept
            </button>
          )}

          <p className="text-center text-xs text-gray-400 mt-4">
            Use the Google account associated with <strong>{member!.inviteEmail}</strong>
          </p>
        </div>
      </div>

      <p className="text-center text-xs text-gray-400 mt-5">
        Powered by Praise Agency Affiliate Platform
      </p>
    </div>
  );
}
