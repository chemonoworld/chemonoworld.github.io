---
title: "Pedersen DKG란?"
description: "Rust 코드로 Pedersen DKG의 라운드 흐름을 따라가며 각 노드가 다항식, commitment, share를 어떻게 다루는지 정리한다."
pubDate: 2026-06-24
updatedDate: 2026-06-27
heroImage: "/materials/pedersen-dkg/dkg-final-shares.png"
tags: ["cryptography", "mpc", "dkg", "rust", "pedersen-dkg", "threshold-signature-scheme"]
---

DKG(Distributed Key Generation)는 비밀키를 한 곳에서 만든 뒤 나눠주는 방식이 아니다. 참여자들이 각자 비밀 기여분을 만들고, 그 값들이 합쳐지면서 하나의 secret/group public key가 생긴다.

이 글에서는 내가 직접 작성한 Rust 코드를 기준으로 Pedersen DKG의 흐름을 설명할 예정이다. 여기서 말하는 Pedersen DKG는 각 참여자가 자기 다항식의 coefficient commitment를 공개하고, 수신자가 Feldman-style 검증식으로 share를 확인하는 DKG 흐름이다. 이해를 위한 목적이기 때문에 실제 DKG protocol을 구현했다기 보다는 암호학을 이해하기 위해 로컬환경으로 돌아가는 mock protocol에 가깝다. 그래서, reliable broadcast, complaint, qualified set 같은 실제 네트워크 프로토콜 요소들은 과감하게 제외했다.

코드는 다음 github repository에서 확인할 수 있다.
https://github.com/chemonoworld/pedersen-dkg

## Overview

먼저 각 참여자 `i`는 자기만 아는 다항식 하나를 만든다.

$$
f_i(x) = \sum_{j=0}^{t-1} c_{i,j}x^j
$$

이 다항식의 상수항이 참여자 `i`의 local secret contribution이다.

$$
c_{i,0} = sk_i = f_i(0)
$$

여기서 용어를 하나 정리해 두는 게 좋다. 이 코드에서 `t`는 threshold 값이다. 따라서 threshold가 `t`이면 실제로 샘플링하는 다항식의 차수는 `t - 1`이고, 계수는 `t`개다.

```rust
pub fn rand_sample_polynomial(&mut self, t: usize) {
    let mut rng = OsRng;
    self.round1_state = Some(Round1State {
        status: R1_INIT,
        polynomial: Polynomial::random(t - 1, &mut rng),
        other_commitments: None,
    })
}
```

참여자가 세 명이라면 각자 자기 secret contribution과 secret polynomial을 따로 만든다. 중요한 점은 이 시점에 “원본 private key” 같은 것은 없다는 것이다. 최종 key는 유효한 contribution들이 모인 뒤에야 생긴다.

아래 그림들은 participant 1, 2, 3이 각각 자기 다항식을 만들고, 같은 참여자 좌표 `x_1`, `x_2`, `x_3`에서 share를 평가하는 모습을 나눠 보여준다. 각 곡선의 y절편이 해당 참여자의 local secret contribution이다.

![Participant 1 polynomial and evaluated shares](/materials/pedersen-dkg/dkg-f-1.svg)

![Participant 2 polynomial and evaluated shares](/materials/pedersen-dkg/dkg-f-2.svg)

![Participant 3 polynomial and evaluated shares](/materials/pedersen-dkg/dkg-f-3.svg)

![Each DKG node creates its own secret contribution](/materials/pedersen-dkg/dkg-step1.svg)

이후 각 참여자는 자기 다항식을 다른 참여자의 x좌표에서 평가한다. participant `i`가 participant `j`에게 보내는 값은 다음처럼 쓸 수 있다.

$$
s_{ij} = f_i(x_j)
$$

나중에 participant `j`가 들고 있게 될 최종 share는, 자기 앞으로 온 값들을 모두 더한 결과가 된다.

$$
s_j = \sum_i s_{ij}
$$

세 참여자의 다항식을 합치면 하나의 group polynomial `F(x)`가 되고, 이 곡선의 y절편 `F(0)`이 최종 group secret이 된다.

