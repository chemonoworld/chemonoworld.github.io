---
title: "Linux Networking 자료 모음"
description: "Bootlin 강의자료를 중심으로 Linux networking stack, VSOCK, virtio, Nitro Enclaves를 이어 보기 위한 링크 정리."
pubDate: 2026-07-14
category: "Memo"
lang: "ko"
tags: ["linux", "networking", "kernel", "vsock", "virtio", "nitro-enclaves"]
---

Bootlin의 Linux networking 강의자료를 봤는데, 생각보다 상당히 좋았다. 이런 자료는 나중에 다시 찾으려 하면 꼭 안 보이기 때문에, 관련 링크들을 한곳에 묶어둔다.

이름에는 Embedded Linux가 붙어 있지만, 내용은 꽤 일반적인 Linux networking stack에 가깝다. socket API에서 시작해 `sk_buff`, `net_device`, NAPI, qdisc, Netfilter, routing, driver, eBPF/XDP까지 내려간다. 결국 Linux에서 packet이 어떻게 만들어지고, 어디를 지나가고, 어떤 구조체에 담기고, 어느 지점에서 driver와 만나는지를 보고 싶다면 이 자료부터 봐야됨.

## Bootlin 자료

- [Embedded Linux networking training](https://bootlin.com/training/networking/): 강의 소개 페이지. 여기서 slides, practical labs, lab data를 한 번에 찾을 수 있다.
- [Networking slides](https://bootlin.com/doc/training/networking/networking-slides.pdf): 메인 교재. Linux networking stack을 큰 흐름으로 잡기에 가장 좋다.
- [Practical labs](https://bootlin.com/doc/training/networking/networking-espressobin-labs.pdf): 실습 교재. Espressobin 보드 기준이긴 한데, `iproute2`, namespace, bridge, driver, XDP 흐름을 보는 데는 충분히 참고할 만하다.
- [Lab data](https://bootlin.com/doc/training/networking/networking-espressobin-labs.tar.xz): 실습용 데이터 tarball.
- [Bootlin Elixir](https://elixir.bootlin.com/linux/latest/source): Linux kernel source browser. 슬라이드에서 나온 함수나 구조체를 실제 source에서 따라가야 할 때 쓴다.

## Linux Kernel 공식 문서

- [Linux networking documentation](https://docs.kernel.org/networking/index.html): 공식 networking 문서 인덱스. 최신 kernel 기준으로 확인해야 할 때 여기부터 들어가면 됨.
- [`sk_buff`](https://docs.kernel.org/networking/skbuff.html): packet buffer 구조체를 볼 때 필요하다. Linux networking을 보려면 결국 `sk_buff`를 피할 수 없다.
- [NAPI](https://docs.kernel.org/networking/napi.html): NIC driver가 interrupt만으로 packet을 처리하지 않고 polling과 섞어서 처리하는 흐름을 볼 때 봐야됨.

## VSOCK, Virtio, Nitro Enclaves

- [`vsock(7)`](https://man7.org/linux/man-pages/man7/vsock.7.html): user space에서 `AF_VSOCK`을 어떻게 쓰는지 보는 man page.
- [Linux VSOCK documentation](https://docs.kernel.org/networking/vsock.html): kernel 쪽 VSOCK 개념과 transport 구조를 볼 때 필요하다.
- [Linux virtio documentation](https://docs.kernel.org/driver-api/virtio/virtio.html): virtio device, driver, virtqueue의 기본 모델을 잡는 공식 문서.
- [Nitro Enclaves kernel overview](https://docs.kernel.org/virt/ne_overview.html): Nitro Enclaves driver와 ioctl 기반 제어 흐름을 볼 때 시작점으로 좋다.

Nitro Enclaves나 VSOCK을 이해하려면 일반적인 TCP/IP stack만 봐서는 조금 부족하다. `AF_VSOCK`은 socket API로 보이지만, 아래쪽에서는 transport, virtio, hypervisor, enclave driver 같은 개념이 같이 튀어나온다. 그래서 Bootlin 자료로 Linux networking의 기본 골격을 먼저 잡고, 그 다음 VSOCK과 virtio 문서를 붙여 보는 편이 낫다.

## 실습으로 붙일 자료

- [Stanford CS144](https://web.stanford.edu/class/cs144/): TCP를 직접 구현하면서 protocol state machine, retransmission, stream reassembly 같은 감각을 익히기 좋다.
- [XDP tutorial](https://github.com/xdp-project/xdp-tutorial): eBPF/XDP를 손으로 만져볼 때 참고하면 좋다. 다만 이쪽은 워낙 빠르게 바뀌기 때문에 kernel docs와 같이 봐야됨.

## 책

- [The Linux Programming Interface](https://nostarch.com/tlpi): socket, file descriptor, syscall, process, epoll 같은 Linux userspace programming 기반을 잡기 좋다. 최신 networking stack 책은 아니지만, API 감각을 만들기에는 여전히 강하다.
- [Linux Kernel Networking](https://link.springer.com/book/10.1007/978-1-4302-6197-1): kernel networking 내부 구조를 책 형태로 훑을 수 있다. 다만 오래된 책이라 최신 kernel 세부사항은 공식 문서와 source로 보정해야됨.
- [Learning eBPF](https://www.oreilly.com/library/view/learning-ebpf/9781098135119/): modern Linux networking에서 eBPF/XDP 관점이 필요할 때 보면 좋다.
- [Networking and Kubernetes](https://www.oreilly.com/library/view/networking-and-kubernetes/9781492081647/): namespace, veth, bridge, routing, iptables/nftables, overlay networking을 Kubernetes 맥락에서 이어 보기 좋다.

## 보는 순서

1. Bootlin slides로 큰 지도를 잡아야됨.
2. 이해 안 되는 구조체는 Elixir에서 바로 source를 봐야됨.
3. `sk_buff`, `net_device`, NAPI, qdisc, Netfilter, routing 순서로 packet path를 따라가야됨.
4. VSOCK, virtio, Nitro Enclaves는 일반 networking stack과 구분해서 공식 문서와 source를 따로 봐야됨.
5. 시간이 되면 CS144나 XDP tutorial로 손에 잡히는 실습을 붙이면 좋겠다.
