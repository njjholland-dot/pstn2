# MAP (Managed Access Provider) Overview

**Version:** 1.1 (protocol v1.1)
**Date:** 2026-10-06
**Status:** Complete Specification

## Executive Summary

A **Managed Access Provider (MAP)** enables smaller Communication Providers (CPs) to participate in PSTN2 without requiring deep technical expertise or significant infrastructure investment. MAPs act as intermediaries, handling complex PSTN2 operations on behalf of multiple downstream CPs.

## Two Types of MAPs

### 1. Pure PSTN2 MAP

**Purpose:** Provide PSTN2-only services to downstream CPs

**Services Provided:**
- PSTN2 authentication (Direct Query & Token Pool)
- Number Discovery for tenants: Range Holder answers for their blocks and discovery client for their calls
- Emergency services location handling
- Direct routing coordination
- Porting answers: redirects for tenants' ported-out numbers, `held` for ported-in numbers
- Cryptographic key management
- Protocol compliance and certification

**Target Customers:**
- Small VoIP providers wanting PSTN2 features
- New market entrants
- OTT providers adding telephony
- International carriers expanding to new markets

**Infrastructure Requirements:**
- PSTN2 protocol implementation
- Multi-tenant architecture
- API endpoints for downstream CPs
- Monitoring and billing systems

### 2. Full Service MAP

**Purpose:** Bridge both PSTN and PSTN2 for downstream CPs

**Services Provided:**
- **All Pure PSTN2 MAP services**, plus:
- Legacy PSTN connectivity (wholesale termination/origination)
- Automatic call routing between PSTN and PSTN2
- SIP trunking services
- Number provisioning and management
- Traditional carrier-grade switching
- Billing for both PSTN and PSTN2 calls
- 24/7 operations and support

**Target Customers:**
- Existing PSTN wholesalers adding PSTN2
- Traditional carriers modernizing services
- Resellers wanting complete voice solutions
- CPs needing seamless legacy/modern transition

**Infrastructure Requirements:**
- PSTN2 + legacy PSTN infrastructure
- SIP switching platform
- Interconnection to legacy carriers
- Complete billing and provisioning systems
- Regulatory compliance (E.164 numbers, emergency services)

## Business Models

### Pure PSTN2 MAP
- **Revenue:** Per-call fees, monthly subscription, or hybrid
- **Costs:** Infrastructure, bandwidth, support
- **Margins:** Higher (no PSTN transit costs)
- **Complexity:** Lower operational overhead
- **Time to Market:** Faster (PSTN2 only)

### Full Service MAP
- **Revenue:** Per-minute rates (PSTN), per-call fees (PSTN2), monthly commitments
- **Costs:** PSTN transit, infrastructure, regulatory compliance, 24/7 NOC
- **Margins:** Lower on PSTN (competitive), higher on PSTN2
- **Complexity:** Higher (dual-network operations)
- **Time to Market:** Longer (requires PSTN interconnects)

## Key Differentiators

| Feature | Pure PSTN2 MAP | Full Service MAP |
|---------|----------------|------------------|
| **PSTN2 Support** | ✓ Complete | ✓ Complete |
| **Legacy PSTN** | ✗ None | ✓ Complete |
| **Number Provisioning** | Via downstream CP | ✓ Direct provisioning |
| **Emergency Services** | PSTN2 only (GPS) | Both PSTN & PSTN2 |
| **Call Routing** | PSTN2 only | Automatic PSTN/PSTN2 |
| **Infrastructure Cost** | Lower | Higher |
| **Regulatory Burden** | Minimal | Full compliance required |
| **Customer Type** | Tech-savvy VoIP | Traditional carriers |

## Value Proposition for Downstream CPs

### Why Use a MAP?

**For Small CPs:**
1. **Lower Barrier to Entry** - No need for deep PSTN2 expertise
2. **Reduced Infrastructure** - No need to operate PSTN2 servers
3. **Faster Time to Market** - Days instead of months
4. **Lower Costs** - Shared infrastructure costs
5. **Support & Expertise** - 24/7 technical support included
6. **Compliance** - MAP handles protocol certification

**For Full Service MAP Customers:**
7. **Single Vendor** - One partner for PSTN + PSTN2
8. **Seamless Transition** - Gradual PSTN2 adoption
9. **Complete Solution** - Number management, billing, support

## How a MAP Takes Part in Number Discovery

PSTN2 v1.1 has no central database and no central lookup service (SPECIFICATION.md
§9). Every CP answers "who holds this number?" only for its own numbers, and the
regulator's numbering list says which CP to ask first. A MAP does both jobs on
behalf of its downstream CPs:

**As Range Holder responder.** Each tenant's allocated blocks appear in the
regulator's numbering list (Ofcom S1–S9) against the tenant, with a **Range
Holder URL** that points at the MAP, one base URL per tenant:

```
Number Block    Communications Provider   Range Holder URL
0161 496 0xxx   Tenant One Ltd            https://pstn2.map.example/t/cp1-uk-0123
0113 496 1xxx   Tenant Two Ltd            https://pstn2.map.example/t/cp1-uk-0456
```

