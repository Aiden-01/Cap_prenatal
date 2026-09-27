import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';
function subscribe(onChange) {
  const media = window.matchMedia?.(QUERY);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}
const snapshot = () => window.matchMedia?.(QUERY).matches ?? false;
export default function useHistoryMobile() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
