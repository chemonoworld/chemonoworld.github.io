---
title: 'ECDHE & Commit-Reveal Scheme'
description: 'Deep dive into ECDHE key exchange & Commit-Reveal schemes in the context of Web3Auth.'
pubDate: 'Jul 10 2025'
tags: ['cryptography', 'ecdhe', 'aes-gcm', 'web3auth', 'mpc']
---

*Original presentation by Jinwoo Lee on Jul 10, 2025*

## 1. ECDHE (Elliptic Curve Diffie-Hellman Ephemeral)

### 기본적인 컨셉

Alice와 Bob이 각각 Key Pair를 생성하고 <strong>키 교환(Key Exchange)</strong>을 통해 둘만 아는 (대칭)암호화 키를 만들어 비밀 커뮤니케이션 채널을 만드는 것입니다. VPN이나 HTTPS(TLS)에 활용됩니다.

![ECDHE Process](./image.png)

### 1.1. Initial Setup

**Public Parameters:**
- **타원곡선 $E$**: (ex. `ed25519`, `secp256k1`)
- **기준점 $G$** (Generator): 타원곡선마다 정해져 있음.
- **소수 $p$** (유한체의 크기): `ed25519`는 거의 256bit에 근접($2^{256}$).
- **HKDF**: Key Derivation Function.

### 1.2. Keygen

**Alice의 키 생성:**
- **비밀키**: $a$ (랜덤 숫자)
- **공개키**: $A = a \times G$

**Bob의 키 생성:**
- **비밀키**: $b$ (랜덤 숫자)
- **공개키**: $B = b \times G$

### 1.3. Key Exchange

- Alice와 Bob이 공개키 $A$, $B$를 서로 교환합니다.
- 도청꾼(Eavesdropper)은 $A, B, G$를 볼 수 있지만 비밀키 $a, b$는 알 수 없습니다 (Discrete Logarithm Problem).

### 1.4. Shared Secret 계산

- **Alice**: $S = a \times B = a \times (b \times G) = abG$
- **Bob**: $S = b \times A = b \times (a \times G) = abG$

**Result**: 둘 다 같은 값 $S$를 얻습니다!

### 1.5. 공유 비밀로 대칭키 암호화 키 얻기

**대칭키 암호화 관련**
- AES-GCM 등의 대칭키 암호화 키는 보통 16bytes 또는 32bytes를 사용합니다.
- 그러나 타원곡선 점(Shared Secret $S$)의 좌표는 보통 32bytes ($x$) + 32bytes ($y$) = 64bytes이므로 포맷이 맞지 않습니다.

**KDF (Key Derivation Function)의 역할**
- Shared Secret $S$로부터 적절한 길이의 암호화 키를 유도하기 위해 **HKDF** (HMAC-based KDF) 등을 사용합니다.

### 1.6. ECDHE란?

**Ephemeral (일시적인)**
- ECDH로 만든 공유 비밀을 **일회용** 또는 **해당 세션 동안만** 쓰는 대칭키 암호화용 키로 활용한다는 의미입니다 (Forward Secrecy 보장).

---

## 2. Commit-Reveal Scheme 개요

### 2.1. 커밋(Commit) 단계

- 사용자는 어떤 값을 <strong>숨긴 채 커밋(Commit)</strong>합니다.
- 해시나 암호화 기법을 사용하여, **내용은 숨기되 변경은 못 하게(Binding)** 합니다.

```text
commitment = Hash(value || nonce)
```

- `value`: 숨기고 싶은 값 (ex. 투표, 랜덤 값, 예측 결과 등)
- `nonce`: 무작위 값 (같은 value라도 해시 충돌/Rainbow Table 공격 방지)

### 2.2. 리빌(Reveal) 단계

- 이후에 사용자는 `value`와 `nonce`를 <strong>공개(Reveal)</strong>합니다.
- 다른 사람들은 이를 보고 실제로 커밋한 값이 맞는지 검증합니다.
    - `commitment == Hash(value || nonce)` 확인.