![Three DKG participant polynomials combine into a group polynomial whose y-intercept is the group secret](/materials/pedersen-dkg/dkg-f-sum.svg)

## 다항식 샘플링

코드에서는 다항식을 낮은 차수의 계수부터 저장한다.

```rust
pub struct Polynomial {
    /// 낮은 차수부터 저장된 계수들: coeffs[0] + coeffs[1]x + ...
    pub coeffs: Vec<Scalar>,
}
```

랜덤 다항식은 `degree + 1`개의 scalar 계수를 뽑아 만든다.

```rust
pub fn random<R: k256::elliptic_curve::rand_core::RngCore>(
    degree: usize,
    rng: &mut R,
) -> Self {
    let mut coeffs = Vec::<Scalar>::new();
    coeffs.reserve(degree + 1);
    for _ in 0..(degree + 1) {
        let s = Scalar::generate_vartime(rng);
        coeffs.push(s)
    }
    Self { coeffs }
}
```

평가는 단순하다. 각 계수에 `x^i`를 곱한 뒤 전부 더한다.

```rust
pub fn evaluate(&self, val: &Scalar) -> Scalar {
    let mut result = Scalar::ZERO;
    for (i, coeff) in self.coeffs.iter().enumerate() {
        let exp = [i as u64, 0u64, 0u64, 0u64];
        result += *coeff * val.pow(exp)
    }

    result
}
```

round 2에서 만들어지는 `s_ij = f_i(j)`가 바로 이 함수의 결과다.

## Round 1: commitment broadcast

각 참여자는 자기 다항식의 계수를 그대로 공개하지 않는다. 대신 각 계수에 generator `G`를 곱해서 commitment vector를 만든다.

![Round 1 commitment broadcast](/materials/pedersen-dkg/dkg-round1.svg)

```rust
pub fn to_commitments(&self) -> Vec<ProjectivePoint> {
    self.coeffs
        .iter()
        .map(|coeff| ProjectivePoint::GENERATOR * coeff)
        .collect()
}
```

지금 코드는 네트워크 broadcast를 구현하지 않았다. 대신 로컬에서 모든 참여자의 commitment snapshot을 만든 뒤, 각 참여자의 상태에 복사한다.

```rust
pub fn broadcast_commitments_local(&mut self) -> Result<(), String> {
    let commitments = self
        .members
        .iter()
        .map(|p| {
            let state = p.round1_state.as_ref().unwrap();
            Commitment::new(p.id, state.polynomial.to_commitments())
        })
        .collect::<Vec<_>>();

    for participant in self.members.iter_mut() {
        let state = participant.round1_state.as_mut().unwrap();
        state.other_commitments = Some(
            commitments
                .iter()
                .filter(|commitment| commitment.from != participant.id)
                .cloned()
                .collect(),
        );
        state.status = DONE;

        participant.round2_state = Some(Round2State {
            status: R2_INIT,
            received_shares: Vec::new(),
        });
    }

    Ok(())
}
```

이 단계가 끝나면 각 참여자는 다른 참여자들의 coefficient commitment를 알고 있다. 계수 자체는 모르고, 아직 share도 받지 않은 상태다.

## Round 2: share evaluation and exchange

다음 라운드에서는 모든 참여자가 자기 다항식을 각 참여자 id에서 평가하고, 수신자별 share를 보낸다. 실제 프로토콜이라면 이 share는 private channel이나 encryption으로 보호되어야 한다. 여기서는 같은 흐름을 로컬 `Round2Payload`로만 흉내낸다.

![DKG nodes commit, verify, and exchange shares](/materials/pedersen-dkg/dkg-step2.png)

```rust
pub fn evaluate_each_polynomial(&self) -> Result<Vec<Round2Payload>, String> {
    let participant_ids = self.members.iter().map(|p| p.id).collect::<Vec<_>>();

    Ok(self
        .members
        .iter()
        .flat_map(|sender| {
            let polynomial = &sender.round1_state.as_ref().unwrap().polynomial;
            participant_ids.iter().map(|receiver_id| Round2Payload {
                from: sender.id,
                to: *receiver_id,
                s_ij: polynomial.evaluate(receiver_id),
            })
        })
        .collect::<Vec<_>>())
}
```

