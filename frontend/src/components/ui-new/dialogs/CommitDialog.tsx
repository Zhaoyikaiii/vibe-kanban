import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { GitCommitIcon, SparkleIcon, SpinnerIcon } from '@phosphor-icons/react';
import { defineModal } from '@/lib/modals';
import { repoApi } from '@/lib/api';
import type { RepoWorkingStatus } from 'shared/types';

export interface CommitDialogProps {
  repoId: string;
  repoName: string;
  status: RepoWorkingStatus;
  /** Optional callback to generate commit message using AI */
  onGenerateMessage?: () => Promise<string>;
}

export interface CommitDialogResult {
  action: 'committed' | 'canceled';
  commitSha?: string;
}

const CommitDialogImpl = NiceModal.create<CommitDialogProps>((props) => {
  const modal = useModal();
  const { repoId, repoName, status, onGenerateMessage } = props;

  const [message, setMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCommit = async () => {
    if (!message.trim()) {
      setError('Commit message is required');
      return;
    }

    setIsCommitting(true);
    setError(null);

    try {
      const result = await repoApi.commit(repoId, { message: message.trim() });
      modal.resolve({
        action: 'committed',
        commitSha: result.commit_sha,
      } as CommitDialogResult);
      modal.hide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleGenerate = async () => {
    if (!onGenerateMessage) return;

    setIsGenerating(true);
    setError(null);

    try {
      const generatedMessage = await onGenerateMessage();
      setMessage(generatedMessage);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate commit message'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    modal.resolve({ action: 'canceled' } as CommitDialogResult);
    modal.hide();
  };

  const totalChanges = status.uncommitted_files + status.untracked_files;

  return (
    <Dialog open={modal.visible} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <GitCommitIcon className="h-6 w-6 text-brand" weight="fill" />
            <DialogTitle>Commit Changes</DialogTitle>
          </div>
          <DialogDescription className="text-left pt-2">
            Commit {totalChanges} changed file{totalChanges !== 1 ? 's' : ''} in{' '}
            <span className="font-medium text-normal">{repoName}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Changed files preview */}
          {status.changed_files.length > 0 && (
            <div className="rounded-md border bg-secondary/50 p-3 max-h-32 overflow-y-auto">
              <div className="text-xs text-low mb-2">Changed files:</div>
              <div className="space-y-1">
                {status.changed_files.slice(0, 10).map((file) => (
                  <div key={file} className="text-xs font-mono truncate">
                    {file}
                  </div>
                ))}
                {status.changed_files.length > 10 && (
                  <div className="text-xs text-low">
                    ...and {status.changed_files.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Commit message input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="commit-message">Commit Message</Label>
              {onGenerateMessage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={isGenerating || isCommitting}
                  className="h-7 text-xs"
                >
                  {isGenerating ? (
                    <SpinnerIcon className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <SparkleIcon className="h-3 w-3 mr-1" />
                  )}
                  Generate with AI
                </Button>
              )}
            </div>
            <Textarea
              id="commit-message"
              placeholder="feat: add new feature&#10;&#10;Describe your changes here..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[120px] font-mono text-sm"
              disabled={isCommitting}
            />
            <p className="text-xs text-low">
              Use conventional commit format: type(scope): description
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={isCommitting}>
            Cancel
          </Button>
          <Button
            onClick={handleCommit}
            disabled={isCommitting || !message.trim()}
          >
            {isCommitting ? (
              <>
                <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <GitCommitIcon className="h-4 w-4 mr-2" />
                Commit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export const CommitDialog = defineModal<CommitDialogProps, CommitDialogResult>(
  CommitDialogImpl
);
