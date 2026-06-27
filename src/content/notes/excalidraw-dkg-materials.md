---
title: "Excalidraw DKG Materials"
description: "Distributed Key Generation diagrams with PNG previews and an importable Excalidraw source file."
pubDate: 2026-06-12
category: "Memo"
heroImage: "/materials/excalidraw/dkg/dkg-final-20260612.png"
tags: ["excalidraw", "dkg", "mpc", "cryptography"]
---

Excalidraw materials for explaining Distributed Key Generation (DKG): participants create secret contributions, exchange/verifiably check shares, then derive final local shares and a group public key without any trusted dealer.

- [Download the importable Excalidraw source](/materials/excalidraw/dkg/dkg-20260612-2.excalidraw)
- [Step 1 PNG](/materials/excalidraw/dkg/dkg-step1-20260612-2.png)
- [Step 2 PNG](/materials/excalidraw/dkg/dkg-step2-20260612.png)
- [Final PNG](/materials/excalidraw/dkg/dkg-final-20260612.png)

## Step 1: Local Contributions

Each participant creates its own secret contribution. There is no original private key controlled by a dealer.

![DKG local contributions](/materials/excalidraw/dkg/dkg-step1-20260612-2.png)

## Step 2: Exchange and Verify

Participants exchange commitments and encrypted shares, then verify received shares before accepting them.

![DKG exchange and verification](/materials/excalidraw/dkg/dkg-step2-20260612.png)

## Final: Shares and Group Public Key

The protocol yields one final share per participant and a group public key. The private key is not assembled during DKG.

![DKG final shares and group public key](/materials/excalidraw/dkg/dkg-final-20260612.png)