참여자가 `n`명이면 round 2 payload는 `n * n`개가 나온다. 자기 자신에게 보내는 `f_i(x_i)`도 포함된다.

```rust
pub struct Round2Payload {
    pub from: ParticipantId,
    pub to: ParticipantId,
    pub s_ij: Scalar,
}
```

## 평가값(evaluation values) 검증

수신자 `j`는 분배자 `i`에게서 `s_ij`를 받는다. 여기서 바로 받아들이면 안 된다. 이 값이 정말 `i`가 round 1에서 commitment한 다항식에서 나온 값인지 확인해야 한다.

![Round 2 share verification flow](/materials/pedersen-dkg/dkg-round2.svg)

계수 commitment를 다음처럼 두자.

$$
C_{ik} = c_{i,k}G
$$

그러면 수신자는 아래 식이 맞는지 확인하면 된다.

$$
s_{ij}G = C_{i0} + C_{i1}x_j + C_{i2}x_j^2 + \cdots
$$

코드도 이 식을 거의 그대로 옮긴 형태다.

```rust
pub fn verify_share_with_commitments(
    commitments: &[ProjectivePoint],
    participant_id: &ParticipantId,
    share: &Scalar,
) -> bool {
    let expected =
        commitments
            .iter()
            .enumerate()
            .fold(ProjectivePoint::IDENTITY, |acc, (i, commitment)| {
                let exp = [i as u64, 0u64, 0u64, 0u64];
                acc + (*commitment * participant_id.pow(exp))
            });
    let actual = ProjectivePoint::GENERATOR * share;

    actual == expected
}
```

검증이 통과하면 수신자는 계수 자체를 몰라도, 받은 share가 commitment된 다항식과 일치한다고 볼 수 있다.

## Finalization

검증된 share가 모두 모이면 각 참여자는 자기 앞으로 온 `s_ij`들을 더한다.

![Aggregate verified shares into final shares and one public key](/materials/pedersen-dkg/dkg-final-shares.png)

```rust
let mut s_i = Scalar::ZERO;
p.round2_state
    .as_ref()
    .unwrap()
    .received_shares
    .iter()
    .for_each(|r2_payload| {
        s_i += r2_payload.s_ij;
    });
```

즉 participant `j`의 최종 share는 다음과 같다.

$$
s_j = f_1(x_j) + f_2(x_j) + \cdots + f_n(x_j)
$$

이 값은 모든 참여자의 다항식을 더한 group polynomial을 `x_j`에서 평가한 것과 같다.

$$
F(x) = \sum_i f_i(x)
$$

$$
s_j = F(x_j)
$$

아래 그림처럼 각 참여자의 다항식 `f_1`, `f_2`, `f_3`를 더하면 하나의 group polynomial `F`가 된다. 보라색 곡선 위의 `F(x_1)`, `F(x_2)`, `F(x_3)`가 각 참여자의 final share이고, y절편 `F(0)`이 최종 group secret이다. 실제 구현은 finite field 위에서 계산되므로 이 곡선은 직관을 위한 실수 다항식 그림이다.

![Three DKG participant polynomials combine into a group polynomial whose y-intercept is the group secret](/materials/pedersen-dkg/dkg-f-sum.svg)

group secret은 이 합성 다항식의 상수항이다.

$$
F(0) = \sum_i f_i(0) = \sum_i sk_i
$$

결국 누군가 한 명이 secret을 정해서 나눠준 것이 아니다. 각 참여자의 local secret contribution이 합쳐져 group secret이 된다. 이 차이가 dealer-based Shamir Secret Sharing과 DKG를 가르는 핵심이 된다.

### Group public key 계산

각 참여자가 알고 있는 constant-term commitment를 전부 더하면 group public key가 된다.

$$
PK = C_{10} + C_{20} + \cdots + C_{n0}
$$

각 commitment는 `C_i0 = f_i(0)G`이므로 다음과 같다.

$$
PK = \sum_i f_i(0)G = F(0)G
$$

코드에서는 자기 다항식의 commitment와 다른 참여자들에게 받은 commitment의 0번째 항을 더한다.

