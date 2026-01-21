import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useRef,
  useEffect,
  useCallback,
  useState,
  ReactNode,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { cn } from '@/lib/utils';

export interface VirtualMessageListMethods {
  scrollToIndex: (index: number | 'LAST', options?: { align?: 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }) => void;
  scrollToBottom: (behavior?: 'auto' | 'smooth') => void;
}

export interface VirtualMessageListProps<T, C = unknown> {
  data: T[];
  context?: C;
  computeItemKey: (item: T, index: number) => string | number;
  ItemContent: React.ComponentType<{ data: T; index: number; context: C }>;
  Header?: () => ReactNode;
  Footer?: () => ReactNode;
  className?: string;
  autoScrollToBottom?: boolean;
  estimateSize?: number;
  overscan?: number;
}

function VirtualMessageListInner<T, C = unknown>(
  {
    data,
    context,
    computeItemKey,
    ItemContent,
    Header,
    Footer,
    className,
    autoScrollToBottom = true,
    estimateSize = 100,
    overscan = 5,
  }: VirtualMessageListProps<T, C>,
  ref: React.Ref<VirtualMessageListMethods>
) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevDataLengthRef = useRef(data.length);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => computeItemKey(data[index], index),
  });

  const scrollToIndex = useCallback(
    (index: number | 'LAST', options?: { align?: 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }) => {
      const targetIndex = index === 'LAST' ? data.length - 1 : index;
      if (targetIndex >= 0 && targetIndex < data.length) {
        virtualizer.scrollToIndex(targetIndex, {
          align: options?.align ?? 'end',
          behavior: options?.behavior ?? 'smooth',
        });
      }
    },
    [data.length, virtualizer]
  );

  const scrollToBottom = useCallback(
    (behavior: 'auto' | 'smooth' = 'smooth') => {
      if (parentRef.current) {
        parentRef.current.scrollTo({
          top: parentRef.current.scrollHeight,
          behavior,
        });
      }
    },
    []
  );

  useImperativeHandle(ref, () => ({
    scrollToIndex,
    scrollToBottom,
  }), [scrollToIndex, scrollToBottom]);

  // Track scroll position to determine if user is at bottom
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
  }, []);

  // Auto-scroll to bottom when new data arrives (if user was at bottom)
  useEffect(() => {
    if (autoScrollToBottom && data.length > prevDataLengthRef.current && isAtBottom) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
    }
    prevDataLengthRef.current = data.length;
  }, [data.length, autoScrollToBottom, isAtBottom, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    if (autoScrollToBottom && data.length > 0) {
      // Delay to ensure virtualizer has measured items
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // Only on mount

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={parentRef}
      className={cn('overflow-auto', className)}
      onScroll={handleScroll}
    >
      {Header && <Header />}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = data[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ItemContent
                data={item}
                index={virtualItem.index}
                context={context as C}
              />
            </div>
          );
        })}
      </div>
      {Footer && <Footer />}
    </div>
  );
}

// Use forwardRef with generic support
export const VirtualMessageList = forwardRef(VirtualMessageListInner) as <T, C = unknown>(
  props: VirtualMessageListProps<T, C> & { ref?: React.Ref<VirtualMessageListMethods> }
) => ReturnType<typeof VirtualMessageListInner>;
