import { useMemo, useState } from 'react';
import {
  clearRuntimeSupabaseConfig,
  getRuntimeSupabaseConfig,
  getSupabaseSetupState,
  saveRuntimeSupabaseConfig,
  supabase,
} from '../../lib/supabase';
import { initializeStarterWorkspace } from '../../lib/dataApi';
import { checkSchemaHealth, toUserFacingBootstrapError } from '../../lib/schemaHealth';
import { getSupabaseProvisioningStatus, startSupabaseProvisioning } from '../../lib/setupApi';

type Props = {
  onReady: () => void;
};


function extractProjectRef(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname;
    if (!host.endsWith('.supabase.co')) return null;
    return host.split('.')[0] ?? null;
  } catch {
    return null;
  }
}

const allowDevPatMode = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_PAT_SETUP === 'true';

export function SetupWizard({ onReady }: Props) {
  const initialState = getSupabaseSetupState();
  const existingRuntimeConfig = getRuntimeSupabaseConfig();
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState(existingRuntimeConfig?.url ?? '');
  const [anonKey, setAnonKey] = useState(existingRuntimeConfig?.anonKey ?? '');
  const [status, setStatus] = useState<string>(initialState.message);
  const [checking, setChecking] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [installingSchema, setInstallingSchema] = useState(false);
  const [accessToken, setAccessToken] = useState('');

  const canSubmitConfig = useMemo(() => url.trim().length > 0 && anonKey.trim().length > 0, [url, anonKey]);
  const projectRef = useMemo(() => extractProjectRef(url), [url]);

  const validateConnection = async () => {
    setChecking(true);
    setStatus('Validating Supabase connection...');
    saveRuntimeSupabaseConfig({ url: url.trim(), anonKey: anonKey.trim() });

    const state = getSupabaseSetupState();
    if (state.status !== 'ready') {
      setStatus(state.message);
      setChecking(false);
      return;
    }

    const { error } = await supabase.auth.getSession();
    if (error) {
      setStatus(`Connection failed: ${error.message}`);
      setChecking(false);
      return;
    }

    const schema = await checkSchemaHealth();
    if (!schema.ok) {
      setStatus(schema.message);
      setChecking(false);
      setStep(4);
      return;
    }

    setStatus('Connection and schema validation succeeded. Continue to initialize your workspace.');
    setChecking(false);
    setStep(4);
  };

  const runBootstrap = async () => {
    setBootstrapping(true);
    const { error } = await initializeStarterWorkspace();
    if (error) {
      setStatus(`Initialization check: ${toUserFacingBootstrapError(error.message)}. This can be run automatically after sign-in.`);
    } else {
      setStatus('Workspace initialization finished successfully.');
    }
    setBootstrapping(false);
  };


  const installSchema = async () => {
    if (!projectRef) {
      setStatus('Could not detect project ID from URL. Expected format: https://<project-ref>.supabase.co');
      return;
    }

    if (allowDevPatMode && !accessToken.trim()) {
      setStatus('Dev mode requires a PAT for backend token exchange when no server PAT is configured.');
      return;
    }

    setInstallingSchema(true);
    setStatus('Starting secure backend provisioning...');

    try {
      const started = await startSupabaseProvisioning({
        projectUrl: url.trim(),
        projectRef,
        devAccessToken: allowDevPatMode ? accessToken.trim() : undefined,
      });

      let isComplete = false;
      while (!isComplete) {
        const current = await getSupabaseProvisioningStatus(started.operationId);
        setStatus(current.message);

        if (current.status === 'failed') {
          throw new Error(current.message);
        }

        if (current.status === 'succeeded') {
          if (current.result?.projectUrl && current.result.anonKey) {
            saveRuntimeSupabaseConfig({ url: current.result.projectUrl, anonKey: current.result.anonKey });
            setUrl(current.result.projectUrl);
            setAnonKey(current.result.anonKey);
          }
          isComplete = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch (error) {
      setStatus(`Schema install failed: ${error instanceof Error ? error.message : 'Unknown error.'}`);
      setInstallingSchema(false);
      return;
    }

    const schema = await checkSchemaHealth();
    if (!schema.ok) {
      setStatus(`Schema install finished, but validation still failed: ${schema.message}`);
      setInstallingSchema(false);
      return;
    }

    setStatus('Schema installed successfully. You can now initialize your workspace.');
    setInstallingSchema(false);
  };

  const finish = () => {
    onReady();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="card w-full max-w-2xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">First-run setup</h1>
          <p className="text-sm text-slate-600">Configure Supabase before using Prompt Manager.</p>
        </div>

        <ol className="grid gap-2 text-sm md:grid-cols-4">
          {['Create project', 'Paste credentials', 'Validate', 'Initialize workspace'].map((label, index) => {
            const active = step === index + 1;
            return (
              <li key={label} className={`rounded border px-3 py-2 ${active ? 'border-slate-900 bg-slate-100' : 'border-slate-200'}`}>
                {index + 1}. {label}
              </li>
            );
          })}
        </ol>

        {step === 1 && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>Create a Supabase project, then open <strong>Project Settings → API</strong> and copy:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Project URL</li>
              <li>anon/public API key</li>
            </ul>
            <div className="flex flex-wrap gap-3">
              <a className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-100" href="https://supabase.com/dashboard/new" target="_blank" rel="noreferrer">Create Supabase project</a>
              <a className="rounded border border-slate-300 px-3 py-2 hover:bg-slate-100" href="https://supabase.com/docs/guides/getting-started" target="_blank" rel="noreferrer">Supabase getting started docs</a>
            </div>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={() => setStep(2)}>Continue</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Current config source: <strong>{initialState.source}</strong>
              {initialState.source === 'env'
                ? ' (configured by host environment variables).'
                : initialState.source === 'runtime'
                  ? ' (stored in this browser, can be switched here).'
                  : ' (not configured yet).'}
            </p>
            <label className="block text-sm">
              Supabase URL
              <input className="input mt-1" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
            </label>
            <label className="block text-sm">
              Supabase anon key
              <textarea className="input mt-1 min-h-28" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={() => setStep(1)}>Back</button>
              <button disabled={!canSubmitConfig} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={() => setStep(3)}>Continue</button>
              <button
                className="rounded border border-rose-300 px-4 py-2 text-sm text-rose-700"
                onClick={() => {
                  clearRuntimeSupabaseConfig();
                  setUrl('');
                  setAnonKey('');
                  setStatus('Runtime credentials reset.');
                }}
              >
                Reset credentials
              </button>
            </div>
          </div>
        )}


        {step === 3 && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>Validate connectivity using <code>auth.getSession()</code>.</p>
            <div className="flex gap-2">
              <button className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={() => setStep(2)}>Back</button>
              <button disabled={checking} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={validateConnection}>Validate connection</button>
              <button className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={() => setStep(4)}>Skip to initialize</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>Run workspace initialization now (recommended). This creates an empty workspace.</p>
            <div className="rounded border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs text-slate-600">No-CLI option: this action calls a backend provisioning endpoint. The browser never receives the backend-managed PAT.</p>
              <p className="mb-2 text-xs text-slate-500">Detected project ref: <strong>{projectRef ?? 'not detected'}</strong></p>
              {allowDevPatMode ? (
                <label className="block text-xs">
                  <span className="font-semibold text-amber-700">Dev-only override:</span> Supabase PAT (never returned to client)
                  <input
                    type="password"
                    className="input mt-1"
                    placeholder="sbp_..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                </label>
              ) : (
                <p className="text-xs text-slate-500">Hosted/prod mode: PAT input is disabled. Configure <code>SUPABASE_MANAGEMENT_PAT</code> on the backend.</p>
              )}
              <button
                disabled={installingSchema || !projectRef}
                className="mt-2 rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-60"
                onClick={installSchema}
              >
                {installingSchema ? 'Installing schema...' : 'Install schema now (secure backend)'}
              </button>
            </div>
            <div className="flex gap-2">
              <button disabled={bootstrapping} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60" onClick={runBootstrap}>Initialize workspace</button>
              <button className="rounded border border-slate-300 px-4 py-2 text-sm" onClick={finish}>Continue to sign-in</button>
              <button className="rounded border border-rose-300 px-4 py-2 text-sm text-rose-700" onClick={clearRuntimeSupabaseConfig}>Reset config</button>
            </div>
          </div>
        )}

        {status && <p className="rounded bg-slate-100 px-3 py-2 text-xs text-slate-600">{status}</p>}
      </div>
    </div>
  );
}