```rust
let round1_state = p.round1_state.as_ref().unwrap();
let own_public_key = round1_state.polynomial.to_commitments()[0];
let other_public_keys = round1_state
    .other_commitments
    .as_ref()
    .unwrap()
    .iter()
    .map(|commitment| commitment.commitments.get(0).unwrap())
    .sum::<ProjectivePoint>();
let group_public_key = own_public_key + other_public_keys;

p.fin_state = Some(FinState {
    final_share: s_i,
    group_public_key: PointWrapper::from_projective_point(group_public_key),
})
```

`PointWrapper`는 projective point를 affine point로 바꾼 뒤 x좌표와 y parity만 저장한다. 다시 curve point로 되돌릴 때는 SEC1 compressed point prefix인 `0x02` 또는 `0x03`을 붙여 복원한다.

```rust
pub fn to_projective_point(&self) -> ProjectivePoint {
    let mut compressed = [0u8; COMPRESSED_LENTH];
    compressed[0] = match self.y_parity {
        0 => 0x02,
        1 => 0x03,
        _ => panic!("invalid point parity"),
    };
    compressed[1..].copy_from_slice(&self.x.bytes);

    let compressed_point = CompressedPoint::from(compressed);
    let affine_point = AffinePoint::from_bytes(&compressed_point).unwrap();
    ProjectivePoint::from(affine_point)
}
```

### Finalization 검증

finalization에서는 두 가지를 확인한다.

첫 번째는 모든 참여자가 계산한 group public key가 같은지 확인하는 것이다. 각 참여자가 자기 commitment와 받은 commitment를 조합해서 같은 값을 얻어야 한다.

```rust
let group_public_keys = self
    .members
    .iter()
    .map(|p| {
        p.fin_state
            .as_ref()
            .unwrap()
            .group_public_key
            .to_projective_point()
    })
    .collect::<Vec<ProjectivePoint>>();

let pk_all_equal = group_public_keys
    .iter()
    .all(|pk| pk == &group_public_keys[0]);

if !pk_all_equal {
    return Err(String::from("group public key verification failed"));
}
```

두 번째는 final share들로 복원한 group secret과 group public key가 일치하는지 확인하는 것이다. 여기서 주의할 점은 final share들을 그냥 더하면 group secret이 아니라는 것이다. 각 share는 서로 다른 x좌표의 `F(x_j)`이기 때문에, `F(0)`을 얻으려면 Lagrange interpolation이 필요하다.

$$
F(0) = \sum_j s_j \lambda_j(0)
$$

$$
\lambda_j(0) = \prod_{m \neq j} \frac{-x_m}{x_j - x_m}
$$

코드에서는 이 계수를 scalar field에서 계산한다.

```rust
fn reconstruct_group_secret_from_final_shares(&self) -> Result<Scalar, String> {
    let shares = self
        .members
        .iter()
        .map(|p| {
            let fin_state = p
                .fin_state
                .as_ref()
                .ok_or_else(|| String::from("all participants must finalize first"))?;
            Ok((p.id, fin_state.final_share))
        })
        .collect::<Result<Vec<_>, String>>()?;

    let mut secret = Scalar::ZERO;
    for (j, (x_j, y_j)) in shares.iter().enumerate() {
        let mut coefficient = Scalar::ONE;
        for (m, (x_m, _)) in shares.iter().enumerate() {
            if j == m {
                continue;
            }

            let denominator = *x_j - *x_m;
            let Some(inverse_denominator) = Option::<Scalar>::from(denominator.invert()) else {
                return Err(String::from("participant ids must be distinct"));
            };
            coefficient *= -*x_m * inverse_denominator;
        }
        secret += *y_j * coefficient;
    }

    Ok(secret)
}
```

복원한 `F(0)`에 generator를 곱했을 때 group public key와 같아야 한다.

```rust
let group_secret = self.reconstruct_group_secret_from_final_shares()?;
let group_public_key = self.members[0]
    .fin_state
    .as_ref()
    .unwrap()
    .group_public_key
    .to_projective_point();

if group_public_key != ProjectivePoint::GENERATOR * group_secret {
    return Err(String::from(
        "group secret key <-> group public key verification failed",
    ));
}
```

