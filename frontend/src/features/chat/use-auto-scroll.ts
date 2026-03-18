import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD = 50;

export function useAutoScroll<T extends HTMLElement>() {
  const containerRef = useRef<T>(null);
  const isNearBottomRef = useRef(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const near =
        el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD;
      isNearBottomRef.current = near;
      setIsNearBottom(near);
    };

    const observer = new MutationObserver(() => {
      if (isNearBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });

    el.addEventListener("scroll", handleScroll, { passive: true });
    observer.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      el.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  return { containerRef, scrollToBottom, isNearBottom };
}
