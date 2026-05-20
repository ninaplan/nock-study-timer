'use client';
import { useAppHeight } from '@/hooks/useAppHeight';

export default function AppHeightProvider({ children }) {
  useAppHeight();
  return children;
}
