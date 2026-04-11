import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const BASE_Z = 80;
const STEP = 5;
const MAX_DEPTH = 4;

interface LayerEntry {
  panelId: string;
  type: string;
}

interface ZLayerContextValue {
  requestLayer: (panelId: string, type: string) => void;
  releaseLayer: (panelId: string) => void;
  getZIndex: (panelId: string) => number;
}

const ZLayerContext = createContext<ZLayerContextValue | null>(null);

export function ZLayerProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<LayerEntry[]>([]);

  const requestLayer = useCallback((panelId: string, type: string) => {
    setStack((prev) => {
      const existingIndex = prev.findIndex((e) => e.panelId === panelId);
      if (existingIndex !== -1) {
        const entry = prev[existingIndex];
        const without = prev.filter((_, i) => i !== existingIndex);
        return [...without, entry];
      }
      const truncated = prev.length >= MAX_DEPTH ? prev.slice(1) : prev;
      return [...truncated, { panelId, type }];
    });
  }, []);

  const releaseLayer = useCallback((panelId: string) => {
    setStack((prev) => prev.filter((e) => e.panelId !== panelId));
  }, []);

  const getZIndex = useCallback(
    (panelId: string): number => {
      const idx = stack.findIndex((e) => e.panelId === panelId);
      if (idx === -1) return BASE_Z;
      return BASE_Z + idx * STEP;
    },
    [stack]
  );

  const value = useMemo(
    () => ({ requestLayer, releaseLayer, getZIndex }),
    [requestLayer, releaseLayer, getZIndex]
  );

  return (
    <ZLayerContext.Provider value={value}>{children}</ZLayerContext.Provider>
  );
}

export function useZLayer(
  panelId: string,
  type: string,
  open: boolean
): { zIndex: number } {
  const ctx = useContext(ZLayerContext);

  useEffect(() => {
    if (!ctx || !panelId || !open) return;
    ctx.requestLayer(panelId, type);
    return () => {
      ctx.releaseLayer(panelId);
    };
  }, [panelId, open]);

  if (!ctx || !panelId) return { zIndex: BASE_Z };
  return { zIndex: ctx.getZIndex(panelId) };
}
