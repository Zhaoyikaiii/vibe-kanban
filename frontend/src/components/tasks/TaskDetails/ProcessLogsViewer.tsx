import { useEffect, useRef, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertCircle } from 'lucide-react';
import { useLogStream } from '@/hooks/useLogStream';
import RawLogText from '@/components/common/RawLogText';
import type { PatchType } from 'shared/types';

type LogEntry = Extract<PatchType, { type: 'STDOUT' } | { type: 'STDERR' }>;

interface ProcessLogsViewerProps {
  processId: string;
}

export function ProcessLogsViewerContent({
  logs,
  error,
}: {
  logs: LogEntry[];
  error: string | null;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const didInitScroll = useRef(false);
  const prevLenRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const virtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 20,
    getItemKey: (index) => `log-${index}`,
  });

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAtBottom(isAtBottom);
  }, []);

  // 1) Initial jump to bottom once data appears.
  useEffect(() => {
    if (!didInitScroll.current && logs.length > 0) {
      didInitScroll.current = true;
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    }
  }, [logs.length, scrollToBottom]);

  // 2) If there's a large append and we're at bottom, force-stick to the last item.
  useEffect(() => {
    const prev = prevLenRef.current;
    const grewBy = logs.length - prev;
    prevLenRef.current = logs.length;

    // tweak threshold as you like; this handles "big bursts"
    const LARGE_BURST = 10;
    if (grewBy >= LARGE_BURST && atBottom && logs.length > 0) {
      // defer so virtualizer can re-measure before jumping
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
    }
  }, [logs.length, atBottom, scrollToBottom]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="h-full">
      {logs.length === 0 && !error ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No logs available
        </div>
      ) : error ? (
        <div className="p-4 text-center text-destructive text-sm">
          <AlertCircle className="h-4 w-4 inline mr-2" />
          {error}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="h-full overflow-auto rounded-lg"
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
              const entry = logs[virtualItem.index];
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
                    content={entry.content}
                    channel={entry.type === 'STDERR' ? 'stderr' : 'stdout'}
                    className="text-sm px-4 py-1"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcessLogsViewer({
  processId,
}: ProcessLogsViewerProps) {
  const { logs, error } = useLogStream(processId);
  return <ProcessLogsViewerContent logs={logs} error={error} />;
}
