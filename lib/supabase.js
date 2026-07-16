// lib/supabase.js
//
// Cached Supabase client for use inside Vercel serverless functions.
// Uses the SERVICE ROLE key so it can bypass Row Level Security from the
// server side — this key must never be exposed to the browser/frontend.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
}

let cachedClient = globalThis._supabaseClient;

export function getSupabase() {
    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables are missing on Vercel.');
    }

    if (!cachedClient) {
        cachedClient = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false },
        });
        globalThis._supabaseClient = cachedClient;
    }

    return cachedClient;
}
