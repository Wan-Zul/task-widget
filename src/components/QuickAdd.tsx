import { useState } from "react";

interface Props {
  onAdd: (title: string) => void;
}

export function QuickAdd({ onAdd }: Props) {
  const [value, setValue] = useState("");

  return (
    <input
      id="quick-add"
      className="quick-add"
      placeholder="Add a task…"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) {
          onAdd(value.trim());
          setValue("");
        } else if (e.key === "Escape") {
          setValue("");
        }
      }}
    />
  );
}
