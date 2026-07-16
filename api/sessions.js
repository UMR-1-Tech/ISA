// api/sessions.js
//
// Persists full ISA training call sessions to Supabase and serves them back
// as recent history + an aggregated per-agent leaderboard (agent_leaderboard view).

import { getSupabase } from '../lib/supabase.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    let supabase;
    try {
        supabase = getSupabase();
    } catch (error) {
        console.error('Supabase client init error:', error);
        return res.status(500).json({ error: error.message });
    }

    try {
        if (req.method === 'POST') {
            const {
                agentName,
                mode,
                difficulty,
                scores,
                completedDataPoints,
                transcript,
                infractions,
                startedAt,
                endedAt,
            } = req.body || {};

            if (!agentName || typeof agentName !== 'string' || !agentName.trim()) {
                return res.status(400).json({ error: 'agentName is required.' });
            }
            if (!scores || typeof scores.qualification !== 'number' || typeof scores.script !== 'number') {
                return res.status(400).json({ error: 'scores.qualification and scores.script are required.' });
            }

            const startedAtDate = startedAt ? new Date(startedAt) : new Date();
            const endedAtDate = endedAt ? new Date(endedAt) : new Date();
            const durationSeconds = Math.max(0, Math.round((endedAtDate - startedAtDate) / 1000));

            const { data, error } = await supabase
                .from('call_sessions')
                .insert({
                    agent_name: agentName.trim(),
                    mode: mode || 'Unknown',
                    difficulty: difficulty || 'Unknown',
                    qualification_score: scores.qualification,
                    script_score: scores.script,
                    completed_data_points: Array.isArray(completedDataPoints) ? completedDataPoints : [],
                    transcript: Array.isArray(transcript) ? transcript : [],
                    infractions: Array.isArray(infractions) ? infractions : [],
                    started_at: startedAtDate.toISOString(),
                    ended_at: endedAtDate.toISOString(),
                    duration_seconds: durationSeconds,
                })
                .select('id')
                .single();

            if (error) throw error;
            return res.status(201).json({ insertedId: data.id });
        }

        if (req.method === 'GET') {
            const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

            const { data: sessions, error: sessionsError } = await supabase
                .from('call_sessions')
                .select('id, agent_name, mode, difficulty, qualification_score, script_score, completed_data_points, infractions, duration_seconds, created_at')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (sessionsError) throw sessionsError;

            const { data: leaderboard, error: leaderboardError } = await supabase
                .from('agent_leaderboard')
                .select('*')
                .limit(25);

            if (leaderboardError) throw leaderboardError;

            return res.status(200).json({
                sessions: (sessions || []).map((s) => ({
                    agentName: s.agent_name,
                    mode: s.mode,
                    difficulty: s.difficulty,
                    scores: { qualification: s.qualification_score, script: s.script_score },
                    completedDataPoints: s.completed_data_points,
                    infractions: s.infractions,
                    durationSeconds: s.duration_seconds,
                    createdAt: s.created_at,
                })),
                leaderboard: (leaderboard || []).map((row) => ({
                    agentName: row.agent_name,
                    totalCalls: row.total_calls,
                    avgQualification: row.avg_qualification,
                    avgScript: row.avg_script,
                    bestQualification: row.best_qualification,
                    totalInfractions: row.total_infractions,
                    lastCallAt: row.last_call_at,
                })),
            });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (error) {
        console.error('Sessions endpoint exception:', error);
        return res.status(500).json({ error: error.message || 'Internal processing error.' });
    }
}
