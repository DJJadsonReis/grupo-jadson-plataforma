import { useState } from "react";
import { markTourDone, nextStepIndex, previousStepIndex, readTourDone, shouldShowTour, STARTER_TOUR_STEPS, type TourPageId } from "../../lib/starter-tour";

export type { TourPageId } from "../../lib/starter-tour";

export function StarterTour({ onNavigate }: { onNavigate: (pageId: TourPageId) => void }) {
  const [visible, setVisible] = useState(() => {
    const result = readTourDone((key) => window.localStorage.getItem(key));
    return shouldShowTour(result.stored, result.storageFailed);
  });
  const [stepIndex, setStepIndex] = useState(0);
  if (!visible) return null;

  const step = STARTER_TOUR_STEPS[stepIndex]!;
  const finish = () => {
    markTourDone((key, value) => window.localStorage.setItem(key, value));
    setVisible(false);
  };
  const move = (nextIndex: number) => {
    setStepIndex(nextIndex);
    onNavigate(STARTER_TOUR_STEPS[nextIndex]!.pageId);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center", background: "rgba(0, 0, 0, 0.48)" }}>
      <section role="dialog" aria-modal="true" aria-labelledby="starter-tour-title" style={{ width: "min(420px, calc(100vw - 32px))", padding: 24, borderRadius: 16, background: "var(--surface, #202020)", color: "var(--text, #fff)", boxShadow: "0 20px 70px rgba(0,0,0,.4)" }}>
        <span>Passo {stepIndex + 1} de {STARTER_TOUR_STEPS.length}</span>
        <h2 id="starter-tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 24 }}>
          <button type="button" onClick={finish}>Pular</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => move(previousStepIndex(stepIndex))} disabled={stepIndex === 0}>Voltar</button>
            {stepIndex < STARTER_TOUR_STEPS.length - 1
              ? <button type="button" autoFocus onClick={() => move(nextStepIndex(stepIndex))}>Próximo</button>
              : <button type="button" autoFocus onClick={finish}>Concluir</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
