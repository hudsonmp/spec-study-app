'use client';

type Item = { id: string; name: string; visibility: string };

export default function ProjectPicker({
  studies,
  activeId,
}: {
  studies: Item[];
  activeId: string;
}) {
  return (
    <select
      value={activeId}
      onChange={(e) => {
        window.location.href = `/create/script?p=${e.target.value}`;
      }}
      className="border border-[var(--rule)] px-2 py-1 bg-white text-sm"
    >
      {studies.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} ({s.visibility})
        </option>
      ))}
    </select>
  );
}
