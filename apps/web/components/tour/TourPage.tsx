'use client';

import { useState } from 'react';
import type { TourDto } from '../../lib/api';
import { CgiDisclaimer } from '../CgiDisclaimer';
import { PlanMinimap } from './PlanMinimap';
import { StagingToggle } from './StagingToggle';
import { TourViewer, type TourScene } from './TourViewer';

/**
 * §8.2 / §8.3 — the tour and its plan are one screen: the minimap shows where
 * the camera is, and clicking a room moves it. §9 Phase 3 requires that link to
 * work in both directions.
 */
export function TourPage({ tour }: { tour: TourDto }) {
  const [sceneKey, setSceneKey] = useState(
    tour.scenes.find((s) => s.id === tour.startSceneId)?.key ?? tour.scenes[0]?.key ?? '',
  );
  const [yaw, setYaw] = useState(0);
  const [staged, setStaged] = useState(true);

  return (
    <div className="tour-layout">
      <div>
        <TourViewer
          tour={tour as unknown as { id: string; name: string; startSceneId: string | null; scenes: TourScene[] }}
          initialSceneKey={sceneKey}
          onSceneChange={(scene) => setSceneKey(scene.key)}
          onYawChange={setYaw}
        />
        <CgiDisclaimer className="disclaimer" />
      </div>

      <aside className="tour-side">
        <PlanMinimap
          planUrl={tour.typology?.floorPlanSvgUrl ?? null}
          scenes={tour.scenes.map((s) => ({
            key: s.key,
            label: s.label,
            planX: s.planX,
            planY: s.planY,
          }))}
          activeSceneKey={sceneKey}
          yawDeg={yaw}
          onPick={setSceneKey}
        />
        <StagingToggle staged={staged} onChange={setStaged} />
      </aside>
    </div>
  );
}
