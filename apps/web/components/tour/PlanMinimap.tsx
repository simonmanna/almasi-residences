'use client';

/**
 * §8.3 — the floor plan minimap. A camera cone shows where the visitor is
 * standing and which way they are looking; clicking a room enters the tour at
 * that scene.
 *
 * The plan must be SVG with semantic room paths, not a raster image — §8.3 is
 * explicit that a raster plan kills every interaction in this section.
 */
export function PlanMinimap({
  planUrl,
  scenes,
  activeSceneKey,
  yawDeg,
  onPick,
}: {
  planUrl: string | null;
  scenes: { key: string; label: string; planX: number | null; planY: number | null }[];
  activeSceneKey: string;
  yawDeg: number;
  onPick: (key: string) => void;
}) {
  const active = scenes.find((s) => s.key === activeSceneKey);

  if (!planUrl) {
    return (
      <p className="note">
        TODO(content) — no vector floor plan supplied for this typology yet (§7.8 item 2).
      </p>
    );
  }

  return (
    <figure className="minimap">
      <svg viewBox="0 0 1200 900" role="img" aria-label="Floor plan showing where you are standing">
        <image href={planUrl} x="0" y="0" width="1200" height="900" />

        {scenes.map((s) =>
          s.planX === null || s.planY === null ? null : (
            <g
              key={s.key}
              role="button"
              tabIndex={0}
              aria-label={`Go to ${s.label}`}
              className="minimap-node"
              data-active={s.key === activeSceneKey || undefined}
              onClick={() => onPick(s.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPick(s.key);
                }
              }}
            >
              <circle cx={s.planX} cy={s.planY} r={14} />
            </g>
          ),
        )}

        {/* The camera cone, rotated about the active node so it reads as a
            direction of view rather than decoration. */}
        {active && active.planX !== null && active.planY !== null && (
          <g
            className="minimap-cone"
            transform={`translate(${active.planX} ${active.planY}) rotate(${yawDeg})`}
            aria-hidden="true"
          >
            <path d="M 0 0 L -46 -80 A 92 92 0 0 1 46 -80 Z" />
          </g>
        )}
      </svg>
      <figcaption className="note">Click a room to move there.</figcaption>
    </figure>
  );
}
