---
title: "[Concept] Cryptographic Attestation"
description: "Nitro Enclaves와 AWS KMS를 중심으로 cryptographic attestation, PCR, attestation document, secret release 모델을 정리합니다."
pubDate: 2026-05-28
tags: ["cryptography", "attestation", "tee", "nitro-enclaves", "aws-kms"]
---

## 1. 한 줄 정의

**Cryptographic attestation**은 “어떤 코드가 어떤 격리 실행 환경에서, 어떤 상태로 실행 중인지”를 암호학적으로 증명하는 절차다.

Nitro Enclaves 기준으로 말하면 다음 질문에 답하는 메커니즘이다.

> “지금 secret을 요청하는 이 프로그램이, 내가 기대한 enclave image에서, 내가 허용한 IAM role / signing certificate / code measurement로 실행 중인 게 맞는가?”

즉 단순히 “누가 요청했는가”를 보는 IAM 인증보다 한 단계 더 나아가서, **무슨 코드가 어떤 신뢰 가능한 실행환경에서 실행 중인가**까지 확인한다.

---

## 2. 왜 필요한가?

일반적인 서버 보안 모델에서는 다음을 신뢰한다.

* 서버의 IAM role
* OS 권한
* 프로세스 권한
* 네트워크 접근 제어
* 디스크 암호화
* 운영자 접근 통제

하지만 MPC node, key share, HSM-like workload 같은 민감한 시스템에서는 이것만으로 부족하다.

예를 들어 parent EC2 instance가 KMS decrypt 권한을 갖고 있다면, 일반 모델에서는 다음 위험이 생긴다.

```text
Attacker or compromised parent instance
        |
        v
Call KMS Decrypt
        |
        v
Plaintext secret exposed outside enclave
```

Cryptographic attestation을 쓰면 KMS나 외부 verifier가 이렇게 판단할 수 있다.

```text
이 요청은 단순히 EC2 role이 보낸 게 아니라,
특정 Nitro Enclave 안에서,
특정 image measurement를 가진 코드가,
특정 public key를 포함한 attestation document와 함께 보낸 요청이다.
```

그래서 secret release 조건을 다음처럼 바꿀 수 있다.

```text
IAM role이 맞다
AND
요청이 attested enclave에서 왔다
AND
PCR 값이 기대값과 일치한다
AND
debug mode가 아니다
AND
응답은 enclave public key로 암호화해서 돌려준다
```

---

## 3. Attestation이 증명하는 것과 증명하지 않는 것

### 3.1 증명하는 것

Cryptographic attestation은 보통 다음을 증명한다.

| 항목                  | 의미                                      |
| ------------------- | --------------------------------------- |
| Code identity       | 어떤 코드 / 이미지가 실행 중인지                     |
| Runtime environment | 특정 TEE 또는 enclave 안에서 실행 중인지            |
| Measurement         | 코드, 부팅 구성, signer, parent context의 hash |
| Freshness           | nonce 또는 timestamp를 통해 replay가 아닌지      |
| Binding             | 응답을 특정 enclave public key에 묶을 수 있는지     |

Nitro Enclaves에서는 이 정보가 **attestation document**에 들어간다.

---

### 3.2 증명하지 않는 것

Attestation이 모든 것을 해결하는 것은 아니다.

| 증명하지 않는 것                        | 설명                                                |
| -------------------------------- | ------------------------------------------------- |
| 코드가 버그 없다는 것                     | measurement는 “이 코드가 실행 중”임을 증명할 뿐, 코드 품질을 증명하지 않음 |
| business logic이 안전하다는 것          | 정책 로직 자체가 잘못됐으면 attestation은 막지 못함                |
| 입력 데이터가 정상이라는 것                  | enclave 밖에서 들어오는 요청은 별도 검증 필요                     |
| enclave 안에서 secret이 오남용되지 않는다는 것 | enclave 코드가 악성/취약하면 secret을 잘못 쓸 수 있음             |
| side-channel risk가 0이라는 것        | TEE는 side-channel 완전 제거를 보장하지 않음                  |
| parent instance가 선량하다는 것         | parent는 여전히 relay, logging, DoS를 할 수 있음           |

즉 attestation은 **“내가 기대한 코드가 기대한 환경에서 실행 중인지”**를 증명하는 수단이지, 애플리케이션의 모든 보안성을 자동 보장하는 것은 아니다.

---

## 4. 핵심 참여자

Nitro Enclaves cryptographic attestation에는 보통 다음 주체가 있다.

