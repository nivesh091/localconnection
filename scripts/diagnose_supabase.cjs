const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function runDiagnosis() {
  console.log('--- 1. Testing Connection to Supabase ---');
  try {
    const { data: profiles, error: pError } = await supabase
      .from('profiles')
      .select('id, name, is_internet_call_enabled')
      .limit(3);

    if (pError) {
      console.error('Error fetching profiles:', pError);
    } else {
      console.log('Successfully connected. Sample profiles:', profiles);
    }
  } catch (e) {
    console.error('Connection exception:', e);
  }

  console.log('\n--- 2. Checking `calls` Table ---');
  try {
    const { data: calls, error: cError } = await supabase
      .from('calls')
      .select('*')
      .limit(5);

    if (cError) {
      console.error('Error querying `calls` table:', cError);
    } else {
      console.log('`calls` table exists! Total rows found (up to 5):', calls.length);
      if (calls.length > 0) {
        console.log('Latest call row columns:', Object.keys(calls[0]));
        console.log('Latest call status:', calls[0]);
      }
    }
  } catch (e) {
    console.error('`calls` table exception:', e);
  }

  console.log('\n--- 3. Checking `call_signals` Table ---');
  try {
    const { data: signals, error: sError } = await supabase
      .from('call_signals')
      .select('*')
      .limit(5);

    if (sError) {
      console.error('Error querying `call_signals` table:', sError);
    } else {
      console.log('`call_signals` table exists! Total rows found (up to 5):', signals.length);
      if (signals.length > 0) {
        console.log('Latest signal row columns:', Object.keys(signals[0]));
        console.log('Latest signal type:', signals[0].type);
      }
    }
  } catch (e) {
    console.error('`call_signals` table exception:', e);
  }

  console.log('\n--- 4. Checking `call-recordings` Storage Bucket ---');
  try {
    const { data: buckets, error: bError } = await supabase.storage.listBuckets();
    if (bError) {
      console.error('Error listing storage buckets:', bError);
    } else {
      const callBucket = buckets.find(b => b.id === 'call-recordings');
      console.log('`call-recordings` bucket exists?', Boolean(callBucket), callBucket ? { public: callBucket.public } : '');
    }
  } catch (e) {
    console.error('Storage bucket exception:', e);
  }
}

runDiagnosis().then(() => {
  console.log('\n--- Diagnosis Complete ---');
  process.exit(0);
}).catch(err => {
  console.error('Fatal diagnosis error:', err);
  process.exit(1);
});
