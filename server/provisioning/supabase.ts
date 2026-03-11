import { randomUUID } from 'node:crypto';

const MIGRATION_SQL = `
create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  parent_id uuid references folders(id) on delete set null,
  name text not null,
  path text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, path)
);

create table if not exists prompt_files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null,
  path text not null,
  content text not null,
  frontmatter_json jsonb,
  is_template boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(workspace_id, path)
);

alter table workspaces enable row level security;
alter table folders enable row level security;
alter table prompt_files enable row level security;

drop policy if exists "workspace owner" on workspaces;
create policy "workspace owner" on workspaces for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "folder by workspace owner" on folders;
create policy "folder by workspace owner" on folders for all using (
  exists(select 1 from workspaces w where w.id = folders.workspace_id and w.owner_id = auth.uid())
);

drop policy if exists "file by workspace owner" on prompt_files;
create policy "file by workspace owner" on prompt_files for all using (
  exists(select 1 from workspaces w where w.id = prompt_files.workspace_id and w.owner_id = auth.uid())
);

create unique index if not exists workspaces_owner_id_unique on workspaces(owner_id);

create or replace function public.initialize_starter_workspace()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  starter_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'initialize_starter_workspace requires an authenticated user';
  end if;

  insert into workspaces (owner_id, name)
  values (current_user_id, 'Workspace')
  on conflict (owner_id) do nothing;

  select id into starter_workspace_id
  from workspaces
  where owner_id = current_user_id
  limit 1;

  if starter_workspace_id is null then
    raise exception 'Failed to resolve workspace for user %', current_user_id;
  end if;

  return starter_workspace_id;
end;
$$;

grant execute on function public.initialize_starter_workspace() to authenticated;
`;

type Pending = {
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  message: string;
  createdAt: string;
  completedAt?: string;
  result?: {
    projectRef: string;
    projectUrl?: string;
    anonKey?: string;
  };
};

type ProvisioningPayload = {
  projectRef?: string;
  projectUrl?: string;
  createProject?: {
    organizationId: string;
    name: string;
    region?: string;
    dbPass?: string;
  };
  devAccessToken?: string;
};

const operations = new Map<string, Pending>();

function extractProjectRef(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    if (!host.endsWith('.supabase.co')) return null;
    return host.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

function canUseDevPat() {
  return process.env.SUPABASE_ALLOW_DEV_PAT === 'true' || process.env.NODE_ENV !== 'production';
}

function resolveManagementToken(payload: ProvisioningPayload): string {
  const envPat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (envPat) return envPat;
  if (canUseDevPat() && payload.devAccessToken) return payload.devAccessToken;
  throw new Error('Management PAT is not configured on backend.');
}

async function supabaseApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.supabase.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

async function createProjectIfRequested(payload: ProvisioningPayload, token: string): Promise<{ projectRef: string; projectUrl?: string; anonKey?: string }> {
  if (!payload.createProject) {
    const providedRef = payload.projectRef ?? (payload.projectUrl ? extractProjectRef(payload.projectUrl) : null);
    if (!providedRef) throw new Error('A projectRef or projectUrl is required when createProject is not requested.');
    return { projectRef: providedRef, projectUrl: payload.projectUrl };
  }

  const created = await supabaseApi<{ id: string; organization_id: string; region: string; name: string }>('/projects', token, {
    method: 'POST',
    body: JSON.stringify({
      organization_id: payload.createProject.organizationId,
      name: payload.createProject.name,
      region: payload.createProject.region ?? 'us-east-1',
      db_pass: payload.createProject.dbPass,
    }),
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const project = await supabaseApi<{ id: string; status?: string; region?: string }> (`/projects/${created.id}`, token);
    if (project.status === 'ACTIVE' || project.status === 'HEALTHY') {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }

  const apiKeys = await supabaseApi<Array<{ api_key: string; name: string }>>(`/projects/${created.id}/api-keys`, token);
  const anon = apiKeys.find((item) => item.name.toLowerCase().includes('anon'));

  return {
    projectRef: created.id,
    projectUrl: `https://${created.id}.supabase.co`,
    anonKey: anon?.api_key,
  };
}

async function installSchema(projectRef: string, token: string): Promise<void> {
  await supabaseApi(`/projects/${projectRef}/database/query`, token, {
    method: 'POST',
    body: JSON.stringify({ query: MIGRATION_SQL }),
  });
}

async function runProvisioning(operationId: string, payload: ProvisioningPayload) {
  const state = operations.get(operationId);
  if (!state) return;

  state.status = 'running';
  state.message = 'Provisioning Supabase project and installing schema...';

  try {
    const token = resolveManagementToken(payload);
    const created = await createProjectIfRequested(payload, token);
    await installSchema(created.projectRef, token);

    state.status = 'succeeded';
    state.message = 'Provisioning complete.';
    state.completedAt = new Date().toISOString();
    state.result = created;
  } catch (error) {
    state.status = 'failed';
    state.completedAt = new Date().toISOString();
    state.message = error instanceof Error ? error.message : 'Unknown provisioning error.';
  }
}

export function startSupabaseProvisioning(payload: ProvisioningPayload) {
  const id = randomUUID();
  operations.set(id, {
    id,
    status: 'pending',
    message: 'Provisioning request accepted.',
    createdAt: new Date().toISOString(),
  });

  void runProvisioning(id, payload);
  return { operationId: id };
}

export function getSupabaseProvisioningStatus(operationId: string) {
  return operations.get(operationId) ?? null;
}
