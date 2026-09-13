'use client';

import { useCallback, useEffect, useState } from 'react';

const FAVORITES = 'almasi:favorites';
const COMPARE = 'almasi:compare';
const CHANGE = 'almasi:shortlist-change';

function read(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function useResidenceShortlist() {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const refresh = useCallback(() => {
    setFavorites(read(FAVORITES));
    setCompare(read(COMPARE));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(CHANGE, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHANGE, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const write = (key: string, values: string[]) => {
    localStorage.setItem(key, JSON.stringify(values));
    window.dispatchEvent(new Event(CHANGE));
  };
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter((x) => x !== id) : [...favorites, id];
    setFavorites(next);
    write(FAVORITES, next);
    return next.includes(id);
  };
  const toggleCompare = (id: string) => {
    const next = compare.includes(id) ? compare.filter((x) => x !== id) : [...compare, id].slice(-3);
    setCompare(next);
    write(COMPARE, next);
    return next.includes(id);
  };
  const clearCompare = () => {
    setCompare([]);
    write(COMPARE, []);
  };
  return { favorites, compare, toggleFavorite, toggleCompare, clearCompare };
}
