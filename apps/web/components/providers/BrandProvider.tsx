'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { LogoDto } from '../../lib/api';

const BrandContext = createContext<LogoDto | null>(null);

/** The logo the admin uploaded (Property → Logo), read once by the layout and shared with every wordmark. */
export function BrandProvider({ logo, children }: { logo: LogoDto | null; children: ReactNode }) {
  return <BrandContext.Provider value={logo}>{children}</BrandContext.Provider>;
}

export const useBrandLogo = () => useContext(BrandContext);
