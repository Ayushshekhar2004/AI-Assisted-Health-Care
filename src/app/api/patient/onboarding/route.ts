import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isTrustedSameOriginForm } from '@/lib/security/request';
import { createRouteClient } from '@/lib/supabase/route';
import { getRoleHome, resolveCurrentRole } from '@/modules/auth';
import { parsePatientOnboarding } from '@/modules/patient';

function onboardingRedirect(request: NextRequest, error = false) {
  const url = new URL('/patient/onboarding', request.nextUrl.origin);
  if (error) url.searchParams.set('error', '1');
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  if (
    !isTrustedSameOriginForm(
      request.headers.get('origin'),
      request.nextUrl.origin,
      request.headers.get('sec-fetch-site'),
      request.headers.get('content-type'),
    )
  ) {
    return NextResponse.json(
      { error: 'Request is unavailable' },
      { status: 403 },
    );
  }

  const { applyCookies, supabase } = createRouteClient(request);
  const role = await resolveCurrentRole(supabase);
  if (!role) {
    return applyCookies(
      NextResponse.redirect(
        new URL('/auth/login', request.nextUrl.origin),
        303,
      ),
    );
  }
  if (role !== 'patient') {
    return applyCookies(
      NextResponse.redirect(
        new URL(getRoleHome(role), request.nextUrl.origin),
        303,
      ),
    );
  }

  const formData = await request.formData().catch(() => null);
  const parsed = await Promise.resolve()
    .then(() =>
      parsePatientOnboarding({
        preferredLanguage: formData?.get('preferredLanguage'),
        dateOfBirth: formData?.get('dateOfBirth'),
        gender: formData?.get('gender'),
        city: formData?.get('city'),
        emergencyContactName: formData?.get('emergencyContactName'),
        emergencyContactPhone: formData?.get('emergencyContactPhone'),
        teleconsultationConsent: formData?.get('teleconsultationConsent'),
        intakeProcessingConsent: formData?.get('intakeProcessingConsent'),
      }),
    )
    .catch(() => null);
  if (!parsed) return applyCookies(onboardingRedirect(request, true));

  const { error } = await supabase.rpc('complete_patient_onboarding', {
    p_city: parsed.city,
    p_date_of_birth: parsed.dateOfBirth,
    p_emergency_contact_name: parsed.emergencyContactName ?? null,
    p_emergency_contact_phone: parsed.emergencyContactPhone ?? null,
    p_gender: parsed.gender ?? null,
    p_intake_processing_consent: true,
    p_preferred_language: parsed.preferredLanguage,
    p_teleconsultation_consent: true,
  });
  if (error) return applyCookies(onboardingRedirect(request, true));

  return applyCookies(
    NextResponse.redirect(new URL('/patient', request.nextUrl.origin), 303),
  );
}