| 주체                               | 역할                                                   |
| -------------------------------- | ---------------------------------------------------- |
| Enclave application              | attestation document를 생성하고 secret을 요청하는 코드           |
| Nitro Secure Module / Hypervisor | enclave measurement를 만들고 attestation document 생성을 지원 |
| AWS Nitro Attestation PKI        | attestation document의 root of trust                  |
| Parent EC2 instance              | 네트워크와 AWS API 호출을 relay                              |
| Verifier                         | attestation document를 검증하는 주체                        |
| AWS KMS                          | 대표적인 managed verifier                                |
| Secret store                     | Secrets Manager, S3, DB 등 ciphertext 저장소             |

구조는 대략 다음과 같다.

```text
Enclave App
  |
  | get attestation document
  v
Nitro Hypervisor / NSM
  |
  v
Signed Attestation Document
  |
  v
Verifier or AWS KMS
  |
  | verify signature + PCR + nonce
  v
Release encrypted secret only to enclave
```

---

## 5. Attestation Document란?

**Attestation document**는 enclave가 verifier에게 제출하는 증명서 같은 것이다.

Nitro Enclaves에서는 이 문서가 다음 특성을 가진다.

* CBOR payload
* COSE signature
* AWS Nitro Attestation PKI 기반 서명
* PCR measurement 포함
* optional public key 포함 가능
* optional nonce 포함 가능
* optional user data 포함 가능

개념적으로는 이런 구조다.

```json
{
  "module_id": "enclave identifier",
  "timestamp": 1716796800000,
  "digest": "SHA384",
  "pcrs": {
    "0": "PCR0 value",
    "1": "PCR1 value",
    "2": "PCR2 value",
    "3": "PCR3 value",
    "4": "PCR4 value",
    "8": "PCR8 value"
  },
  "certificate": "attestation signing certificate",
  "cabundle": ["root cert", "intermediate certs"],
  "public_key": "enclave generated public key",
  "nonce": "verifier challenge",
  "user_data": "protocol specific metadata"
}
```

실제로는 JSON이 아니라 binary 형식이다. 위 예시는 이해를 위한 표현이다.

---

## 6. PCR이란?

PCR은 **Platform Configuration Register**의 약자다. 쉽게 말하면 “실행 환경의 측정값”이다.

어떤 코드, 이미지, signer, parent role 같은 요소를 hash로 측정한 값이라고 보면 된다.

Nitro Enclaves에서 중요한 PCR은 다음과 같다.

|  PCR | 의미                                   | 쉽게 말하면                     |
| ---: | ------------------------------------ | -------------------------- |
| PCR0 | Enclave Image File 전체 measurement    | 이 EIF 자체가 맞는가              |
| PCR1 | Kernel / boot ramfs measurement      | 부팅 구성 요소가 맞는가              |
| PCR2 | Application measurement              | 애플리케이션 코드가 맞는가             |
| PCR3 | Parent instance IAM role measurement | 허용된 IAM role 위에서 실행 중인가    |
| PCR4 | Parent instance ID measurement       | 특정 EC2 instance 위에서 실행 중인가 |
| PCR8 | EIF signing certificate measurement  | 특정 signer가 서명한 EIF인가       |

운영적으로는 PCR0/PCR2는 image가 바뀔 때마다 값이 바뀌기 쉽다. 반면 PCR8은 “이 signer가 서명한 enclave image라면 허용”이라는 식으로 정책을 잡을 수 있어 배포 운영이 더 유연하다.

---

## 7. 전체 흐름

### 7.1 기본 Attestation 흐름

```text
1. Verifier가 nonce를 생성한다.
2. Enclave app이 내부에서 key pair를 생성한다.
3. Enclave app이 public key와 nonce를 포함해 attestation document를 요청한다.
4. Nitro Hypervisor / NSM이 signed attestation document를 만든다.
5. Enclave app이 attestation document를 verifier에게 보낸다.
6. Verifier가 AWS Nitro Attestation PKI chain과 signature를 검증한다.
7. Verifier가 PCR 값이 policy와 맞는지 확인한다.
8. Verifier가 nonce가 맞는지 확인한다.
9. 검증 성공 시 secret, data key, certificate 등을 enclave public key로 암호화해서 보낸다.
10. Enclave만 private key로 응답을 복호화한다.
```

핵심은 secret이 절대 parent instance에 평문으로 떨어지지 않게 만드는 것이다.

---

### 7.2 AWS KMS를 verifier로 쓰는 흐름

AWS KMS를 쓰면 verifier 구현을 직접 만들 필요가 줄어든다. KMS가 attestation document를 이해하고 검증한다.

