import { useEffect, useRef } from 'react';

// Global flag to prevent cascading popstate triggers during programmatic modal closes
let isProgrammaticPopping = false;

/**
 * Hook to handle professional popup/menu/modal behavior:
 * 1. Dismisses on outside click if containerRef is provided.
 * 2. Pressing browser/mobile Back button closes the modal FIRST without navigating away from the page.
 * 3. Never triggers unintended route changes or tab switching.
 */
export function usePopupBackDismiss(
  isOpen: boolean,
  onClose: () => void,
  containerRef?: React.RefObject<HTMLElement | null>
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const modalIdRef = useRef<string>('');
  const isPushedRef = useRef(false);

  // 1. Back button dismissal logic
  useEffect(() => {
    if (!isOpen) {
      // If modal was closed programmatically and our state is on top of history, consume it cleanly
      if (isPushedRef.current) {
        isPushedRef.current = false;
        const currentModalId = modalIdRef.current;
        if (window.history.state?.modalId === currentModalId) {
          isProgrammaticPopping = true;
          window.history.back();
          setTimeout(() => {
            isProgrammaticPopping = false;
          }, 60);
        }
      }
      return;
    }

    // Modal opened: create unique ID and push state
    const modalId = 'modal_' + Math.random().toString(36).substring(2, 9);
    modalIdRef.current = modalId;

    window.history.pushState(
      { isModal: true, popupOpen: true, modalId },
      '',
      window.location.href
    );
    isPushedRef.current = true;

    const handlePopState = (e: PopStateEvent) => {
      if (isProgrammaticPopping) return;

      // When the browser back button is pressed, the browser has already popped the entry
      isPushedRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (isPushedRef.current) {
        isPushedRef.current = false;
        const currentModalId = modalIdRef.current;
        if (window.history.state?.modalId === currentModalId) {
          isProgrammaticPopping = true;
          window.history.back();
          setTimeout(() => {
            isProgrammaticPopping = false;
          }, 60);
        }
      }
    };
  }, [isOpen]); // Notice: ONLY depends on isOpen, NEVER on onClose reference!

  // 2. Outside click dismissal
  useEffect(() => {
    if (!isOpen || !containerRef) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown);
      document.addEventListener('touchstart', handlePointerDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, containerRef]);
}
