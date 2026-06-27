---
title: "Pedersen DKG Materials"
description: "Visual materials for explaining Pedersen DKG polynomial shares, commitments, share verification, and final aggregation."
pubDate: 2026-06-23
updatedDate: 2026-06-27
category: "Memo"
heroImage: "/materials/pedersen-dkg/dkg-final-shares.png"
tags: ["pedersen-dkg", "dkg", "threshold-cryptography", "cryptography"]
---

Visual materials used in [Pedersen DKG란?](/blog/pedersen-dkg/). These diagrams show how each participant creates a local polynomial, broadcasts coefficient commitments, exchanges and verifies shares, then aggregates final shares and a group public key.

- [Source Markdown](/materials/pedersen-dkg/dkg-polynomial-materials.md)
- [Participant 1 polynomial SVG](/materials/pedersen-dkg/dkg-f-1.svg)
- [Participant 2 polynomial SVG](/materials/pedersen-dkg/dkg-f-2.svg)
- [Participant 3 polynomial SVG](/materials/pedersen-dkg/dkg-f-3.svg)
- [Local contribution SVG](/materials/pedersen-dkg/dkg-step1.svg)
- [Group polynomial SVG](/materials/pedersen-dkg/dkg-f-sum.svg)
- [Round 1 commitment SVG](/materials/pedersen-dkg/dkg-round1.svg)
- [Round 2 share exchange PNG](/materials/pedersen-dkg/dkg-step2.png)
- [Round 2 share verification SVG](/materials/pedersen-dkg/dkg-round2.svg)
- [Final shares PNG](/materials/pedersen-dkg/dkg-final-shares.png)

## Polynomial Form

When the threshold is `t`, each participant `i` samples a degree `t - 1` polynomial:

```math
f_i(x) = \sum_{j=0}^{t-1} c_{i,j} x^j
```

The constant term is that participant's local secret contribution:

```math
c_{i,0} = sk_i = f_i(0)
```

For three participants:

```math
f_1(x) = \sum_{j=0}^{t-1} c_{1,j} x^j
```

```math
f_2(x) = \sum_{j=0}^{t-1} c_{2,j} x^j
```

```math
f_3(x) = \sum_{j=0}^{t-1} c_{3,j} x^j
```

## Local Polynomial Shares

### Participant 1

![Participant 1 DKG polynomial](/materials/pedersen-dkg/dkg-f-1.svg)

### Participant 2

![Participant 2 DKG polynomial](/materials/pedersen-dkg/dkg-f-2.svg)

### Participant 3

![Participant 3 DKG polynomial](/materials/pedersen-dkg/dkg-f-3.svg)

## Local Contributions

![Each DKG node creates its own secret contribution](/materials/pedersen-dkg/dkg-step1.svg)

## Group Polynomial

![Three DKG participant polynomials combine into a group polynomial whose y-intercept is the group secret](/materials/pedersen-dkg/dkg-f-sum.svg)

## Round 1 Commitments

![Round 1 commitment broadcast](/materials/pedersen-dkg/dkg-round1.svg)

## Round 2 Share Exchange

![DKG nodes commit, verify, and exchange shares](/materials/pedersen-dkg/dkg-step2.png)

## Round 2 Share Verification

![Round 2 share verification flow](/materials/pedersen-dkg/dkg-round2.svg)

## Final Shares

![Aggregate verified shares into final shares and one public key](/materials/pedersen-dkg/dkg-final-shares.png)
