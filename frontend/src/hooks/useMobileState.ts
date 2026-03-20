import { useState, useEffect } from 'react';

type MobileState = {
  activePage: string;
  activeBoardId: string | null;
  bottomSheetOpen: boolean;
  selectedItemId: string | null;
  scrollPosition: number;
};

const STORAGE_KEY = 'sunday_mobile_state';

export function useMobileState(initialPage: string = 'home') {
  const [state, setState] = useState<MobileState>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          activePage: parsed.activePage || initialPage,
          activeBoardId: parsed.activeBoardId || null,
          bottomSheetOpen: !!parsed.bottomSheetOpen,
          selectedItemId: parsed.selectedItemId || null,
          scrollPosition: parsed.scrollPosition || 0,
        };
      }
    } catch (e) {
      console.warn('Error reading mobile state from sessionStorage', e);
    }
    return {
      activePage: initialPage,
      activeBoardId: null,
      bottomSheetOpen: false,
      selectedItemId: null,
      scrollPosition: 0,
    };
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Error saving mobile state to sessionStorage', e);
    }
  }, [state]);

  const updateState = (updates: Partial<MobileState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  return { mobileState: state, updateMobileState: updateState };
}
