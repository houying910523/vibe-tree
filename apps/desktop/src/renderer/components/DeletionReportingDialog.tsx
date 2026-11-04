import { ScrollArea } from './ui/scroll-area';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';

interface DeletionStep {
  message: string;
  status: 'pending' | 'in-progress' | 'success' | 'error';
  error?: string;
}

interface DeletionReportingToastProps {
  branchName: string;
  worktreePath: string;
  steps: DeletionStep[];
}

export function DeletionReportingToast({
  branchName,
  worktreePath,
  steps
}: DeletionReportingToastProps) {
  return (
    <div className="mt-2 space-y-3">
      <div className="rounded-md border bg-muted/50 p-3 text-xs">
        <p>
          <strong>Branch:</strong> {branchName}
        </p>
        <p className="break-all">
          <strong>Path:</strong> {worktreePath}
        </p>
      </div>

      <ScrollArea className="max-h-56 w-full rounded-md border p-3">
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0">
                {step.status === 'pending' && (
                  <div className="h-4 w-4 rounded-full border-2 border-muted" />
                )}
                {step.status === 'in-progress' && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                )}
                {step.status === 'success' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {step.status === 'error' && (
                  <XCircle className="h-4 w-4 text-red-500 group-[.destructive]:text-destructive-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{step.message}</p>
                {step.error && (
                  <p className="mt-1 text-xs text-red-500 group-[.destructive]:text-destructive-foreground">
                    {step.error}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
