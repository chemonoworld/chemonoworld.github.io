---
title: "Pedersen DKG Materials"
description: "Polynomial diagrams for explaining how each participant samples a local contribution polynomial in Pedersen DKG."
pubDate: 2026-06-23
category: "Memo"
heroImage: "/materials/pedersen-dkg/dkg-final-shares.png"
tags: ["pedersen-dkg", "dkg", "threshold-cryptography", "cryptography"]
---

Materials for explaining the polynomial generation step in Pedersen DKG. Each participant samples its own polynomial and sends evaluated shares to the other participants.

- [Source Markdown](/materials/pedersen-dkg/dkg-polynomial-materials.md)
- [Participant 1 polynomial SVG](/materials/pedersen-dkg/dkg-f-1.svg)
- [Participant 2 polynomial SVG](/materials/pedersen-dkg/dkg-f-2.svg)
- [Participant 3 polynomial SVG](/materials/pedersen-dkg/dkg-f-3.svg)

## Polynomial Form

Each participant `i` samples a degree `t` polynomial:

```math
f_i(x) = \sum_{j=0}^{t} c_{i,j} x^j
```

The constant term is that participant's local secret contribution:

```math
c_{i,0} = sk_i = f_i(0)
```

For three participants:

```math
f_1(x) = \sum_{j=0}^{t} c_{1,j} x^j
```

```math
f_2(x) = \sum_{j=0}^{t} c_{2,j} x^j
```

```math
f_3(x) = \sum_{j=0}^{t} c_{3,j} x^j
```

## Participant 1

![Participant 1 DKG polynomial](/materials/pedersen-dkg/dkg-f-1.svg)

## Participant 2

![Participant 2 DKG polynomial](/materials/pedersen-dkg/dkg-f-2.svg)

## Participant 3

![Participant 3 DKG polynomial](/materials/pedersen-dkg/dkg-f-3.svg)
