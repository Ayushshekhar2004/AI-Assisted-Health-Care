import { NextResponse } from 'next/server';
import { generateOwnFinalizedDocument } from '../../../../../modules/prescription/document-server';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ appointmentId: string }> },
) {
  try {
    const appointmentId = (await params).appointmentId;
    const bytes = await generateOwnFinalizedDocument(appointmentId);
    return new Response(bytes as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="consultation-${appointmentId}.pdf"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Consultation document is unavailable' },
      { status: 403, headers: { 'Cache-Control': 'no-store, private' } },
    );
  }
}
