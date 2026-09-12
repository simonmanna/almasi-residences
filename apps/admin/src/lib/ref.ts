import { get } from './api';
import { useQuery } from './query';
import type { Feature, FloorRow, PaymentPlan, TeamMember, Typology } from './types';

/** Reference data many screens pick from. Cached by key; invalidated after edits. */
export const useFloors = () => useQuery('floors', () => get<FloorRow[]>('/admin/floors'));
export const useTypes = () => useQuery('types', () => get<Typology[]>('/admin/types'));
export const usePlans = () => useQuery('payment-plans', () => get<PaymentPlan[]>('/admin/payment-plans'));
export const useFeatures = () => useQuery('features', () => get<Feature[]>('/admin/features'));
export const useTeam = () => useQuery('team', () => get<TeamMember[]>('/admin/team'));

export const floorName = (f: { label: string; displayName: string | null }) => f.displayName ?? f.label;
