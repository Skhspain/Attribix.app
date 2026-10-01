// A short guided tour of Overview: highlights one section at a time.
import { useEffect } from "react";
import { Button, InlineStack, Text, BlockStack } from "@shopify/polaris";

export type TourStep = { target: string; title: string; text: string };

export function OverviewTour({ steps, step, onStep, onEnd }: {
  steps: TourStep[]; step: number; onStep: (n: number) => void; onEnd: () => void;
}) {
  const current = steps[step];

  const target = current?.target;
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target);
    if (!el) return;
    const prev = { position: el.style.position, zIndex: el.style.zIndex, boxShadow: el.style.boxShadow, borderRadius: el.style.borderRadius };
    el.style.position = "relative";
    el.style.zIndex = "521";
    el.style.boxShadow = "0 0 0 3px #2b59c3, 0 10px 30px rgba(0,0,0,.25)";
    el.style.borderRadius = "12px";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    return () => { Object.assign(el.style, prev); };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onEnd(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEnd]);

  if (!current) return null;
  const last = step === steps.length - 1;
  return (
    <>
      <div onClick={onEnd} style={{ position: "fixed", inset: 0, background: "rgba(10,12,16,.45)", zIndex: 520 }} />
      <div role="dialog" aria-label="Overview tour" style={{
        position: "fixed", zIndex: 522, left: "50%", transform: "translateX(-50%)", bottom: 16,
        width: "min(440px, calc(100% - 32px))", background: "#fff", borderRadius: 12, padding: 16,
        boxShadow: "0 12px 40px rgba(0,0,0,.3)",
      }}>
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">{current.title}</Text>
          <Text as="p" variant="bodyMd" tone="subdued">{current.text}</Text>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodySm" tone="subdued">{step + 1} of {steps.length}</Text>
            <InlineStack gap="200">
              <Button size="slim" onClick={onEnd}>Skip</Button>
              {step > 0 && <Button size="slim" onClick={() => onStep(step - 1)}>Back</Button>}
              <Button size="slim" variant="primary" onClick={() => (last ? onEnd() : onStep(step + 1))}>{last ? "Finish" : "Next"}</Button>
            </InlineStack>
          </InlineStack>
        </BlockStack>
      </div>
    </>
  );
}
