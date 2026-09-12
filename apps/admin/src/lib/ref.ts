import { get } from './api';
import { useQuery } from './query';
import type { Dashboard, Feature, FloorRow, PaymentPlan, TeamMember, Typology } from './types';

/** Reference data many screens pick from. Cached by key; invalidated after edits. */
export const useFloors = () => useQuery('floors', () => get<FloorRow[]>('/admin/floors'));
export const useTypes = () => useQuery('types', () => get<Typology[]>('/admin/types'));
export const usePlans = () => useQuery('payment-plans', () => get<PaymentPlan[]>('/admin/payment-plans'));
export const useFeatures = () => useQuery('features', () => get<Feature[]>('/admin/features'));
export const useTeam = () => useQuery('team', () => get<TeamMember[]>('/admin/team'));

/**
 * The development's currency. Backed by the dashboard query the shell already
 * holds, so this costs no extra request; when that payload is split up
 * (roadmap phase 4, item 59) this hook is the only thing to repoint.
 */
export function useCurrency(): string {
  const { data } = useQuery('dashboard', () => get<Dashboard>('/admin/dashboard'));
  return data?.currency ?? 'USD';
}

export const floorName = (f: { label: string; displayName: string | null }) => f.displayName ?? f.label;
