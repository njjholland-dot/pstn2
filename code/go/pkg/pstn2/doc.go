// Package pstn2 is the Go SDK for the PSTN2 protocol v1.1.
//
// PSTN2 adds caller ID verification, direct routing, end-to-end encryption and
// enhanced emergency location to the existing PSTN without a central database.
// Every interaction starts with Number Discovery (SPECIFICATION.md §9): "which
// CP currently holds this number?"
//
//	cache → regulator numbering list (longest prefix) → Range Holder →
//	redirect (ported number) → holder        (max 5 hops, loop detection)
//
// The SDK provides:
//
//   - [NumberingList]: the regulator's numbering list with Range Holder URLs,
//     fetched with ETag/If-None-Match and refreshed daily.
//   - [DiscoveryCache]: number → holder hints with TTL (never block-level).
//   - [DiscoveryClient]: Discover(ctx, number) implementing §9.3 exactly as the
//     reference engine (animations/src/test-harness/harness-engine.js).
//   - [RangeHolderResponder]: the server side of a discovery query (§9.2),
//     optionally Ed25519-signed (§9.6).
//   - [CanonicalJSON], [VerifySignature], [SignBody]: §9.6 signatures.
//   - [Client] with Auth (Direct Query and Token Pool), Routing and Emergency
//     modules, all of which find the holder with Discover() and handle a
//     not_held answer by purging the cache, rediscovering and retrying once.
//
// Only the Go standard library is used.
package pstn2
