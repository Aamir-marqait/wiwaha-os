import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Tiny, safe renderer for the markdown agents produce (### headings, - lists,
 * **bold**, _italic_, [links](/internal)). Builds React elements, never HTML
 * strings, so agent output can't inject markup.
 */
export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`ul-${blocks.length}`}>{list}</ul>);
    list = [];
  };
  source.split("\n").forEach((line, i) => {
    const t = line.trimEnd();
    if (t.startsWith("### ")) {
      flush();
      blocks.push(<h3 key={i}>{inline(t.slice(4))}</h3>);
    } else if (t.startsWith("- ")) {
      list.push(<li key={i}>{inline(t.slice(2))}</li>);
    } else if (t.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(<p key={i}>{inline(t)}</p>);
    }
  });
  flush();
  return <div className="prose-wiwaha text-[15px] text-ink">{blocks}</div>;
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|_(.+?)_|\[(.+?)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={m.index}>{m[2]}</em>);
    else if (m[3] && m[4]) out.push(<Link key={m.index} href={m[4]}>{m[3]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
