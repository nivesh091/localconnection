// Supabase Edge Function: purge-expired-recordings
// Safely purges expired audio recordings from Supabase Storage 'call-recordings' bucket
// and marks database metadata as purged only after verified storage deletion.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

interface PurgeResult {
  success: boolean;
  message: string;
  processed: number;
  purged: number;
  failed: number;
  errors?: string[];
  timestamp: string;
}

Deno.serve(async (req: Request) => {
  // Only accept POST requests
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 1. FAIL-CLOSED CRON_SECRET VERIFICATION
  const serverCronSecret = Deno.env.get('CRON_SECRET');
  if (!serverCronSecret || serverCronSecret.trim().length === 0) {
    console.error('CRON_SECRET environment variable is missing on server');
    return new Response(
      JSON.stringify({
        error: 'Unauthorized: CRON_SECRET is not configured on the server. Failing closed.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check custom header or Bearer authorization
  const authHeader = req.headers.get('Authorization') || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const customSecretHeader = req.headers.get('x-cron-secret')?.trim() || '';

  const incomingSecret = customSecretHeader || bearerToken;

  if (!incomingSecret || incomingSecret !== serverCronSecret) {
    console.warn('Unauthorized invocation attempt: secret mismatch');
    return new Response(
      JSON.stringify({ error: 'Unauthorized: Invalid or missing CRON_SECRET' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Initialize Supabase Admin Client using Service Role Key
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  try {
    const nowIso = new Date().toISOString();

    // 3. Query expired recordings that have not been purged yet
    const { data: expiredRecordings, error: fetchError } = await supabase
      .from('call_recordings')
      .select('id, call_id, storage_path, expires_at')
      .is('purged_at', null)
      .lt('expires_at', nowIso)
      .limit(50);

    if (fetchError) {
      console.error('Error querying expired recordings:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!expiredRecordings || expiredRecordings.length === 0) {
      const response: PurgeResult = {
        success: true,
        message: 'No expired recordings found to purge.',
        processed: 0,
        purged: 0,
        failed: 0,
        timestamp: nowIso,
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let purgedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // 4. Delete each recording object from Storage first
    for (const recording of expiredRecordings) {
      try {
        const { error: removeError } = await supabase.storage
          .from('call-recordings')
          .remove([recording.storage_path]);

        // If removed successfully or error indicates file already absent (e.g. 404 / Object not found)
        const isAbsentOrSuccess =
          !removeError ||
          removeError.message?.toLowerCase().includes('not found') ||
          (removeError as any).statusCode === '404';

        if (isAbsentOrSuccess) {
          // 5. Update database record only after storage confirmed removal
          const { error: updateError } = await supabase
            .from('call_recordings')
            .update({
              purged_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', recording.id);

          if (updateError) {
            console.warn(`Failed to update purged_at for recording ${recording.id}:`, updateError);
            failedCount++;
            errors.push(`DB update failed for ${recording.id}: ${updateError.message}`);
          } else {
            purgedCount++;
          }
        } else {
          console.error(`Storage deletion failed for ${recording.storage_path}:`, removeError);
          failedCount++;
          errors.push(`Storage delete failed for ${recording.storage_path}: ${removeError.message}`);
          // FAILED DELETIONS RETAIN METADATA WITHOUT SETTING purged_at SO THEY WILL RETRY ON NEXT RUN
        }
      } catch (itemErr: any) {
        failedCount++;
        errors.push(`Exception purging ${recording.id}: ${itemErr?.message || itemErr}`);
      }
    }

    const result: PurgeResult = {
      success: failedCount === 0,
      message: `Processed ${expiredRecordings.length} recordings. Purged: ${purgedCount}, Failed: ${failedCount}`,
      processed: expiredRecordings.length,
      purged: purgedCount,
      failed: failedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: nowIso,
    };

    return new Response(JSON.stringify(result), {
      status: failedCount === 0 ? 200 : 207,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Unexpected error in purge-expired-recordings function:', err);
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
