import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';

const STORAGE_KEY = 'worktreePanelWidth';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

export function useWorktreePanelWidth() {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    const savedWidth = localStorage.getItem(STORAGE_KEY);
    if (!savedWidth) return;

    const width = parseInt(savedWidth, 10);
    if (!isNaN(width)) {
      setPanelWidth(width);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, panelWidth.toString());
  }, [panelWidth]);

  const handleResizeMouseDown = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      setPanelWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, event.clientX)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  return { panelWidth, isResizing, handleResizeMouseDown };
}
