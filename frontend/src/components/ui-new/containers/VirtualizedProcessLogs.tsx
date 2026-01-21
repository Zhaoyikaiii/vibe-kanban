import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/ssr';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

export type LogEntry = Extract<
  PatchType,
  { type: 'STDOUT' } | { type: 'STDERR' }
>;

export interface VirtualizedProcessLogsProps {
  logs: LogEntry[];
  error: string | null;
  searchQuery: string;
  matchIndices: number[];
  currentMatchIndex: number;
}

type LogEntryWithKey = LogEntry & { key: string; originalIndex: number };

export function VirtualizedProcessLogs({
  logs,
  error,
  searchQuery,
  matchIndices,
  currentMatchIndex,
}: VirtualizedProcessLogsProps) {
  const { t } = useTranslation('tasks');
  const parentRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevLogsLengthRef = useRef(0);
  const prevCurrentMatchRef = useRef<number | undefined>(undefined);

  const logsWithKeys: LogEntryWithKey[] = useMemo(() =>
    logs.map((entry, index) => ({
      ...entry,
      key: `log-${index}`,
      originalIndex: index,
    })),
    [logs]
  );

  const virtualizer = useVirtualizer({
    count: logsWithKeys.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
    getItemKey: (index) => logsWithKeys[index].key,
  });

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const scrollToIndex = useCallback((index: number, behavior: 'auto' | 'smooth' = 'smooth') => {
    virtualizer.scrollToIndex(index, {
      align: 'center',
      behavior,
    });
  }, [virtualizer]);

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (logs.length > prevLogsLengthRef.current) {
        if (isAtBottom || prevLogsLengthRef.current === 0) {
          requestAnimationFrame(() => {
            scrollToBottom(prevLogsLengthRef.current === 0 ? 'auto' : 'smooth');
          });
        }
      }
      prevLogsLengthRef.current = logs.length;
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [logs.length, isAtBottom, scrollToBottom]);

  // Scroll to current match when it changes
  useEffect(() => {
    if (
      matchIndices.length > 0 &&
      currentMatchIndex >= 0 &&
      currentMatchIndex !== prevCurrentMatchRef.current
    ) {
      const logIndex = matchIndices[currentMatchIndex];
      scrollToIndex(logIndex, 'smooth');
      prevCurrentMatchRef.current = currentMatchIndex;
    }
  }, [currentMatchIndex, matchIndices, scrollToIndex]);

  if (logs.length === 0 && !error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-center text-muted-foreground text-sm">
          {t('processes.noLogsAvailable')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-center text-destructive text-sm">
          <WarningCircleIcon className="size-icon-base inline mr-2" />
          {error}
        </p>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="h-full">
      <div
        ref={parentRef}
        className="h-full overflow-auto"
        onScroll={handleScroll}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = logsWithKeys[virtualItem.index];
            const isMatch = matchIndices.includes(item.originalIndex);
            const isCurrentMatch =
              matchIndices[currentMatchIndex] === item.originalIndex;

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
                <RawLogText
                  content={item.content}
                  channel={item.type === 'STDERR' ? 'stderr' : 'stdout'}
                  className="text-sm px-4 py-1"
                  linkifyUrls
                  searchQuery={isMatch ? searchQuery : undefined}
                  isCurrentMatch={isCurrentMatch}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
