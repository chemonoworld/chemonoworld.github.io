---
title: 'Shamir Secret Sharing'
description: 'Deep dive into Shamir Secret Sharing (SSS) algorithm, Lagrange interpolation, and finite fields.'
pubDate: 'Oct 24 2024'
tags: ['cryptography', 'algorithm', 'math', 'golang']
---

*Original presentation by Jinwoo on Oct 24, 2024*

## SSS란?

- **Secret Key**를 안전하게 공유하고 복구하는 방법입니다.
- **$n$**명의 사람에게 키를 나눠줍니다. (Threshold **$k$**, $k \le n$)
- $n$개의 키를 나눠 갖고 **$k$ ($k \le n$)**개 이상의 키가 모였을 때 원래의 Secret Key를 복구할 수 있는 알고리즘을 의미합니다.
- Multisig와 유사한 점이 있으므로 비유하자면, $n$을 전체 멀티시그 참여자 수, $k$를 Threshold라고 생각하면 이해하기 쉽습니다.

---

## Principle

다항식(Polynomial)과 그 해의 기본 성질을 이용합니다.

### 다항식(Polynomial) 및 $(k-1)$차 방정식 해의 성질

- **0차 함수**는 1개의 점에 대한 정보가 있으면 그래프를 얻어낼 수 있습니다. (ex. $y = 5$)
- **1차 함수**는 2개의 점에 대한 정보가 있으면 그래프를 알아낼 수 있습니다.
    - ex. $y = 2x - 1$
    - $(1,1), (0,-1)$ 두 점이 주어졌을 때 기울기는 2이므로, $y -(-1) = 2(x-0) \rightarrow y = 2x - 1$
- **$(k-1)$차 함수**는..?
    - **$k$개의 점이 필요합니다.**

    $$
    y = a_{k-1}x^{k-1} + ... + a_1x + a_0
    $$

- $(x_i, y_i)$ 쌍이 $k$개 존재하고 이를 모두 대입하면, 중학교 1학년 수준의 미지수가 $k$개인 연립 일차 방정식이 됨을 알 수 있습니다. (미지수가 $a_i$가 되므로)
- 따라서 미지수가 $k$개인 연립 일차 방정식은 서로 **Linearly Independent**한 $k$개의 방정식이 주어져야 하므로, 서로 다른 $k$개의 점이 필요함을 알 수 있습니다.

> **Q**: 그러면 $k$개 이상의 점이 있어도 되나?
> **A**: 네. 위 조건들은 필요한 **최소 개수**입니다. ($k \le n$)

### 1. Polynomial

이제 위 성질을 알았으니 랜덤한 $a_i$ 값을 만들고 다항식을 생성합시다.

$$
a_0, a_1, a_2, ... , a_{k-1} \quad (\text{randomly generated numbers})
$$

$$
y = f(x) = a_{k-1}x^{k-1} + ... + a_1x + a_0
$$

### 2. Secret Key

임의의 $a_0 \sim a_{k-1}$을 설정하고, 이때 **$a_0$가 비밀키(Secret Key)**가 됩니다.

$$
\text{Secret Key} = a_0
$$

### 3. Sharing

- 위 $(k-1)$차 방정식의 해를 알기 위해서는 (최소) $k$개의 서로 다른 점이 필요함을 알 수 있습니다.
    - (정확히는 Linearly Independent한 $k$개의 점이 필요합니다.)
- 이제 해당 방정식 위의 서로 다른 점 $(x, y)$를 $n$개 정합니다.

    $$
    (x_1, y_1), ..., (x_n, y_n) \quad (\text{where } n \ge k)
    $$

    그리고 이것을 **$n$명에게 1개씩 공유**합니다.

- 이때 $n$은 반드시 $k$개보다 같거나 커야 합니다.
    - 그래야 복구가 가능하기 때문입니다.

### 4. Recovery

- 이제 비밀키를 복구해봅시다.
- $n \ge k$ 이므로 우리는 원래의 $(k-1)$차 방정식의 모든 계수 $a_i$를 알아낼 수 있습니다.
    - 연립 일차방정식을 풀면 됩니다 (총 $n$개의 방정식).

    $$
    y_i = f(x_i) \quad (\text{for } i = 0, ..., n-1)
    $$

