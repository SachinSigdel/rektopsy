"use client";

import { useEffect, useState } from "react";

export type NavGroup = { title: string; items: { id: string; label: string }[] };

// Sticky sidebar that highlights the section being read: the last one whose top
// has scrolled past the upper part of the screen.
export default function DocsNav({ groups }: { groups: NavGroup[] }) {
  const [active, setActive] = useState(groups[0]?.items[0]?.id ?? "");

  useEffect(() => {
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      // At the very bottom, the last short sections can't reach the top: pick the last one.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = ids[ids.length - 1];
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [groups]);

  return (
    <nav aria-label="Docs" className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <span className="eyebrow mb-1.5">{g.title}</span>
          {g.items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={`-ml-px border-l py-1 pl-3 text-[13.5px] no-underline transition-colors ${
                active === item.id
                  ? "border-fail !text-text"
                  : "border-line !text-muted hover:border-muted hover:!text-text"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}