```text
Enclave App
  |
  | generate attestation document with public key
  v
Parent EC2
  |
  | forward KMS request
  v
AWS KMS
  |
  | verify attestation document
  | verify PCR condition
  | verify IAM / key policy
  v
CiphertextForRecipient
  |
  v
Enclave decrypts inside memory
```

일반 KMS decrypt와 attested KMS decrypt의 차이는 이렇다.

| 구분           | 일반 KMS 호출        | Attested KMS 호출                     |
| ------------ | ---------------- | ----------------------------------- |
| 인증 기준        | IAM principal 중심 | IAM principal + enclave attestation |
| 요청 파라미터      | CiphertextBlob   | CiphertextBlob + Recipient          |
| 응답           | Plaintext 가능     | Plaintext 대신 CiphertextForRecipient |
| secret 노출 위치 | 호출자 프로세스         | enclave 내부 private key 보유자          |
| 정책 조건        | IAM / key policy | IAM / key policy + PCR 조건           |

---

## 8. Recipient와 CiphertextForRecipient

AWS KMS attested call에서 중요한 개념이 `Recipient`다.

`Recipient`에는 다음이 들어간다.

```json
{
  "AttestationDocument": "<base64 encoded attestation document>",
  "KeyEncryptionAlgorithm": "RSAES_OAEP_SHA_256"
}
```

KMS는 attestation document 안의 public key를 보고, 복호화 결과를 그 public key로 다시 암호화한다.

그래서 응답은 이런 식이 된다.

```json
{
  "CiphertextBlob": "<KMS encrypted data key>",
  "CiphertextForRecipient": "<encrypted to enclave public key>",
  "Plaintext": null
}
```

이 구조의 의미는 매우 중요하다.

```text
KMS는 secret을 평문으로 돌려주지 않는다.
KMS는 enclave attestation document 안에 들어 있던 public key로 암호화해서 돌려준다.
따라서 해당 private key를 가진 enclave만 최종 secret을 열 수 있다.
```

---

## 9. Nonce가 필요한 이유

Attestation document가 서명되어 있다고 해도, 예전 문서를 재사용하는 replay 공격이 가능할 수 있다.

예를 들어 공격자가 과거에 유효했던 attestation document를 저장해 두었다가 나중에 다시 제출할 수 있다.

이를 막기 위해 verifier는 매번 nonce를 준다.

```text
Verifier: 이번 요청에 이 nonce를 넣어서 증명해봐.
Enclave: 이 nonce가 포함된 attestation document를 생성해서 제출.
Verifier: 내가 방금 준 nonce와 일치하네. 오래된 문서 재사용은 아니군.
```

따라서 custom verifier를 만들 때는 nonce를 반드시 다음처럼 다뤄야 한다.

* 충분히 랜덤해야 함
* 짧은 TTL을 가져야 함
* 한 번 사용하면 폐기해야 함
* attestation document 안의 nonce와 정확히 비교해야 함

---

## 10. Public Key Binding이 중요한 이유

Attestation document 안에는 optional `public_key`를 넣을 수 있다.

이 public key는 보통 enclave 내부에서 생성한 key pair의 public key다.

중요한 점은 이 public key가 attestation document의 서명 대상에 포함된다는 것이다.

즉 verifier는 다음을 믿을 수 있다.

```text
이 public key는 attestation된 enclave가 제시한 key다.
```

그래서 verifier는 secret을 이 public key로 암호화해서 보낼 수 있다.

```text
Verifier
  |
  | encrypt(secret, enclave_public_key)
  v
Encrypted secret
  |
  v
Only enclave private key can decrypt
```

이것이 “검증된 enclave에게만 secret release”를 가능하게 하는 핵심이다.

---

## 11. Trust Chain

Nitro Enclaves attestation의 신뢰 체인은 다음과 같이 볼 수 있다.

```text
AWS Nitro Attestation Root CA
        |
        v
Intermediate CA
        |
        v
Attestation certificate
        |
        v
Signed attestation document
        |
        v
PCR values + public key + nonce
```

Verifier는 다음을 검증한다.

```text
1. Certificate chain이 AWS Nitro Attestation Root로 이어지는가?
2. Certificate들이 유효한가?
3. Attestation document signature가 맞는가?
4. Payload 안의 PCR 값이 기대값과 맞는가?
5. Nonce가 내가 준 값과 맞는가?
6. Public key가 포함되어 있다면, 이 key로 secret을 암호화할 것인가?
```

AWS KMS를 쓰면 이 검증 흐름 상당 부분을 KMS가 대신 수행한다.

---

## 12. IAM 인증과 Attestation의 차이

IAM은 “누가 AWS API를 호출할 권한이 있는가”에 가깝다.

