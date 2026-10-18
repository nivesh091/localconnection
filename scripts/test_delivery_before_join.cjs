const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

async function testDeliveryBeforeJoin() {
  const clientA = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  const roomName = `room_test_${Date.now()}`;
  let bReceived = false;

  const channelB = clientB.channel(roomName);
  channelB.on('broadcast', { event: 'signal' }, () => {
    bReceived = true;
  });

  // Ensure B is joined and ready
  await new Promise(r => {
    channelB.subscribe(status => {
      if (status === 'SUBSCRIBED') r();
    });
  });

  // Client A creates channel and sends IMMEDIATELY without waiting for SUBSCRIBED
  const channelA = clientA.channel(roomName);
  channelA.subscribe(); // joining...

  const res = await channelA.send({
    type: 'broadcast',
    event: 'signal',
    payload: { test: 1 }
  });

  console.log('channelA send result:', res);

  await new Promise(r => setTimeout(r, 2000));

  console.log('Did client B receive the broadcast from unjoined client A?', bReceived);

  clientA.removeChannel(channelA);
  clientB.removeChannel(channelB);
}

testDeliveryBeforeJoin().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
