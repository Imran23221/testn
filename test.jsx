import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   Flow-State Study — frontend demo
   ------------------------------------------------------------
   This is a self-contained UI demo of the full product: auth,
   theme switching, AI-generated study materials, study mode,
   the Flow-State break transition, and the paywall.

   It is wired to call a real backend if you set API_BASE below
   to your FastAPI server (see /backend in this project). Until
   then it runs against a local simulation so you can click
   through the whole flow right now.
   ============================================================ */

const API_BASE = ""; // e.g. "http://localhost:8000" — leave blank to use the built-in simulation

const FONT_IMPORT_ID = "flowstate-fonts";

function ensureFonts() {
  if (typeof document === "undefined") return;
  if (document.getElementById(FONT_IMPORT_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_IMPORT_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap";
  document.head.appendChild(link);
}

/* ---------------- theme tokens ---------------- */
const THEMES = {
  light: {
    bg: "#FAF9F5",
    bgElevated: "#FFFFFF",
    bgSubtle: "#F1EFE8",
    text: "#15181C",
    textSecondary: "#5B6168",
    textTertiary: "#8A8F96",
    border: "rgba(21,24,28,0.09)",
    borderStrong: "rgba(21,24,28,0.16)",
    accent: "#4F46E5",
    accentSoft: "#EEF0FE",
    accentText: "#3C34B0",
    success: "#0F9D78",
    successSoft: "#E3F6EF",
    danger: "#D14343",
    dangerSoft: "#FBEAEA",
    glow: "0 0 0 rgba(0,0,0,0)",
    cardShadow: "0 1px 2px rgba(21,24,28,0.04)",
  },
  dark: {
    bg: "#0A0C0F",
    bgElevated: "#15181D",
    bgSubtle: "#1B1F25",
    text: "#F2F3F5",
    textSecondary: "#9BA1AB",
    textTertiary: "#6B7178",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.14)",
    accent: "#8B92FF",
    accentSoft: "rgba(139,146,255,0.12)",
    accentText: "#AEB3FF",
    success: "#3FD9A8",
    successSoft: "rgba(63,217,168,0.12)",
    danger: "#FF6B6B",
    dangerSoft: "rgba(255,107,107,0.12)",
    glow: "0 0 32px rgba(139,146,255,0.25)",
    cardShadow: "0 1px 0 rgba(255,255,255,0.03)",
  },
};

/* ---------------- simulated backend (swap for real fetch when API_BASE is set) ---------------- */

const SAMPLE_BANK = [
  {
    q: "What is the main idea expressed in the notes?",
    a: "The central concept the notes are organized around.",
  },
  { q: "Name one key term introduced in this material.", a: "A key vocabulary word from the notes." },
  { q: "What process or mechanism is described?", a: "The step-by-step process outlined in the text." },
  { q: "What's a real-world application of this concept?", a: "A practical example connecting theory to practice." },
  { q: "What common misconception does this material address?", a: "A misunderstanding the notes clarify." },
  { q: "How does this topic connect to the broader subject?", a: "Its relationship to the wider field of study." },
];

function simulateGeneration(text, title) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const seed = words.length || 1;
  const flashcards = SAMPLE_BANK.map((c, i) => ({
    question: c.q,
    answer: `${c.a} (derived from your ${seed}-word upload)`,
  }));
  const quiz = SAMPLE_BANK.slice(0, 5).map((c, i) => ({
    question: c.q,
    options: [c.a, "An unrelated distractor option", "A plausible but incorrect option", "None of the above"],
    correct_index: 0,
  }));
  return {
    id: "lesson_" + Date.now(),
    title: title || (words.slice(0, 5).join(" ") + "…" || "Untitled lesson"),
    flashcards,
    quiz,
    created_at: new Date().toISOString(),
  };
}

/* ---------------- app shell ---------------- */

