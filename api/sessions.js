// api/sessions.js
//
// Persists full ISA training call sessions to MongoDB and serves them back
// as recent history + an aggregated per-agent leaderboard.

import { getCollection } from '../lib/mongodb.js';

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const sessions = await getCollection('sessions');

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

            const doc = {
                agentName: agentName.trim(),
                mode: mode || 'Unknown',
                difficulty: difficulty || 'Unknown',
                scores: {
                    qualification: scores.qualification,
                    script: scores.script,
                },
                completedDataPoints: Array.isArray(completedDataPoints) ? completedDataPoints : [],
                transcript: Array.isArray(transcript) ? transcript : [],
                infractions: Array.isArray(infractions) ? infractions : [],
                startedAt: startedAtDate,
                endedAt: endedAtDate,
                durationSeconds,
                createdAt: new Date(),
            };

            const result = await sessions.insertOne(doc);
            return res.status(201).json({ insertedId: result.insertedId });
        }

        if (req.method === 'GET') {
            const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

            const recent = await sessions
                .find({}, {
                    projection: {
                        agentName: 1,
                        mode: 1,
                        difficulty: 1,
                        scores: 1,
                        completedDataPoints: 1,
                        infractions: 1,
                        durationSeconds: 1,
                        createdAt: 1,
                    },
                })
                .sort({ createdAt: -1 })
                .limit(limit)
                .toArray();

            const leaderboard = await sessions.aggregate([
                {
                    $group: {
                        _id: '$agentName',
                        totalCalls: { $sum: 1 },
                        avgQualification: { $avg: '$scores.qualification' },
                        avgScript: { $avg: '$scores.script' },
                        bestQualification: { $max: '$scores.qualification' },
                        totalInfractions: { $sum: { $size: { $ifNull: ['$infractions', []] } } },
                        lastCallAt: { $max: '$createdAt' },
                    },
                },
                { $sort: { avgQualification: -1, avgScript: -1 } },
                { $limit: 25 },
            ]).toArray();

            return res.status(200).json({
                sessions: recent,
                leaderboard: leaderboard.map((row) => ({
                    agentName: row._id,
                    totalCalls: row.totalCalls,
                    avgQualification: Math.round(row.avgQualification * 10) / 10,
                    avgScript: Math.round(row.avgScript * 10) / 10,
                    bestQualification: row.bestQualification,
                    totalInfractions: row.totalInfractions,
                    lastCallAt: row.lastCallAt,
                })),
            });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });

    } catch (error) {
        console.error('Sessions endpoint exception:', error);
        return res.status(500).json({ error: error.message || 'Internal processing error.' });
    }
}
