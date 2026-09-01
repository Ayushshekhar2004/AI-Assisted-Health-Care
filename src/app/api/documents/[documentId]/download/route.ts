import { NextResponse } from 'next/server';
import { createOwnPatientDocumentDownload } from '../../../../../modules/patient/document-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const download = await createOwnPatientDocumentDownload(
      (await params).documentId,
    );
    return NextResponse.redirect(download.url, {
      status: 302,
      headers: {
        'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Document is unavailable' },
      { status: 403, headers: { 'Cache-Control': 'no-store, private' } },
    );
  }
}
