const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function inspectColumns() {
  console.log('--- Inspecting Columns of calls, call_signals, call_recordings ---');
  
  // Test inserting an invalid dummy call to see what Postgres complains about or if RLS denies anon
  const { data: testIns, error: insErr } = await supabase
    .from('calls')
    .insert({
      caller_id: '4261fe77-d162-48c7-8072-e22ae9d93978',
      receiver_id: '99fa39a6-5c4d-4c35-806b-db86e292fa26',
      status: 'calling'
    })
    .select();

  console.log('Insert test result without auth:', { testIns, insErr });

  // Test what columns exist by selecting non-existent column
  const { error: colErr } = await supabase.from('calls').select('non_existent_column_xyz');
  console.log('Column error response:', colErr?.message);
}

inspectColumns().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
