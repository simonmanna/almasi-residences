import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@avida/db';
import { PrismaService } from './prisma.service.js';

const ROUTES_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
/** The Routes API takes at most 25 destinations per origin in one matrix call. */
const BATCH = 25;

interface MatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
}

/**
 * Distances from the property to its nearby places.
 *
 * Every non-manual place first gets the straight-line PostGIS distance (§4.5)
 * and the modelled 28 km/h drive / 4.5 km/h walk times (§13), with
 * `routed = false`. When GOOGLE_MAPS_API_KEY is set, Google's Routes API then
 * replaces them with the real road distance and drive and walk times, and
 * `routed = true`, so the site can say which it is showing. A routing failure
 * is logged and leaves the straight-line figures in place.
 */
@Injectable()
export class LandmarkDistances {
  private readonly log = new Logger(LandmarkDistances.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Re-measure every non-manual place of a development, or just the given ones. */
  async refresh(developmentId: string, ids?: string[]): Promise<{ routed: boolean }> {
    await this.straightLine(developmentId, ids);
    const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
    if (!key) return { routed: false };
    try {
      await this.route(developmentId, key, ids);
      return { routed: true };
    } catch (e) {
      this.log.warn(`Road routing failed, keeping straight-line distances: ${(e as Error).message}`);
      return { routed: false };
    }
  }

  private async straightLine(developmentId: string, ids?: string[]) {
    const only = (col: string) => (ids?.length ? Prisma.sql`AND ${Prisma.raw(col)} IN (${Prisma.join(ids)})` : Prisma.empty);
    await this.prisma.client.$executeRaw`
      UPDATE "Landmark" l
      SET "distanceM" = ROUND(
            ST_Distance(
              ST_SetSRID(ST_MakePoint(l."longitude", l."latitude"), 4326)::geography,
              ST_SetSRID(ST_MakePoint(d."longitude", d."latitude"), 4326)::geography
            )
          )::int,
          "routed" = false
      FROM "Development" d
      WHERE d."id" = ${developmentId} AND l."developmentId" = d."id" AND NOT l."manualDistance"
        ${only('l."id"')}
    `;
    await this.prisma.client.$executeRaw`
      UPDATE "Landmark"
      SET "driveMinutes" = GREATEST(1, ROUND(("distanceM" / 1000.0) / 28.0 * 60)::int),
          "walkMinutes"  = CASE WHEN "distanceM" <= 3000
                                THEN GREATEST(1, ROUND(("distanceM" / 1000.0) / 4.5 * 60)::int)
                                ELSE NULL END
      WHERE "developmentId" = ${developmentId} AND NOT "manualDistance"
        ${only('"id"')}
    `;
  }

  private async route(developmentId: string, key: string, ids?: string[]) {
    const dev = await this.prisma.client.development.findUniqueOrThrow({ where: { id: developmentId }, select: { latitude: true, longitude: true } });
    const places = await this.prisma.client.landmark.findMany({
      where: { developmentId, manualDistance: false, ...(ids?.length ? { id: { in: ids } } : {}) },
      select: { id: true, latitude: true, longitude: true },
    });
    for (let i = 0; i < places.length; i += BATCH) {
      const batch = places.slice(i, i + BATCH);
      const [drive, walk] = await Promise.all([this.matrix(key, dev, batch, 'DRIVE'), this.matrix(key, dev, batch, 'WALK')]);
      for (const [j, p] of batch.entries()) {
        const d = drive.get(j);
        if (!d) continue; // no road route: keep the straight line for this one
        const w = walk.get(j);
        // A walk over 45 minutes is not a walk anyone plans; hide it rather than list it.
        const walkMinutes = w && w.seconds <= 45 * 60 ? Math.max(1, Math.round(w.seconds / 60)) : null;
        await this.prisma.client.landmark.update({
          where: { id: p.id },
          data: { distanceM: d.metres, driveMinutes: Math.max(1, Math.round(d.seconds / 60)), walkMinutes, routed: true },
        });
      }
    }
  }

  /** destination index → road metres and seconds, for the routes Google could find. */
  private async matrix(key: string, origin: { latitude: number; longitude: number }, places: { latitude: number; longitude: number }[], mode: 'DRIVE' | 'WALK') {
    const waypoint = (p: { latitude: number; longitude: number }) => ({ waypoint: { location: { latLng: { latitude: p.latitude, longitude: p.longitude } } } });
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,condition',
      },
      body: JSON.stringify({
        origins: [waypoint(origin)],
        destinations: places.map(waypoint),
        travelMode: mode,
        // Free-flow times, not whatever is on the road the moment an admin clicks save.
        ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_UNAWARE' } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Routes API ${mode} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const out = new Map<number, { metres: number; seconds: number }>();
    for (const e of (await res.json()) as MatrixElement[]) {
      if (e.condition !== 'ROUTE_EXISTS' || e.destinationIndex === undefined || e.distanceMeters === undefined || !e.duration) continue;
      out.set(e.destinationIndex, { metres: e.distanceMeters, seconds: parseInt(e.duration, 10) });
    }
    return out;
  }
}
