import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

// PKCE keeps the sign-in handshake in the query string rather than the URL
// hash, which this app uses for its own routing.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

// The signed-in person's row in `members`, loaded once per session.
export const state = {
  session: null,
  me: null,
  members: [],
  places: [],
};

export async function loadIdentity() {
  const [{ data: members, error: membersError }, { data: places, error: placesError }] =
    await Promise.all([
      supabase.from('members').select('id, user_id, email, display_name, is_admin').order('display_name'),
      supabase.from('places').select('id, name, locality, is_home, sort_order').order('sort_order'),
    ]);

  if (membersError) throw membersError;
  if (placesError) throw placesError;

  state.members = members ?? [];
  state.places = places ?? [];
  state.me = state.members.find((m) => m.user_id === state.session?.user?.id) ?? null;
  return state.me;
}

export function memberName(id) {
  const member = state.members.find((m) => m.id === id);
  if (!member) return 'Someone';
  return member.display_name || member.email;
}
