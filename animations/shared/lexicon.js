// Spoken-form rules for PSTN2 narration. Used by the narration renderer
// (tools/narrate/build-narration.mjs, macOS `say`) and by the player's live
// Web Speech fallback, so both pronounce the same text the same way.
//
// The on-screen caption always shows the written text; only the voice uses this.

const DIGIT = ['oh', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const RULES = [
    // Money
    [/£(\d+(?:\.\d+)?)\s?bn\b/g, '$1 billion pounds'],
    [/£(\d+(?:\.\d+)?)\s?m\b/g, '$1 million pounds'],
    [/£(\d+(?:\.\d+)?)\s?k\b/g, '$1 thousand pounds'],
    [/(\d+)%/g, '$1 percent'],
    // Standards and acronyms (longest first)
    [/\bSTIR\/SHAKEN\b/g, 'stir shaken'],
    [/\bS1\s*(?:–|-|to)\s*S9\b/g, 'S one to S nine'],
    [/\bE\.164\b/g, 'E one six four'],
    [/\bEd25519\b/g, 'E D two five five one nine'],
    [/\bPSTN2\b/g, 'P S T N two'],
    [/\bPSTN\b/g, 'P S T N'],
    [/\bRCPIDs?\b/g, 'R C P I D'],
    [/\bCPs\b/g, 'C Pees'],
    [/\bCP's\b/g, "C Pee's"],
    [/\bCP\b/g, 'C P'],
    [/\bCDB\b/g, 'C D B'],
    [/\bSRTP\b/g, 'S R T P'],
    [/\bDTLS\b/g, 'D T L S'],
    [/\bTLS\b/g, 'T L S'],
    [/\bHTTPS\b/g, 'H T T P S'],
    [/\bHTTP\b/g, 'H T T P'],
    [/\bAPIs\b/g, 'A P Is'],
    [/\bAPI\b/g, 'A P I'],
    [/\bURLs\b/g, 'U R Ls'],
    [/\bURL\b/g, 'U R L'],
    [/\bJSON\b/g, 'jason'],
    [/\bSIP\b/g, 'sip'],
    [/\bTTL\b/g, 'T T L'],
    [/\bGDPR\b/g, 'G D P R'],
    [/\bPSAPs?\b/g, 'P SAP'],
    [/\bMAPs\b/g, 'maps'],
    [/\bMAP\b/g, 'map'],
    [/\bVoIP\b/g, 'voyp'],
    [/\bOTT\b/g, 'O T T'],
    [/\bSDKs\b/g, 'S D Ks'],
    [/\bSDK\b/g, 'S D K'],
    [/\bGET\b/g, 'get'],
    [/\b999\b/g, 'nine nine nine'],
    [/\b112\b/g, 'one one two'],
];

/** Read a UK number digit by digit, pausing between the written groups. */
function speakNumber(match) {
    return match
        .trim()
        .split(/\s+/)
        .map((group) => group.replace(/x+/gi, (xs) => ' ' + 'x '.repeat(xs.length).trim() + ' ')
            .split('')
            .map((ch) => (/\d/.test(ch) ? DIGIT[+ch] : ch))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim())
        .join(', ');
}

export function spoken(text) {
    let s = String(text);
    // UK national numbers such as 0161 496 0123, 020 7946 0321, 07700 900003, 0113 496 0xxx
    s = s.replace(/\b0\d{2,4}(?:\s\d[\dx]{2,5}){1,2}\b/gi, speakNumber);
    for (const [re, rep] of RULES) s = s.replace(re, rep);
    return s;
}
