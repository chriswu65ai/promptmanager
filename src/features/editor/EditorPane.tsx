import { markdown } from '@codemirror/lang-markdown';
import type { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { Copy, Download, Save, Smile } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { usePromptStore } from '../../hooks/usePromptStore';
import { composeMarkdown, splitFrontmatter } from '../../lib/frontmatter';
import { updateFile } from '../../lib/dataApi';
import type { FrontmatterModel } from '../../types/models';
import { MetadataPanel } from '../metadata/MetadataPanel';
import { useDialog } from '../../components/ui/DialogProvider';

const EMOJIS = ['🔥', '✅', '📌', '🧠', '🚀', '💡', '⚠️', '📊', '🎯', '📝', '🤖', '🔍'];

export function EditorPane() {
  const { files, selectedFileId, refresh } = usePromptStore();
  const dialog = useDialog();
  const file = files.find((f) => f.id === selectedFileId);
  const viewRef = useRef<EditorView | null>(null);
  const [tab, setTab] = useState<'edit' | 'preview' | 'split'>('split');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const parsed = useMemo(() => splitFrontmatter(file?.content ?? ''), [file?.content]);
  const [body, setBody] = useState(parsed.body);
  const [frontmatter, setFrontmatter] = useState<FrontmatterModel>(parsed.frontmatter);

  useEffect(() => {
    setBody(parsed.body);
    setFrontmatter(parsed.frontmatter);
  }, [file?.id, parsed.body, parsed.frontmatter]);

  if (!file) return <div className="flex h-full items-center justify-center text-slate-400">Select a prompt file.</div>;

  const merged = composeMarkdown(frontmatter, body);
  const dirty = merged !== file.content;

  const applySelection = (mapper: (selected: string) => { replacement: string; selectionOffsetStart?: number; selectionOffsetEnd?: number }) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const sel = view.state.selection.main;
    const selected = doc.sliceString(sel.from, sel.to);
    const { replacement, selectionOffsetStart = 0, selectionOffsetEnd = replacement.length } = mapper(selected);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: replacement },
      selection: { anchor: sel.from + selectionOffsetStart, head: sel.from + selectionOffsetEnd },
      scrollIntoView: true,
    });
    view.focus();
  };

  const applyLinePrefix = (prefix: (i: number) => string) => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const sel = view.state.selection.main;
    const startLine = doc.lineAt(sel.from);
    const endLine = doc.lineAt(sel.to);
    const lines: string[] = [];
    for (let i = startLine.number; i <= endLine.number; i += 1) {
      lines.push(doc.line(i).text);
    }
    const replaced = lines.map((line, i) => `${prefix(i)}${line}`).join('\n');
    view.dispatch({
      changes: { from: startLine.from, to: endLine.to, insert: replaced },
      selection: { anchor: startLine.from, head: startLine.from + replaced.length },
      scrollIntoView: true,
    });
    view.focus();
  };

  const downloadCurrent = () => {
    const filename = file.name.toLowerCase().endsWith('.md') ? file.name : `${file.name}.md`;
    const blob = new Blob([merged], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_300px]">
      <section className="flex min-h-0 flex-col">
        <div className="border-b border-slate-200 bg-white px-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {(['edit', 'preview', 'split'] as const).map((t) => (
                <button key={t} className={`rounded-md px-3 py-1 text-xs ${tab === t ? 'bg-slate-900 text-white' : 'bg-slate-100'}`} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button className="rounded-md border px-2 py-1 text-xs" onClick={downloadCurrent}><Download className="mr-1 inline" size={14} />Download</button>
              <button className="rounded-md border px-2 py-1 text-xs" onClick={() => navigator.clipboard.writeText(merged)}><Copy className="mr-1 inline" size={14} />Copy</button>
              <button
                className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                disabled={!dirty}
                onClick={async () => {
                  await updateFile(file.id, {
                    content: merged,
                    frontmatter_json: frontmatter,
                    is_template: !!frontmatter.template,
                    template_type: frontmatter.template ? (frontmatter.templateType ?? null) : null,
                  });
                  await refresh();
                }}
              >
                <Save className="mr-1 inline" size={14} />Save {dirty ? '*' : ''}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2 text-xs">
            <button className="rounded border px-2 py-1" onClick={() => applyLinePrefix(() => '# ')}>H1</button>
            <button className="rounded border px-2 py-1" onClick={() => applyLinePrefix(() => '## ')}>H2</button>
            <button className="rounded border px-2 py-1" onClick={() => applyLinePrefix(() => '### ')}>H3</button>
            <button className="rounded border px-2 py-1" onClick={() => applySelection((s) => ({ replacement: `**${s || 'bold text'}**`, selectionOffsetStart: 2, selectionOffsetEnd: 2 + (s || 'bold text').length }))}>Bold</button>
            <button className="rounded border px-2 py-1" onClick={() => applySelection((s) => ({ replacement: `*${s || 'italic text'}*`, selectionOffsetStart: 1, selectionOffsetEnd: 1 + (s || 'italic text').length }))}>Italic</button>
            <button className="rounded border px-2 py-1" onClick={() => applyLinePrefix((i) => `${i + 1}. `)}>OL</button>
            <button className="rounded border px-2 py-1" onClick={() => applyLinePrefix(() => '- ')}>UL</button>
            <button className="rounded border px-2 py-1" onClick={() => applyLinePrefix(() => '- [ ] ')}>Task</button>
            <button
              className="rounded border px-2 py-1"
              onClick={async () => {
                const r = await dialog.prompt('Insert table', '3', 'Rows');
                if (!r) return;
                const c = await dialog.prompt('Insert table', '3', 'Columns');
                if (!c) return;
                const rows = Math.max(1, Number.parseInt(r, 10) || 1);
                const cols = Math.max(1, Number.parseInt(c, 10) || 1);
                const header = `| ${Array.from({ length: cols }, (_, i) => `Col ${i + 1}`).join(' | ')} |`;
                const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
                const bodyRows = Array.from({ length: rows }, () => `| ${Array.from({ length: cols }, () => ' ').join(' | ')} |`).join('\n');
                applySelection(() => ({ replacement: `${header}\n${sep}\n${bodyRows}` }));
              }}
            >
              Table
            </button>
            <div className="relative">
              <button className="rounded border px-2 py-1" onClick={() => setEmojiOpen((v) => !v)}><Smile className="mr-1 inline" size={12} />Emoji</button>
              {emojiOpen && (
                <div className="absolute left-0 top-8 z-20 grid grid-cols-6 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow">
                  {EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      className="rounded px-1 py-1 hover:bg-slate-100"
                      onClick={() => {
                        applySelection(() => ({ replacement: emoji }));
                        setEmojiOpen(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={`grid min-h-0 flex-1 ${tab === 'split' ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
          {(tab === 'edit' || tab === 'split') && (
            <CodeMirror
              value={body}
              className="min-h-0 flex-1 overflow-auto"
              height="100%"
              extensions={[markdown()]}
              onCreateEditor={(view) => {
                viewRef.current = view;
              }}
              onChange={(v) => setBody(v)}
            />
          )}
          {(tab === 'preview' || tab === 'split') && (
            <div className="prose max-w-none overflow-y-auto border-l border-slate-200 bg-white p-5 text-sm">
              <ReactMarkdown>{merged}</ReactMarkdown>
            </div>
          )}
        </div>
      </section>
      <MetadataPanel frontmatter={frontmatter} onChange={setFrontmatter} />
    </div>
  );
}
