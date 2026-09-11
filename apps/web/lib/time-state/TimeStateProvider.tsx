'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  TIME_STATES,
  timeStateForDate,
  isTimeState,
  type TimeState,
} from '@avida/types';

const STORAGE_KEY = 'avida:time-state';
/** §2.3 — images crossfade over 1200ms; the provider holds `isTransitioning` for that long. */
const TRANSITION_MS = 1200;
/** §6.2 — the timelapse dwells four seconds on each state. */
const CYCLE_DWELL_MS = 4000;

interface TimeStateContextValue {
  state: TimeState;
  setState: (s: TimeState) => void;
  isTransitioning: boolean;
  /** 0..1 along the scrubber track; maps to the four discrete states. */
  scrubPosition: number;
  setScrub: (p: number) => void;
  isCycling: boolean;
  toggleCycle: () => void;
  reducedMotion: boolean;
}

const TimeStateContext = createContext<TimeStateContextValue | null>(null);

function positionFor(state: TimeState): number {
  return TIME_STATES.indexOf(state) / (TIME_STATES.length - 1);
}

/** Dragging past a midpoint commits to the next state (§6.2). */
function stateForPosition(p: number): TimeState {
  const i = Math.round(p * (TIME_STATES.length - 1));
  return TIME_STATES[Math.min(TIME_STATES.length - 1, Math.max(0, i))]!;
}

export function TimeStateProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  /** Server-rendered default. Corrected to the visitor's clock on mount. */
  initialState: TimeState;
}) {
  const [state, setInternalState] = useState<TimeState>(initialState);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(() => positionFor(initialState));
  const [isCycling, setIsCycling] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // §6.2 — stored preference wins over the clock; the clock wins over the
  // server default. Runs once, after hydration, so SSR output stays stable.
  useEffect(() => {
    let next: TimeState | null = null;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isTimeState(stored)) next = stored;
    } catch {
      // Private mode or blocked storage: fall through to the clock.
    }
    next ??= timeStateForDate();
    setInternalState(next);
    setScrubPosition(positionFor(next));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // The provider owns `data-time` on <html>. §2.3: every colour cascades from
  // here, and no component computes a colour from the time state.
  useEffect(() => {
    document.documentElement.dataset.time = state;
    try {
      window.localStorage.setItem(STORAGE_KEY, state);
    } catch {
      // Not being able to remember the choice is not worth an error.
    }
  }, [state]);

  const setState = useCallback(
    (next: TimeState) => {
      setInternalState((current) => {
        if (current === next) return current;
        // §2.6 — reduced motion snaps instantly rather than crossfading.
        if (!reducedMotion) {
          setIsTransitioning(true);
          if (transitionTimer.current) clearTimeout(transitionTimer.current);
          transitionTimer.current = setTimeout(() => setIsTransitioning(false), TRANSITION_MS);
        }
        return next;
      });
      setScrubPosition(positionFor(next));
    },
    [reducedMotion],
  );

  const setScrub = useCallback(
    (p: number) => {
      const clamped = Math.min(1, Math.max(0, p));
      setScrubPosition(clamped);
      setState(stateForPosition(clamped));
    },
    [setState],
  );

  const toggleCycle = useCallback(() => {
    // §6.2 — cycling is disabled entirely under reduced motion.
    if (reducedMotion) return;
    setIsCycling((c) => !c);
  }, [reducedMotion]);

  useEffect(() => {
    if (!isCycling || reducedMotion) return;
    const id = setInterval(() => {
      setInternalState((current) => {
        const next = TIME_STATES[(TIME_STATES.indexOf(current) + 1) % TIME_STATES.length]!;
        setScrubPosition(positionFor(next));
        return next;
      });
    }, CYCLE_DWELL_MS);
    return () => clearInterval(id);
  }, [isCycling, reducedMotion]);

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
  }, []);

  const value = useMemo<TimeStateContextValue>(
    () => ({
      state,
      setState,
      isTransitioning,
      scrubPosition,
      setScrub,
      isCycling,
      toggleCycle,
      reducedMotion,
    }),
    [state, setState, isTransitioning, scrubPosition, setScrub, isCycling, toggleCycle, reducedMotion],
  );

  return <TimeStateContext.Provider value={value}>{children}</TimeStateContext.Provider>;
}

export function useTimeState(): TimeStateContextValue {
  const ctx = useContext(TimeStateContext);
  if (!ctx) throw new Error('useTimeState must be used inside a TimeStateProvider');
  return ctx;
}