#### How?

1.  **가우스-조던 소거법 (Gaussian Elimination)**
    - 시간이 많이 걸리고 연산량도 많습니다.
2.  **다른 접근: 라그랑주 보간법 (Lagrange Interpolation)**
    - 다항식의 선형대수적인 특성으로 인해 보간 알고리즘으로 기존 다항식을 복구하는 것이 가능합니다.

$$
f(x) = \sum_{j=0}^{k-1} y_j \prod_{i\neq j}^{k-1} \frac{x-x_i}{x_j-x_i}
$$

$$
f(x) = \sum_{j=0}^{k-1} y_j \left(\frac{x-x_0}{x_j-x_0}\right) \left(\frac{x-x_1}{x_j-x_1}\right) ...
$$

- $f(x)$를 구한 다음에는?
    - $x = 0$을 대입하여 원래 **Secret Key**를 복구할 수 있습니다.

$$
f(0) = a_0
$$

---

## 유한체 (Finite Field)

위의 다항식 원리는 유한체 위에서도 잘 정의됩니다.
왜냐하면 $(k-1)$차 다항식은 유한체 $F$에 대한 차원이 $k$인 **벡터 공간 $V$ (Finite Dimension Vector Space)**로 정의할 수 있기 때문입니다.

### 1. 성질
유한체는 다음과 같은 성질을 가지고 있습니다:
- 원소 개수가 유한(Finite)합니다.
- `+` 연산: 항등원이 존재, 닫혀있어야 함, 역원 존재, 교환법칙 성립.
- `*` 연산: 항등원이 존재, 닫혀있어야 함, 역원 존재, 교환법칙 성립.

### 2. 생성 방법
유한체는 보통 정수 중 다음과 같은 집합을 사용하여 쉽게 얻을 수 있습니다.
- 임의의 소수 $p$를 잡습니다.
- $\{ 0, 1, \dots, p-1 \}$
- `+` 연산: 정수의 덧셈 후 `% p` 연산.
- `*` 연산: 정수의 곱셈 후 `% p` 연산.

> **Example ($p=5$)**:
> - $3 + 4 = 7 \pmod 5 = 2$
> - $3 \times 4 = 12 \pmod 5 = 2$

### 3. 빼기/나누기 연산
역원 연산으로 뺄셈, 나눗셈 연산을 정의합니다.
- **뺄셈**: `+` 연산의 역원은 합해서 0이 되는 수입니다. 이를 더하고 `mod p`를 취하면 됩니다.
    - ex. ($p=5$): $3 - 4 = 3 + 1 = 4 \pmod 5 = 4$
    - (4의 덧셈 역원은 1, $4+1=5 \equiv 0$)
- **나눗셈**: `*` 연산의 역원(ModInverse)을 곱하고 `mod p`를 취합니다.
    - ex. ($p=5$): $3 / 4 = 3 \times 4 = 12 \pmod 5 = 2$
    - (4의 곱셈 역원은 4, $4 \times 4 = 16 \equiv 1$)

---

## Code Example

