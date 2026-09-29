import { useLayoutEffect, useRef, useState } from "react";
import type { Rect } from "@/lib/flow-geometry";

export interface FlowLayout {
  width: number;
  height: number;
  junction: Rect;
  // Keyed by the `data-node-id` of each measured node.
  nodes: Partial<Record<string, Rect>>;
}

function relativeRect(element: Element, stage: DOMRect): Rect {
  const rect = element.getBoundingClientRect();
  return { left: rect.left - stage.left, top: rect.top - stage.top, width: rect.width, height: rect.height };
}

// Measures the stage, the junction (`[data-flow-junction]`) and every node (`[data-node-id]`) inside it, relative to
// the stage. Nothing is measured during render: the first layout arrives from the ResizeObserver after mount (it
// reports every observed element once on `observe`), so the server render and the first client render match and
// carry no connector lines. `enabled` re-attaches the observer when the stage is mounted or unmounted.
export function useFlowLines(enabled: boolean) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<FlowLayout | null>(null);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!enabled || !stage) return;

    const measure = () => {
      const junction = stage.querySelector("[data-flow-junction]");
      if (!junction) return;
      const stageRect = stage.getBoundingClientRect();
      const nodes: Partial<Record<string, Rect>> = {};
      stage.querySelectorAll<HTMLElement>("[data-node-id]").forEach((node) => {
        const id = node.dataset.nodeId;
        if (id) nodes[id] = relativeRect(node, stageRect);
      });
      setLayout({
        width: stageRect.width,
        height: stageRect.height,
        junction: relativeRect(junction, stageRect),
        nodes,
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage.querySelectorAll("[data-node-id], [data-flow-junction]").forEach((element) => {
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
    };
  }, [enabled]);

  return { stageRef, layout };
}
