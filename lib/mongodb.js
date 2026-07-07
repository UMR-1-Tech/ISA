// lib/mongodb.js
//
// Cached MongoDB connection helper for use inside Vercel serverless functions.
// Serverless functions can be re-invoked on a "warm" container, so we cache the
// client/connection on the global object to avoid opening a new connection
// (and exhausting Atlas's connection limit) on every single request.

import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'isa_call_auditor';

if (!uri) {
    // We don't throw at import-time because that would crash the whole
    // function bundle before we get a chance to return a clean JSON error.
    console.warn('MONGODB_URI environment variable is not set.');
}

let cachedClientPromise = globalThis._mongoClientPromise;

function getClientPromise() {
    if (!uri) {
        throw new Error('MONGODB_URI environment variable is missing on Vercel.');
    }

    if (!cachedClientPromise) {
        const client = new MongoClient(uri, {
            maxPoolSize: 5,
        });
        cachedClientPromise = client.connect();
        globalThis._mongoClientPromise = cachedClientPromise;
    }

    return cachedClientPromise;
}

export async function getDb() {
    const client = await getClientPromise();
    return client.db(dbName);
}

export async function getCollection(name) {
    const db = await getDb();
    return db.collection(name);
}
