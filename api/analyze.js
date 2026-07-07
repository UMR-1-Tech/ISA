// api/analyze.js

export default async function handler(req, res) {
    // Handle CORS pre-flight configurations safely
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { userInput, currentStep, completedDataPoints, currentMode, currentDifficulty } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'System Setup Error: GEMINI_API_KEY environment variable is missing on Vercel.' });
    }

    try {
        // Advanced roleplay prompt context mapping
        const prompt = `
            You are David Miller, a realistic real estate prospect being qualified by an Internal Sales Associate (ISA) over the phone.
            
            [SESSION PARAMS]
            Simulation Scenario Mode: ${currentMode || 'Standard Lead'}
            Prospect Resistance Difficulty: ${currentDifficulty || 'Medium'}
            Current Stage Pointer: ${currentStep || 'INTRO_FLOW'}
            Already Collected Criteria Point IDs: ${JSON.stringify(completedDataPoints || [])}
            
            [AGENT INBOUND STATEMENT]
            "${userInput}"
            
            [QUALIFICATION GUIDELINE REFERENCE]
            1 = Property Type (Single family, condo, multi-family)
            2 = Beds/Baths Requirements
            3 = Motivation / Buying Timeline
            4 = Target Location / Zip Code
            5 = Financial Budget Range
            6 = Financing Status (Pre-approved vs cash vs needs lender)
            7 = Agent Contract Status (Are they bound to another realtor?)
            8 = Identity Check (Confirming correct point of contact)
            9 = Best Callback Window / Next Action Agreement

            [CORE EXECUTION RULES]
            1. Analyze the agent's input line. If they successfully extracted/asked cleanly for one of the missing numbered points above, indicate that specific ID in "extractedPointId".
            2. Behavioral Infraction Check: If the agent breaks structural phone etiquette (e.g., repeating a question for an ID already collected, aggressively cutting you off, ignoring a detail you just stated, or pushing for a close prematurely without building value), set "isMistake" to true and write professional structural feedback.
            3. Stay strictly in character as David Miller. Adjust your resistance level based on the difficulty parameter. Don't blurt out answers all at once unless the agent guides the call perfectly.

            Respond strictly in valid raw JSON matching this structure exactly without markdown decoration wrapper text:
            {
                "reply": "Your conversational response spoken directly back to the ISA agent.",
                "stepUpdate": "BUY_FLOW",
                "extractedPointId": null,
                "isMistake": false,
                "feedback": ""
            }
        `;

        const gatewayResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    responseMimeType: "application/json",
                    temperature: 0.7
                }
            })
        });

        if (!gatewayResponse.ok) {
            const errorText = await gatewayResponse.text();
            return res.status(500).json({ error: `Gemini Studio Gateway Fault: ${errorText}` });
        }

        const data = await gatewayResponse.json();
        const rawJsonString = data.candidates[0].content.parts[0].text.trim();
        
        return res.status(200).json(JSON.parse(rawJsonString));

    } catch (error) {
        console.error("Critical Serverless Function Exception:", error);
        return res.status(500).json({ error: "Internal processing layer hit a parse exception." });
    }
}