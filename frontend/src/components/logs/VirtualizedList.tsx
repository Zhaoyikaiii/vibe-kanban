import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState, useCallback } from 'react';

import DisplayConversationEntry from '../NormalizedConversation/DisplayConversationEntry';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/hooks/useConversationHistory';
import { Loader2 } from 'lucide-react';
import { TaskWithAttemptStatus } from 'shared/types';
import type { WorkspaceWithSession } from '@/types/attempt';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';

interface VirtualizedListProps {
  attempt: WorkspaceWithSession;
  task?: TaskWithAttemptStatus;
}

const VirtualizedList = ({ attempt, task }: VirtualizedListProps) => {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { setEntries, reset } = useEntries();
  const parentRef = useRef<HTMLDivElement>(null);
  const prevEntriesLengthRef = useRef(0);
  const shouldScrollToBottomRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    reset();
  }, [attempt.id, reset]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
    getItemKey: (index) => `l-${entries[index].patchKey}`,
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
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);
  }, []);

  const onEntriesUpdated = useCallback((
    newEntries: PatchTypeWithKey[],
    addType: AddEntryType,
    newLoading: boolean
  ) => {
    const shouldAutoScroll = (addType === 'running' || addType === 'plan') && !loading && isAtBottom;
    shouldScrollToBottomRef.current = shouldAutoScroll;

    setEntriesState(newEntries);
    setEntries(newEntries);

    if (loading) {
      setLoading(newLoading);
    }
  }, [loading, isAtBottom, setEntries]);

  useConversationHistory({ attempt, onEntriesUpdated });

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (entries.length > prevEntriesLengthRef.current) {
      if (shouldScrollToBottomRef.current || prevEntriesLengthRef.current === 0) {
        requestAnimationFrame(() => {
          scrollToBottom(prevEntriesLengthRef.current === 0 ? 'auto' : 'smooth');
        });
      }
    }
    prevEntriesLengthRef.current = entries.length;
  }, [entries.length, scrollToBottom]);

  const virtualItems = virtualizer.getVirtualItems();

  const renderItem = (data: PatchTypeWithKey) => {
    if (data.type === 'STDOUT') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'STDERR') {
      return <p>{data.content}</p>;
    }
    if (data.type === 'NORMALIZED_ENTRY' && attempt) {
      return (
        <DisplayConversationEntry
          expansionKey={data.patchKey}
          entry={data.content}
          executionProcessId={data.executionProcessId}
          taskAttempt={attempt}
          task={task}
        />
      );
    }
    return null;
  };

  return (
    <ApprovalFormProvider>
      <div
        ref={parentRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        <div className="h-2" />
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = entries[virtualItem.index];
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
                {renderItem(item)}
              </div>
            );
          })}
        </div>
        <div className="h-2" />
      </div>
      {loading && (
        <div className="float-left top-0 left-0 w-full h-full bg-primary flex flex-col gap-2 justify-center items-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading History</p>
        </div>
      )}
    </ApprovalFormProvider>
  );
};

export default VirtualizedList;