export default function FlowStateApp() {
  const [theme, setTheme] = useState("light"); // default light, per spec
  const T = THEMES[theme];

  useEffect(ensureFonts, []);

  const [user, setUser] = useState(null); // { email, isGuest, plan }
  const [lessonsByEmail, setLessonsByEmail] = useState({}); // history "saved by email"
  const [view, setView] = useState("auth"); // auth -> dashboard -> study -> break
  const [activeLesson, setActiveLesson] = useState(null);
  const [lastUploadAt, setLastUploadAt] = useState(null); // ms timestamp, per session
  const [showPaywall, setShowPaywall] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 3200);
  }, []);

  const history = user ? lessonsByEmail[user.email] || [] : [];

  function handleAuth(email, isGuest, plan) {
    setUser({ email, isGuest, plan: plan || "free" });
    setLessonsByEmail((prev) => (prev[email] ? prev : { ...prev, [email]: [] }));
    setView("dashboard");
    if (!isGuest) showToast(`Welcome email sent to ${email}`, "success");
  }

  function handleLogout() {
    setUser(null);
    setView("auth");
    setActiveLesson(null);
  }

  function rateLimitAllows() {
    if (!user) return false;
    if (user.plan === "premium") return true;
    if (!lastUploadAt) return true;
    const hoursSince = (Date.now() - lastUploadAt) / 36e5;
    return hoursSince >= 24;
  }

  function nextAvailableLabel() {
    if (!lastUploadAt) return "";
    const next = new Date(lastUploadAt + 24 * 36e5);
    return next.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  }

  async function handleGenerate(title, text) {
    if (!rateLimitAllows()) {
      setShowPaywall(true);
      return;
    }
    let lesson;
    if (API_BASE) {
      // Real backend call — uncomment / adapt once your FastAPI server is running.
      // const res = await fetch(`${API_BASE}/lessons/upload-text`, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      //   body: JSON.stringify({ title, text }),
      // });
      // if (res.status === 429) { setShowPaywall(true); return; }
      // lesson = await res.json();
      lesson = simulateGeneration(text, title);
    } else {
      await new Promise((r) => setTimeout(r, 900)); // feel of an AI call
      lesson = simulateGeneration(text, title);
    }
    setLastUploadAt(Date.now());
    setLessonsByEmail((prev) => ({
      ...prev,
      [user.email]: [lesson, ...(prev[user.email] || [])],
    }));
    setActiveLesson(lesson);
    setView("study");
    showToast("Study materials ready", "success");
  }

  function handleUpgrade() {
    setUser((u) => ({ ...u, plan: "premium" }));
    setShowPaywall(false);
    showToast("Welcome to Premium — uploads are now unlimited", "success");
  }

  function toggleTheme() {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }

  return (
    <div
      style={{
        fontFamily: "'Inter', system-ui, sans-serif",
        background: T.bg,
        color: T.text,
        minHeight: 560,
        borderRadius: 16,
        overflow: "hidden",
        border: `1px solid ${T.border}`,
        transition: "background 0.4s ease, color 0.4s ease",
        position: "relative",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        ::selection { background: ${T.accentSoft}; }
        @keyframes fsFadeIn { from { opacity:0; transform: translateY(6px);} to {opacity:1; transform:none;} }
        @keyframes fsBreatheIn { from { transform: scale(0.6); } to { transform: scale(1.15); } }
        @keyframes fsBreatheOut { from { transform: scale(1.15); } to { transform: scale(0.6); } }
        .fs-anim { animation: fsFadeIn 0.35s ease both; }
        button.fs-btn { font-family: inherit; cursor: pointer; }
        input.fs-input, textarea.fs-input { font-family: inherit; }
      `}</style>

      {toast && (
        <div
          className="fs-anim"
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: toast.kind === "success" ? T.successSoft : T.accentSoft,
            color: toast.kind === "success" ? T.success : T.accentText,
            padding: "8px 16px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 500,
            border: `1px solid ${T.border}`,
          }}
        >
          {toast.msg}
        </div>
      )}

      {view === "auth" && <AuthScreen T={T} theme={theme} onAuth={handleAuth} />}

      {view !== "auth" && (
        <TopBar
          T={T}
          theme={theme}
          onToggleTheme={toggleTheme}
          user={user}
          onLogout={handleLogout}
          onHome={() => setView("dashboard")}
          onUpgrade={() => setShowPaywall(true)}
        />
      )}

      {view === "dashboard" && (
        <Dashboard
          T={T}
          user={user}
          history={history}
          rateLimitAllows={rateLimitAllows()}
          nextAvailableLabel={nextAvailableLabel()}
          onGenerate={handleGenerate}
          onOpenLesson={(l) => {
            setActiveLesson(l);
            setView("study");
          }}
        />
      )}

      {view === "study" && activeLesson && (
        <StudyMode
          T={T}
          lesson={activeLesson}
          onBack={() => setView("dashboard")}
          onBreak={() => setView("break")}
        />
      )}

      {view === "break" && (
        <FlowStateBreak T={T} theme={theme} onDone={() => setView("study")} />
      )}

      {showPaywall && (
        <PaywallModal
          T={T}
          theme={theme}
          nextAvailableLabel={nextAvailableLabel()}
          onClose={() => setShowPaywall(false)}
          onUpgrade={handleUpgrade}
        />
      )}
    </div>
  );
}

/* ---------------- Auth screen ---------------- */

function AuthScreen({ T, theme, onAuth }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function submit(e) {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onAuth(email, false);
    }, 500);
  }

  return (
    <div
      className="fs-anim"
      style={{
        minHeight: 560,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: T.accent,
              margin: "0 auto 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: theme === "dark" ? "0 0 24px rgba(139,146,255,0.45)" : "none",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 L14.5 9 L22 12 L14.5 15 L12 22 L9.5 15 L2 12 L9.5 9 Z" fill="white" />
            </svg>
          </div>
          <h1 style={{ fontFamily: "'Sora', sans-serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
            Flow-State Study
          </h1>
          <p style={{ color: T.textSecondary, fontSize: 14, marginTop: 6 }}>
            AI flashcards. Calm, structured breaks.
          </p>
        </div>

        <div
          style={{
            background: T.bgElevated,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: 22,
            boxShadow: T.cardShadow,
          }}
        >
          <div
            style={{
              display: "flex",
              background: T.bgSubtle,
              borderRadius: 10,
              padding: 3,
              marginBottom: 18,
            }}
          >
            {["login", "signup"].map((m) => (
              <button
                key={m}
                className="fs-btn"
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  borderRadius: 8,
                  border: "none",
                  background: mode === m ? T.bgElevated : "transparent",
                  color: mode === m ? T.text : T.textSecondary,
                  fontWeight: 500,
                  fontSize: 13,
                  boxShadow: mode === m ? T.cardShadow : "none",
                }}
              >
                {m === "login" ? "Log in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <label style={{ fontSize: 12.5, color: T.textSecondary, display: "block", marginBottom: 5 }}>
              Email
            </label>
            <input
              className="fs-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              style={inputStyle(T)}
            />

            <label style={{ fontSize: 12.5, color: T.textSecondary, display: "block", margin: "12px 0 5px" }}>
              Password
            </label>
            <input
              className="fs-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              style={inputStyle(T)}
            />

            {error && (
              <p style={{ color: T.danger, fontSize: 12.5, marginTop: 8, marginBottom: 0 }}>{error}</p>
            )}

            <button
              className="fs-btn"
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: 16,
                padding: "11px 0",
                borderRadius: 9,
                border: "none",
                background: T.accent,
                color: "white",
                fontWeight: 600,
                fontSize: 14,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          {mode === "signup" && (
            <p style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 10, lineHeight: 1.5 }}>
              We'll send a welcome confirmation to your email. For your security, we never email
              passwords — use "forgot password" if you need a reset later.
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ fontSize: 11.5, color: T.textTertiary }}>or</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          <button
            className="fs-btn"
            onClick={() => onAuth("guest_" + Math.random().toString(36).slice(2, 8) + "@guest.local", true)}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 9,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: T.text,
              fontWeight: 500,
              fontSize: 13.5,
            }}
          >
            Continue as guest
          </button>
        </div>
      </div>
    </div>
  );
}

function inputStyle(T) {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: `1px solid ${T.border}`,
    background: T.bg,
    color: T.text,
    fontSize: 14,
    outline: "none",
  };
}

/* ---------------- Top bar ---------------- */

function TopBar({ T, theme, onToggleTheme, user, onLogout, onHome, onUpgrade }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 22px",
        borderBottom: `1px solid ${T.border}`,
        background: T.bgElevated,
      }}
    >
      <div onClick={onHome} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: T.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 L14.5 9 L22 12 L14.5 15 L12 22 L9.5 15 L2 12 L9.5 9 Z" fill="white" />
          </svg>
        </div>
        <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 600, fontSize: 15 }}>
          Flow-State Study
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {user?.plan !== "premium" && (
          <button
            className="fs-btn"
            onClick={onUpgrade}
            style={{
              padding: "6px 13px",
              borderRadius: 999,
              border: `1px solid ${T.accent}`,
              background: T.accentSoft,
              color: T.accentText,
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            Upgrade
          </button>
        )}
        {user?.plan === "premium" && (
          <span
            style={{
              padding: "5px 11px",
              borderRadius: 999,
              background: T.successSoft,
              color: T.success,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Premium
          </span>
        )}

        <button
          className="fs-btn"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {theme === "light" ? "🌙" : "☀️"}
        </button>

        <div
          title={user?.email}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: T.bgSubtle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12.5,
            fontWeight: 600,
            color: T.textSecondary,
            cursor: "pointer",
          }}
          onClick={onLogout}
        >
          {user?.isGuest ? "G" : (user?.email?.[0] || "?").toUpperCase()}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ T, user, history, rateLimitAllows, nextAvailableLabel, onGenerate, onOpenLesson }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef(null);

  async function submit() {
    if (text.trim().length < 20) return;
    setGenerating(true);
    await onGenerate(title, text);
    setGenerating(false);
    setText("");
    setTitle("");
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result).slice(0, 24000));
      setTitle(f.name.replace(/\.(txt|pdf)$/i, ""));
    };
    if (f.type === "application/pdf") {
      setText(`[PDF uploaded: ${f.name} — text extraction happens server-side via the FastAPI /lessons/upload-file endpoint]`);
      setTitle(f.name.replace(/\.pdf$/i, ""));
    } else {
      reader.readAsText(f);
    }
  }

  return (
    <div className="fs-anim" style={{ padding: "28px 26px 36px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 21, fontWeight: 600, margin: 0 }}>
          New lesson
        </h2>
        <p style={{ color: T.textSecondary, fontSize: 13.5, marginTop: 4 }}>
          Paste your notes or upload a file — Claude turns them into flashcards and a quiz.
        </p>
      </div>

      <div
        style={{
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: 14,
          padding: 18,
          boxShadow: T.cardShadow,
        }}
      >
        <input
          className="fs-input"
          placeholder="Lesson title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{ ...inputStyle(T), marginBottom: 10 }}
        />
        <textarea
          className="fs-input"
          placeholder="Paste lecture notes here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          style={{ ...inputStyle(T), resize: "vertical" }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <button
            className="fs-btn"
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "9px 14px",
              borderRadius: 9,
              border: `1px solid ${T.border}`,
              background: "transparent",
              color: T.text,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Upload .txt / .pdf
          </button>
          <input ref={fileRef} type="file" accept=".txt,.pdf" onChange={handleFile} style={{ display: "none" }} />

          <button
            className="fs-btn"
            onClick={submit}
            disabled={generating || text.trim().length < 20}
            style={{
              padding: "10px 20px",
              borderRadius: 9,
              border: "none",
              background: T.accent,
              color: "white",
              fontWeight: 600,
              fontSize: 13.5,
              opacity: generating || text.trim().length < 20 ? 0.6 : 1,
            }}
          >
            {generating ? "Generating…" : "Generate study set"}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          fontSize: 12.5,
          color: rateLimitAllows ? T.textTertiary : T.danger,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {user.plan === "premium"
          ? "Premium — unlimited uploads"
          : rateLimitAllows
          ? "Free plan: 1 upload per 24 hours available now"
          : `Free plan limit reached — next upload available ${nextAvailableLabel}`}
      </div>

      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: 15.5, fontWeight: 600, marginBottom: 12 }}>
          History
        </h3>
        {history.length === 0 ? (
          <p style={{ color: T.textTertiary, fontSize: 13.5 }}>
            Nothing yet — your generated lessons will be saved here under {user.email}.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((l) => (
              <div
                key={l.id}
                onClick={() => onOpenLesson(l)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${T.border}`,
                  background: T.bgElevated,
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13.5 }}>{l.title}</div>
                  <div style={{ fontSize: 11.5, color: T.textTertiary, marginTop: 2 }}>
                    {new Date(l.created_at).toLocaleString()} · {l.flashcards.length} cards · {l.quiz.length} quiz Qs
                  </div>
                </div>
                <span style={{ color: T.textTertiary, fontSize: 16 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Study mode ---------------- */

function StudyMode({ T, lesson, onBack, onBreak }) {
  const [tab, setTab] = useState("flashcards");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          onBreak();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [onBreak]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const card = lesson.flashcards[cardIndex];

  return (
    <div className="fs-anim" style={{ padding: "24px 26px 36px", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button
          className="fs-btn"
          onClick={onBack}
          style={{ border: "none", background: "transparent", color: T.textSecondary, fontSize: 13, padding: 0 }}
        >
          ‹ Back to dashboard
        </button>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: 13,
            padding: "5px 11px",
            borderRadius: 999,
            background: T.bgSubtle,
            color: T.textSecondary,
          }}
        >
          {mm}:{ss} until break
        </div>
      </div>

      <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>
        {lesson.title}
      </h2>
      <p style={{ color: T.textSecondary, fontSize: 13, marginTop: 0, marginBottom: 18 }}>
        {lesson.flashcards.length} flashcards · {lesson.quiz.length} quiz questions
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {["flashcards", "quiz"].map((t) => (
          <button
            key={t}
            className="fs-btn"
            onClick={() => setTab(t)}
            style={{
              padding: "8px 16px",
              borderRadius: 9,
              border: `1px solid ${tab === t ? T.accent : T.border}`,
              background: tab === t ? T.accentSoft : "transparent",
              color: tab === t ? T.accentText : T.textSecondary,
              fontWeight: 500,
              fontSize: 13,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "flashcards" && (
        <div>
          <div
            onClick={() => setFlipped((f) => !f)}
            style={{
              minHeight: 220,
              borderRadius: 16,
              border: `1px solid ${T.border}`,
              background: T.bgElevated,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 32,
              cursor: "pointer",
              boxShadow: T.cardShadow,
            }}
          >
            <div>
              <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {flipped ? "Answer" : "Question"} · tap to flip
              </div>
              <div style={{ fontSize: 17, fontWeight: 500, lineHeight: 1.5 }}>
                {flipped ? card.answer : card.question}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <button
              className="fs-btn"
              onClick={() => {
                setFlipped(false);
                setCardIndex((i) => Math.max(0, i - 1));
              }}
              disabled={cardIndex === 0}
              style={navBtnStyle(T, cardIndex === 0)}
            >
              ‹ Previous
            </button>
            <span style={{ fontSize: 12.5, color: T.textTertiary }}>
              {cardIndex + 1} / {lesson.flashcards.length}
            </span>
            <button
              className="fs-btn"
              onClick={() => {
                setFlipped(false);
                setCardIndex((i) => Math.min(lesson.flashcards.length - 1, i + 1));
              }}
              disabled={cardIndex === lesson.flashcards.length - 1}
              style={navBtnStyle(T, cardIndex === lesson.flashcards.length - 1)}
            >
              Next ›
            </button>
          </div>
        </div>
      )}

      {tab === "quiz" && (
        <div style={{ display: "grid", gap: 14 }}>
          {lesson.quiz.map((q, qi) => (
            <div
              key={qi}
              style={{
                border: `1px solid ${T.border}`,
                borderRadius: 12,
                padding: 16,
                background: T.bgElevated,
              }}
            >
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 10 }}>
                {qi + 1}. {q.question}
              </div>
              <div style={{ display: "grid", gap: 7 }}>
                {q.options.map((opt, oi) => {
                  const picked = answers[qi];
                  const isPicked = picked === oi;
                  const isCorrect = oi === q.correct_index;
                  let bg = "transparent";
                  let border = T.border;
                  let color = T.text;
                  if (picked !== undefined) {
                    if (isCorrect) {
                      bg = T.successSoft;
                      border = T.success;
                      color = T.success;
                    } else if (isPicked) {
                      bg = T.dangerSoft;
                      border = T.danger;
                      color = T.danger;
                    }
                  }
                  return (
                    <button
                      key={oi}
                      className="fs-btn"
                      onClick={() => setAnswers((a) => ({ ...a, [qi]: oi }))}
                      disabled={picked !== undefined}
                      style={{
                        textAlign: "left",
                        padding: "9px 12px",
                        borderRadius: 8,
                        border: `1px solid ${border}`,
                        background: bg,
                        color,
                        fontSize: 13.5,
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 26 }}>
        <button
          className="fs-btn"
          onClick={onBreak}
          style={{
            padding: "9px 18px",
            borderRadius: 9,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.textSecondary,
            fontSize: 12.5,
          }}
        >
          Take a break now
        </button>
      </div>
    </div>
  );
}

function navBtnStyle(T, disabled) {
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: "transparent",
    color: disabled ? T.textTertiary : T.text,
    fontSize: 13,
    opacity: disabled ? 0.5 : 1,
  };
}

/* ---------------- Flow-State break mode ---------------- */

const SOUNDSCAPES = [
  { id: "lofi", label: "Lo-Fi" },
  { id: "rain", label: "Rain" },
  { id: "whitenoise", label: "White noise" },
];

function FlowStateBreak({ T, theme, onDone }) {
  const [seconds, setSeconds] = useState(120);
  const [sound, setSound] = useState("rain");
  const [phase, setPhase] = useState("inhale");
  const phaseDur = 4000;

  useEffect(() => {
    const t = setInterval(() => {
      setSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const order = ["inhale", "hold", "exhale", "hold"];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % order.length;
      setPhase(order[i]);
    }, phaseDur);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  const scale = phase === "inhale" ? 1.15 : phase === "exhale" ? 0.7 : 1;
  const label = { inhale: "Breathe in", hold: "Hold", exhale: "Breathe out" }[phase] || "Hold";

  return (
    <div
      className="fs-anim"
      style={{
        minHeight: 480,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        background:
          theme === "dark"
            ? "radial-gradient(circle at 50% 35%, rgba(139,146,255,0.10), transparent 60%)"
            : "radial-gradient(circle at 50% 35%, rgba(79,70,229,0.06), transparent 60%)",
      }}
    >
      <div style={{ fontSize: 12.5, color: T.textTertiary, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 26 }}>
        Flow-State break
      </div>

      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: theme === "dark" ? "rgba(139,146,255,0.18)" : "rgba(79,70,229,0.10)",
          border: `1px solid ${T.accent}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
          transition: "transform 4s ease-in-out",
          boxShadow: theme === "dark" ? "0 0 60px rgba(139,146,255,0.35)" : "0 0 40px rgba(79,70,229,0.12)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 500, color: T.accentText }}>{label}</span>
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 500, marginTop: 30 }}>
        {mm}:{ss}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
        {SOUNDSCAPES.map((s) => (
          <button
            key={s.id}
            className="fs-btn"
            onClick={() => setSound(s.id)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: `1px solid ${sound === s.id ? T.accent : T.border}`,
              background: sound === s.id ? T.accentSoft : "transparent",
              color: sound === s.id ? T.accentText : T.textSecondary,
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        className="fs-btn"
        onClick={onDone}
        style={{
          marginTop: 30,
          padding: "10px 22px",
          borderRadius: 9,
          border: "none",
          background: T.accent,
          color: "white",
          fontWeight: 600,
          fontSize: 13.5,
        }}
      >
        Back to studying
      </button>
    </div>
  );
}

/* ---------------- Paywall ---------------- */

function PaywallModal({ T, theme, nextAvailableLabel, onClose, onUpgrade }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="fs-anim"
        style={{
          width: 340,
          background: T.bgElevated,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          padding: 26,
          textAlign: "center",
          boxShadow: theme === "dark" ? "0 0 50px rgba(139,146,255,0.15)" : "0 8px 30px rgba(0,0,0,0.12)",
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 12,
            background: T.accentSoft,
            margin: "0 auto 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
          }}
        >
          🔒
        </div>
        <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: 17, fontWeight: 600, margin: "0 0 8px" }}>
          Daily upload used
        </h3>
        <p style={{ fontSize: 13, color: T.textSecondary, lineHeight: 1.55, margin: "0 0 4px" }}>
          Free plan includes 1 lesson upload every 24 hours.
        </p>
        <p style={{ fontSize: 12, color: T.textTertiary, margin: "0 0 18px" }}>
          Next free upload available {nextAvailableLabel || "in 24 hours"}.
        </p>

        <div
          style={{
            border: `1px solid ${T.accent}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            background: T.accentSoft,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 700, color: T.accentText }}>
            $8.99<span style={{ fontSize: 12, fontWeight: 500 }}>/mo</span>
          </div>
          <ul style={{ textAlign: "left", fontSize: 12.5, color: T.text, margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Unlimited lesson uploads</li>
            <li>AI grading of open-ended answers</li>
            <li>Premium spatial soundscapes</li>
            <li>Deep retention analytics</li>
          </ul>
        </div>

        <button
          className="fs-btn"
          onClick={onUpgrade}
          style={{
            width: "100%",
            padding: "11px 0",
            borderRadius: 9,
            border: "none",
            background: T.accent,
            color: "white",
            fontWeight: 600,
            fontSize: 13.5,
            marginBottom: 8,
          }}
        >
          Upgrade to Premium
        </button>
        <button
          className="fs-btn"
          onClick={onClose}
          style={{
            width: "100%",
            padding: "9px 0",
            borderRadius: 9,
            border: "none",
            background: "transparent",
            color: T.textSecondary,
            fontSize: 12.5,
          }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
