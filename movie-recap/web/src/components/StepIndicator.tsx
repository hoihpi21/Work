import { Check } from "lucide-react";

interface Props {
  currentStep: number;
  maxUnlockedStep: number;
  onSelect: (step: number) => void;
}

const STEPS = [
  { id: 1, label: "1. Video URL" },
  { id: 2, label: "2. Language & Transcript" },
  { id: 3, label: "3. Burmese Script" },
  { id: 4, label: "4. Voice-Over Studio" },
  { id: 5, label: "5. Download Video" },
];

export function StepIndicator({ currentStep, maxUnlockedStep, onSelect }: Props) {
  return (
    <div className="stepper" role="tablist" aria-label="Recap workflow steps">
      {STEPS.map((s) => {
        const isActive = currentStep === s.id;
        const isDone = s.id < maxUnlockedStep && !isActive;
        return (
          <button
            key={s.id}
            type="button"
            className={`step-pill ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
            disabled={s.id > maxUnlockedStep}
            onClick={() => onSelect(s.id)}
          >
            <span className="step-num">
              {isDone ? <Check size={14} /> : s.id}
            </span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
