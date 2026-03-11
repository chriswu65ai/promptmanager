export type SupabaseProvisioningResult = {
  projectRef: string;
  projectUrl?: string;
  anonKey?: string;
};

type StartResponse = { operationId: string };

type StatusResponse = {
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  message: string;
  result?: SupabaseProvisioningResult;
};

export async function startSupabaseProvisioning(payload: {
  projectUrl: string;
  projectRef?: string | null;
  devAccessToken?: string;
}) {
  const response = await fetch('/api/setup/supabase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as StartResponse;
}

export async function getSupabaseProvisioningStatus(operationId: string) {
  const response = await fetch(`/api/setup/supabase/${operationId}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as StatusResponse;
}
