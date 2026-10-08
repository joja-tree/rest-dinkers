"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, ChevronDown, Clock3, ExternalLink, History, LogOut, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import type { User } from "firebase/auth";
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import type { GameFormat, Match, Session, Team } from "@/lib/domain";
import { applyCompletedRound } from "@/lib/fair-play";
import { out, point, undo } from "@/lib/scoring";
import { sessionSchema } from "@/lib/schemas";
import { createSession } from "@/lib/session";
import { firebaseAuth, firebaseConfigured } from "@/firebase/client";
import { archiveSession, deleteSession, loadActiveSession, loadSessionHistory, saveActiveSession, type SessionHistoryItem } from "@/firebase/sessions";
import { DEFAULT_RULES, RULE_PRESETS } from "@/lib/game-rules";

const STORAGE_KEY = "rest-dinkers-session-v1";
const FORMAT_KEY = "rest-dinkers-game-format";
type SaveState = "saved" | "device";

export function FairPlayApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [showAuth, setShowAuth] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("device");
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<SessionHistoryItem | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SessionHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const online = useOnlineStatus();

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(firebaseAuth(), async (nextUser) => {
      setUser(nextUser);
      if (nextUser) setShowAuth(false);
      setActiveMatchId(null);
      if (nextUser) {
        const cached = window.localStorage.getItem(`rest-dinkers-history-${nextUser.uid}`);
        if (cached) {
          try {
            const history = JSON.parse(cached) as SessionHistoryItem[];
            setSessionHistory(history.map((item) => ({ ...item, session: normalizeSession(item.session) })));
          } catch { window.localStorage.removeItem(`rest-dinkers-history-${nextUser.uid}`); }
        }
        try {
          const [cloudSession, history] = await Promise.all([loadActiveSession(nextUser.uid), loadSessionHistory(nextUser.uid)]);
          if (cloudSession) setSession(normalizeSession(cloudSession));
          const normalized = history.map((item) => ({ ...item, session: normalizeSession(item.session) }));
          setSessionHistory(normalized);
          window.localStorage.setItem(`rest-dinkers-history-${nextUser.uid}`, JSON.stringify(normalized));
        } catch { setSaveState("device"); }
      } else setSessionHistory([]);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setSession(normalizeSession(JSON.parse(stored) as Session)); } catch { window.localStorage.removeItem(STORAGE_KEY); }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, [session, ready]);

  useEffect(() => {
    if (!user || !session) return;
    setSaveState("device");
    if (!online) return;
    let cancelled = false;
    let cloudTimeout: number | undefined;
    const saveTimeout = window.setTimeout(() => {
      const timeout = new Promise<never>((_, reject) => {
        cloudTimeout = window.setTimeout(() => reject(new Error("Cloud save timed out.")), 6000);
      });
      Promise.race([saveActiveSession(user.uid, session), timeout])
        .then(() => { if (!cancelled) setSaveState("saved"); })
        .catch(() => { if (!cancelled) setSaveState("device"); })
        .finally(() => { if (cloudTimeout) window.clearTimeout(cloudTimeout); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(saveTimeout); if (cloudTimeout) window.clearTimeout(cloudTimeout); };
  }, [session, user, online]);

  const activeMatch = session?.current.matches.find((match) => match.id === activeMatchId);

  function updateMatch(nextMatch: Match) {
    if (!session) return;
    const current = { ...session.current, matches: session.current.matches.map((match) => match.id === nextMatch.id ? nextMatch : match) };
    setSession({ ...session, current });
  }

  function advanceRound() {
    if (!session || !session.current.matches.every((match) => Boolean(match.winner))) return;
    setSession(applyCompletedRound(session));
    setActiveMatchId(null);
  }

  function openMatch(matchId: string) {
    setActiveMatchId(matchId);
  }

  async function endSession() {
    if (!session) return;
    if (user) {
      try {
        await archiveSession(user.uid, session);
        const history = await loadSessionHistory(user.uid);
        const normalized = history.map((item) => ({ ...item, session: normalizeSession(item.session) }));
        setSessionHistory(normalized);
        window.localStorage.setItem(`rest-dinkers-history-${user.uid}`, JSON.stringify(normalized));
      } catch { setSaveState("device"); }
    }
    setSession(null);
  }

  function removeHistorySession(item: SessionHistoryItem) {
    setDeleteError("");
    setPendingDelete(item);
  }

  async function confirmDeleteSession() {
    if (!user || !pendingDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteSession(user.uid, pendingDelete.session.id);
      const next = sessionHistory.filter((entry) => entry.session.id !== pendingDelete.session.id);
      setSessionHistory(next);
      window.localStorage.setItem(`rest-dinkers-history-${user.uid}`, JSON.stringify(next));
      if (selectedHistory?.session.id === pendingDelete.session.id) setSelectedHistory(null);
      setPendingDelete(null);
    } catch {
      setDeleteError("This session could not be deleted. Check your connection and try again.");
    } finally { setDeleting(false); }
  }

  if (!ready || !authReady) return <main className="shell loading">Getting the court ready…</main>;
  const authModal = showAuth ? <AuthScreen onClose={() => setShowAuth(false)} /> : null;
  if (!session) return <><Setup onCreate={setSession} user={user} saveState={saveState} onSignIn={() => setShowAuth(true)} onHistory={() => setShowHistory(true)} onRules={() => setShowRules(true)} />{!online && <OfflineIndicator />}{authModal}{showRules && <RulesGuide onClose={() => setShowRules(false)} />}{showHistory && <SessionHistoryLibrary items={sessionHistory} onView={(item) => { setShowHistory(false); setSelectedHistory(item); }} onDelete={removeHistorySession} onClose={() => setShowHistory(false)} />}{selectedHistory && <SessionHistoryDetails item={selectedHistory} onClose={() => { setSelectedHistory(null); setShowHistory(true); }} />}{pendingDelete && <DeleteSessionConfirmation item={pendingDelete} busy={deleting} error={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={confirmDeleteSession} />}</>;
  if (activeMatch) {
    return (
      <>
      <Scorer
        session={session}
        match={activeMatch}
        onBack={() => setActiveMatchId(null)}
        onPoint={() => updateMatch(point(activeMatch))}
        onOut={() => updateMatch(out(activeMatch))}
        onUndo={() => updateMatch(undo(activeMatch))}
        onConfigure={updateMatch}
        user={user}
        saveState={saveState}
        onSignIn={() => setShowAuth(true)}
        onHistory={() => setShowHistory(true)}
        onRules={() => setShowRules(true)}
      />
      {authModal}
      {!online && <OfflineIndicator />}
      {showRules && <RulesGuide onClose={() => setShowRules(false)} />}
      {showHistory && <SessionHistoryLibrary items={sessionHistory} onView={(item) => { setShowHistory(false); setSelectedHistory(item); }} onDelete={removeHistorySession} onClose={() => setShowHistory(false)} />}
      {selectedHistory && <SessionHistoryDetails item={selectedHistory} onClose={() => { setSelectedHistory(null); setShowHistory(true); }} />}
      {pendingDelete && <DeleteSessionConfirmation item={pendingDelete} busy={deleting} error={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={confirmDeleteSession} />}
      </>
    );
  }
  return <><SessionView session={session} onScore={openMatch} onAdvance={advanceRound} onEnd={endSession} user={user} saveState={saveState} onSignIn={() => setShowAuth(true)} onHistory={() => setShowHistory(true)} onRules={() => setShowRules(true)} />{!online && <OfflineIndicator />}{authModal}{showRules && <RulesGuide onClose={() => setShowRules(false)} />}{showHistory && <SessionHistoryLibrary items={sessionHistory} onView={(item) => { setShowHistory(false); setSelectedHistory(item); }} onDelete={removeHistorySession} onClose={() => setShowHistory(false)} />}{selectedHistory && <SessionHistoryDetails item={selectedHistory} onClose={() => { setSelectedHistory(null); setShowHistory(true); }} />}{pendingDelete && <DeleteSessionConfirmation item={pendingDelete} busy={deleting} error={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={confirmDeleteSession} />}</>;
}

function OfflineIndicator() {
  return <div className="offline-indicator" role="status"><span /> Offline · Changes Saved On This Device</div>;
}

function AuthScreen({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (createAccount) await createUserWithEmailAndPassword(firebaseAuth(), email, password);
      else await signInWithEmailAndPassword(firebaseAuth(), email, password);
    } catch (reason) {
      const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
      setError(code.includes("invalid-credential") ? "Email or password is incorrect." : code.includes("email-already-in-use") ? "An account already uses this email." : code.includes("weak-password") ? "Use a password with at least 6 characters." : "We couldn’t sign you in. Please try again.");
    } finally { setBusy(false); }
  }

  async function googleSignIn() {
    setBusy(true);
    setError("");
    try { await signInWithPopup(firebaseAuth(), new GoogleAuthProvider()); }
    catch { setError("Google sign-in could not be completed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <section className="card auth-card">
          <button className="modal-close auth-close" onClick={onClose} aria-label="Close Sign In">×</button>
          <span className="eyebrow">Save Your Games</span>
          <h2 id="auth-title">{createAccount ? "Create Account" : "Welcome Back"}</h2>
          <p className="subtle">{createAccount ? "Create your Rest Dinkers account." : "Sign in to continue your saved session."}</p>
          <button className="button google-button" disabled={busy} onClick={googleSignIn}>Continue With Google</button>
          <div className="auth-divider"><span>or</span></div>
          <div className="field"><label htmlFor="auth-email">Email</label><input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" className="input" type="password" autoComplete={createAccount ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && submit()} /></div>
          {error && <p className="error">{error}</p>}
          <button className="button primary" disabled={busy || !email || password.length < 6} onClick={submit}>{busy ? "Please Wait…" : createAccount ? "Create Account" : "Sign In"}</button>
          <button className="auth-switch" disabled={busy} onClick={() => { setCreateAccount(!createAccount); setError(""); }}>{createAccount ? "Already Have An Account? Sign In" : "New Here? Create An Account"}</button>
        </section>
    </div>
  );
}

function Header({ trailing, user, saveState, onSignIn, onHistory, onRules }: { trailing?: React.ReactNode; user?: User | null; saveState?: SaveState; onSignIn?: () => void; onHistory?: () => void; onRules?: () => void }) {
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="brand">
        <img src="/logo-header.png" alt="Rest Dinkers" />
      </div>
      <div className="header-actions">
        {trailing}
        {user ? <div className="account-menu"><button className="account-pill" onClick={() => setAccountOpen(!accountOpen)} aria-expanded={accountOpen}><span><strong>{user.displayName || user.email?.split("@")[0] || "Player"}</strong><small>{saveState === "saved" ? "Saved" : "Saved On Device"}</small></span><i><ChevronDown size={17} /></i></button>{accountOpen && <div className="account-dropdown">{onRules && <button onClick={() => { setAccountOpen(false); onRules(); }}><BookOpen size={16} /> Pickleball Rules</button>}{onHistory && <button onClick={() => { setAccountOpen(false); onHistory(); }}><History size={16} /> Session History</button>}<button onClick={() => signOut(firebaseAuth())}><LogOut size={16} /> Sign Out</button></div>}</div> : firebaseConfigured && onSignIn ? <button className="button secondary sign-in-button" onClick={onSignIn}>Sign In</button> : !trailing && <span className="status-pill">MVP · Local Play</span>}
      </div>
    </header>
  );
}

function Setup({ onCreate, user, saveState, onSignIn, onHistory, onRules }: { onCreate: (session: Session) => void; user?: User | null; saveState?: SaveState; onSignIn?: () => void; onHistory: () => void; onRules: () => void }) {
  const [name, setName] = useState("");
  const [courts, setCourts] = useState(1);
  const [players, setPlayers] = useState(["Alex", "Bea", "Cal", "Dani"]);
  const [error, setError] = useState("");
  const [format, setFormat] = useState<GameFormat>("rest-dinkers-doubles");

  useEffect(() => {
    const saved = window.localStorage.getItem(FORMAT_KEY) as GameFormat | null;
    if (saved && saved in RULE_PRESETS) setFormat(saved);
  }, []);

  function selectFormat(next: GameFormat) {
    setFormat(next);
    window.localStorage.setItem(FORMAT_KEY, next);
    setError("");
  }

  function submit() {
    const parsed = sessionSchema.safeParse({ name, courts, players });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the session details.");
      return;
    }
    const required = RULE_PRESETS[format].teamSize * 2;
    if (parsed.data.players.length < required) {
      setError(`At least ${required} players are required for ${RULE_PRESETS[format].name}.`);
      return;
    }
    onCreate(createSession(parsed.data.name, parsed.data.players, parsed.data.courts, format));
  }

  return (
    <main className="shell">
      <Header user={user} saveState={saveState} onSignIn={onSignIn} onHistory={onHistory} onRules={onRules} />
      <div className="content hero">
        <section>
          <span className="eyebrow">More play. Better rotation.</span>
          <h1>Everyone gets a fair shot.</h1>
          <p className="lede">Build balanced pickleball rounds, keep partners moving, and score every game from the sideline.</p>
          {!user && <div className="home-actions"><button className="button rules-button" onClick={onRules}><BookOpen size={18} /> View Pickleball Rules</button></div>}
        </section>
        <section className="card setup-card">
          <h2>Start a Session</h2>
          <p className="subtle">Add your group and we’ll build the first two rounds.</p>
          <div className="field">
            <label>Game Format</label>
            <div className="format-options">
              {(Object.values(RULE_PRESETS) as (typeof RULE_PRESETS)[GameFormat][]).map((rules) => (
                <button key={rules.id} className={format === rules.id ? "active" : ""} onClick={() => selectFormat(rules.id)}>
                  <strong>{rules.name}</strong><small>{rules.description}</small>
                  {rules.id === "rest-dinkers-doubles" && <em>Saved Custom</em>}
                </button>
              ))}
            </div>
            <p className="format-note">Your selected format is remembered for the next session.</p>
          </div>
          <div className="field">
            <label htmlFor="session-name">Session Name</label>
            <input id="session-name" className="input" placeholder="Session Name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="courts">Courts</label>
            <select id="courts" className="select" value={courts} onChange={(event) => setCourts(Number(event.target.value))}>
              {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count} Court{count > 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Players</label>
            <div className="players">
              {players.map((player, index) => (
                <div className="player-row" key={index}>
                  <input className="input" aria-label={`Player ${index + 1}`} value={player} onChange={(event) => setPlayers(players.map((value, i) => i === index ? event.target.value : value))} />
                  <button className="remove" aria-label={`Remove ${player || `player ${index + 1}`}`} disabled={players.length <= RULE_PRESETS[format].teamSize * 2} onClick={() => setPlayers(players.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
                </div>
              ))}
            </div>
            <button className="button ghost add-player" disabled={players.length >= 32} onClick={() => setPlayers([...players, ""])}><Plus size={16} /> Add Player</button>
          </div>
          {error && <p className="error">{error}</p>}
          <button className="button primary" onClick={submit}>Generate Fair Rounds</button>
        </section>
      </div>
    </main>
  );
}

function HistoryList({ items, onView, onDelete, filtered = false }: { items: SessionHistoryItem[]; onView: (item: SessionHistoryItem) => void; onDelete: (item: SessionHistoryItem) => void; filtered?: boolean }) {
  if (!items.length) return <div className="empty-history"><History size={23} /><div><strong>{filtered ? "No Sessions On This Date" : "No Saved Sessions Yet"}</strong><p>{filtered ? "Choose another date or clear the filter." : "Finish a signed-in session and it will appear here."}</p></div></div>;
  return <div className="history-list">{items.map((item) => {
    const playedMatches = historyRounds(item.session).flatMap((round) => round.matches).length;
    return <div className="history-item" key={item.session.id}><button className="history-open" onClick={() => onView(item)}><div><strong>{item.session.name}</strong><small>{item.session.rules.name}</small></div><span><Users size={14} /> {item.session.players.length}</span><span><Clock3 size={14} /> {item.savedAt ? new Date(item.savedAt).toLocaleDateString() : "Saved"}</span><em>{playedMatches} Match{playedMatches === 1 ? "" : "es"}</em></button><button className="history-delete" onClick={() => onDelete(item)} aria-label={`Delete ${item.session.name}`}><Trash2 size={17} /></button></div>;
  })}</div>;
}

function SessionHistoryLibrary({ items, onView, onDelete, onClose }: { items: SessionHistoryItem[]; onView: (item: SessionHistoryItem) => void; onDelete: (item: SessionHistoryItem) => void; onClose: () => void }) {
  const [date, setDate] = useState("");
  const filtered = date ? items.filter((item) => item.savedAt > 0 && localDateKey(item.savedAt) === date) : items;
  return <div className="modal-backdrop rules-backdrop" role="presentation" onMouseDown={onClose}><section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-library-title" onMouseDown={(event) => event.stopPropagation()}><header className="rules-header"><div><span className="eyebrow">Your Games</span><h2 id="history-library-title">Session History</h2><p>Completed sessions are saved to your account.</p></div><button className="modal-close" onClick={onClose} aria-label="Close Session History">×</button></header><div className="history-details"><div className="history-filter"><label htmlFor="history-date">Search By Date</label><div><input id="history-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />{date && <button onClick={() => setDate("")}>Clear</button>}</div><small>{filtered.length} Session{filtered.length === 1 ? "" : "s"}</small></div><HistoryList items={filtered} onView={onView} onDelete={onDelete} filtered={Boolean(date)} /></div></section></div>;
}

function DeleteSessionConfirmation({ item, busy, error, onCancel, onConfirm }: { item: SessionHistoryItem; busy: boolean; error: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="modal-backdrop delete-backdrop" role="presentation" onMouseDown={() => !busy && onCancel()}><section className="delete-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description" onMouseDown={(event) => event.stopPropagation()}><div className="delete-icon"><Trash2 size={24} /></div><span className="eyebrow">Delete Saved Session</span><h2 id="delete-title">Delete {item.session.name}?</h2><p id="delete-description">This session and its match history will be permanently removed. This action cannot be undone.</p>{error && <p className="delete-error">{error}</p>}<div className="delete-actions"><button disabled={busy} onClick={onCancel}>Cancel</button><button className="danger" disabled={busy} onClick={onConfirm}>{busy ? "Deleting…" : "Delete Session"}</button></div></section></div>;
}

function SessionHistoryDetails({ item, onClose }: { item: SessionHistoryItem; onClose: () => void }) {
  const session = item.session;
  const rounds = historyRounds(session);
  const matches = rounds.flatMap((round) => round.matches);
  return (
    <div className="modal-backdrop rules-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="rules-header"><div><span className="eyebrow">Saved Session</span><h2 id="history-title">{session.name}</h2><p>{session.rules.name} · {session.players.length} Players · {rounds.length} Round{rounds.length === 1 ? "" : "s"}</p></div><button className="modal-close" onClick={onClose} aria-label="Close Session History">×</button></header>
        <div className="history-details">
          <div className="history-player-summary">{session.players.map((player) => { const games = matches.filter((match) => [...match.teamA, ...match.teamB].includes(player.id)).length; const points = matches.reduce((total, match) => total + match.pointScorers.filter((id) => id === player.id).length, 0); return <div key={player.id}><strong>{player.name}</strong><span>{games} Game{games === 1 ? "" : "s"}</span><span>{points} Point{points === 1 ? "" : "s"}</span></div>; })}</div>
          {rounds.length ? rounds.map((round) => <article className="history-round" key={round.number}><h3>Round {round.number}</h3>{round.matches.map((match) => <div className="history-match" key={match.id}><span>Court {match.court}</span><strong>{names(match.teamA, session)} <b>{match.scoreA}</b></strong><strong>{names(match.teamB, session)} <b>{match.scoreB}</b></strong><em>{matchDuration(match)}</em></div>)}</article>) : <div className="empty-history"><History size={23} /><div><strong>No Completed Rounds</strong><p>This session ended before a round was completed.</p></div></div>}
        </div>
      </section>
    </div>
  );
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function historyRounds(session: Session) {
  const currentMatches = session.current.matches.filter((match) => match.setupComplete || match.startedAt || match.history.length || match.scoreA || match.scoreB || match.winner);
  return currentMatches.length
    ? [...session.completedRounds, { ...session.current, matches: currentMatches }]
    : session.completedRounds;
}

function RulesGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop rules-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="rules-header">
          <div><span className="eyebrow">Quick Reference</span><h2 id="rules-title">Pickleball Rules</h2><p>Standard USA Pickleball rules for singles and doubles.</p></div>
          <button className="modal-close" onClick={onClose} aria-label="Close Pickleball Rules">×</button>
        </header>
        <div className="rules-content">
          <article className="line-call-rule">
            <span>Line Calls</span>
            <h3>If The Ball Touches The Line, It Is In.</h3>
            <p>The exception is a serve touching the non-volley zone line. That serve is short and is a fault. Call a ball out only when you clearly see space between the ball and the line. If there is doubt, the ball is in.</p>
          </article>
          <div className="rules-grid">
            <article><h3>Game Basics</h3><ul><li>Play singles with one player per side or doubles with two.</li><li>Standard games are played to 11 and must be won by 2.</li><li>Under traditional scoring, only the serving side scores.</li></ul></article>
            <article><h3>The Serve</h3><ul><li>Serve diagonally into the opposite service court.</li><li>Use an underhand upward stroke with contact below the waist, or use a legal drop serve.</li><li>Keep at least one foot behind the baseline and inside the sideline and centerline extensions at contact.</li><li>Each server gets one attempt.</li></ul></article>
            <article><h3>Service Sequence</h3><ul><li>In doubles, both partners serve before a side out, except at the start of a game when only one partner serves.</li><li>The first serve after a side out begins from the right court.</li><li>In singles, serve from the right when your score is even and from the left when it is odd.</li></ul></article>
            <article><h3>Two-Bounce Rule</h3><ul><li>The receiving side must let the serve bounce.</li><li>The serving side must let the return bounce.</li><li>After those two bounces, either side may volley or play after a bounce.</li></ul></article>
            <article><h3>The Kitchen</h3><ul><li>The non-volley zone extends 7 feet from each side of the net.</li><li>You may not volley while touching the zone or its line.</li><li>Momentum after a volley may not carry you or anything you wear or carry into the zone.</li><li>You may stand in the kitchen when you are not volleying.</li></ul></article>
            <article><h3>Common Faults</h3><ul><li>The ball lands out, hits the net without crossing, or bounces twice.</li><li>A player volleys before both required bounces or from the kitchen.</li><li>A player, clothing, or paddle touches the net while the ball is live.</li><li>The ball hits a player or something the player is wearing or carrying.</li><li>The serve lands outside the correct service court.</li></ul></article>
          </div>
          <article className="line-calling-guide"><h3>Who Makes The Call?</h3><p>In games without line judges, players call the lines on their own end. Partners should resolve disagreement in favor of the opponents. Make an out call promptly and clearly; otherwise play continues. Spectators should not make line calls.</p></article>
          <a className="official-rules-link" href="https://usapickleball.org/rules/" target="_blank" rel="noreferrer">Open The Complete Official Rulebook <ExternalLink size={16} /></a>
        </div>
      </section>
    </div>
  );
}

function SessionView({ session, onScore, onAdvance, onEnd, user, saveState, onSignIn, onHistory, onRules }: { session: Session; onScore: (id: string) => void; onAdvance: () => void; onEnd: () => void; user?: User | null; saveState?: SaveState; onSignIn?: () => void; onHistory: () => void; onRules: () => void }) {
  const complete = session.current.matches.every((match) => Boolean(match.winner));
  return (
    <main className="shell">
      <Header user={user} saveState={saveState} onSignIn={onSignIn} onHistory={onHistory} onRules={onRules} trailing={<button className="button secondary" onClick={onEnd}>End Session</button>} />
      <div className="content">
        <div className="session-header">
          <div><span className="eyebrow">Live Session</span><h1>{session.name}</h1><p className="subtle">{session.rules.name} · {session.players.length} players · {session.courts} court{session.courts > 1 ? "s" : ""}</p></div>
        </div>
        <div className="round-grid">
          <div className="round-column">
            <section className="card current-round">
              <span className="round-label">Current · Round {session.current.number}</span>
              {session.current.matches.map((match) => <MatchCard key={match.id} match={match} session={session} onScore={onScore} />)}
            </section>
            <PreviousRounds session={session} />
          </div>
          <div>
            <section className="card up-next-round">
              <span className="round-label">Up Next · Round {session.next.number}</span>
              <div className="next-list">
                {session.next.matches.map((match) => <div className="mini-match" key={match.id}><strong>Court {match.court}</strong><br />{names(match.teamA, session)} <span className="versus">vs</span> {names(match.teamB, session)}</div>)}
              </div>
              <button className="button primary next-round-button" disabled={!complete} onClick={onAdvance}>Start Round {session.next.number}</button>
            </section>
            <Stats session={session} />
          </div>
        </div>
      </div>
    </main>
  );
}

function MatchCard({ match, session, onScore }: { match: Match; session: Session; onScore: (id: string) => void }) {
  return (
    <div className="match-card">
      <div className="court-label">Court {match.court}{match.winner ? ` · Team ${match.winner} Wins` : " · In Play"}</div>
      {match.winner ? (
        <div className="current-result" aria-label={`Final score ${match.scoreA} to ${match.scoreB}`}>
          <div className={match.winner === "A" ? "winner" : ""}><span>Team A</span><strong>{names(match.teamA, session)}</strong><b>{match.scoreA}</b></div>
          <div className={match.winner === "B" ? "winner" : ""}><span>Team B</span><strong>{names(match.teamB, session)}</strong><b>{match.scoreB}</b></div>
        </div>
      ) : (
        <>
          <div className="teams"><div className="team">{names(match.teamA, session)}</div><span className="versus">VS</span><div className="team">{names(match.teamB, session)}</div></div>
          <button className="button primary score-button" onClick={() => onScore(match.id)}>Open Scorer</button>
        </>
      )}
    </div>
  );
}

function Stats({ session }: { session: Session }) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const selectedPlayer = session.players.find((player) => player.id === selectedPlayerId);
  return (
    <>
      <section className="card stats">
        <h2 className="section-title">Player Statistics</h2>
        <p className="stats-hint">Select a player to view their statistics.</p>
        <div className="stat-table">
          <div className="stat-row header"><span>Player</span><span>Games</span><span>Points</span></div>
          {session.players.map((player) => <PlayerStats key={player.id} player={player} session={session} onSelect={() => setSelectedPlayerId(player.id)} />)}
        </div>
      </section>
      {selectedPlayer && <PersonalStats player={selectedPlayer} session={session} onClose={() => setSelectedPlayerId(null)} />}
    </>
  );
}

function PreviousRounds({ session }: { session: Session }) {
  if (!session.completedRounds.length) return null;
  return (
    <section className="previous-rounds">
      <h2 className="section-title">Previous Rounds</h2>
      {[...session.completedRounds].reverse().map((round) => (
        <article className="card previous-round" key={round.number}>
          <span className="round-label">Round {round.number}</span>
          <div className="previous-match-list">
            {round.matches.map((match) => (
              <div className="previous-match" key={match.id}>
                <div className="previous-match-header"><span className="previous-court">Court {match.court}</span><span className="duration-label">{matchDuration(match)}</span></div>
                <div className={`previous-team-row ${match.winner === "A" ? "winner" : ""}`}><div><small>Team A</small><strong>{names(match.teamA, session)}</strong></div><span>{match.scoreA}</span></div>
                <div className={`previous-team-row ${match.winner === "B" ? "winner" : ""}`}><div><small>Team B</small><strong>{names(match.teamB, session)}</strong></div><span>{match.scoreB}</span></div>
                <div className="winner-badge">Team {match.winner} Winner</div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function Scorer({ session, match, onBack, onPoint, onOut, onUndo, onConfigure, user, saveState, onSignIn, onHistory, onRules }: { session: Session; match: Match; onBack: () => void; onPoint: () => void; onOut: () => void; onUndo: () => void; onConfigure: (match: Match) => void; user?: User | null; saveState?: SaveState; onSignIn?: () => void; onHistory: () => void; onRules: () => void }) {
  const [editingSetup, setEditingSetup] = useState(false);
  const serving = match.servingTeam === "A" ? match.teamA : match.teamB;
  const teamAHasServed = match.teamA.some((id) => (match.serveCounts[id] ?? 0) > 0);
  const teamBHasServed = match.teamB.some((id) => (match.serveCounts[id] ?? 0) > 0);
  const setupEditable = !teamAHasServed || !teamBHasServed;
  if (!match.setupComplete) {
    return (
      <main className="shell">
        <Header user={user} saveState={saveState} onSignIn={onSignIn} onHistory={onHistory} onRules={onRules} />
        <div className="content scorer setup-only">
          <div className="scorer-meta"><p className="eyebrow">Court {match.court} · Match Setup</p></div>
          <MatchSetup match={match} session={session} onChange={onConfigure} />
        </div>
      </main>
    );
  }
  return (
    <main className="shell">
      <Header user={user} saveState={saveState} onSignIn={onSignIn} onHistory={onHistory} onRules={onRules} />
      <div className="content scorer">
        <div className="scorer-meta">
          <p className="eyebrow">Court {match.court} · {match.rules.name}</p>
          <button className="scorer-undo" disabled={!match.history.length} onClick={onUndo}><RotateCcw size={15} /> Undo</button>
        </div>
        {editingSetup && setupEditable
          ? <LiveMatchSetupEditor match={match} session={session} onChange={onConfigure} onDone={() => setEditingSetup(false)} />
          : <CollapsedMatchSetup match={match} session={session} canEdit={setupEditable} onEdit={() => setEditingSetup(true)} />}
        <div className="scoreboard">
          <div className="score-names"><span>Team A</span><span>Team B</span><span>{match.rules.teamSize === 1 ? "Service Side" : "Server"}</span></div>
          <div className="scores"><strong>{match.scoreA}</strong><strong>{match.scoreB}</strong><strong className={`server ${match.rules.teamSize === 1 ? "service-side" : ""}`}>{match.rules.teamSize === 1 ? ((match.servingTeam === "A" ? match.scoreA : match.scoreB) % 2 === 0 ? "Right" : "Left") : match.server}</strong></div>
          <RoundTimer startedAt={match.startedAt} endedAt={match.endedAt} />
          <div className="serving">Team {match.servingTeam} · {playerName(serving[match.server - 1], session)} Serving</div>
          {match.winner && <div className="complete">Team {match.winner} Wins!</div>}
        </div>
        <div className="controls">
          {match.winner ? (
            <button className="control finish-match" onClick={onBack}><Check size={22} /> Finish Match</button>
          ) : (
            <>
              <button className="control point" onClick={onPoint}>Score</button>
              <button className="control out" onClick={onOut}>Fault</button>
            </>
          )}
        </div>
        <MatchStatistics match={match} session={session} />
      </div>
    </main>
  );
}

function MatchSetup({ match, session, onChange }: { match: Match; session: Session; onChange: (match: Match) => void }) {
  function startingTeam(team: "A" | "B") {
    const startingPlayers = team === "A" ? match.teamA : match.teamB;
    const firstServer = startingPlayers[match.rules.openingServer - 1] ?? startingPlayers[0];
    onChange({ ...match, servingTeam: team, server: match.rules.openingServer, serveCounts: { [firstServer]: 1 } });
  }
  function swap(team: "A" | "B") {
    if (match.rules.teamSize === 1) return;
    const selected = team === "A" ? match.teamA : match.teamB;
    if (selected.length !== 2) return;
    const swapped: Team = [selected[1], selected[0]];
    const teamA = team === "A" ? swapped : match.teamA;
    const teamB = team === "B" ? swapped : match.teamB;
    const servingPlayers = match.servingTeam === "A" ? teamA : teamB;
    onChange({ ...match, teamA, teamB, server: match.rules.openingServer, serveCounts: { [servingPlayers[0]]: 1 } });
  }
  function startMatch() {
    if (match.servingTeam === "B") {
      const openingPlayer = match.teamB[match.rules.openingServer - 1] ?? match.teamB[0];
      onChange({ ...match, teamA: match.teamB, teamB: match.teamA, servingTeam: "A", server: match.rules.openingServer, serveCounts: { [openingPlayer]: 1 }, setupComplete: true, startedAt: Date.now() });
      return;
    }
    const openingPlayer = match.teamA[match.rules.openingServer - 1] ?? match.teamA[0];
    onChange({ ...match, servingTeam: "A", server: match.rules.openingServer, serveCounts: { [openingPlayer]: 1 }, setupComplete: true, startedAt: Date.now() });
  }
  return (
    <section className="match-setup">
      <div className="setup-heading"><div><span>Match Setup</span><small>Choose the first team and confirm player positions.</small></div></div>
      <div className="starting-team-control"><span>Starting Team</span><div><button className={match.servingTeam === "A" ? "active" : ""} onClick={() => startingTeam("A")}>Team A Starts</button><button className={match.servingTeam === "B" ? "active" : ""} onClick={() => startingTeam("B")}>Team B Starts</button></div></div>
      {match.rules.teamSize === 2 && <div className="service-order-grid">
        <div><span>Team A Order</span><strong>1 · {playerName(match.teamA[0], session)}</strong><strong>2 · {playerName(match.teamA[1]!, session)}</strong><button onClick={() => swap("A")}>Swap Players</button></div>
        <div><span>Team B Order</span><strong>1 · {playerName(match.teamB[0], session)}</strong><strong>2 · {playerName(match.teamB[1]!, session)}</strong><button onClick={() => swap("B")}>Swap Players</button></div>
      </div>}
      <CourtPreview match={match} session={session} />
      <button className="button primary start-match-button" onClick={startMatch}>Start Match</button>
    </section>
  );
}

function CourtPreview({ match, session }: { match: Match; session: Session }) {
  return (
    <div className={`court-preview ${match.rules.teamSize === 1 ? "singles-court" : ""}`} aria-label="Player positions on court">
      <div className="court-lines" />
      <div className="court-center-line" />
      <div className="court-kitchen kitchen-left" />
      <div className="court-kitchen kitchen-right" />
      <div className="court-net"><span>Net</span></div>
      <span className="court-team-label team-a-label">Team A</span>
      <span className="court-team-label team-b-label">Team B</span>
      <PlayerPosition className="player-a1" number={1} name={playerName(match.teamA[0], session)} />
      {match.teamA[1] && <PlayerPosition className="player-a2" number={2} name={playerName(match.teamA[1]!, session)} />}
      <PlayerPosition className="player-b1" number={1} name={playerName(match.teamB[0], session)} />
      {match.teamB[1] && <PlayerPosition className="player-b2" number={2} name={playerName(match.teamB[1]!, session)} />}
    </div>
  );
}

function PlayerPosition({ number, name, className }: { number: number; name: string; className: string }) {
  return <div className={`player-position ${className}`}><span>{number}</span><strong>{name}</strong></div>;
}

function CollapsedMatchSetup({ match, session, canEdit, onEdit }: { match: Match; session: Session; canEdit: boolean; onEdit: () => void }) {
  return (
    <section className="match-setup-summary">
      <div><span>Match Setup</span><small>Team A</small><strong>{names(match.teamA, session)}</strong></div>
      <div><small>Team B</small><strong>{names(match.teamB, session)}</strong></div>
      {canEdit ? <button onClick={onEdit}>Edit Setup</button> : <em>Setup Locked</em>}
    </section>
  );
}

function LiveMatchSetupEditor({ match, session, onChange, onDone }: { match: Match; session: Session; onChange: (match: Match) => void; onDone: () => void }) {
  const teamAHasServed = match.teamA.some((id) => (match.serveCounts[id] ?? 0) > 0);
  const teamBHasServed = match.teamB.some((id) => (match.serveCounts[id] ?? 0) > 0);
  function swap(team: "A" | "B") {
    if (match.rules.teamSize === 1) return;
    if ((team === "A" && teamAHasServed) || (team === "B" && teamBHasServed)) return;
    const currentServingPlayer = (match.servingTeam === "A" ? match.teamA : match.teamB)[match.server - 1];
    const selected = team === "A" ? match.teamA : match.teamB;
    if (selected.length !== 2) return;
    const swapped: Team = [selected[1], selected[0]];
    const teamA = team === "A" ? swapped : match.teamA;
    const teamB = team === "B" ? swapped : match.teamB;
    const servingTeam = match.servingTeam === "A" ? teamA : teamB;
    const server = (servingTeam.indexOf(currentServingPlayer) + 1) as 1 | 2;
    onChange({ ...match, teamA, teamB, server });
  }
  return (
    <section className="live-setup-editor">
      <div className="live-setup-heading"><div><span>Editing Match Setup</span><small>Each team locks after its first serve.</small></div><button onClick={onDone}>Done</button></div>
      {match.rules.teamSize === 2 && <div className="service-order-grid">
        <div className={teamAHasServed ? "order-locked" : ""}><span>Team A Order</span><strong>1 · {playerName(match.teamA[0], session)}</strong><strong>2 · {playerName(match.teamA[1]!, session)}</strong><button disabled={teamAHasServed} onClick={() => swap("A")}>{teamAHasServed ? "Order Locked" : "Swap Players"}</button></div>
        <div className={teamBHasServed ? "order-locked" : ""}><span>Team B Order</span><strong>1 · {playerName(match.teamB[0], session)}</strong><strong>2 · {playerName(match.teamB[1]!, session)}</strong><button disabled={teamBHasServed} onClick={() => swap("B")}>{teamBHasServed ? "Order Locked" : "Swap Players"}</button></div>
      </div>}
      <CourtPreview match={match} session={session} />
    </section>
  );
}

function playerName(id: string, session: Session) {
  return session.players.find((player) => player.id === id)?.name ?? "Unknown";
}

function names(ids: readonly string[], session: Session) {
  return ids.map((id) => playerName(id, session)).join(" + ");
}

function RoundTimer({ startedAt, endedAt }: { startedAt: number | null; endedAt: number | null }) {
  const now = useNow();
  const elapsed = startedAt ? Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000)) : 0;
  return <div className="round-timer"><span>Round Time</span><strong>{formatTime(elapsed)}</strong></div>;
}

function MatchStatistics({ match, session }: { match: Match; session: Session }) {
  const now = useNow();
  const elapsed = match.startedAt ? Math.max(0, Math.floor(((match.endedAt ?? now) - match.startedAt) / 1000)) : 0;
  const teamServes = (team: readonly string[]) => team.reduce((total, id) => total + (match.serveCounts[id] ?? 0), 0);
  const teamFaults = (team: readonly string[]) => team.reduce((total, id) => total + (match.faultCounts[id] ?? 0), 0);
  return (
    <section className="match-statistics card">
      <div className="match-stat-heading"><div><span className="eyebrow">Match Statistics</span><h2>At a Glance</h2></div><strong>{formatTime(elapsed)}</strong></div>
      <div className="match-stat-grid header"><span>Team</span><span>Score</span><span>Serves</span><span>Faults</span></div>
      <div className="match-stat-grid"><div><strong>Team A</strong><small>{names(match.teamA, session)}</small></div><span>{match.scoreA}</span><span>{teamServes(match.teamA)}</span><span>{teamFaults(match.teamA)}</span></div>
      <div className="match-stat-grid"><div><strong>Team B</strong><small>{names(match.teamB, session)}</small></div><span>{match.scoreB}</span><span>{teamServes(match.teamB)}</span><span>{teamFaults(match.teamB)}</span></div>
    </section>
  );
}

function PlayerStats({ player, session, onSelect }: { player: Session["players"][number]; session: Session; onSelect: () => void }) {
  const livePoints = session.current.matches.reduce((total, match) => total + match.pointScorers.filter((id) => id === player.id).length, 0);
  return <button className="stat-row player-stat-row" onClick={onSelect}><strong>{player.name}</strong><span>{player.games}</span><span>{player.points + livePoints}</span></button>;
}

function PersonalStats({ player, session, onClose }: { player: Session["players"][number]; session: Session; onClose: () => void }) {
  const now = useNow();
  const allMatches = [...session.completedRounds, session.current].flatMap((round) => round.matches);
  const playerMatches = allMatches.filter((match) => [...match.teamA, ...match.teamB].includes(player.id));
  const livePoints = session.current.matches.reduce((total, match) => total + match.pointScorers.filter((id) => id === player.id).length, 0);
  const serves = playerMatches.reduce((total, match) => total + (match.serveCounts[player.id] ?? 0), 0);
  const faults = playerMatches.reduce((total, match) => total + (match.faultCounts[player.id] ?? 0), 0);
  const activeSeconds = session.current.matches.reduce((total, match) => {
    if (!match.startedAt || ![...match.teamA, ...match.teamB].includes(player.id)) return total;
    return total + Math.max(0, Math.floor(((match.endedAt ?? now) - match.startedAt) / 1000));
  }, 0);
  const stats: [string, string | number][] = [
    ["Points", player.points + livePoints],
    ["Games", player.games],
    ["Court Time", formatTime(player.timePlayedSeconds + activeSeconds)],
    ["Serves", serves],
    ["Faults", faults],
    ["Avg. Points", player.games ? (player.points / player.games).toFixed(1) : "0.0"],
    ["Current Streak", player.consecutiveGames],
  ];
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="player-modal" role="dialog" aria-modal="true" aria-labelledby="player-stat-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="player-modal-header"><div><span className="eyebrow">Player Statistics</span><h2 id="player-stat-title">{player.name}</h2></div><button className="modal-close" onClick={onClose} aria-label="Close player statistics">×</button></div>
        <div className="personal-stat-grid">
          {stats.map(([label, value]) => <div className="personal-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </section>
    </div>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function matchDuration(match: Match) {
  if (!match.startedAt || !match.endedAt) return "—";
  return formatTime(Math.max(0, Math.floor((match.endedAt - match.startedAt) / 1000)));
}

function normalizeSession(session: Session): Session {
  const rules = session.rules ?? DEFAULT_RULES;
  const normalizeMatch = (match: Match): Match => ({
    ...match,
    pointScorers: match.pointScorers ?? [],
    serveCounts: match.serveCounts ?? { [match.teamA[0]]: 1 },
    faultCounts: match.faultCounts ?? {},
    setupComplete: match.setupComplete ?? Boolean(match.history?.length || match.scoreA || match.scoreB || match.winner),
    startedAt: match.startedAt ?? null,
    endedAt: match.endedAt ?? null,
    rules: match.rules ?? rules,
    history: (match.history ?? []).map((item) => ({ ...item, pointScorers: item.pointScorers ?? [], serveCounts: item.serveCounts ?? {}, faultCounts: item.faultCounts ?? {}, endedAt: item.endedAt ?? null })),
  });
  return {
    ...session,
    rules,
    completedRounds: (session.completedRounds ?? []).map((round) => ({ ...round, matches: round.matches.map(normalizeMatch) })),
    players: session.players.map((player) => ({ ...player, points: player.points ?? 0, timePlayedSeconds: player.timePlayedSeconds ?? 0 })),
    current: { ...session.current, matches: session.current.matches.map(normalizeMatch) },
    next: { ...session.next, matches: session.next.matches.map(normalizeMatch) },
  };
}
