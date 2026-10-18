const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

async function testPrematureSend() {
  const clientA = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const channelA = clientA.channel(`premature_test_${Date.now()}`);
  channelA.subscribe(); // NOT AWAITED! Still in 'CLOSED' or 'JOINING' state

  console.log('channelA state before send:', channelA.state);
  try {
    const res = await channelA.send({
      type: 'broadcast',
      event: 'test',
      payload: { hello: 'world' }
    });
    console.log('Result of channelA.send() without awaiting SUBSCRIBED:', res);
  } catch (err) {
    console.error('Error from channelA.send():', err);
  }
}

testPrematureSend().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
