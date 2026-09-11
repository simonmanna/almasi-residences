'use client';

/**
 * §9 Phase 5 — virtual staging: a furniture layer that can be shown or hidden
 * inside the tour and on the floor plan.
 *
 * §13 governs what may be in that layer. Furniture and props may be generated;
 * anything dimensional about the apartment — walls, windows, ceiling heights —
 * comes from the architect's model. So the toggle is labelled as furniture, and
 * the disclaimer says the furniture is not included, because a buyer who thinks
 * the sofa comes with the apartment has been misled by us.
 */
export function StagingToggle({
  staged,
  onChange,
}: {
  staged: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="staging">
      <label className="staging-control">
        <input type="checkbox" checked={staged} onChange={(e) => onChange(e.target.checked)} />
        <span>Show furniture</span>
      </label>
      {staged && (
        <p className="disclaimer">
          Furniture is shown to indicate scale and is not included in the sale. Room dimensions are
          from the architect&rsquo;s drawings.
        </p>
      )}
    </div>
  );
}
