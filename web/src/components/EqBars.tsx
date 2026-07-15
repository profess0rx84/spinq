const DURATIONS = ["0.7s", "0.6s", "0.8s"];
const DELAYS = ["-0.2s", "-0.5s", "-0.1s"];

export function EqBars({ size = "sm", active = true }: { size?: "sm" | "md"; active?: boolean }) {
  const height = size === "md" ? 14 : 12;
  const width = size === "md" ? 20 : 16;
  return (
    <div className="flex items-end gap-[2px]" style={{ height, width }}>
      {DURATIONS.map((duration, i) => (
        <div
          key={i}
          className={`flex-1 h-full origin-bottom rounded-[1px] bg-accent ${active ? "animate-eqbar" : ""}`}
          style={
            active
              ? { animationDuration: duration, animationDelay: DELAYS[i] }
              : { transform: "scaleY(.3)", opacity: 0.35 }
          }
        />
      ))}
    </div>
  );
}
