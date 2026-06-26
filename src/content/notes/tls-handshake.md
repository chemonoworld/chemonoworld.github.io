---
title: "TLS Handshake"
description: "TLS 1.3 핸드셰이크를 ECDHE key share, 인증서, Finished, 1-RTT 관점에서 간단히 정리."
pubDate: 2026-06-04
category: "Memo"
tags: ["TLS", "cryptography", "ECDHE", "security"]
---

TLS는 HTTP 같은 애플리케이션 데이터를 암호화하기 전에, 클라이언트와 서버가 "이번 연결에서 어떤 키와 알고리즘을 쓸지" 합의하는 프로토콜이다.

요즘 기준으로는 TLS 1.3을 기본으로 보면 된다. 핵심만 잡으면 TLS 1.3 full handshake는 다음 흐름이다.

```text
Client                                               Server

ClientHello
  supported_versions
  cipher_suites
  supported_groups
  key_share = client ephemeral public key
                              -------->

                                      ServerHello
                                        key_share = server ephemeral public key
                                  {EncryptedExtensions}
                                  {Certificate}
                                  {CertificateVerify}
                                  {Finished}
                              <--------

{Finished}                    -------->

[Application Data]            <-------> [Application Data]
```

## `key_share`는 사실상 ECDHE public key

TLS 1.3에서 `key_share`라고 부르는 값은 완성된 세션 키가 아니다. 클라이언트와 서버가 ECDHE shared secret을 만들기 위해 교환하는 각자의 ephemeral public key다.

예를 들어 X25519를 쓴다고 하면 다음과 같다.

```text
Client:
  client private key 생성
  client public key 계산
  ClientHello.key_share로 client public key 전송

Server:
  server private key 생성
  server public key 계산
  ServerHello.key_share로 server public key 전송

Both:
  ECDH(private_key, peer_public_key)
  => 같은 shared secret 계산
```

네트워크에 노출되는 것은 public key뿐이다. 실제 shared secret은 각자의 private key와 상대방의 public key로 계산한다.

중요한 점은 이 shared secret을 그대로 대칭키로 쓰지 않는다는 것이다. TLS 1.3은 HKDF 기반 key schedule을 통해 handshake traffic key, application traffic key 등 여러 키를 분리해서 만든다.

## 인증서는 키 교환이 아니라 서버 인증

헷갈리기 쉬운 부분이 RSA다.

TLS 1.3에서는 static RSA key exchange가 제거됐다. 즉 RSA로 세션 키를 직접 교환하지 않는다. 세션 키 합의는 보통 X25519나 P-256 같은 ECDHE로 하고, RSA 인증서는 서버 인증에 쓰일 수 있다.

정확히는 이런 조합이 가능하다.

```text
Key exchange:   X25519 ECDHE
Authentication: RSA certificate
```

서버가 `Certificate`를 보내면 클라이언트는 다음을 검증한다.

- 인증서 체인이 신뢰 가능한 CA로 이어지는가
- hostname이 인증서 SAN과 일치하는가
- 인증서 유효 기간이 맞는가
- key usage와 signature algorithm이 적절한가

그 다음 `CertificateVerify`에서 서버는 handshake transcript에 서명한다. 클라이언트는 인증서의 public key로 이 서명을 검증한다.

이 단계가 "나는 인증서만 들고 있는 게 아니라, 그 private key도 실제로 갖고 있다"는 증명이다.

## `Finished`는 handshake 전체에 대한 HMAC

`Finished`는 단순 ACK가 아니다. 지금까지 오간 핸드셰이크 메시지 전체 transcript에 대한 MAC이다.

개념적으로는 이렇다.

```text
verify_data = HMAC(
  finished_key,
  Hash(ClientHello ... CertificateVerify)
)
```

서버 `Finished`는 server handshake traffic secret에서 나온 `finished_key`로 만들고, 클라이언트 `Finished`는 client handshake traffic secret에서 나온 `finished_key`로 만든다.

`Finished`가 확인하는 것은 세 가지다.

- 양쪽이 같은 ECDHE shared secret에서 같은 key schedule을 계산했다.
- 중간자가 `ClientHello`, `ServerHello`, cipher suite, key share, 인증서 등을 바꾸지 않았다.
- 양쪽이 같은 handshake transcript를 보고 있다.

## 왜 1-RTT인가

TLS 1.3 full handshake가 1-RTT라고 하는 이유는 애플리케이션 데이터를 보내기까지 네트워크 왕복이 한 번이면 되기 때문이다.

```text
1. Client -> Server: ClientHello + client key_share
2. Server -> Client: ServerHello + server key_share + cert + Finished
3. Client -> Server: Finished + Application Data
```

클라이언트가 첫 메시지에 ECDHE public key를 미리 넣어 보내기 때문에, 서버 응답을 받는 순간 양쪽은 shared secret과 traffic key를 만들 수 있다. 그래서 클라이언트는 자기 `Finished` 뒤에 바로 application data를 붙여 보낼 수 있다.

비교하면 다음과 같다.

| 방식 | Application Data까지 |
| --- | --- |
| TLS 1.2 full handshake | 보통 2-RTT |
| TLS 1.3 full handshake | 보통 1-RTT |
| TLS 1.3 resumption + 0-RTT | 0-RTT 가능 |

0-RTT는 빠르지만 replay risk가 있다. 결제, 주문, signing, nonce 소비 같은 상태 변경 요청에는 기본적으로 쓰면 안 된다.

## 현업에서는 어떻게 쓰이나

요즘 TLS 1.3에서는 X25519 기반 ECDHE가 흔한 기본 키 교환이다. 서버 인증서는 RSA도 아직 흔하고, ECDSA도 많이 쓴다.

정리하면 다음과 같다.

```text
세션 키 합의: X25519 ECDHE
서버 인증:   RSA 또는 ECDSA certificate
무결성 확인: Finished = transcript HMAC
데이터 암호화: application traffic key로 AEAD
```

따라서 "RSA 기반 TLS"라고 말할 때는 조심해야 한다. TLS 1.3에서 RSA가 보이면 보통 key exchange가 아니라 certificate authentication 쪽이다.

AWS ACM for Nitro Enclaves처럼 특정 서비스가 "RSA 인증서만 지원"한다고 할 때도 마찬가지다. 그 말은 인증서 키 알고리즘이 RSA라는 뜻이지, TLS 1.3 세션 키를 RSA로 교환한다는 뜻은 아니다.
