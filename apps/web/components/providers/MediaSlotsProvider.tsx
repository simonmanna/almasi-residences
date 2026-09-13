'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MediaSlotsDto, SlotMediaDto } from '../../lib/api';

const EMPTY: SlotMediaDto = { image: null, video: null };
const Ctx = createContext<MediaSlotsDto>({});

/**
 * The site's placements (homepage hero, film teaser, page headers), read once
 * in the root layout from /media-slots and refreshed with every publish. A
 * component asks for a placement by key; the admin decides what fills it.
 */
export function MediaSlotsProvider({ slots, children }: { slots: MediaSlotsDto; children: ReactNode }) {
  return <Ctx.Provider value={slots}>{children}</Ctx.Provider>;
}

export function useSlot(key: string): SlotMediaDto {
  return useContext(Ctx)[key] ?? EMPTY;
}
