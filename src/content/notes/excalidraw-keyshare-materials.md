---
title: "Excalidraw Keyshare Materials"
description: "Updated MPC key share split, reshare, and combine diagrams with PNG previews and an importable Excalidraw source file."
pubDate: 2026-06-11
updatedDate: 2026-06-11
category: "Memo"
heroImage: "/materials/excalidraw/split-combine-reshare/combine-20260611-2.png"
tags: ["excalidraw", "mpc", "cryptography"]
---

Updated Excalidraw materials for explaining MPC private key share lifecycle: split, reshare, and combine/recovery.

- [Download the importable Excalidraw source](/materials/excalidraw/split-combine-reshare/split-combine-reshare-20260612.excalidraw)
- [Split PNG](/materials/excalidraw/split-combine-reshare/split-20260612.png)
- [Reshare PNG](/materials/excalidraw/split-combine-reshare/reshare-20260611.png)
- [Combine PNG](/materials/excalidraw/split-combine-reshare/combine-20260611-2.png)

## Split

A private key is split into a 2-of-3 threshold set of shares. No single share is the private key.

![Split one private key into shares](/materials/excalidraw/split-combine-reshare/split-20260612.png)

## Reshare

Existing shares can participate in a resharing protocol to create a new share distribution. The underlying private key stays the same.

![Reshare into a new distribution](/materials/excalidraw/split-combine-reshare/reshare-20260611.png)

## Combine

A valid threshold number of new shares can combine to recover the original private key. This is a recovery/combine operation, not the normal signing path.

![Combine new shares to recover the private key](/materials/excalidraw/split-combine-reshare/combine-20260611-2.png)
