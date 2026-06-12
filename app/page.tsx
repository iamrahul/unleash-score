"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./scoreboard.module.css";

type Team = { name: string; score: number };
type State = {
  title: string;
  label: string;
  teams: [Team, Team];
  v: number;
};

const FALLBACK: State = {
  title: "SCORE BOARD",
  label: "WEEK 1",
  teams: [
    { name: "CoreX", score: 0 },
    { name: "SuperZ", score: 0 },
  ],
  v: 0,
};

export default function Page() {
  const [state, setState] = useState<State>(FALLBACK);
  const [locked, setLocked] = useState(true);
  const [live, setLive] = useState(false);

  // Field currently being edited locally — protect it from remote overwrites.
  const focusedRef = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastSentV = useRef(0);

  // Confetti on score increases. Armed after first sync so it doesn't fire
  // while the initial stored scores load in.
  const prevScores = useRef<[number, number]>([0, 0]);
  const confettiArmed = useRef(false);
  const confettiFn = useRef<((opts: object) => void) | null>(null);

  const fireConfetti = useCallback((side: 0 | 1) => {
    const burst = (confetti: (opts: object) => void) => {
      const x = side === 0 ? 0.25 : 0.75;
      const angle = side === 0 ? 65 : 115;
      const colors = ["#00F500", "#ffffff", "#ff1f1f", "#ff2d8b"];
      confetti({
        particleCount: 90,
        spread: 72,
        startVelocity: 48,
        angle,
        origin: { x, y: 0.62 },
        colors,
        scalar: 1.1,
        ticks: 220,
      });
      confetti({
        particleCount: 45,
        spread: 110,
        startVelocity: 30,
        angle,
        origin: { x, y: 0.62 },
        colors,
        scalar: 0.9,
        ticks: 200,
      });
    };
    if (confettiFn.current) burst(confettiFn.current);
    else
      import("canvas-confetti")
        .then((m) => {
          confettiFn.current = m.default as unknown as (opts: object) => void;
          burst(confettiFn.current);
        })
        .catch(() => {});
  }, []);

  // Apply a remote state without clobbering the field the user is typing in.
  const applyRemote = useCallback((incoming: State) => {
    if (incoming.v <= lastSentV.current) return; // ignore our own echoes
    setState((prev) => {
      const focused = focusedRef.current;
      const merged: State = { ...incoming };
      if (focused === "title") merged.title = prev.title;
      if (focused === "label") merged.label = prev.label;
      merged.teams = incoming.teams.map((t, i) => {
        const nameKey = `team-${i}-name`;
        const scoreKey = `team-${i}-score`;
        return {
          name: focused === nameKey ? prev.teams[i].name : t.name,
          score: focused === scoreKey ? prev.teams[i].score : t.score,
        };
      }) as [Team, Team];
      return merged;
    });
  }, []);

  // Celebrate score increases (from steppers, keys, or remote updates), but
  // not the field being actively typed in.
  useEffect(() => {
    const cur: [number, number] = [
      state.teams[0].score,
      state.teams[1].score,
    ];
    if (confettiArmed.current) {
      ([0, 1] as const).forEach((i) => {
        if (
          cur[i] > prevScores.current[i] &&
          focusedRef.current !== `team-${i}-score`
        ) {
          fireConfetti(i);
        }
      });
    }
    prevScores.current = cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.teams[0].score, state.teams[1].score]);

  // Arm shortly after mount so the initial score sync doesn't trigger it.
  useEffect(() => {
    const t = setTimeout(() => {
      confettiArmed.current = true;
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  // Initial load + read lock preference.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "1") setLocked(false);
    else {
      const saved = localStorage.getItem("unleash-locked");
      if (saved != null) setLocked(saved === "1");
    }

    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then(applyRemote)
      .catch(() => {});
  }, [applyRemote]);

  // Real-time stream with polling fallback.
  useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        fetch("/api/state", { cache: "no-store" })
          .then((r) => r.json())
          .then(applyRemote)
          .catch(() => {});
      }, 1000);
    };

    try {
      es = new EventSource("/api/stream");
      es.onopen = () => setLive(true);
      es.onmessage = (e) => {
        try {
          applyRemote(JSON.parse(e.data));
        } catch {
          /* ignore heartbeats */
        }
      };
      es.onerror = () => {
        setLive(false);
        // EventSource auto-reconnects; keep a polling safety net.
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      stopped = true;
      es?.close();
      if (poll) clearInterval(poll);
      void stopped;
    };
  }, [applyRemote]);

  // Persist to the server (debounced for text typing, immediate for steppers).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const push = useCallback((next: State, immediate = false) => {
    const send = () => {
      lastSentV.current = Date.now();
      const payload = { ...next, v: lastSentV.current };
      fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .then((saved: State) => {
          lastSentV.current = saved.v;
        })
        .catch(() => {});
    };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (immediate) send();
    else saveTimer.current = setTimeout(send, 180);
  }, []);

  const update = useCallback(
    (mutator: (s: State) => State, immediate = false) => {
      setState((prev) => {
        const next = mutator(prev);
        push(next, immediate);
        return next;
      });
    },
    [push]
  );

  const setScore = useCallback(
    (i: 0 | 1, value: number, immediate = false) => {
      const v = Math.max(0, Math.min(9999, Math.round(value || 0)));
      update((s) => {
        const teams = [...s.teams] as [Team, Team];
        teams[i] = { ...teams[i], score: v };
        return { ...s, teams };
      }, immediate);
    },
    [update]
  );

  const bump = useCallback(
    (i: 0 | 1, delta: number) => {
      setScore(i, (stateRef.current.teams[i].score || 0) + delta, true);
    },
    [setScore]
  );

  // Keyboard shortcuts (ignored while typing in a field or when locked).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key.toLowerCase() === "e") {
        toggleLock();
        return;
      }
      if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
        return;
      }
      if (locked) return;
      switch (e.key.toLowerCase()) {
        case "q":
          bump(0, 1);
          break;
        case "a":
          bump(0, -1);
          break;
        case "p":
          bump(1, 1);
          break;
        case "l":
          bump(1, -1);
          break;
        case "r":
          update(
            (s) => ({
              ...s,
              teams: [
                { ...s.teams[0], score: 0 },
                { ...s.teams[1], score: 0 },
              ],
            }),
            true
          );
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, bump, update]);

  const toggleLock = useCallback(() => {
    setLocked((prev) => {
      const next = !prev;
      localStorage.setItem("unleash-locked", next ? "1" : "0");
      return next;
    });
  }, []);

  // Fullscreen (with Safari/webkit fallback)
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () =>
      setIsFs(
        !!(document.fullscreenElement ||
          // @ts-expect-error vendor-prefixed
          document.webkitFullscreenElement)
      );
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void>;
      webkitFullscreenElement?: Element;
    };
    const active = document.fullscreenElement || doc.webkitFullscreenElement;
    if (!active) {
      (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch(
        () => {}
      );
    } else {
      doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.();
    }
  }, []);

  const editProps = (field: string) => ({
    readOnly: locked,
    onFocus: () => (focusedRef.current = field),
    onBlur: () => {
      if (focusedRef.current === field) focusedRef.current = null;
    },
    className: locked ? styles.locked : styles.editable,
  });

  return (
    <main className={styles.stage}>
      <div className={styles.topbar}>
        <input
          {...editProps("title")}
          className={`${styles.title} ${editProps("title").className}`}
          value={state.title}
          spellCheck={false}
          onChange={(e) =>
            update((s) => ({ ...s, title: e.target.value }))
          }
          aria-label="Scoreboard title"
        />
        <img src="/unleash.svg" alt="Logo" className={styles.brandSlot} aria-hidden />
      </div>

      <section className={styles.panel}>
        <header className={styles.head}>
          {[0, 1].map((i) => (
            <div className={styles.cell} key={i}>
              <input
                {...editProps(`team-${i}-name`)}
                className={`${styles.teamName} ${
                  editProps(`team-${i}-name`).className
                }`}
                value={state.teams[i].name}
                spellCheck={false}
                placeholder={`Team ${i + 1}`}
                onChange={(e) =>
                  update((s) => {
                    const teams = [...s.teams] as [Team, Team];
                    teams[i] = { ...teams[i], name: e.target.value };
                    return { ...s, teams };
                  })
                }
                aria-label={`Team ${i + 1} name`}
              />
            </div>
          ))}
        </header>

        <div className={styles.body}>
          {[0, 1].map((i) => (
            <div className={styles.scoreCol} key={i}>
              <input
                {...editProps(`team-${i}-score`)}
                className={`${styles.score} ${
                  editProps(`team-${i}-score`).className
                }`}
                value={state.teams[i].score}
                inputMode="numeric"
                pattern="[0-9]*"
                onFocus={(e) => {
                  focusedRef.current = `team-${i}-score`;
                  e.currentTarget.select();
                }}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^0-9]/g, "");
                  setScore(
                    i as 0 | 1,
                    digits === "" ? 0 : parseInt(digits, 10)
                  );
                }}
                aria-label={`${state.teams[i].name} score`}
              />
              <div
                className={`${styles.stepper} ${!locked ? styles.live : ""}`}
              >
                <button
                  className={styles.stepBtn}
                  onClick={() => bump(i as 0 | 1, -1)}
                  tabIndex={-1}
                  aria-label="decrease"
                >
                  −
                </button>
                <button
                  className={styles.stepBtn}
                  onClick={() => bump(i as 0 | 1, 1)}
                  tabIndex={-1}
                  aria-label="increase"
                >
                  +
                </button>
              </div>
            </div>
          ))}

          <input
            {...editProps("label")}
            className={`${styles.label} ${editProps("label").className}`}
            value={state.label}
            spellCheck={false}
            onChange={(e) =>
              update((s) => ({ ...s, label: e.target.value }))
            }
            aria-label="Round label"
          />
        </div>
      </section>

      <button
        className={styles.fsBtn}
        onClick={toggleFullscreen}
        aria-label={isFs ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFs ? "Exit fullscreen (F)" : "Fullscreen (F)"}
      >
        {isFs ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path
              fill="currentColor"
              d="M9 9V4H7v3H4v2h5zm6 0h5V7h-3V4h-2v5zM9 15H4v2h3v3h2v-5zm6 0v5h2v-3h3v-2h-5z"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path
              fill="currentColor"
              d="M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM6 15v3h3v2H4v-5h2zm12 0h2v5h-5v-2h3v-3z"
            />
          </svg>
        )}
        {isFs ? "Exit" : "Fullscreen"}
      </button>

      <button className={styles.lockBtn} onClick={toggleLock}>
        <span className={`${styles.dot} ${live ? styles.on : ""}`} />
        {locked ? "Locked · press E to edit" : "Editing · E to lock"}
      </button>

      {!locked && (
        <div className={styles.hint}>
          Q/A left · P/L right · R reset · E lock · F fullscreen · click a
          number to type
        </div>
      )}
    </main>
  );
}
