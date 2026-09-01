import { NextResponse } from 'next/server';
import { createDoctorDocumentDownload } from '../../../../../../modules/patient/document-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const url = await createDoctorDocumentDownload((await params).documentId);
    return NextResponse.redirect(url, {
      status: 302,
      headers: {
        'Cache-Control': 'no-store, private',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'Document is unavailable' },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store, private',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  }
}
