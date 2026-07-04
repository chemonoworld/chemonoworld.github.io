---
title: "Linux Network Hands-on Tutorial"
description: "TUN/TAP, Linux routing, VPC network, socat, VSOCK을 Linux VM에서 직접 실습하며 네트워크 경로와 인터페이스 동작을 정리합니다."
pubDate: 2026-07-04
tags: ["linux", "network", "tun", "tap", "vpc", "socat", "vsock"]
---

TUN/TAP, Linux routing, VPC network, socat, VSOCK을 "명령을 직접 치면서" 이해하기 위한 실습 튜토리얼입니다.

목표는 명령을 외우는 것이 아니라 아래 질문에 답할 수 있게 되는 것입니다.

- 이 패킷은 어느 인터페이스로 나가는가?
- 라우팅 테이블은 어떤 기준으로 경로를 고르는가?
- TUN과 TAP은 왜 둘 다 가상 NIC인데 다르게 쓰이는가?
- socat 같은 프록시/릴레이는 kernel routing과 무엇이 다른가?
- VPC route table과 Linux route table은 같은 것인가, 다른 것인가?
- Nitro Enclave/VSOCK은 IP 네트워크와 어디서 갈라지는가?

## 0. 실습 전제

이 문서는 Linux VM에서 실행하는 것을 기준으로 합니다. macOS에서는 `ip netns`, `ip tuntap`, Linux bridge 동작이 그대로 되지 않습니다.

권장 환경:

- Ubuntu 22.04/24.04, Debian, Amazon Linux 2023 중 하나
- `sudo` 권한
- 가능하면 버려도 되는 VM 또는 실습용 EC2

패키지 설치:

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y iproute2 iputils-ping tcpdump socat netcat-openbsd
```

```bash
# Amazon Linux/Fedora/RHEL 계열
sudo dnf install -y iproute iputils tcpdump socat nc
```

실습 중 만든 리소스 이름은 모두 `ns-client`, `ns-router`, `ns-server`, `tun-lab`, `tap-lab`, `br-lab`처럼 고정합니다.

실습을 초기화하고 싶으면 아래 cleanup을 실행합니다.

```bash
sudo ip netns del ns-client 2>/dev/null || true
sudo ip netns del ns-router 2>/dev/null || true
sudo ip netns del ns-server 2>/dev/null || true
sudo ip link del tun-lab 2>/dev/null || true
sudo ip link del br-lab 2>/dev/null || true
sudo ip tuntap del dev tap-lab mode tap 2>/dev/null || true
```

## 1. 현재 Linux 네트워크 상태 보기

먼저 지금 OS가 네트워크를 어떻게 보고 있는지 확인합니다.

```bash
ip -br link
```

볼 것:

- `lo`는 loopback입니다.
- `eth0`, `ens5`, `enp0s...` 같은 이름은 실제 또는 가상 NIC입니다.
- `UP`이면 link가 올라와 있습니다.

```bash
ip -br addr
```

볼 것:

- 각 인터페이스에 붙은 IP 주소를 봅니다.
- EC2라면 보통 private IP가 NIC에 붙어 있습니다.

```bash
ip route show
```

볼 것:

- `default via ... dev ...`는 기본 경로입니다.
- `10.x.x.x/.. dev ...` 같은 줄은 직접 연결된 네트워크입니다.
- Linux routing은 목적지 IP를 보고 이 테이블에서 가장 적절한 route를 고릅니다.

```bash
ip rule show
```

볼 것:

- 기본적으로 `local`, `main`, `default` rule이 있습니다.
- policy routing을 쓰면 source IP, fwmark 등에 따라 다른 route table을 보게 할 수 있습니다.

```bash
ip route get 8.8.8.8
```

볼 것:

- 실제 패킷을 보내지 않고, 커널이 "8.8.8.8로 가려면 어떤 dev/source/gateway를 쓰는지" 계산한 결과를 보여줍니다.
- 라우팅 문제를 볼 때 가장 먼저 쓰기 좋은 명령입니다.

## 2. 격리된 미니 네트워크 만들기

이제 host를 직접 망가뜨리지 않도록 network namespace 안에 작은 네트워크를 만듭니다.

구성:

```text
ns-client                ns-router                  ns-server
10.10.1.2/24  <---->  10.10.1.1/24
                         10.10.2.1/24  <---->  10.10.2.2/24
