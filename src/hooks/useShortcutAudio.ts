import { useState, useEffect, useCallback } from 'react';
import { shortcutAudioController } from '../services/shortcutAudioController';

export function useShortcutAudio(id?: string) {
  const [isPlaying, setIsPlaying] = useState<boolean>(() => {
    return id ? shortcutAudioController.isPlaying(id) : false;
  });

  useEffect(() => {
    if (!id) return;
    setIsPlaying(shortcutAudioController.isPlaying(id));

    const unsubscribe = shortcutAudioController.subscribe((activeId) => {
      setIsPlaying(activeId === id);
    });

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

  return { isPlaying, toggleAudio };
}
