import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState, useCallback } from 'react';

import { cn } from '@/lib/utils';
import NewDisplayConversationEntry from './NewDisplayConversationEntry';
import { ApprovalFormProvider } from '@/contexts/ApprovalFormContext';
import { useEntries } from '@/contexts/EntriesContext';
import {
  AddEntryType,
  PatchTypeWithKey,
  useConversationHistory,
} from '@/components/ui-new/hooks/useConversationHistory';
import type { WorkspaceWithSession } from '@/types/attempt';

interface ConversationListProps {
  attempt: WorkspaceWithSession;
}

export function ConversationList({ attempt }: ConversationListProps) {
  const [entries, setEntriesState] = useState<PatchTypeWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { setEntries, reset } = useEntries();
  const parentRef = useRef<HTMLDivElement>(null);
  const pendingUpdateRef = useRef<{
    entries: PatchTypeWithKey[];
    addType: AddEntryType;
    loading: boolean;
  } | null>(null);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEntriesLengthRef = useRef(0);
  const scrollModeRef = useRef<'bottom' | 'top-of-last' | 'none'>('bottom');

  useEffect(() => {
    setLoading(true);
    setEntriesState([]);
    reset();
  }, [attempt.id, reset]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5,
    getItemKey: (index) => `conv-${entries[index].patchKey}`,
  });

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    if (parentRef.current) {
      parentRef.current.scrollTo({
        top: parentRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const scrollToTopOfLast = useCallback((behavior: 'auto' | 'smooth' = 'smooth') => {
    if (entries.length > 0) {
      virtualizer.scrollToIndex(entries.length - 1, {
        align: 'start',
        behavior,
      });
    }
  }, [entries.length, virtualizer]);

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
    pendingUpdateRef.current = {
      entries: newEntries,
      addType,
      loading: newLoading,
    };

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const pending = pendingUpdateRef.current;
      if (!pending) return;

      // Determine scroll mode
      if (pending.addType === 'plan' && !loading) {
        scrollModeRef.current = 'top-of-last';
      } else if (pending.addType === 'running' && !loading && isAtBottom) {
        scrollModeRef.current = 'bottom';
      } else if (prevEntriesLengthRef.current === 0) {
        scrollModeRef.current = 'bottom';
      } else {
        scrollModeRef.current = 'none';
      }

      setEntriesState(pending.entries);
      setEntries(pending.entries);

      if (loading) {
        setLoading(pending.loading);
      }
    }, 100);
  }, [loading, isAtBottom, setEntries]);

  useConversationHistory({ attempt, onEntriesUpdated });

  // Handle scrolling after entries update
  useEffect(() => {
    if (entries.length > prevEntriesLengthRef.current || prevEntriesLengthRef.current === 0) {
      requestAnimationFrame(() => {
        if (scrollModeRef.current === 'bottom') {
          scrollToBottom(prevEntriesLengthRef.current === 0 ? 'auto' : 'smooth');
        } else if (scrollModeRef.current === 'top-of-last') {
          scrollToTopOfLast('smooth');
        }
      });
    }
    prevEntriesLengthRef.current = entries.length;
  }, [entries.length, scrollToBottom, scrollToTopOfLast]);

  // Determine if content is ready to show (has data or finished loading)
  const hasContent = !loading || entries.length > 0;

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
        <NewDisplayConversationEntry
          expansionKey={data.patchKey}
          entry={data.content}
          executionProcessId={data.executionProcessId}
          taskAttempt={attempt}
        />
      );
    }
    return null;
  };

  return (
    <ApprovalFormProvider>
      <div
        className={cn(
          'h-full transition-opacity duration-300',
          hasContent ? 'opacity-100' : 'opacity-0'
        )}
      >
        <div
          ref={parentRef}
          className="h-full overflow-auto scrollbar-none"
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
      </div>
    </ApprovalFormProvider>
  );
}

export default ConversationList;