Attestation은 “그 호출자가 어떤 코드/환경에서 실행 중인가”에 가깝다.

| 구분    | IAM                     | Attestation                                      |
| ----- | ----------------------- | ------------------------------------------------ |
| 주 관심사 | identity / permission   | runtime integrity / code identity                |
| 질문    | 이 role이 KMS를 호출할 수 있는가? | 이 enclave가 기대한 코드로 실행 중인가?                       |
| 기준    | user, role, policy      | PCR, signature, nonce, certificate chain         |
| 공격 대응 | 권한 없는 principal 차단      | compromised parent / wrong image / debug mode 차단 |
| 한계    | role 탈취 시 위험            | 코드 자체 취약점은 못 막음                                  |

좋은 설계는 둘 중 하나만 쓰는 것이 아니라 둘을 같이 쓴다.

```text
Allow KMS Decrypt only if:
  IAM role is allowed
  AND recipient attestation PCR values match expected values
```

---

## 13. Nitro Enclave에서 Secret Release 모델

Attestation을 사용하면 secret release 구조가 다음처럼 바뀐다.

### 13.1 나쁜 모델

```text
Parent EC2
  |
  | KMS Decrypt
  v
Plaintext secret in parent memory
  |
  v
Send to enclave
```

문제는 parent가 compromised되면 평문 secret이 노출될 수 있다는 점이다.

---

### 13.2 좋은 모델

```text
Parent EC2
  |
  | fetch encrypted blob only
  v
Enclave
  |
  | create attestation document
  v
KMS / Verifier
  |
  | return secret encrypted to enclave public key
  v
Enclave
  |
  | decrypt inside enclave memory
  v
Use secret
```

이 구조에서는 parent EC2가 네트워크 relay를 해도 평문 secret을 볼 수 없다.

---

## 14. Debug Mode와 Attestation

Nitro Enclave를 debug mode로 실행하면 운영자가 enclave console에 접근할 수 있다.

디버깅에는 편하지만, 보안 모델에서는 문제가 된다.

AWS 문서 기준으로 debug mode 또는 attach console로 시작한 enclave의 PCR은 all-zero가 될 수 있고, cryptographic attestation에 사용할 수 없다.

개념적으로 보면 이렇다.

```text
Production enclave:
  PCR = hash(real image / role / signer)
  -> verifier can trust measurement

Debug enclave:
  PCR = zero-like debug values
  -> verifier should not treat it as production workload
```

따라서 debug mode는 다음처럼 봐야 한다.

| 구분                          | 사용 여부           |
| --------------------------- | --------------- |
| 운영 signing path             | 사용 금지           |
| secret unseal path          | 사용 금지           |
| 장애 분석                       | 제한적 break-glass |
| KMS policy에 all-zero PCR 허용 | 매우 위험           |
| 장기 운영                       | 금지              |

---

## 15. Local Attestation vs Remote Attestation

Attestation은 크게 두 관점으로 볼 수 있다.

| 구분                 | 의미                                          | 예시                                             |
| ------------------ | ------------------------------------------- | ---------------------------------------------- |
| Local attestation  | 같은 host 또는 가까운 local component가 enclave를 검증 | parent-side agent가 vsock으로 document 수신 후 검증    |
| Remote attestation | 외부 서비스가 enclave를 검증                         | AWS KMS, external CA, secret injection service |

Nitro Enclaves에서 실무적으로 중요한 것은 remote attestation이다.

예를 들어 KMS가 remote verifier 역할을 한다.

```text
Enclave -> Parent relay -> AWS KMS
```

custom CA나 secret injection service도 remote verifier가 될 수 있다.

```text
Enclave -> Parent relay -> Internal Verifier / CA
```

---

## 16. Sealing과 Attestation의 관계

TEE 문맥에서 자주 나오는 개념이 **sealing**이다.

Sealing은 대략 다음 의미다.

> 특정 코드/환경에서만 다시 열 수 있도록 데이터를 암호화해 저장하는 것.

Nitro Enclaves 자체는 일반적인 persistent local storage를 제공하지 않는다. 그래서 실무에서는 보통 KMS 기반으로 sealing 비슷한 패턴을 만든다.

```text
1. Secret을 KMS data key로 암호화한다.
2. 암호문은 S3, DB, Secrets Manager 등에 저장한다.
3. Enclave가 시작되면 attestation document를 생성한다.
4. KMS가 PCR 조건을 확인한다.
5. 조건이 맞으면 data key 또는 decrypt result를 enclave public key로 암호화해 반환한다.
6. Enclave 안에서만 secret을 복호화한다.
```

