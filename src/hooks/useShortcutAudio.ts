import { useState, useEffect, useCallback } from 'react';
import { shortcutAudioController } from '../services/shortcutAudioController';

export function useShortcutAudio(id?: string) {
  const [state, setState] = useState(() => ({
    isPlaying: id ? shortcutAudioController.isPlaying(id) : false,
    isLoading: id ? shortcutAudioController.isLoading(id) : false,
    hasError: id ? shortcutAudioController.hasError(id) : false,
  }));

  useEffect(() => {
    if (!id) return;

    const syncState = () => {
      setState({
        isPlaying: shortcutAudioController.isPlaying(id),
        isLoading: shortcutAudioController.isLoading(id),
        hasError: shortcutAudioController.hasError(id),
      });
    };

    syncState();
    const unsubscribe = shortcutAudioController.subscribe(syncState);
    return unsubscribe;
  }, [id]);

  const toggleAudio = useCallback(
    (url?: string | null, e?: React.MouseEvent) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      if (!id || !url) return;
      shortcutAudioController.toggle(id, url);
    },
    [id]
  );

  const preloadAudio = useCallback((url?: string | null) => {
    if (!url) return;
    shortcutAudioController.preloadAudio(url);
  }, []);

  return {
    isPlaying: state.isPlaying,
    isLoading: state.isLoading,
    hasError: state.hasError,
    toggleAudio,
    preloadAudio,
  };
}
