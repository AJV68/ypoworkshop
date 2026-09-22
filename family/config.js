// Public Supabase settings for the browser.
//
// These two values are safe to ship to the client. The project URL is public
// and the publishable key is designed to be embedded in a web page; on its own
// it grants nothing, because every table is behind Row Level Security that
// requires a signed-in member of this family.
//
// NEVER put the service_role key or the database password in this repository.
export const SUPABASE_URL = 'https://mkjegaxglmqxpeqhmgcs.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sho6LtX_b2d-vpz7BD5vVg_-MZrf6sy';
