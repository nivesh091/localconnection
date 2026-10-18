const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';

async function testRealtimeBroadcast() {
  console.log('--- Testing Realtime Broadcast between two clients ---');

  const clientA = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const clientB = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  const roomName = `call_room_diag_${Date.now()}`;
  let receivedSignal = null;

  const channelB = clientB.channel(roomName, { config: { broadcast: { self: false } } });
  
  channelB.on('broadcast', { event: 'signal' }, (payload) => {
    console.log('✅ Client B received broadcast signal:', payload);
    receivedSignal = payload;
  });

  const subB = await new Promise((resolve) => {
    channelB.subscribe((status, err) => {
      console.log('Client B channel status:', status, err || '');
      if (status === 'SUBSCRIBED') resolve(true);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(false);
    });
  });

  if (!subB) {
    console.error('❌ Client B failed to subscribe to channel');
    process.exit(1);
  }

  const channelA = clientA.channel(roomName, { config: { broadcast: { self: false } } });
  const subA = await new Promise((resolve) => {
    channelA.subscribe((status, err) => {
      console.log('Client A channel status:', status, err || '');
      if (status === 'SUBSCRIBED') resolve(true);
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve(false);
    });
  });

  if (!subA) {
    console.error('❌ Client A failed to subscribe to channel');
    process.exit(1);
  }

  console.log('Both clients SUBSCRIBED. Client A sending broadcast signal...');
  const sendRes = await channelA.send({
    type: 'broadcast',
    event: 'signal',
    payload: {
      type: 'offer',
      sdp: 'mock-sdp-test-payload'
    }
  });

  console.log('Client A send response:', sendRes);

  // Wait 3 seconds to see if B receives it
  await new Promise(r => setTimeout(r, 3000));

  if (receivedSignal) {
    console.log('🎉 SUCCESS: Realtime Broadcast works perfectly between two clients!');
  } else {
    console.error('❌ FAILURE: Broadcast was sent by A, but never received by B!');
  }

  clientA.removeChannel(channelA);
  clientB.removeChannel(channelB);
}

testRealtimeBroadcast().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