The MAP serves `GET {tenantUrl}/pstn2/v1/numbers/{digits}` from that tenant's
number database (held, redirect for numbers it ported out, `not_held` +
`cache.invalidate` for numbers that left, 404 otherwise) and
`GET {tenantUrl}/pstn2/v1/keys` with the tenant's signing keys. Answers are
signed with the tenant's key and reveal nothing about other tenants.

**As discovery client.** For tenants' calls the MAP downloads the numbering
list once, keeps it in memory, and runs discovery (cache → list → Range Holder
→ redirect, max 5 hops) before verifying caller IDs, requesting routing or
answering emergency queries. Each tenant still appears as itself: requests
carry the tenant's RCPID and signature.

Tenants that are their own Range Holder can point the Range Holder URL at the
MAP; tenants that host numbers ported in from other CPs simply have those
numbers in their MAP-held number database. Nothing is synchronised between
CPs. See MAP-MULTITENANT-DESIGN.md §3 for the data model and endpoints.

## Technical Architecture

### Multi-Tenant Design

**Core Principles:**
1. **Isolation** - Each CP's data and credentials isolated
2. **Scalability** - Add CPs without infrastructure changes
3. **Performance** - Sub-500ms authentication targets (p95)
4. **Reliability** - 99.99% uptime SLA
5. **Security** - End-to-end encryption, audit logs

**Shared Resources:**
- Regulator numbering list (downloaded and refreshed once, used for every tenant)
- Emergency services location database
- Number Discovery cache (per number; discovery answers are public, so one cache can serve all tenants)
- Authentication server infrastructure
- Direct routing coordinator

**Per-CP Resources:**
- Unique CP identifier (CPID)
- Ed25519 key pair management
- API credentials and rate limits
- Billing and usage tracking
- Configuration and policies

## Deployment Models

### 1. Cloud-Hosted (AWS/Azure/GCP)

**Advantages:**
- Rapid deployment
- Global availability
- Elastic scaling
- Lower capital expenditure
- Managed services (databases, monitoring)

**Best For:**
- Pure PSTN2 MAPs
- Startups and new entrants
- Global operations
- Rapid scaling scenarios

### 2. On-Premises Infrastructure

**Advantages:**
- Full control
- Data sovereignty
- Lower operational costs at scale
- Custom hardware optimization
- No cloud vendor lock-in

**Best For:**
- Full Service MAPs
- Established carriers
- High-volume operations
- Regulatory requirements (data residency)

### 3. Hybrid Model

**Advantages:**
- Best of both worlds
- Critical services on-prem, elasticity in cloud
- Disaster recovery built-in
- Geographic distribution

**Best For:**
- Large-scale operations
- Multi-region deployments
- Gradual cloud adoption

## Revenue & Pricing Models

### Pure PSTN2 MAP Pricing

**Option 1: Per-Call**
- Authentication: $0.0001-$0.0005 per call
- Emergency location: $0.001 per 999 call
- Number Discovery query: $0.00001 per query

**Option 2: Monthly Subscription**
- Tier 1: Up to 10,000 calls/month - $100/month
- Tier 2: Up to 100,000 calls/month - $500/month
- Tier 3: Up to 1M calls/month - $2,000/month
- Enterprise: Custom pricing

**Option 3: Hybrid**
- Base fee: $50/month
- Overage: $0.0002 per call above included amount

### Full Service MAP Pricing

**PSTN Minutes:**
- Inbound: $0.003-$0.015 per minute (varies by region)
- Outbound: $0.005-$0.025 per minute (varies by destination)
- Emergency: $0.05 per call (flat rate)

**PSTN2 Features:**
- Authentication: Included in per-minute rate
- Direct routing: $0.0001 per call setup
- Enhanced features: +10% premium on base rates

**Monthly Minimums:**
- Small CP: $500/month
- Medium CP: $2,500/month
- Large CP: $10,000/month

## Getting Started

### For Pure PSTN2 MAP

1. **Review Technical Specifications**
   - Read SPECIFICATION.md
   - Review API-SPECIFICATION.yaml
   - Study MAP-MULTITENANT-DESIGN.md

2. **Choose Deployment Model**
   - Cloud (AWS/Azure/GCP) or On-Premises
   - Review MAP-DEPLOYMENT-AWS.md or MAP-DEPLOYMENT-ONPREM.md

3. **Implement Multi-Tenant Architecture**
   - Review MAP-MULTITENANT-DESIGN.md
   - Deploy reference implementation
   - Test with sample downstream CP

4. **Obtain PSTN2 Certification**
   - Run certification test suite
   - Submit to PSTN2 consortium
   - Receive official CPID

5. **Onboard First Customer**
   - Provision CP credentials
   - Configure API access
   - Provide documentation and support

### For Full Service MAP

1. **Complete Pure PSTN2 MAP Setup** (above)

2. **Establish PSTN Connectivity**
   - Interconnect with legacy carriers
   - Obtain SIP trunking capacity
   - Configure SBC (Session Border Controller)

3. **Implement Hybrid Routing**
   - Deploy intelligent call router
   - Configure PSTN/PSTN2 decision logic
   - Test failover scenarios

