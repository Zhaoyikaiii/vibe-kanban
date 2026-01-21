import type { RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchInput,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './Dropdown';

export interface VirtualListHandle {
  scrollToIndex: (index: number, behavior?: 'auto' | 'smooth') => void;
}

interface SearchableDropdownProps<T> {
  /** Array of filtered items to display */
  filteredItems: T[];
  /** Currently selected value (matched against getItemKey) */
  selectedValue?: string | null;

  /** Extract unique key from item */
  getItemKey: (item: T) => string;
  /** Extract display label from item */
  getItemLabel: (item: T) => string;

  /** Called when an item is selected */
  onSelect: (item: T) => void;

  /** Trigger element (uses asChild pattern) */
  trigger: React.ReactNode;

  /** Search state */
  searchTerm: string;
  onSearchTermChange: (value: string) => void;

  /** Highlight state */
  highlightedIndex: number | null;
  onHighlightedIndexChange: (index: number | null) => void;

  /** Open state */
  open: boolean;
  onOpenChange: (open: boolean) => void;

  /** Keyboard handler */
  onKeyDown: (e: React.KeyboardEvent) => void;

  /** Virtual list ref for scrolling */
  virtualListRef: RefObject<VirtualListHandle | null>;

  /** Class name for dropdown content */
  contentClassName?: string;
  /** Placeholder text for search input */
  placeholder?: string;
  /** Message shown when no items match */
  emptyMessage?: string;

  /** Optional badge text for each item */
  getItemBadge?: (item: T) => string | undefined;
}

export function SearchableDropdown<T>({
  filteredItems,
  selectedValue,
  getItemKey,
  getItemLabel,
  onSelect,
  trigger,
  searchTerm,
  onSearchTermChange,
  highlightedIndex,
  onHighlightedIndexChange,
  open,
  onOpenChange,
  onKeyDown,
  virtualListRef,
  contentClassName,
  placeholder = 'Search',
  emptyMessage = 'No items found',
  getItemBadge,
}: SearchableDropdownProps<T>) {
  const parentRef = { current: null as HTMLDivElement | null };

  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 5,
    getItemKey: (index) => getItemKey(filteredItems[index]) ?? String(index),
  });

  // Expose scrollToIndex method via ref
  if (virtualListRef) {
    (virtualListRef as React.MutableRefObject<VirtualListHandle | null>).current = {
      scrollToIndex: (index: number, behavior: 'auto' | 'smooth' = 'auto') => {
        virtualizer.scrollToIndex(index, {
          align: 'center',
          behavior,
        });
      },
    };
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent className={contentClassName}>
        <DropdownMenuSearchInput
          placeholder={placeholder}
          value={searchTerm}
          onValueChange={onSearchTermChange}
          onKeyDown={onKeyDown}
        />
        <DropdownMenuSeparator />
        {filteredItems.length === 0 ? (
          <div className="px-base py-half text-sm text-low text-center">
            {emptyMessage}
          </div>
        ) : (
          <div
            ref={(el) => { parentRef.current = el; }}
            style={{ height: '16rem', overflow: 'auto' }}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualItem) => {
                const item = filteredItems[virtualItem.index];
                const key = getItemKey(item);
                const isHighlighted = virtualItem.index === highlightedIndex;
                const isSelected = selectedValue === key;
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
                    <DropdownMenuItem
                      onSelect={() => onSelect(item)}
                      onMouseEnter={() => onHighlightedIndexChange(virtualItem.index)}
                      preventFocusOnHover
                      badge={getItemBadge?.(item)}
                      className={cn(
                        isSelected && 'bg-secondary',
                        isHighlighted && 'bg-secondary'
                      )}
                    >
                      {getItemLabel(item)}
                    </DropdownMenuItem>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
