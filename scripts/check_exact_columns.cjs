const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const columnsToCheck = [
  'id',
  'caller_id',
  'receiver_id',
  'status',
  'started_at',
  'answered_at',
  'connected_at',
  'ended_at',
  'duration_seconds',
  'ended_reason',
  'end_reason',
  'caller_personal_recording',
  'recipient_personal_recording',
  'admin_recording_active',
  'caller_consent_admin_recording',
  'recipient_consent_admin_recording',
  'receiver_consent_admin_recording',
  'conversation_id',
  'created_at',
  'updated_at'
];

async function checkColumns() {
  console.log('Testing each column existence on `calls`:');
  for (const col of columnsToCheck) {
    const { error } = await supabase.from('calls').select(col).limit(0);
    if (error) {
      console.log(`❌ Column [${col}]: NOT FOUND (${error.message})`);
    } else {
      console.log(`✅ Column [${col}]: EXISTS`);
    }
  }

  console.log('\nTesting each column existence on `call_signals`:');
  const signalCols = ['id', 'call_id', 'sender_id', 'recipient_id', 'type', 'payload', 'created_at'];
  for (const col of signalCols) {
    const { error } = await supabase.from('call_signals').select(col).limit(0);
    if (error) {
      console.log(`❌ Column [${col}]: NOT FOUND (${error.message})`);
    } else {
      console.log(`✅ Column [${col}]: EXISTS`);
    }
  }

  console.log('\nTesting each column existence on `call_recordings`:');
  const recCols = ['id', 'call_id', 'user_id', 'owner_id', 'recording_type', 'storage_path', 'duration_seconds', 'file_size_bytes', 'mime_type', 'expires_at', 'purged_at', 'is_deleted_by_user'];
  for (const col of recCols) {
    const { error } = await supabase.from('call_recordings').select(col).limit(0);
    if (error) {
      console.log(`❌ Column [${col}]: NOT FOUND (${error.message})`);
    } else {
      console.log(`✅ Column [${col}]: EXISTS`);
    }
  }
}

checkColumns().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
