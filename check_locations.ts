import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hhvxanktvbncyeedzzdf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cdXk34V8WeafviYplVRbig_fcDmRDj0';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkLocations() {
  const { data: locs, error } = await supabase.from('locations').select('*');
  console.log('--- ALL LOCATIONS IN SUPABASE ---');
  console.log(JSON.stringify(locs, null, 2));

  const { data: profs } = await supabase.from('profiles').select('id, name, address');
  console.log('--- ALL PROFILES ADDRESSES ---');
  console.log(JSON.stringify(profs, null, 2));
}

checkLocations().catch(console.error);
