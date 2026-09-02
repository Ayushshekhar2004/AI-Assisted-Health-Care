import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { getAIProvider, getOllamaConfig } from '../../lib/ai/provider-config';
import { getSupabaseAdminConfig } from '../../lib/supabase/admin-config';
import { createRoleAuthorizedClient } from '../auth';
import { getLiveKitConfig } from '../consultation';

import { getRecentFailureCounts } from './server';
import { collectReadiness, type ReadinessProbe } from './readiness';

const PROBE_TIMEOUT_MS = 3_000;

async function timedFetch(url: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
}

function createPrivilegedClient() {
  const { secretKey, url } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createAIProbe(): ReadinessProbe {
  return async () => {
    if (getAIProvider() === 'ollama') {
      if (!process.env.OLLAMA_BASE_URL || !process.env.OLLAMA_MODEL) {
        return 'UNCONFIGURED';
      }
      const { baseUrl, model } = getOllamaConfig();
      const response = await timedFetch(`${baseUrl}/api/tags`);
      if (!response.ok) throw new Error('AI readiness failed');
      const body = z
        .object({
          models: z.array(z.object({ name: z.string() }).passthrough()),
        })
        .passthrough()
        .parse(await response.json());
      if (!body.models.some(({ name }) => name === model)) {
        throw new Error('AI model unavailable');
      }
      return 'READY';
    }

    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_INTAKE_MODEL) {
      return 'UNCONFIGURED';
    }
    const config = z
      .object({ apiKey: z.string().min(20), model: z.string().min(1).max(120) })
      .parse({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_INTAKE_MODEL,
      });
    const response = await timedFetch(
      `https://api.openai.com/v1/models/${encodeURIComponent(config.model)}`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    );
    if (!response.ok) throw new Error('AI readiness failed');
    return 'READY';
  };
}

function createVideoProbe(): ReadinessProbe {
  return async () => {
    if (
      !process.env.LIVEKIT_URL ||
      !process.env.LIVEKIT_API_KEY ||
      !process.env.LIVEKIT_API_SECRET
    ) {
      return 'UNCONFIGURED';
    }
    const { serverUrl } = getLiveKitConfig();
    const healthUrl = new URL(serverUrl);
    healthUrl.protocol = 'https:';
    const response = await timedFetch(healthUrl.toString());
    if (response.status >= 500) throw new Error('Video readiness failed');
    return 'READY';
  };
}

export async function getOperationsHealthDashboard() {
  await createRoleAuthorizedClient(
    ['operations'],
    'Service health is unavailable',
  );

  const privileged = createPrivilegedClient();
  const database: ReadinessProbe = async () => {
    const { error } = await privileged
      .from('profiles')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error('Database readiness failed');
    return 'READY';
  };
  const storage: ReadinessProbe = async () => {
    const { error } = await privileged.storage.listBuckets();
    if (error) throw new Error('Storage readiness failed');
    return 'READY';
  };

  return {
    readiness: await collectReadiness({
      database,
      storage,
      ai: createAIProbe(),
      video: createVideoProbe(),
    }),
    recentFailures: getRecentFailureCounts(),
    failureWindowMinutes: 15,
  } as const;
}
