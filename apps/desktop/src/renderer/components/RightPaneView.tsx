import {useEffect, useRef, useState} from 'react';
import {Tabs, TabsContent, TabsList, TabsTrigger} from './ui/tabs';
import {TerminalGrid} from './TerminalGrid';
import {GitDiffView} from './GitDiffView';
import {Bot, GitBranch, Terminal} from 'lucide-react';
import {type AgentCommand, getAgentCommandForWorktree} from '@/services/worktreeAgentCommands';
import {isRightPaneTab, type RightPaneTab} from './rightPaneTabs';
import {EventType, onEvent} from "@/event";

interface RightPaneViewProps {
  worktreePath: string;
  projectId?: string;
  theme?: 'light' | 'dark';
  isProjectRootWorktree?: boolean;
}

export function RightPaneView({
  worktreePath,
  projectId,
  theme,
  isProjectRootWorktree
}: RightPaneViewProps) {
  const [activeTab, setActiveTab] = useState<RightPaneTab>('terminal');
  const [agentCommandState, setAgentCommandState] = useState<{
    worktreePath: string;
    loaded: boolean;
    command?: AgentCommand;
  }>({ worktreePath, loaded: false });
  const agentCommandLoaded =
    agentCommandState.worktreePath === worktreePath && agentCommandState.loaded;
  const agentCommand =
    agentCommandState.worktreePath === worktreePath ? agentCommandState.command : undefined;
  const agentTabOpenedForWorktree = useRef<string | null>(null);

  // Fired by the Worktree menu accelerator; only the visible pane is mounted
  useEffect(() => {
    const toggle = () => setActiveTab((tab) => (tab === 'terminal' ? 'git-diff' : 'terminal'));
    return onEvent(EventType.TOGGLE_VIEW, toggle)
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey) {
        return
      }
      event.preventDefault()
      const indexTabMapping: Record<string, RightPaneTab> = {
        '1': 'agent',
        '2': 'terminal',
        '3': 'git-diff'
      }
      if (indexTabMapping[event.key]) {
        setActiveTab(indexTabMapping[event.key])
      }
    }
    return onEvent('keydown', onKeyDown)
  }, []);

  useEffect(() => {
    let cancelled = false;
    setAgentCommandState({ worktreePath, loaded: false });

    getAgentCommandForWorktree(worktreePath)
      .then((command) => {
        if (cancelled) return;

        const agentCommand = command ?? (isProjectRootWorktree ? 'codex' : undefined);
        setAgentCommandState({ worktreePath, loaded: true, command: agentCommand });
        if (agentCommand && agentTabOpenedForWorktree.current !== worktreePath) {
          agentTabOpenedForWorktree.current = worktreePath;
          setActiveTab('agent');
          return;
        }

        if (!agentCommand) {
          setActiveTab((tab) => (tab === 'agent' ? 'terminal' : tab));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgentCommandState({ worktreePath, loaded: true });
          setActiveTab((tab) => (tab === 'agent' ? 'terminal' : tab));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isProjectRootWorktree, worktreePath]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (isRightPaneTab(value)) setActiveTab(value);
        }}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="border-b border-border/60 flex items-center h-10 px-2 flex-shrink-0">
          <TabsList className="h-7 bg-muted p-0.5 rounded-md gap-0.5">
            <TabsTrigger
              value="agent"
              className="h-6 rounded px-4 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
            >
              <Bot className="h-3.5 w-3.5" />
              Agent
            </TabsTrigger>
            <TabsTrigger
              value="terminal"
              className="h-6 rounded px-4 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
            >
              <Terminal className="h-3.5 w-3.5" />
              Terminal
            </TabsTrigger>
            <TabsTrigger
              value="git-diff"
              className="h-6 rounded px-4 text-xs font-medium text-muted-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center gap-1.5"
            >
              <GitBranch className="h-3.5 w-3.5" />
              Changes
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="terminal" className="flex-1 m-0 h-full min-h-0">
          {agentCommandLoaded && (
            <TerminalGrid worktreePath={worktreePath} projectId={projectId} theme={theme} />
          )}
        </TabsContent>

        <TabsContent value="agent" className="flex-1 m-0 h-full min-h-0">
          {agentCommandLoaded && (agentCommand || activeTab === 'agent') && (
            <TerminalGrid
              worktreePath={worktreePath}
              projectId={projectId}
              theme={theme}
              cacheKey={`${worktreePath}:agent`}
              initialCommand={agentCommand}
            />
          )}
        </TabsContent>

        <TabsContent value="git-diff" className="flex-1 m-0 h-full min-h-0">
          <GitDiffView worktreePath={worktreePath} theme={theme} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
