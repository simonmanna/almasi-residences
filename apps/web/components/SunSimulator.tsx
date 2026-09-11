'use client';

import { useMemo, useState } from 'react';
import * as SunCalc from 'suncalc';
import { formatDate, type TimeState } from '@avida/types';
import { useTimeState } from '../lib/time-state/TimeStateProvider';

/**
 * §8.6 F15 — the sun and view simulator.
 *
 * Real solar geometry from the development's actual coordinates, via suncalc.
 * §8.6 is explicit that this must never be presented as a promise: it is
 * labelled as modelled, and the label is not in the footer.
 *
 * §8.6 point 5 — the time slider is bound to the global time state, so moving
 * it also changes the site's palette. The two systems are one system.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** §6.2's boundaries, so the simulator and the scrubber agree. */
function stateForHour(hour: number): TimeState {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19.5) return 'dusk';
  return 'night';
}

/**
 * suncalc returns an Invalid Date where the sun never rises or sets — polar
 * summer and winter. Kigali will never see it, but the development's
 * coordinates are configuration, and a component that throws on a latitude
 * change is a component that will throw one day.
 */
function clockOrDash(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function bearingLabel(azimuthDeg: number): string {
  const points = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return points[Math.round(((azimuthDeg % 360) + 360) % 360 / 45) % 8]!;
}

export function SunSimulator({
  latitude,
  longitude,
  orientation,
  landmarks = [],
}: {
  latitude: number;
  longitude: number;
  /** The selected unit's facing, so "your windows" can be answered honestly. */
  orientation?: string;
  landmarks?: { name: string; distanceM: number | null }[];
}) {
  const { setState } = useTimeState();
  const [month, setMonth] = useState(new Date().getMonth());
  const [hour, setHour] = useState(14);

  const date = useMemo(() => {
    const d = new Date();
    d.setMonth(month, 15);
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    return d;
  }, [month, hour]);

  const sun = useMemo(() => {
    const position = SunCalc.getPosition(date, latitude, longitude);
    const times = SunCalc.getTimes(date, latitude, longitude);
    return {
      // suncalc gives azimuth from south, westward. Convert to a compass bearing.
      azimuthDeg: ((position.azimuth * 180) / Math.PI + 180 + 360) % 360,
      altitudeDeg: (position.altitude * 180) / Math.PI,
      sunrise: times.sunrise,
      sunset: times.sunset,
    };
  }, [date, latitude, longitude]);

  const isUp = sun.altitudeDeg > 0;

  function onHour(next: number) {
    setHour(next);
    // §8.6 point 5 — the two systems are one system.
    setState(stateForHour(next));
  }

  return (
    <section className="sun-simulator">
      <h3 className="head">Sun and view</h3>

      <div className="sun-controls">
        <label>
          Month
          <input
            type="range"
            min={0}
            max={11}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-valuetext={MONTHS[month]}
          />
          <output data-numeric>{MONTHS[month]}</output>
        </label>

        <label>
          Time
          <input
            type="range"
            min={0}
            max={23.5}
            step={0.5}
            value={hour}
            onChange={(e) => onHour(Number(e.target.value))}
            aria-valuetext={`${Math.floor(hour)}:${hour % 1 ? '30' : '00'}`}
          />
          <output data-numeric>
            {String(Math.floor(hour)).padStart(2, '0')}:{hour % 1 ? '30' : '00'}
          </output>
        </label>
      </div>

      <svg viewBox="-120 -120 240 140" className="sun-compass" role="img"
           aria-label={`Modelled sun position for ${MONTHS[month]}, ${Math.floor(hour)} hundred hours`}>
        <path d="M -100 0 A 100 100 0 0 1 100 0" className="sun-horizon" />
        <line x1="-110" y1="0" x2="110" y2="0" className="sun-ground" />
        {isUp && (
          <circle
            cx={-Math.cos((sun.azimuthDeg * Math.PI) / 180) * 100}
            cy={-Math.sin((Math.max(0, sun.altitudeDeg) * Math.PI) / 180) * 100}
            r="9"
            className="sun-disc"
          />
        )}
        <text x="-104" y="16" className="sun-cardinal">W</text>
        <text x="96" y="16" className="sun-cardinal">E</text>
        <text x="-6" y="-104" className="sun-cardinal">S</text>
      </svg>

      <dl className="sun-facts">
        <div>
          <dt>Sun</dt>
          <dd data-numeric>
            {isUp
              ? `${sun.altitudeDeg.toFixed(0)}° above the horizon, to the ${bearingLabel(sun.azimuthDeg)}`
              : 'Below the horizon'}
          </dd>
        </div>
        <div>
          <dt>Sunrise</dt>
          <dd data-numeric>{clockOrDash(sun.sunrise)}</dd>
        </div>
        <div>
          <dt>Sunset</dt>
          <dd data-numeric>{clockOrDash(sun.sunset)}</dd>
        </div>
        {orientation && (
          <div>
            <dt>This apartment faces</dt>
            <dd>{orientation}</dd>
          </div>
        )}
        <div>
          <dt>Date modelled</dt>
          <dd data-numeric>{formatDate(date)}</dd>
        </div>
      </dl>

      {landmarks.length > 0 && (
        <p className="note">
          Visible in that direction, subject to construction:{' '}
          {landmarks.map((l) => l.name).join(', ')}.
        </p>
      )}

      {/* §8.6 — "A simulator that promises a view is a legal problem." */}
      <p className="disclaimer">
        Modelled sun position for the development&rsquo;s coordinates. Actual light and views are
        subject to construction and to neighbouring development.
      </p>
    </section>
  );
}
