---
title: "Linux Networking 자료 모음"
description: "Bootlin 강의자료를 중심으로 Linux networking stack, VSOCK, virtio, Nitro Enclaves를 이어 보기 위한 링크 정리."
pubDate: 2026-07-14
category: "Memo"
lang: "ko"
tags: ["linux", "networking", "kernel", "vsock", "virtio", "nitro-enclaves"]
---

## Bootlin 자료

- [Embedded Linux networking training](https://bootlin.com/training/networking/)
- [Networking slides](https://bootlin.com/doc/training/networking/networking-slides.pdf)
- [Practical labs](https://bootlin.com/doc/training/networking/networking-espressobin-labs.pdf)
- [Lab data](https://bootlin.com/doc/training/networking/networking-espressobin-labs.tar.xz)
- [Bootlin Elixir](https://elixir.bootlin.com/linux/latest/source)

## Linux Kernel 공식 문서

- [Linux networking documentation](https://docs.kernel.org/networking/index.html)
- [`sk_buff`](https://docs.kernel.org/networking/skbuff.html)
- [NAPI](https://docs.kernel.org/networking/napi.html)

## VSOCK, Virtio, Nitro Enclaves

- [`vsock(7)`](https://man7.org/linux/man-pages/man7/vsock.7.html)
- [Linux VSOCK documentation](https://docs.kernel.org/networking/vsock.html)
- [Linux virtio documentation](https://docs.kernel.org/driver-api/virtio/virtio.html)
- [Nitro Enclaves kernel overview](https://docs.kernel.org/virt/ne_overview.html)

## 실습으로 붙일 자료

- [Stanford CS144](https://web.stanford.edu/class/cs144/)
- [XDP tutorial](https://github.com/xdp-project/xdp-tutorial)

## 책

- [The Linux Programming Interface](https://nostarch.com/tlpi)
- [Linux Kernel Networking](https://link.springer.com/book/10.1007/978-1-4302-6197-1)
- [Learning eBPF](https://www.oreilly.com/library/view/learning-ebpf/9781098135119/)
- [Networking and Kubernetes](https://www.oreilly.com/library/view/networking-and-kubernetes/9781492081647/)

## 보는 순서

1. Bootlin slides 읽기
2. Bootlin Elixir로 Linux source 따라가기
3. `sk_buff`, `net_device`, NAPI 순서로 packet path 보기
4. qdisc, Netfilter, routing 흐름 보기
5. `vsock(7)`, Linux VSOCK docs, virtio docs 보기
6. Nitro Enclaves kernel overview 보기
7. CS144 또는 XDP tutorial로 실습 붙이기
