import { useEffect, useRef, useState } from 'react';
import {
  scrollToBottom,
  ScrollController,
  isNearBottom,
  shouldShowScrollToBottom,
} from '@shared/scroll';
import type { ChatMessage } from '@core/types/messages';

export interface UseChatScrollInput {
  messages: ChatMessage[];
  sessionId: string | null;
  showSettings: boolean;
}

export interface UseChatScrollResult {
  chatViewportRef: React.RefObject<HTMLElement>;
  showScrollBottom: boolean;
  handleViewportScroll: (e: React.UIEvent<HTMLElement>) => void;
  handleScrollToBottom: () => void;
  pinAndHide: () => void;
  scrollToBottomNextFrame: () => void;
  pinAndJumpToBottom: () => void;
}

/**
 * Wraps the already-tested `ScrollController` (see tests/shared/scroll.test.ts) with the
 * viewport ref, the "scroll to bottom" button visibility state, and the effects that keep
 * the chat pinned to the bottom on new messages, session switches and leaving Settings.
 *
 * Takes `messages`, `sessionId` and `showSettings` as inputs because the hook does not own
 * the reducer or the settings view toggle -- those live in App.tsx and are only read here to
 * decide when to auto-scroll (see odd/tasks/architecture-restructure.md, T5 plan: "those
 * fusions ... the hook takes them as INPUTS").
 *
 * Exposes `pinAndJumpToBottom` as the single imperative operation the call sites that need
 * the full "pin + hide button + scroll on next frame" triple can call. Call sites whose
 * behavior does not match that triple exactly (they only pin+hide, or only pin+hide then
 * scroll later after other work) are NOT flattened into this method -- they call
 * `pinAndHide` and `scrollToBottomNextFrame` individually instead, preserving their original,
 * slightly different behavior. See the T5a report for exactly which call site uses which.
 */
export function useChatScroll({
  messages,
  sessionId,
  showSettings,
}: UseChatScrollInput): UseChatScrollResult {
  const chatViewportRef = useRef<HTMLElement>(null);
  const scrollControllerRef = useRef<ScrollController | null>(null);
  if (!scrollControllerRef.current) {
    scrollControllerRef.current = new ScrollController();
  }
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const handleViewportScroll = (e: React.UIEvent<HTMLElement>) => {
    const el = e.currentTarget;
    scrollControllerRef.current?.handleScroll(el);
    const atBottom = isNearBottom({
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    });
    setShowScrollBottom(shouldShowScrollToBottom(atBottom, messages.length));
  };

  const handleScrollToBottom = () => {
    scrollControllerRef.current?.pinToBottom();
    setShowScrollBottom(false);
    scrollToBottom(chatViewportRef.current, 'smooth');
  };

  const pinAndHide = () => {
    scrollControllerRef.current?.pinToBottom();
    setShowScrollBottom(false);
  };

  const scrollToBottomNextFrame = () => {
    requestAnimationFrame(() => {
      scrollToBottom(chatViewportRef.current, 'auto');
    });
  };

  const pinAndJumpToBottom = () => {
    pinAndHide();
    scrollToBottomNextFrame();
  };

  // Auto-scroll on new messages or streaming tokens when pinned to bottom
  useEffect(() => {
    if (scrollControllerRef.current?.shouldAutoScroll()) {
      scrollToBottom(chatViewportRef.current, 'auto');
      setShowScrollBottom(false);
    }
  }, [messages]);

  // When switching sessions or setting active session, pin to bottom and immediately scroll
  useEffect(() => {
    if (sessionId) {
      scrollControllerRef.current?.pinToBottom();
      setShowScrollBottom(false);
      scrollToBottom(chatViewportRef.current, 'auto');
      requestAnimationFrame(() => {
        scrollToBottom(chatViewportRef.current, 'auto');
      });
    }
  }, [sessionId]);

  // When exiting settings (showSettings becomes false), automatically scroll to bottom
  useEffect(() => {
    if (!showSettings) {
      scrollControllerRef.current?.pinToBottom();
      setShowScrollBottom(false);
      const scroll = () => {
        if (chatViewportRef.current) {
          scrollToBottom(chatViewportRef.current, 'auto');
        }
      };
      scroll();
      const raf = requestAnimationFrame(scroll);
      const timer = setTimeout(scroll, 50);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
  }, [showSettings]);

  return {
    chatViewportRef,
    showScrollBottom,
    handleViewportScroll,
    handleScrollToBottom,
    pinAndHide,
    scrollToBottomNextFrame,
    pinAndJumpToBottom,
  };
}