---

## 3. Web3Auth에서의 활용

### 기본적인 컨셉

ECDHE로 유저(Web3Auth SDK)와 Committee 사이에 <strong>세션 키</strong>를 만들고, 이를 통해 Google OAuth Token을 Commit-Reveal Scheme으로 안전하게 Committee에 전달하여 인증합니다.

- **User ($A$)**: 세션마다 Key Pair 새로 생성 ($sk_a, pk_a$)
- **Committee 1 ($B$)**: $pk_b$는 공개되어 있음 (인증서 포함)
- **Committee 2 ($C$)**: $pk_c$는 공개되어 있음 (인증서 포함)

### 3.1. Commit

#### User(SDK) $\rightarrow$ Committee Request
1.  User는 $H(\text{id\_token})$와 자신의 공개키 $pk_a$를 전송합니다.
2.  Committee는 받으려는 token의 해시값만 알 뿐, 실제 토큰은 알 수 없습니다.
    - 다른 Committee에게 토큰을 유출하거나 악용할 수 없습니다.
3.  User와 Committee는 ECDH를 수행합니다:
    - User 계산: $S = sk_a \times pk_b$
    - Committee 계산: $S = sk_b \times pk_a$
    - 이를 통해 공유 비밀 생성 후 대칭키 암호화 키 $K$를 유도합니다.

#### Committee $\rightarrow$ User Response (추측)
- $pk_b$와 인증서(개인키로 서명)를 전송하여 MITM 공격을 방지합니다.

### 3.2. Reveal

#### User $\rightarrow$ Committee Request
1.  User는 `id_token`을 키 $K$로 암호화(AES-GCM)하여 전송합니다.
    - `Enc(id_token)`
2.  이때 $sk_a$의 소유를 증명하는 서명 등을 함께 보낼 수 있습니다.

#### Committee $\rightarrow$ User Response
1.  Committee는 `Enc(id_token)`을 $K$로 복호화합니다.
2.  복호화된 `id_token`을 검증합니다.
3.  성공 시 Key Share를 발급할 수 있는 `access_token`을 지급하거나, Key Share를 암호화하여 전송합니다.

---

## 4. MITM (Man In The Middle) Attack

### 기본적인 컨셉

중간자 공격이라고 하며, **Mallory**($M$)가 Alice($A$)와 Bob($B$) 사이의 패킷을 가로채고, 가짜 공개키를 서로에게 보내 중간에서 메시지를 복호화/변조하는 공격입니다.

### 4.1. Process

**Mallory ($M$)**: 키 페어 $sk_m, pk_m$ 생성.

#### A $\rightarrow$ M $\leftrightarrow$ B
1.  Alice는 Bob에게 $pk_a$를 보내려 하지만, **Mallory가 가로채고 자신의 $pk_m$을 Bob에게 보냅니다.**
2.  Bob은 이를 Alice의 키로 착각하고 Shared Secret을 계산합니다.
    - Bob 계산: $S_b = sk_b \times pk_m$
3.  Bob이 메시지를 $S_b$로 암호화하여 보냅니다.
4.  Mallory는 $S_b$를 계산할 수 있습니다 ($sk_m \times pk_b$).
5.  **Mallory는 메시지를 복호화(감청)합니다.**

#### B $\rightarrow$ M $\leftrightarrow$ A
- 반대 방향도 동일하게 공격 가능합니다. Mallory는 Alice에게 자신의 $pk_m$을 Bob의 키인 것처럼 속입니다.

### 4.2. 방어 방법 (Prevention)

1.  **인증서 (Certificates)**: 신뢰할 수 있는 인증 기관(CA)이 서명한 인증서를 통해 공개키의 주인이 누구인지 검증합니다.
2.  **사전 검증**: 공개키를 사전에 안전한 채널로 공유하거나, 디지털 서명을 통해 개인키 소유를 검증합니다.