현재 prototype은 모든 final share를 사용해 `F(0)`을 복원한다. 다항식 차수가 `t - 1`이면 임의의 `t`개 share만으로도 같은 값을 복원할 수 있어야 한다. 그 부분은 threshold reconstruction 테스트로 더 확장할 수 있다.

## Local protocol wrapper

지금 prototype에서는 라운드를 명시적으로 나눠 실행한다.

```rust
pub fn run_round1_local(&mut self) -> Result<(), String> {
    self.validate_params()?;

    self.participants.sample_each_polynomial(self.init_state.t);
    self.participants.broadcast_commitments_local()
}

pub fn run_round2_local(&mut self) -> Result<(), String> {
    let payloads = self.participants.evaluate_each_polynomial()?;
    self.participants
        .broadcast_evaluation_values_local(payloads)?;
    self.participants.verify_round2_shares_local()
}

pub fn run_finalization_local(&mut self) -> Result<(), String> {
    self.participants.finalize()
}

pub fn group_public_key_hexes(&self) -> Result<Vec<String>, String> {
    self.participants.group_public_key_hexes()
}
```

테스트에서는 round 순서가 지켜지는지, threshold parameter가 유효한지, random participant id에서도 로컬 실행이 되는지 확인한다. 여기에 finalization 이후 모든 참여자의 group public key가 같은지도 통합 테스트로 확인한다.

```rust
#[test]
fn protocol_finalization_exposes_matching_group_public_keys() {
    let mut protocol = Protocol::new(5, 3, MemberIdOrderType::SEQ);

    protocol.run_round1_local().unwrap();
    protocol.run_round2_local().unwrap();
    protocol.run_finalization_local().unwrap();

    let group_public_keys = protocol.group_public_key_hexes().unwrap();

    assert_eq!(group_public_keys.len(), protocol.n());
    assert!(
        group_public_keys
            .iter()
            .all(|key| key == &group_public_keys[0])
    );
}
```

유닛 테스트에서는 정상 케이스와 실패 케이스를 나눠 본다. 정상 케이스는 모든 참여자의 public key가 같은지 확인하고, 실패 케이스는 round 2 검증이 끝난 뒤 commitment를 일부러 오염시켜 finalization의 public key 검증이 실패하는지 확인한다.

```rust
#[test]
fn finalize_rejects_group_public_key_commitment_mismatch() {
    let mut participants = Participants::new_seq(3);
    participants.sample_each_polynomial(2);
    participants.broadcast_commitments_local().unwrap();
    let payloads = participants.evaluate_each_polynomial().unwrap();
    participants
        .broadcast_evaluation_values_local(payloads)
        .unwrap();
    participants.verify_round2_shares_local().unwrap();

    let round1_state = participants.members[0].round1_state.as_mut().unwrap();
    round1_state.other_commitments.as_mut().unwrap()[0].commitments[0] +=
        ProjectivePoint::GENERATOR;

    let result = participants.finalize();

    assert_eq!(result.unwrap_err(), "group public key verification failed");
}
```

`cargo check`와 `cargo test` 기준으로 현재 유닛 테스트 19개, 통합 테스트 5개가 통과한다.

## 다음 단계

여기까지 구현하면 “각자 다항식을 만들고, commitment로 share를 검증하고, 검증된 share를 합쳐 final share와 group public key를 만든다”는 흐름은 확인할 수 있다. 다만 아직 실제 네트워크 환경에서 악의적 참여자까지 다루는 robust DKG라고 부르기에는 빠진 것이 많다.

- reliable broadcast와 complaint/accusation flow
- invalid share를 보낸 참여자를 제외하는 qualified set 처리
- participant id의 zero/duplicate 방지
- 임의의 `t`개 final share로 `F(0)`을 복원하는 threshold reconstruction 테스트
- threshold signature protocol과의 연결

지금 단계의 목표는 완성된 프로토콜이 아니라, Pedersen DKG의 라운드 감각을 코드와 그림으로 잡는 것이다. 위 목록은 다음 구현에서 하나씩 채워 넣을 예정이다.