전체 코드: [GitHub Link](https://github.com/chemonoworld/shamir-secret-sharing/blob/main/main.go)

```go
package main

import (
	"crypto/rand"
	"errors"
	"math/big"
)

// 다항식 (x_i, y_i) 총 n개의 서로다른 점 -> n명에게 나눠준다.
type SecretShare struct {
	X *big.Int
	Y *big.Int
}

// 32bytes Random Generation
func generateRand32Bytes() (*big.Int, error) {
	b := make([]byte, 32)
	_, err := rand.Read(b)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(b), nil
}

// (x, y) 서로 다른 점을 생성
func generateDistinctRandomInt64s(n int) ([]int64, error) {
	randomInt64s := make([]int64, n)
	randMap := make(map[int64]bool)
	for i := 0; i < n; i++ {
		b := make([]byte, 8)
		_, err := rand.Read(b)
		if err != nil {
			return nil, err
		}
        // ... (bit manipulation omitted for brevity) ...
		randomInt64s[i] = int64(b[0]) // Simplified
		if _, ok := randMap[randomInt64s[i]]; ok {
			i--
		} else {
			randMap[randomInt64s[i]] = true
		}
	}
	return randomInt64s, nil
}

// a_0 ~ a_k-1 계수 생성
func GenerateCoefficients(k int) ([]*big.Int, error) {
	coefficients := make([]*big.Int, k)
	for i := 0; i < k; i++ {
		coeff, err := generateRand32Bytes()
		if err != nil {
			return nil, err
		}
		coefficients[i] = coeff
	}
	return coefficients, nil
}

// Shamir Secret Share 생성
func ShamirSecretShare(coefficients []*big.Int, k, n int) ([]SecretShare, error) {
	if k > n {
		return nil, errors.New("k must be less than n")
	}

	shares := make([]SecretShare, n)
	distinctPointXs, err := generateDistinctRandomInt64s(n)
	if err != nil {
		return nil, err
	}

	for i := 0; i < n; i++ {
		x := big.NewInt(distinctPointXs[i])
		y := new(big.Int)

		for j := 0; j < k; j++ {
			// term = a_j * x^j
			term := new(big.Int).Exp(x, big.NewInt(int64(j)), nil)
			term.Mul(term, coefficients[j])
			y.Add(y, term)
		}
		shares[i] = SecretShare{X: x, Y: y}
	}
	return shares, nil
}

// Lagrange Interpolation (복구)
func LagrangeInterpolation(shares []SecretShare, prime *big.Int) *big.Int {
	result := new(big.Int)

	for i := 0; i < len(shares); i++ {
		numerator := new(big.Int)
		denominator := new(big.Int)

		numerator.SetInt64(1)
		denominator.SetInt64(1)

		for j := 0; j < len(shares); j++ {
			if i == j { continue }

			// numerator *= -shares[j].X
			numerator.Mul(numerator, shares[j].X)
			numerator.Neg(numerator)

			// denominator *= shares[i].X - shares[j].X
			denominator.Mul(denominator, new(big.Int).Sub(shares[i].X, shares[j].X))
		}

		// denominator = 1 / denominator (Inverse)
		denominator.ModInverse(denominator, prime)

        // Term calc
		term := new(big.Int).Mul(new(big.Int).Mul(shares[i].Y, numerator), denominator)
		result.Add(result, term)
	}

	result.Mod(result, prime)
	return result
}
```

---

## Appendix: 라그랑주 보간법의 수학적 증명

1. 주어진 다항식의 서로 다른 점 $k$개를 취합니다.

    $$
    \{(x_0, y_0), (x_1, y_1), ..., (x_{k-1}, y_{k-1})\}
    $$

2. **라그랑주 기본 다항식 (Lagrange Basis Polynomial)**을 다음과 같이 정의합시다.

    $$
    p_j(x) = \prod_{i\neq j}^{k-1} \frac{x-x_i}{x_j-x_i}
    $$

3. 이 다항식들은 다음과 같은 성질을 가집니다.
    - **Linearly Independent**합니다.
    - **Span**합니다.
    - 따라서 $P_{k-1}$ ($(k-1)$차 이하 다항식의 벡터 공간)의 **Basis**가 됩니다.

4. $x = x_i$를 대입하는 것은 Linear Functional $L_i$에 대응되며, 다음과 같은 성질을 지닙니다 (Kronecker Delta).

    $$
    L_i(p_j(x)) = p_j(x_i) = \delta_{ji}
    $$
    (즉, $i=j$이면 1, 아니면 0)

5. 임의의 다항식 $p(x)$를 Basis의 선형 결합(Linear Combination)으로 표현할 수 있습니다.

    $$
    p(x) = \sum_{j=0}^{k-1} y_j p_j(x)
    $$

6. 결론적으로, 서로 다른 점 $k$개를 통해 유일한 다항식을 복구할 수 있음을 증명할 수 있습니다.
