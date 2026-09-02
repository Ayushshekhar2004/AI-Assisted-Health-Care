import 'server-only';

import { z } from 'zod';

import { createRoleAuthorizedClient } from '@/modules/auth';

import {
  patientPrivacyRequestSchema,
  privacyRequestInputSchema,
  privacyRequestStatusSchema,
  privacyRequestTransitionSchema,
  privacyRequestTypeSchema,
  privacyResolutionCategorySchema,
  type PatientPrivacyRequest,
} from './privacy-request';

const patientRowSchema = z.object({
  id: z.string().uuid(),
  request_type: privacyRequestTypeSchema,
  status: privacyRequestStatusSchema,
  resolution_category: privacyResolutionCategorySchema.nullable(),
  protected_records_retained: z.literal(true),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

const operationsRowSchema = patientRowSchema.extend({
  request_details: z.string().trim().min(1).max(2000),
  total_count: z.coerce.number().int().nonnegative(),
});

function present(row: z.infer<typeof patientRowSchema>): PatientPrivacyRequest {
  return patientPrivacyRequestSchema.parse({
    id: row.id,
    requestType: row.request_type,
    status: row.status,
    resolutionCategory: row.resolution_category,
    protectedRecordsRetained: row.protected_records_retained,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function submitOwnPrivacyRequest(input: unknown): Promise<void> {
  const value = privacyRequestInputSchema.parse(input);
  const { supabase } = await createRoleAuthorizedClient(
    ['patient'],
    'Privacy request is unavailable',
  );
  const result = await supabase.rpc('submit_privacy_request', {
    p_request_details: value.details,
    p_request_type: value.requestType,
  });
  if (result.error) throw new Error('Privacy request is unavailable');
}

export async function listOwnPrivacyRequests(): Promise<
  PatientPrivacyRequest[]
> {
  const { supabase } = await createRoleAuthorizedClient(
    ['patient'],
    'Privacy requests are unavailable',
  );
  const result = await supabase.rpc('list_own_privacy_requests');
  if (result.error) throw new Error('Privacy requests are unavailable');
  return z
    .array(patientRowSchema)
    .parse(result.data ?? [])
    .map(present);
}

export type OperationsPrivacyRequest = PatientPrivacyRequest &
  Readonly<{ details: string }>;

export async function listPrivacyRequestsForOperations(
  pageInput: unknown,
): Promise<{
  items: OperationsPrivacyRequest[];
  page: number;
  totalCount: number;
}> {
  const page = z.coerce.number().int().min(1).max(10_000).parse(pageInput);
  const { supabase } = await createRoleAuthorizedClient(
    ['operations'],
    'Privacy request queue is unavailable',
  );
  const result = await supabase.rpc('list_privacy_requests_for_operations', {
    p_limit: 25,
    p_offset: (page - 1) * 25,
  });
  if (result.error) throw new Error('Privacy request queue is unavailable');
  const rows = z.array(operationsRowSchema).parse(result.data ?? []);
  return {
    items: rows.map((row) => ({
      ...present(row),
      details: row.request_details,
    })),
    page,
    totalCount: rows[0]?.total_count ?? 0,
  };
}

export async function transitionPrivacyRequest(input: unknown): Promise<void> {
  const value = privacyRequestTransitionSchema.parse(input);
  const { supabase } = await createRoleAuthorizedClient(
    ['operations'],
    'Privacy request transition is unavailable',
  );
  const result = await supabase.rpc('transition_privacy_request', {
    p_next_status: value.nextStatus,
    p_request_id: value.requestId,
    p_resolution_category: value.resolutionCategory || null,
  });
  if (result.error)
    throw new Error('Privacy request transition is unavailable');
}