```

namespace 생성:

```bash
sudo ip netns add ns-client
sudo ip netns add ns-router
sudo ip netns add ns-server
```

확인:

```bash
ip netns list
```

veth pair 생성:

```bash
sudo ip link add veth-client type veth peer name veth-r1
sudo ip link add veth-server type veth peer name veth-r2
```

의미:

- `veth`는 가상 랜선 한 쌍입니다.
- 한쪽으로 들어간 frame은 반대쪽으로 나옵니다.
- container, namespace, CNI를 이해할 때 핵심입니다.

각 veth를 namespace에 넣습니다.

```bash
sudo ip link set veth-client netns ns-client
sudo ip link set veth-r1 netns ns-router
sudo ip link set veth-server netns ns-server
sudo ip link set veth-r2 netns ns-router
```

IP 주소를 붙입니다.

```bash
sudo ip -n ns-client addr add 10.10.1.2/24 dev veth-client
sudo ip -n ns-router addr add 10.10.1.1/24 dev veth-r1
sudo ip -n ns-router addr add 10.10.2.1/24 dev veth-r2
sudo ip -n ns-server addr add 10.10.2.2/24 dev veth-server
```

인터페이스를 올립니다.

```bash
sudo ip -n ns-client link set lo up
sudo ip -n ns-router link set lo up
sudo ip -n ns-server link set lo up
sudo ip -n ns-client link set veth-client up
sudo ip -n ns-router link set veth-r1 up
sudo ip -n ns-router link set veth-r2 up
sudo ip -n ns-server link set veth-server up
```

상태 확인:

```bash
sudo ip -n ns-client -br addr
sudo ip -n ns-router -br addr
sudo ip -n ns-server -br addr
```

## 3. 같은 subnet 통신 확인

client에서 router의 같은 subnet 쪽 IP로 ping합니다.

```bash
sudo ip netns exec ns-client ping -c 2 10.10.1.1
```

성공해야 합니다.

server에서 router의 같은 subnet 쪽 IP로 ping합니다.

```bash
sudo ip netns exec ns-server ping -c 2 10.10.2.1
```

성공해야 합니다.

이 단계의 핵심:

- 같은 subnet의 상대는 gateway 없이 직접 보냅니다.
- Linux는 connected route를 자동으로 만듭니다.

확인:

```bash
sudo ip -n ns-client route show
sudo ip -n ns-server route show
```

## 4. 다른 subnet 통신이 처음에 실패하는 이유

client에서 server로 ping합니다.

```bash
sudo ip netns exec ns-client ping -c 2 10.10.2.2
```

대개 실패합니다.

왜 실패하는지 route lookup으로 봅니다.

```bash
sudo ip -n ns-client route get 10.10.2.2
```

볼 것:

- route가 없으면 `Network is unreachable`가 납니다.
- client는 `10.10.1.0/24`만 직접 알고 있고, `10.10.2.0/24`로 가는 법을 모릅니다.

client에 default route를 추가합니다.

```bash
sudo ip -n ns-client route add default via 10.10.1.1
```

server에도 돌아오는 경로를 추가합니다.

```bash
sudo ip -n ns-server route add default via 10.10.2.1
```

다시 route lookup:

```bash
sudo ip -n ns-client route get 10.10.2.2
sudo ip -n ns-server route get 10.10.1.2
```

이제 경로는 잡히지만 ping은 아직 실패할 수 있습니다.

```bash
sudo ip netns exec ns-client ping -c 2 10.10.2.2
```

router namespace가 패킷 forwarding을 하지 않기 때문입니다.

router에서 IP forwarding을 켭니다.

```bash
sudo ip netns exec ns-router sysctl -w net.ipv4.ip_forward=1
```

다시 ping합니다.

```bash
sudo ip netns exec ns-client ping -c 2 10.10.2.2
```

성공해야 합니다.

이 단계의 핵심:

- route가 있다는 것과 forwarding이 켜져 있다는 것은 다른 문제입니다.
- client와 server는 gateway를 알아야 합니다.
- router는 들어온 패킷을 다른 인터페이스로 넘겨야 합니다.

## 5. 라우팅은 "가장 구체적인 prefix"를 우선한다

현재 client는 default route로 server에 갑니다.

```bash
sudo ip -n ns-client route show
```

server 하나만 막는 blackhole route를 추가합니다.

```bash
sudo ip -n ns-client route add blackhole 10.10.2.2/32
```

route lookup:

```bash
sudo ip -n ns-client route get 10.10.2.2
```

볼 것:

- `blackhole 10.10.2.2`처럼 보입니다.
- `/32`는 host 하나를 뜻하고, `default`보다 훨씬 구체적입니다.

ping:

```bash
sudo ip netns exec ns-client ping -c 2 10.10.2.2
```

실패해야 합니다.

blackhole route를 지웁니다.

```bash
sudo ip -n ns-client route del blackhole 10.10.2.2/32
```

다시 확인:

```bash
sudo ip netns exec ns-client ping -c 2 10.10.2.2
```

핵심:

- Linux route 선택은 대략 `longest prefix match -> metric -> 기타 조건` 순서로 이해하면 됩니다.
- `10.10.2.2/32`는 `0.0.0.0/0`보다 우선합니다.

## 6. tcpdump로 실제 패킷 보기

터미널 1에서 router의 client쪽 인터페이스를 봅니다.

```bash
sudo ip netns exec ns-router tcpdump -n -i veth-r1 icmp
```

터미널 2에서 ping합니다.

```bash
sudo ip netns exec ns-client ping -c 3 10.10.2.2
```

터미널 1에서 볼 것:

- `10.10.1.2 > 10.10.2.2: ICMP echo request`
- `10.10.2.2 > 10.10.1.2: ICMP echo reply`

이제 router의 server쪽 인터페이스도 봅니다.

```bash
sudo ip netns exec ns-router tcpdump -n -i veth-r2 icmp
```

다시 ping:

```bash
sudo ip netns exec ns-client ping -c 3 10.10.2.2
```

핵심:

- routing은 추상적인 설정이 아니라 실제로 한 인터페이스에서 다른 인터페이스로 packet을 이동시키는 일입니다.
- `tcpdump`는 "패킷이 여기까지 왔는지"를 확인하는 가장 직접적인 도구입니다.

## 7. TUN 이해하기: Layer 3 가상 인터페이스

TUN은 Ethernet frame이 아니라 IP packet을 유저스페이스 프로그램과 주고받는 가상 장치입니다.

TUN 장치를 만듭니다.

```bash
sudo ip tuntap add dev tun-lab mode tun user "$USER"
```

IP를 붙입니다.

```bash
sudo ip addr add 172.16.100.1/24 dev tun-lab
```

link를 올립니다.

```bash
sudo ip link set tun-lab up
```

확인:

```bash
ip -d link show tun-lab
ip addr show tun-lab
ip route show dev tun-lab
```

볼 것:

- `tun-lab`은 `POINTOPOINT`, `NOARP` 성격을 가집니다.
- `172.16.100.0/24 dev tun-lab` connected route가 생깁니다.

route lookup:

```bash
ip route get 172.16.100.2
```

볼 것:

- 목적지가 `172.16.100.2`이면 `dev tun-lab`으로 나간다고 나옵니다.

터미널 1에서 TUN 인터페이스를 봅니다.

```bash
sudo tcpdump -n -i tun-lab
```

터미널 2에서 ping합니다.

```bash
ping -c 3 172.16.100.2
```

결과:

- ping은 실패합니다.
- 하지만 tcpdump에는 ICMP echo request가 보일 수 있습니다.

왜 실패하는가:

- 커널은 packet을 `tun-lab`으로 보냈습니다.
- 하지만 `/dev/net/tun`을 열고 그 packet을 읽어서 응답을 만들어줄 유저스페이스 프로그램이 없습니다.
- 즉 TUN은 "터널 자체"가 아니라 "터널 프로그램이 packet을 주고받는 입구"입니다.

## 8. TAP 이해하기: Layer 2 가상 인터페이스

TAP은 Ethernet frame을 다룹니다. VM의 가상 NIC, Linux bridge, L2 실험에 자주 쓰입니다.

bridge를 만듭니다.

```bash
sudo ip link add br-lab type bridge
```

bridge에 IP를 붙입니다.

```bash
sudo ip addr add 172.16.200.1/24 dev br-lab
```

bridge를 올립니다.

```bash
sudo ip link set br-lab up
```

TAP 장치를 만듭니다.

```bash
sudo ip tuntap add dev tap-lab mode tap user "$USER"
```

TAP을 bridge에 붙입니다.

```bash
sudo ip link set tap-lab master br-lab
```

TAP을 올립니다.

```bash
sudo ip link set tap-lab up
```

확인:

```bash
ip -d link show tap-lab
bridge link show
ip addr show br-lab
```

볼 것:

- `tap-lab`은 bridge `br-lab`의 port가 됩니다.
- TAP은 Ethernet frame을 다루기 때문에 MAC 주소와 bridge 관계가 중요합니다.

터미널 1에서 bridge의 ARP를 봅니다.

```bash
sudo tcpdump -e -n -i br-lab arp
```

터미널 2에서 아직 없는 IP로 ping합니다.

```bash
ping -c 3 172.16.200.2
```

볼 것:

- ARP request가 보입니다.
- 하지만 응답할 VM/프로세스가 없으므로 ping은 실패합니다.

TUN과 TAP 차이:

- TUN: IP packet부터 다룸. L3. VPN, 라우팅 터널에 적합.
- TAP: Ethernet frame부터 다룸. L2. VM, bridge, 같은 broadcast domain 실험에 적합.

## 9. socat으로 "프록시/릴레이" 감각 잡기

socat은 kernel route를 바꾸는 도구가 아닙니다. 두 endpoint 사이에서 application byte stream을 중계하는 유저스페이스 프로세스입니다.

먼저 server namespace에서 TCP echo 비슷한 endpoint를 엽니다.

터미널 1:

```bash
sudo ip netns exec ns-server socat -v TCP-LISTEN:8080,reuseaddr,fork -
```

client에서 접속합니다.

터미널 2:

```bash
sudo ip netns exec ns-client socat - TCP:10.10.2.2:8080
```

터미널 2에서 아무 문자열을 입력해 봅니다.

```text
hello from client
```

볼 것:

- 터미널 1에 데이터가 찍힙니다.
- 이때 IP routing은 이미 3-4장에서 구성한 경로를 씁니다.

이제 router namespace에 TCP 프록시를 둡니다.

터미널 1은 그대로 server listener를 유지합니다.

터미널 3:

```bash
sudo ip netns exec ns-router socat -v TCP-LISTEN:9000,reuseaddr,fork TCP:10.10.2.2:8080
```

client는 server가 아니라 router의 9000번으로 접속합니다.

터미널 2:

```bash
sudo ip netns exec ns-client socat - TCP:10.10.1.1:9000
```

핵심:

- client 입장에서는 `10.10.1.1:9000`에 연결합니다.
- router의 socat 프로세스가 `10.10.2.2:8080`으로 새 TCP 연결을 만듭니다.
- 이것은 kernel forwarding과 다릅니다. L4/L7 유저스페이스 중계입니다.

## 10. VPC network를 Linux 실습과 연결하기

VPC는 클라우드에서 만드는 논리적 사설 네트워크입니다.

위 namespace 실습을 AWS VPC에 대응시키면 이렇게 볼 수 있습니다.

| 실습 구성 | AWS VPC 개념 |
| --- | --- |
| `10.10.0.0/16` 전체 그림 | VPC CIDR |
| `10.10.1.0/24` | Subnet A |
| `10.10.2.0/24` | Subnet B |
| `ns-client`, `ns-server` | EC2 instance 또는 workload |
| veth interface | ENI에 붙은 OS NIC와 비슷한 관찰 지점 |
| `ns-router` | 라우터/NAT/중계 지점의 단순화 모델 |
| `ip route` | Linux kernel route table |
| VPC route table | AWS control plane의 subnet별 route 정책 |

중요한 구분:

- Linux route table은 인스턴스 안의 kernel이 봅니다.
- VPC route table은 AWS 네트워크가 subnet 단위로 봅니다.
- Security group은 ENI에 붙는 stateful firewall입니다.
- NACL은 subnet 경계의 stateless firewall입니다.
- Linux firewall은 인스턴스 안의 `nftables`/`iptables`입니다.

EC2 안에서 볼 것:

```bash
ip -br addr
ip route show
ip route get 1.1.1.1
```

AWS 쪽에서 볼 것:

```bash
aws ec2 describe-vpcs
aws ec2 describe-subnets
aws ec2 describe-route-tables
aws ec2 describe-security-groups
aws ec2 describe-network-interfaces
```

EC2 metadata에서 ENI 정보를 보는 예:

```bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/network/interfaces/macs/
```

핵심:

- "EC2에서 `ip route`가 맞는데 외부 통신이 안 된다"면 VPC route table, security group, NACL, NAT/IGW를 봐야 합니다.
- "VPC 설정은 맞는데 EC2 안에서 이상하다"면 Linux route, firewall, local process bind address를 봐야 합니다.

## 11. VSOCK을 IP 네트워크와 분리해서 이해하기

VSOCK은 일반 TCP/IP가 아닙니다. IP address 대신 CID와 port를 씁니다.

확인:

```bash
ls -l /dev/vsock 2>/dev/null || true
lsmod | grep -i vsock || true
ss -A vsock -a 2>/dev/null || true
socat -h | grep -i vsock || true
```

볼 것:

- 환경에 따라 아무것도 안 나올 수 있습니다.
- 일반 Linux VM, WSL, Nitro Enclave, Firecracker, QEMU 환경마다 지원 상태가 다릅니다.

Nitro Enclave 관점:

```text
VPC IP network
  -> parent EC2 ENI
  -> Linux TCP process or proxy
  -> AF_VSOCK cid:port
  -> enclave process
