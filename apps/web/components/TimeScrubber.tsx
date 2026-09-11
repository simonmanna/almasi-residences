'use client';

import { TIME_STATES, TIME_STATE_LABEL } from '@avida/types';
import { useTimeState } from '../lib/time-state/TimeStateProvider';

/**
 * §6.2 — four labelled stops, keyboard operable, `role="slider"` with a
 * spoken value. Phase 0 ships the discrete control; the continuous drag and
 * the timelapse play control land with the media pipeline in Phase 2.
 */
export function TimeScrubber() {
  const { state, setState, isCycling, toggleCycle, reducedMotion } = useTimeState();
  const index = TIME_STATES.indexOf(state);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = TIME_STATES[Math.min(TIME_STATES.length - 1, Math.max(0, index + delta))]!;
    setState(next);
  }

  return (
    <div className="scrubber">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Time of day"
        aria-valuemin={0}
        aria-valuemax={TIME_STATES.length - 1}
        aria-valuenow={index}
        aria-valuetext={TIME_STATE_LABEL[state]}
        onKeyDown={onKeyDown}
        className="scrubber-track"
      >
        {TIME_STATES.map((s) => (
          <button
            key={s}
            type="button"
            // A stop is a real button so a screen reader can jump straight to a
            // state, rather than arrowing through all four.
            aria-pressed={s === state}
            onClick={() => setState(s)}
            className="scrubber-stop"
            data-active={s === state}
          >
            {TIME_STATE_LABEL[s]}
          </button>
        ))}
      </div>

      {/* §6.2 — off by default, and absent entirely under reduced motion. */}
      {!reducedMotion && (
        <button type="button" onClick={toggleCycle} className="scrubber-cycle">
          {isCycling ? 'Stop the day' : 'Run the day'}
        </button>
      )}
    </div>
  );
}
