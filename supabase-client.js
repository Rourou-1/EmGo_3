// ══════════════════════════════════════════════════════════════
//  EmGo — Supabase Client


const SUPABASE_URL     = 'https://xgibiyniitkzlwgeorqm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9gvedehNeadBfL_qZIzhpw_SVHlDh9k'; // eyJhbGci…

// so we name our client `emgoDb` to avoid the naming collision that
// caused the original  "Cannot access 'supabase' before initialization" error.
const emgoDb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

//TESTING