즉 Nitro Enclaves에서는 보통 다음처럼 표현하는 게 정확하다.

```text
Local sealing API가 있다기보다는,
external ciphertext + attested KMS decrypt로 sealing-like pattern을 만든다.
```

---

## 17. MPC Node 관점에서의 의미

MPC node를 Nitro Enclave 안에서 운영한다고 하면 attestation의 의미는 다음과 같다.

```text
MPC key share 또는 bootstrap secret을 아무 EC2 role에게나 주지 않는다.
특정 Nitro Enclave 안에서,
특정 MPA / Policy Node image가,
특정 signer 또는 measurement로 실행 중일 때만 unseal한다.
```

개념 흐름은 다음과 같다.

```text
Encrypted key share / bootstrap secret
        |
        v
Parent EC2 fetches ciphertext
        |
        v
Enclave generates attestation document
        |
        v
KMS verifies PCR / signer / IAM role
        |
        v
KMS returns CiphertextForRecipient
        |
        v
Enclave decrypts inside memory
        |
        v
MPC signing or policy evaluation
```

이때 parent EC2는 중요한 역할을 하지만, 신뢰 경계 밖에 가깝게 봐야 한다.

Parent가 할 수 있는 것:

* network relay
* vsock proxy
* ciphertext fetch
* process lifecycle control
* logging
* DoS

Parent가 하면 안 되는 것:

* plaintext key share 보유
* plaintext bootstrap secret 보유
* KMS decrypt 결과 평문 수신
* enclave memory inspection
* production secret을 debug mode enclave에 주입

---

## 18. 가장 중요한 설계 문장

> Cryptographic attestation은 “권한 있는 서버”를 신뢰하는 것이 아니라, “기대된 코드가 기대된 enclave measurement로 실행 중임”을 검증한 뒤에만 secret을 release하는 모델이다.

또는 더 짧게 쓰면:

> IAM은 호출자의 identity를 확인하고, attestation은 호출자의 runtime integrity를 확인한다.

MPC node 관점에서는:

> MPC key share는 parent EC2가 아니라, attested Nitro Enclave 내부의 검증된 workload에게만 unseal되어야 한다.

---

## 19. 자주 헷갈리는 포인트

### 19.1 “Enclave 안에서 실행되면 자동으로 안전한가?”

아니다.

Enclave는 격리 실행 환경을 제공하지만, 어떤 코드가 실행되는지 검증하려면 attestation이 필요하다.

```text
Isolation = 밖에서 안을 보기 어렵게 함
Attestation = 안에서 무엇이 실행 중인지 밖에서 검증하게 함
```

---

### 19.2 “KMS 권한만 있으면 충분한가?”

아니다.

KMS 권한만 있으면 parent instance compromise 시 위험하다. KMS policy에 attestation condition을 걸어야 한다.

```text
kms:RecipientAttestation:PCR...
```

이 조건이 있어야 “특정 enclave measurement에서만 decrypt 허용”이 된다.

---

### 19.3 “PCR0만 쓰면 되는가?”

가능은 하지만 운영상 불편할 수 있다.

PCR0은 EIF image 자체에 강하게 묶인다. 새 build를 만들면 PCR0이 바뀔 수 있다. 그래서 배포가 잦은 환경에서는 PCR8, 즉 signing certificate 기반 정책이 더 유연할 수 있다.

---

### 19.4 “Attestation document의 public key는 인증서인가?”

보통 인증서라기보다는 enclave가 생성한 key pair의 public key다.

그 public key가 attestation document 안에 포함되어 서명되므로, verifier는 “이 key가 해당 enclave와 묶여 있다”고 볼 수 있다.

---

### 19.5 “Parent EC2는 완전히 신뢰해야 하나?”

아니다.

Nitro Enclave 모델에서는 parent가 여전히 중요하지만, secret confidentiality 관점에서는 parent를 완전히 신뢰하지 않는 방향으로 설계한다.

Parent는 relay할 수 있지만, 평문 secret을 볼 수 없어야 한다.

---

## 20. 요약

Cryptographic attestation의 본질은 다음 세 가지다.

```text
1. Measurement
   실행 중인 코드와 환경을 hash로 측정한다.

2. Signed evidence
   측정값을 신뢰 가능한 root of trust가 서명한 attestation document로 만든다.

3. Policy-based release
   verifier 또는 KMS가 측정값을 정책과 비교한 뒤 secret을 release한다.
```

Nitro Enclaves + KMS에서는 이 구조가 다음처럼 구현된다.

```text
Enclave measurement -> Attestation document -> KMS Recipient -> PCR condition check -> CiphertextForRecipient
```
