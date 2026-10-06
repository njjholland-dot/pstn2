// The PSTN2 presentation series, in viewing order. Used by the player's end card
// ("Up next") and chapter navigation between decks.
export const DECKS = [
    { id: 'problem-statement', title: 'The Problem', blurb: 'Why today’s PSTN cannot stop fraud' },
    { id: 'solution-overview', title: 'Solution Overview', blurb: 'PSTN2 in seven ideas' },
    { id: 'authentication-option1', title: 'Authentication: Direct Query', blurb: 'Ask the caller’s CP in real time' },
    { id: 'authentication-option2', title: 'Authentication: Token Pool', blurb: 'Verify with a short-lived token' },
    { id: 'direct-routing', title: 'Direct Routing', blurb: 'Peer-to-peer call setup' },
    { id: 'emergency-services', title: 'Emergency Services', blurb: 'Real-time location for 999 and 112' },
    { id: 'distributed-database', title: 'Who Has This Number?', blurb: 'Number discovery without a central database' },
    { id: 'test-harness', title: 'Test Harness: Live Demo', blurb: 'Three CPs and Ofcom answer “who has this number?”' },
    { id: 'map-architecture', title: 'MAP Architecture', blurb: 'PSTN2 for smaller providers' },
    { id: 'end-to-end-scenario', title: 'End-to-End Scenario', blurb: 'One call, every step' },
    { id: 'law-enforcement', title: 'Law Enforcement Access', blurb: 'Lawful data access without a central database' },
];

export function nextDeck(id) {
    const i = DECKS.findIndex((d) => d.id === id);
    return i >= 0 && i < DECKS.length - 1 ? DECKS[i + 1] : null;
}
