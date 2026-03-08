import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FrontmatterModel } from '../../types/models';

type Props = {
  frontmatter: FrontmatterModel;
  onChange: (f: FrontmatterModel) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function MetadataPanel({ frontmatter, onChange, collapsed, onToggleCollapsed }: Props) {
  const [tagsInput, setTagsInput] = useState((frontmatter.tags ?? []).join(', '));

  useEffect(() => {
    setTagsInput((frontmatter.tags ?? []).join(', '));
  }, [frontmatter.tags]);

  if (collapsed) {
    return (
      <aside className="hidden border-l border-slate-200 bg-white lg:flex lg:w-12 lg:flex-col lg:items-center lg:py-3">
        <button
          className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
          onClick={onToggleCollapsed}
          aria-label="Expand metadata panel"
          title="Expand metadata panel"
        >
          <PanelRightOpen size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="hidden border-l border-slate-200 bg-white p-4 lg:block">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Metadata</h3>
        <button
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          onClick={onToggleCollapsed}
          aria-label="Collapse metadata panel"
          title="Collapse metadata panel"
        >
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="space-y-3">
        <label className="block text-xs text-slate-500">Title
          <input className="input mt-1" value={frontmatter.title ?? ''} onChange={(e) => onChange({ ...frontmatter, title: e.target.value })} />
        </label>
        <label className="block text-xs text-slate-500">Tags (comma separated)
          <input
            className="input mt-1"
            value={tagsInput}
            onChange={(e) => {
              const next = e.target.value;
              setTagsInput(next);
              onChange({ ...frontmatter, tags: next.split(',').map((x) => x.trim()).filter(Boolean) });
            }}
            onBlur={() => setTagsInput((frontmatter.tags ?? []).join(', '))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!frontmatter.template}
            onChange={(e) =>
              onChange({
                ...frontmatter,
                template: e.target.checked,
                templateType: e.target.checked ? (frontmatter.templateType ?? 'file') : undefined,
              })
            }
          />
          Template
        </label>
        <label className="block text-xs text-slate-500">Template type
          <select
            className="input mt-1"
            value={frontmatter.templateType ?? ''}
            onChange={(e) =>
              onChange({
                ...frontmatter,
                template: true,
                templateType: (e.target.value || undefined) as 'file' | 'snippet' | undefined,
              })
            }
          >
            <option value="">None</option>
            <option value="file">File</option>
            <option value="snippet">Snippet</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50"
            onClick={() => onChange({ ...frontmatter, template: true, templateType: frontmatter.templateType ?? 'file' })}
          >
            Add template type
          </button>
          <button
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs hover:bg-slate-50"
            onClick={() => onChange({ ...frontmatter, template: false, templateType: undefined })}
          >
            Delete template type
          </button>
        </div>
      </div>
    </aside>
  );
}