4. **Regulatory Compliance**
   - Emergency services compliance (911/999)
   - Number portability participation
   - Lawful intercept capabilities (if required)
   - Data retention policies

5. **Billing & Operations**
   - Implement CDR (Call Detail Record) system
   - Configure rating engine
   - Set up 24/7 NOC monitoring
   - Customer portal and support system

## Success Metrics

### Pure PSTN2 MAP KPIs

- **Authentication Success Rate:** >99.9%
- **Response Time:** <500ms (p95)
- **Uptime:** >99.99%
- **Downstream CPs:** Growth rate
- **Revenue per CP:** Monthly average
- **Support Tickets:** <1% of total calls

### Full Service MAP KPIs

- **Call Completion Rate:** >98%
- **Audio Quality (MOS):** >4.0
- **PSTN2 Adoption Rate:** % of calls using PSTN2
- **Cost per Minute:** Trend (should decrease as PSTN2 grows)
- **Customer Churn:** <5% annually
- **Net Promoter Score:** >50

## Risk Mitigation

### Technical Risks

1. **Scalability:** Use auto-scaling cloud infrastructure
2. **Single Point of Failure:** Multi-region deployment
3. **Security Breach:** Regular audits, penetration testing
4. **Protocol Changes:** Automated testing, version management

### Business Risks

1. **Competition:** Differentiate with support quality and features
2. **Price Pressure:** Efficient operations, automation
3. **Regulatory Changes:** Legal counsel, industry participation
4. **Customer Concentration:** Diversify customer base

## Competitive Advantages

### Pure PSTN2 MAP

1. **Specialization** - Focus only on PSTN2 excellence
2. **Lower Prices** - No PSTN overhead costs
3. **Innovation** - Faster feature deployment
4. **Simplicity** - Easy onboarding and management

### Full Service MAP

1. **One-Stop Shop** - Complete voice solution
2. **Gradual Transition** - Help CPs migrate at their pace
3. **Existing Relationships** - Leverage current customer base
4. **Proven Operations** - Established carrier credibility

## Customer Success Stories (Projected)

### Case Study 1: Pure PSTN2 MAP - "CloudVoice MAP"

**Background:** Tech startup targeting small VoIP providers
**Launch:** 6 months to production
**Customers:** 50 downstream CPs after 12 months
**Revenue:** $125K MRR (Monthly Recurring Revenue)
**Growth:** 20% month-over-month

**Key Success Factors:**
- Simple API integration (2-day onboarding)
- Transparent pricing ($100-$500/month tiers)
- Excellent documentation and support
- 99.99% uptime SLA

### Case Study 2: Full Service MAP - "TelcoWholesale+"

**Background:** Existing PSTN wholesaler adding PSTN2
**Launch:** 12 months to production
**Customers:** 200 existing CPs, 75% adopted PSTN2
**Revenue:** $2M MRR (mix of PSTN + PSTN2)
**Cost Savings:** 40% reduction in transit costs from PSTN2 direct routing

**Key Success Factors:**
- Seamless integration with existing services
- No customer migration required
- Automatic PSTN/PSTN2 routing
- Reduced rates passed to customers
- 24/7 white-glove support

## Roadmap

### Year 1 (MVP)
- ✓ Pure PSTN2 MAP implementation
- ✓ Multi-tenant architecture
- ✓ AWS deployment guide
- ✓ Basic authentication and routing
- ✓ Onboard first 10 downstream CPs

### Year 2 (Scale)
- Full Service MAP implementation
- PSTN interconnection
- Geographic expansion (3+ regions)
- Advanced features (call recording, analytics)
- Onboard 100+ CPs

### Year 3 (Enterprise)
- White-label MAP platform
- Advanced API capabilities
- ML-powered fraud detection
- Numbering lists for more countries (one regulator list per country)
- 1,000+ downstream CPs

## Conclusion

Becoming a MAP represents a significant business opportunity in the PSTN2 ecosystem. Whether as a **Pure PSTN2 MAP** focusing on modern VoIP providers, or a **Full Service MAP** bridging legacy and modern networks, MAPs play a crucial role in democratizing access to next-generation telecommunications.

**Key Takeaways:**

1. **Two distinct MAP types** serve different markets
2. **Lower barrier to entry** for Pure PSTN2 MAP
3. **Higher revenue potential** for Full Service MAP
4. **Multi-tenant architecture** is essential for both
5. **Cloud or on-premises** deployment options available
6. **Comprehensive documentation** and code provided

## Next Steps

1. Read **MAP-MULTITENANT-DESIGN.md** for the technical deep-dive and architecture patterns
2. Choose deployment model:
   - **AWS:** Read MAP-DEPLOYMENT-AWS.md
   - **On-Premises:** Read MAP-DEPLOYMENT-ONPREM.md
3. Review reference implementations at https://pstn2.org/code/
4. Run certification test suite
5. Join PSTN2 consortium and obtain CPID

---

**Document Version:** 1.1
**Last Updated:** 2026-10-06
**Maintained By:** PSTN2 Project
**License:** Public Domain / CC0

For questions or support, contact: nick.holland@8x8.com
