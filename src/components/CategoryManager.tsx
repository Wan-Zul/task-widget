import { useState } from "react";
import { createCategory, deleteCategory, updateCategory, type Category } from "../db/tasks";

interface Props {
  categories: Category[];
  onChanged: () => void;
  onError: (e: unknown) => void;
}

export function CategoryManager({ categories, onChanged, onError }: Props) {
  const [newName, setNewName] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const run = (fn: () => Promise<unknown>) => fn().then(onChanged, onError);

  return (
    <div className="categories">
      {categories.map((c) => (
        <div key={c.id} className="category-row">
          <input
            type="color"
            value={c.color}
            aria-label={`${c.name} colour`}
            onChange={(e) => run(() => updateCategory(c.id, { color: e.target.value }))}
          />
          <input
            className="category-name"
            defaultValue={c.name}
            aria-label="Category name"
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (!name) e.target.value = c.name;
              else if (name !== c.name) run(() => updateCategory(c.id, { name }));
            }}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
          <button
            className="icon-btn"
            title={confirmId === c.id ? "Click again to delete (tasks keep existing)" : "Delete category"}
            onClick={() => (confirmId === c.id ? run(() => deleteCategory(c.id)) : setConfirmId(c.id))}
            onBlur={() => setConfirmId(null)}
          >
            {confirmId === c.id ? "Sure?" : "✕"}
          </button>
        </div>
      ))}
      <form
        className="category-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          if (categories.some((c) => c.name.toLowerCase() === newName.trim().toLowerCase())) {
            onError(`"${newName.trim()}" already exists.`);
            return;
          }
          run(() => createCategory(newName)).then(() => setNewName(""));
        }}
      >
        <span className="category-swatch-spacer" />
        <input
          className="category-name"
          placeholder="New category…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button type="submit" className="icon-btn" title="Add category">
          +
        </button>
      </form>
    </div>
  );
}