```

중요:

- enclave에는 일반 VPC ENI가 붙지 않습니다.
- parent instance와 enclave 사이 통신은 VSOCK으로 봅니다.
- enclave가 외부 AWS API에 접근하려면 parent의 `vsock-proxy` 같은 중계가 필요합니다.
- 외부 TCP 요청을 enclave로 넣으려면 parent에서 TCP-to-VSOCK bridge가 필요합니다.

## 12. 최종 cleanup

실습 리소스를 정리합니다.

```bash
sudo ip netns del ns-client 2>/dev/null || true
sudo ip netns del ns-router 2>/dev/null || true
sudo ip netns del ns-server 2>/dev/null || true
sudo ip link del tun-lab 2>/dev/null || true
sudo ip link del br-lab 2>/dev/null || true
sudo ip tuntap del dev tap-lab mode tap 2>/dev/null || true
```

확인:

```bash
ip netns list
ip link show tun-lab 2>/dev/null || echo "tun-lab removed"
ip link show tap-lab 2>/dev/null || echo "tap-lab removed"
ip link show br-lab 2>/dev/null || echo "br-lab removed"
```

## 13. 디버깅 순서 요약

네트워크가 안 될 때 아래 순서로 봅니다.

1. 대상 프로세스가 떠 있는가?
   ```bash
   ss -lntup
   ```

2. 내 OS가 목적지로 어떤 경로를 고르는가?
   ```bash
   ip route get <destination-ip>
   ```

3. route table은 의도대로인가?
   ```bash
   ip route show
   ip rule show
   ```

4. 패킷이 인터페이스에 실제로 보이는가?
   ```bash
   sudo tcpdump -n -i <interface> host <ip>
   ```

5. 같은 subnet 문제인가, gateway 문제인가, forwarding 문제인가?
   ```bash
   ping <same-subnet-peer>
   ping <gateway>
   ping <remote-subnet-peer>
   sysctl net.ipv4.ip_forward
   ```

6. cloud 경계 문제인가?
   ```bash
   aws ec2 describe-route-tables
   aws ec2 describe-security-groups
   aws ec2 describe-network-acls
   ```

7. proxy/VSOCK 문제인가?
   ```bash
   ss -lntup
   ss -A vsock -a
   journalctl -u <proxy-service>
   ```

## 14. 머릿속 모델

마지막으로 이렇게 나눠서 생각하면 덜 헷갈립니다.

```text
TUN/TAP
  Linux 안에 만든 가상 NIC.
  TUN은 L3 IP packet, TAP은 L2 Ethernet frame.

Linux routing
  Linux kernel이 목적지 IP를 보고 dev/gateway/source를 고르는 규칙.

socat/proxy
  kernel route를 바꾸는 것이 아니라 유저스페이스에서 두 endpoint를 중계하는 프로세스.

VPC network
  cloud provider가 관리하는 subnet, route table, gateway, firewall 경계.

VSOCK
  IP 밖의 host-guest/enclave 통신. CID와 port를 사용.
```
