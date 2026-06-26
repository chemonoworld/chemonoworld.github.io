---
title: "AWS Nitro Enclaves vsock-proxy 정리"
description: "Nitro Enclaves에서 vsock-proxy가 네트워크 격리, TLS, KMS 접근, allowlist, 운영 흐름과 어떻게 맞물리는지 정리합니다."
pubDate: 2026-05-28
tags: ["aws", "nitro-enclaves", "vsock", "kms", "tee"]
---

> **소스**: [aws-nitro-enclaves-cli](https://github.com/aws/aws-nitro-enclaves-cli/tree/main/vsock_proxy) · [aws-nitro-enclaves-sdk-c](https://github.com/aws/aws-nitro-enclaves-sdk-c) · [aws-c-io](https://github.com/awslabs/aws-c-io) 소스코드 및 공식 kmstool 문서 직접 검증

---

## 1. 배경: Enclave의 네트워크 격리

Nitro Enclave는 EC2 인스턴스 안에서 실행되는 격리된 마이크로 VM이며, 다음과 같은 네트워크 제약이 있다.

- **네트워크 인터페이스 없음** — 인터넷/VPC에 직접 접근 불가
- **유일한 통신 채널**: `AF_VSOCK` 소켓으로 parent instance와만 통신 가능
- **결론**: AWS API(KMS, ACM 등)에 접근하려면 반드시 parent instance를 경유해야 함

이 제약을 해결하는 것이 **vsock-proxy**다.

---

## 2. vsock 기초

`AF_VSOCK`은 VM ↔ hypervisor 간 통신을 위한 Linux 소켓 패밀리(`linux/vm_sockets.h`)다.  
각 VM은 **CID (Context ID)** 라는 고유 식별자를 가진다.

| CID | 대상 |
|-----|------|
| 1 | Hypervisor |
| 2 | Local machine |
| **3** | **Parent EC2 instance (항상 고정)** |
| 4 이상 | Enclave (동적 할당) |

> **검증**: `proxy.rs`에 `pub const VSOCK_PROXY_CID: u32 = 3;`으로 명시. Enclave는 parent에 접근할 때 항상 CID 3을 사용한다.

---

## 3. vsock-proxy란?

vsock-proxy는 **parent instance에서 실행**되는 Rust 기반 TCP ↔ vsock 브릿지다.

```
[Enclave 내 앱]
    │  vsock (CID 3, PORT N)
    ▼
[vsock-proxy — parent에서만 실행]
    │  TCP (암호화된 바이트 그대로 전달, TLS 내용 무관)
    ▼
[AWS KMS / ACM 등 외부 엔드포인트]
```

**핵심 동작 원리** (`proxy.rs` 소스 기반):

1. Parent의 vsock 인터페이스에서 지정한 포트로 `VsockListener::bind()` 수행
2. Enclave에서 연결이 들어오면 `ThreadPool`에서 워커 스레드 할당
3. 원격 호스트에 `TcpStream::connect()` 수행
4. `select()`로 양방향 데이터를 8 KB 버퍼 단위로 복사 (패킷 수정 없음)
5. 한쪽이 끊어지면 반대쪽도 종료

> **중요**: vsock-proxy는 **TLS를 전혀 처리하지 않는다**. 암호화된 바이트를 그대로 중계하는 덕트일 뿐이고, TLS 핸드셰이크는 Enclave 내부 애플리케이션(또는 SDK)이 직접 수행한다.

---

## 4. TLS는 누가 처리하는가

vsock-proxy가 TLS를 건드리지 않는다면, Enclave 내부에서 TLS를 처리하는 주체가 무엇인지가 핵심 질문이다.

### TLS 처리 주체: aws-nitro-enclaves-sdk-c (C SDK)

C SDK(`rest.c`)가 내부적으로 다음을 모두 처리한다:

1. `aws-lc`(AWS 제공 crypto 라이브러리) 기반으로 TLS 컨텍스트 생성
2. `s2n-tls`로 TLS 핸드셰이크 수행 — 인증서 검증 포함
3. 소켓 도메인을 `AWS_SOCKET_VSOCK`으로 지정해 vsock 위에서 TLS를 동작시킴

```c
// rest.c (sdk-c 내부)
aws_tls_ctx_options_init_default_client(&tls_ctx_options, allocator);
rest_client->tls_ctx = aws_tls_client_ctx_new(allocator, &tls_ctx_options);

struct aws_socket_options socket_options = { .type = AWS_SOCKET_STREAM };
struct aws_http_client_connection_options http_options = {
    .tls_options = &tls_connection_options,  // TLS 설정
    // ...
};

// endpoint가 지정된 경우 vsock 소켓 도메인으로 덮어씀
if (configuration->endpoint) {
    socket_options.domain = configuration->domain;  // AWS_SOCKET_VSOCK
    http_options.host_name = aws_byte_cursor_from_c_str("3");  // parent CID
    http_options.port = 8000;  // vsock-proxy 포트
}

aws_http_client_connect(&http_options);  // TLS + vsock 연결 수립
```

즉 **TLS가 vsock 소켓 위에서 직접 동작**한다. vsock-proxy는 이 TLS 트래픽을 내용을 모른 채 TCP로 흘려보낼 뿐이다.

### `USE_VSOCK=1` 컴파일 플래그

`aws-c-io`를 빌드할 때 반드시 `-DUSE_VSOCK=1` 플래그가 있어야 `AF_VSOCK` 소켓 지원이 활성화된다. 이 플래그 없이 빌드된 `aws-c-io`는 `AWS_SOCKET_VSOCK` 도메인을 지원하지 않는다.

```dockerfile
# Dockerfile.al2에서 USE_VSOCK=1 명시적으로 지정
RUN cmake3 -DUSE_VSOCK=1 -DCMAKE_PREFIX_PATH=/usr ... -S aws-c-io -B aws-c-io/build
```

---

## 5. Enclave 앱에서 SDK를 사용하는 세 가지 방법

### 방법 A — `kmstool-enclave-cli` 바이너리 호출 (공식 권장, 언어 무관)

**SDK를 직접 코드에 링크할 필요 없다.** AWS가 제공하는 `kmstool_enclave_cli` 바이너리를 Dockerfile에 복사해두고, 앱에서 subprocess로 호출하는 방식이다.

```
[내 Python/Node/Go 앱]
    └─ subprocess("/kmstool_enclave_cli decrypt ...")
         └─ kmstool_enclave_cli (C 바이너리, SDK + TLS 내장)
              └─ TLS over vsock → parent vsock-proxy → KMS
```

**바이너리 준비:**

```bash
# aws-nitro-enclaves-sdk-c 레포에서 빌드
git clone https://github.com/aws/aws-nitro-enclaves-sdk-c.git
cd aws-nitro-enclaves-sdk-c/bin/kmstool-enclave-cli
./build.sh
# 결과물: kmstool_enclave_cli, libnsm.so
```

**Dockerfile:**

```dockerfile
FROM amazonlinux:2        # CA 인증서가 있는 이미지 사용 (중요)

COPY kmstool_enclave_cli /
COPY libnsm.so /usr/lib64/
COPY my_app.py /

CMD ["python3", "/my_app.py"]
```

**Python 앱 예시:**

```python
import subprocess

proc = subprocess.Popen(
    [
        "/kmstool_enclave_cli", "decrypt",
        "--region", "us-east-1",
        "--proxy-port", "8000",
        "--aws-access-key-id", access_key_id,
        "--aws-secret-access-key", secret_access_key,
        "--aws-session-token", session_token,
        "--ciphertext", ciphertext_b64,
    ],
    stdout=subprocess.PIPE
)
result = proc.communicate()[0].decode()
plaintext_b64 = result.split(":")[1].strip()
```

`kmstool-enclave-cli`가 지원하는 커맨드:

| 커맨드 | 설명 | 주요 인자 |
|--------|------|-----------|
| `decrypt` | KMS Decrypt | `--ciphertext` |
| `genkey` | GenerateDataKey | `--key-id`, `--key-spec` (AES-256/AES-128) |
| `genrandom` | GenerateRandom | `--length` |

### 방법 B — C SDK 직접 링크 (C/C++ 앱)

C/C++로 개발하는 경우에만 해당한다. Dockerfile에서 의존성 전체를 직접 빌드해야 한다.

**의존성 빌드 체인 순서:**

```
aws-lc → s2n-tls → aws-c-common → aws-c-sdkutils → aws-c-cal
  → aws-c-io (USE_VSOCK=1) → aws-c-compression → aws-c-http
  → aws-c-auth → aws-nitro-enclaves-nsm-api → aws-nitro-enclaves-sdk-c
```

**C 코드 예시:**

```c
/* Parent는 항상 CID 3 */
struct aws_socket_endpoint endpoint = {
    .address = "3",   /* parent CID */
    .port    = 8000   /* vsock-proxy 포트 */
};

struct aws_nitro_enclaves_kms_client_configuration config = {
    .allocator  = allocator,
    .endpoint   = &endpoint,
    .domain     = AWS_SOCKET_VSOCK,  /* vsock 명시 */
    .host_name  = NULL,              /* 기본 KMS 호스트명 자동 구성 */
};
// → SDK 내부에서 TLS 핸드셰이크까지 모두 처리
```

> `PROXY_PORT` 기본값은 `8000`, `SERVICE_PORT`(instance ↔ enclave 간 앱 통신 포트)는 `3000`으로 별도다.

### 방법 C — socat 브릿지 (SDK 없이, 언어 무관)

KMS 외 다른 서비스나 SDK 없이 완전 자유로운 언어 환경에서 쓸 때 사용한다.

```bash
# Enclave Dockerfile CMD
CMD socat TCP-LISTEN:8443,fork,reuseaddr VSOCK-CONNECT:3:8000 & python3 /my_app.py
```

이후 앱은 `https://localhost:8443`으로 요청하면 vsock-proxy를 경유해 KMS에 도달한다.

> **주의**: TLS SNI/인증서 hostname 불일치 문제가 생길 수 있다. `localhost`로 TLS를 맺으면 서버 인증서의 CN(`kms.us-east-1.amazonaws.com`)과 불일치한다. `/etc/hosts`에 실제 KMS 호스트명을 `127.0.0.1`로 등록하거나 SDK의 인증서 검증을 커스터마이징해야 한다.

### 방법 비교

| 방법 | SDK 설치 | 언어 | TLS 처리 | 난이도 |
|------|---------|------|----------|--------|
| `kmstool-enclave-cli` 바이너리 호출 | 바이너리만 복사 | 어떤 언어든 | CLI 내장 | 쉬움 (공식 권장) |
| C SDK 직접 링크 | 전체 빌드 체인 | C/C++ 전용 | SDK 내장 | 복잡 |
| socat 브릿지 | 없음 | 어떤 언어든 | 앱이 직접 처리 | 중간, TLS 설정 주의 |

---

## 6. CA 인증서 주의사항

SDK가 KMS 서버 인증서를 검증할 때 **시스템의 CA 번들**을 사용한다. Dockerfile을 `FROM scratch`(빈 이미지)로 만들면 CA 인증서가 없어서 다음 오류가 발생한다.

```
[ERROR] [tls-handler] - ctx: configuration error:
  Error initializing trust store (s2n_x509_validator.c:120)
[ERROR] Failed to set ca_path: (null) and ca_file (null)
```

**해결책:**

```dockerfile
# 방법 1: amazonlinux:2 같이 CA가 포함된 이미지 베이스 사용 (권장)
FROM amazonlinux:2

# 방법 2: FROM scratch 기반 최소 이미지인 경우, CA 파일 직접 복사
# (공식 kmstool Dockerfile.al2 방식)
RUN mkdir -p /rootfs/etc/pki/tls/certs/ \
    && cp -f /etc/pki/tls/certs/* /rootfs/etc/pki/tls/certs/

# 방법 3: debian 계열 최소 이미지인 경우
RUN apt-get update && apt-get install -y ca-certificates
```

---

## 7. 설치 (parent instance)

### Amazon Linux 2

```bash
sudo amazon-linux-extras enable aws-nitro-enclaves-cli
sudo yum install -y aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel
```

### Amazon Linux 2023

```bash
sudo dnf install -y aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel
```

### 소스 빌드 (Rust)

```bash
git clone https://github.com/aws/aws-nitro-enclaves-cli.git
cd aws-nitro-enclaves-cli
make vsock-proxy
# 결과물: build/vsock_proxy/x86_64-unknown-linux-musl/release/vsock-proxy
```

> 패키지 버전 `1.0.1`, Rust edition 2018, rust-version 1.92 이상 요구

---

## 8. vsock-proxy 실행

### CLI 시그니처

```
vsock-proxy [FLAGS] [OPTIONS] <local_port> <remote_addr> <remote_port>
```

| 인자/옵션 | 설명 | 기본값 |
|-----------|------|--------|
| `<local_port>` | Parent에서 열 vsock 포트 (Enclave가 접속하는 포트) | 필수 |
| `<remote_addr>` | 포워딩할 원격 호스트명 또는 IP | 필수 |
| `<remote_port>` | 원격 포트 | 필수 |
| `-w, --num_workers` | 최대 동시 연결 수 | **4** |
| `--config` | allowlist YAML 파일 경로 | `/etc/nitro_enclaves/vsock-proxy.yaml` |
| `-4, --ipv4` | IPv4만 사용 | — |
| `-6, --ipv6` | IPv6만 사용 (`-4`와 상호 배타) | — |

### 실행 예시

```bash
# KMS 기본
vsock-proxy 8000 kms.us-east-1.amazonaws.com 443

# KMS FIPS 엔드포인트
vsock-proxy 8000 kms-fips.us-east-1.amazonaws.com 443

# 동시 연결 수 증가
vsock-proxy 8000 kms.us-east-1.amazonaws.com 443 -w 10

# IPv4 강제
vsock-proxy 8000 kms.ap-northeast-2.amazonaws.com 443 -4
```

> `local_port`는 **3보다 큰 임의의 숫자** 사용 가능. 관례적으로 8000을 쓰지만 강제 사항은 아니다.

---

## 9. systemd 서비스로 운영

설치 후 서비스를 활성화하면 **인스턴스 메타데이터에서 리전을 자동 감지**해 해당 리전의 KMS 엔드포인트로 포트 8000을 연다.

```bash
# 시작 및 자동 시작 등록
sudo systemctl enable --now nitro-enclaves-vsock-proxy.service

# 로그 확인
journalctl -eu nitro-enclaves-vsock-proxy.service
```

**서비스 파일 실행 명령** (소스 기반):

```bash
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
REGION=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/dynamic/instance-identity/document | jq -r .region)
RUST_LOG=warn exec /usr/bin/vsock-proxy 8000 kms.${REGION}.amazonaws.com 443 \
  --config /etc/nitro_enclaves/vsock-proxy.yaml
```

> **서비스는 KMS 전용**: 다른 서비스(Secrets Manager, S3 등)가 필요하면 vsock-proxy 프로세스를 별도로 추가 실행해야 한다.

---

## 10. allowlist 설정

지정한 `<remote_addr>:<remote_port>` 조합이 allowlist에 없으면 **"The given address and port are not allowed"** 오류와 함께 실행이 거부된다.

### 파일 위치

```
/etc/nitro_enclaves/vsock-proxy.yaml
```

### 파일 형식

```yaml
allowlist:
  - {address: kms.us-east-1.amazonaws.com, port: 443}
  - {address: kms-fips.us-east-1.amazonaws.com, port: 443}
  - {address: secretsmanager.us-east-1.amazonaws.com, port: 443}
  - {address: acm.us-east-1.amazonaws.com, port: 443}
```

### allowlist 검사 로직 (소스 기반)

1. 지정한 `remote_addr`를 DNS resolve해 IP 획득
2. allowlist 각 항목과 port 비교
3. hostname 직접 비교 → 실패 시 allowlist 항목도 DNS resolve해서 IP 비교
4. 둘 다 매칭 실패 → 차단

> **기본 allowlist**: KMS 엔드포인트만 전 리전(+ FIPS, GovCloud, China) 포함. 다른 서비스는 직접 추가해야 한다.

---

## 11. DNS TTL 캐싱

매 연결마다 DNS lookup을 하지 않는다. `DnsResolutionInfo`에 TTL을 저장하고 **TTL 만료 시에만 재조회**한다. 장시간 운영 시에도 엔드포인트 IP 변경에 자동으로 대응된다.

---

## 12. 전체 실행 예시 — Python 앱에서 KMS Decrypt

### parent 환경 구성

```bash
sudo amazon-linux-extras install docker
sudo systemctl start docker && sudo systemctl enable docker
sudo usermod -aG docker ec2-user
sudo amazon-linux-extras enable aws-nitro-enclaves-cli
sudo yum install -y aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel

# Enclave 메모리 할당
sudo sed -r "s/^(\s*memory_mib\s*:\s*).*/\11024/" \
  -i /etc/nitro_enclaves/allocator.yaml
sudo systemctl restart nitro-enclaves-allocator.service
sudo systemctl enable nitro-enclaves-allocator.service
```

### kmstool_enclave_cli 바이너리 빌드

```bash
git clone https://github.com/aws/aws-nitro-enclaves-sdk-c.git
cd aws-nitro-enclaves-sdk-c/bin/kmstool-enclave-cli
./build.sh
# 결과물: ./kmstool_enclave_cli, ./libnsm.so
```

### Enclave Dockerfile

```dockerfile
FROM amazonlinux:2

# SDK 바이너리 복사 (빌드 결과물)
COPY kmstool_enclave_cli /
COPY libnsm.so /usr/lib64/

# Python 앱 복사
COPY my_app.py /

CMD ["python3", "/my_app.py"]
```

### my_app.py

```python
import subprocess
import json
import socket
import os

def get_credentials_from_parent():
    """parent instance의 IMDS에서 IAM 자격증명을 받아오는 로직 (별도 vsock 채널 필요)"""
    # 실제 구현에서는 parent가 vsock으로 credentials를 push하거나
    # instance metadata를 parent가 중계해주는 방식을 사용
    return os.environ["AWS_ACCESS_KEY_ID"], \
           os.environ["AWS_SECRET_ACCESS_KEY"], \
           os.environ["AWS_SESSION_TOKEN"]

def kms_decrypt(ciphertext_b64: str, region: str = "us-east-1") -> str:
    access_key, secret_key, session_token = get_credentials_from_parent()

    proc = subprocess.Popen(
        [
            "/kmstool_enclave_cli", "decrypt",
            "--region", region,
            "--proxy-port", "8000",
            "--aws-access-key-id", access_key,
            "--aws-secret-access-key", secret_key,
            "--aws-session-token", session_token,
            "--ciphertext", ciphertext_b64,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout, stderr = proc.communicate()
    if proc.returncode != 0:
        raise RuntimeError(f"kmstool_enclave_cli failed: {stderr.decode()}")

    # 출력 형식: "PLAINTEXT: <base64>"
    return stdout.decode().split(":")[1].strip()

if __name__ == "__main__":
    plaintext_b64 = kms_decrypt(os.environ["CIPHERTEXT"])
    print(f"Decrypted: {plaintext_b64}")
```

### EIF 빌드 및 실행

```bash
# EIF 빌드
nitro-cli build-enclave \
  --docker-uri my-enclave-app \
  --output-file my-app.eif
# PCR0 값 기록

# [터미널 1] Enclave 실행 (debug 모드)
nitro-cli run-enclave \
  --eif-path my-app.eif \
  --memory 1024 --cpu-count 2 \
  --debug-mode \
  --enclave-cid 16

# [터미널 2] vsock-proxy 실행 (KMS용)
vsock-proxy 8000 kms.us-east-1.amazonaws.com 443

# [터미널 3] 로그 확인
nitro-cli console --enclave-id $(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')
```

### KMS 키 정책 (debug → production)

```json
{
  "Statement": [
    {
      "Sid": "debug mode (PCR0 all zeros)",
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCOUNT_ID:role/INSTANCE_ROLE"},
      "Action": "kms:Decrypt",
      "Condition": {
        "StringEqualsIgnoreCase": {
          "kms:RecipientAttestation:ImageSha384":
            "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
        }
      }
    }
  ]
}
```

production 전환 시 `ImageSha384` 값을 EIF 빌드 결과의 PCR0 실제 값으로 교체하고, `--debug-mode` 없이 실행한다.

---

## 13. 트러블슈팅

| 오류 메시지 | 원인 | 해결 |
|-------------|------|------|
| `"The given address and port are not allowed"` | allowlist에 없는 엔드포인트 | `vsock-proxy.yaml`에 항목 추가 |
| `"Could not create new client"` | vsock-proxy 미실행 또는 포트 불일치 | vsock-proxy 프로세스 및 포트 확인 |
| `AWS_IO_TLS_ERROR_NEGOTIATION_FAILURE` | 리전 불일치 | vsock-proxy와 앱의 리전 동일하게 설정 |
| `Error initializing trust store` | CA 인증서 없음 | `amazonlinux:2` 베이스 이미지 사용 또는 CA 파일 복사 |
| `Could not get credentials` | IAM 인스턴스 프로파일 미연결 | EC2 인스턴스에 IAM 역할 연결 확인 |
| vsock 연결 불가 | CID 잘못 지정 | parent CID는 항상 `3`으로 고정 |

### 상세 로그 활성화

```bash
# 서비스 사용 시
sudo sed -i 's/RUST_LOG=warn/RUST_LOG=trace/' \
  /usr/lib/systemd/system/nitro-enclaves-vsock-proxy.service
sudo systemctl daemon-reload && sudo systemctl restart nitro-enclaves-vsock-proxy.service
journalctl -fu nitro-enclaves-vsock-proxy.service

# 직접 실행 시
RUST_LOG=trace vsock-proxy 8000 kms.us-east-1.amazonaws.com 443
```
