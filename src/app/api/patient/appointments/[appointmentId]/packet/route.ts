import { NextResponse } from 'next/server';

import { generateOwnPatientConsultationPacket } from '../../../../../../modules/prescription/document-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const appointmentId = (await params).appointmentId;
    const bytes = await generateOwnPatientConsultationPacket(appointmentId);
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="consultation-packet-${appointmentId}.pdf"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Consultation packet is unavailable' },
      { status: 403, headers: { 'Cache-Control': 'no-store, private' } },
    );
  }
}
